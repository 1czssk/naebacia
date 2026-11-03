/* НАЕБАЦИЯ v1.60 🎃. Исходная навигационная логика v1.58 сохранена. */
// === КОНЕЦ БЛОКА 10 ===

// === БЛОК 11: CONFIG ===
const ACTIVE_PROFILE = window.NAEBACIA_ACTIVE_PROFILE;
if (!ACTIVE_PROFILE || ACTIVE_PROFILE.id !== 'krasny-kut') throw new Error('Не загружен профиль Красного Кута');
const FOLLOW_KEY = 'oprs_rt_follow';
const SPEED_UNIT_KEY = 'oprs_speed_unit';

let rtSpeedUnit = localStorage.getItem(SPEED_UNIT_KEY) || 'kmh';
const SPEED_UNITS = {
  kmh: { label: 'км/ч', factor: 3.6 },
  ms:  { label: 'м/с',  factor: 1 },
  kt:  { label: 'узлы', factor: 1.94384 }
};
const SPEED_UNITS_ORDER = ['kmh', 'ms', 'kt'];

const TRACK_KEY = 'oprs_nav_track_v1';
const TRACK_GPS_KEY = 'oprs_nav_track_gps_v1';
const RT_TRACK_KEY = 'oprs_nav_rt_track_v1'; // старый ключ: для совместимости
const FLIGHT_LOG_KEY = 'naebacia_flight_session_v1'; // сохраняем прежний ключ для миграции v1.56
const ALT_COLORS_KEY = 'naebacia_alt_colors_v1';
const WIND_SPEED_UNIT_KEY = 'naebacia_wind_speed_unit_v1';
const HUD_HEADING_KEY = 'naebacia_hud_heading_v1';
const MENU_SIDE_KEY = 'naebacia_menu_side_v1';
const FLIGHT_SAVE_INTERVAL_MS = 5000;
const WIND_NAV_KEY = 'naebacia_wind_nav_v1';
const HSI_SETTINGS_KEY = 'naebacia_hsi_state_v1';

const MAX_DIST_KM = 300;
const ANGLE_ERROR_DEG = 10;
const ANGLE_WARN_DEG = 20;
const ERROR_LINE_KM = 50;
const HITBOX_WEIGHT = 25;
const RT_MIN_STEP_M = 5;
const RT_MAX_POINTS = 10000;

// Свежесть позиции: старше этого порога — показываем предупреждение
const GPS_STALE_SEC = 60;

// Опорные точки п.п. Красный Кут
// ДПРМ: АИП УВСК AD 2.19 (14.11.2013), координаты исторические; актуальность не подтверждена.
const KTA_POINT = ACTIVE_PROFILE.airfield.kta;
const DPRM_POINT = ACTIVE_PROFILE.airfield.dprm;
// === КОНЕЦ БЛОКА 11 ===

// === БЛОК 12: TABS ===
let currentTab = 'place';

function updateMapInteractivity() {
  const mapEl = document.getElementById('map');
  const blockOverlays = (currentTab === 'nav' && targetEditMode === true);
  if (blockOverlays) mapEl.classList.add('nav-mode');
  else mapEl.classList.remove('nav-mode');
}

function switchTab(name) {
  currentTab = name;
  document.getElementById('tabBtnPlace').classList.toggle('active', name === 'place');
  document.getElementById('tabBtnNav').classList.toggle('active', name === 'nav');
  document.getElementById('tabBtnRtnav').classList.toggle('active', name === 'rtnav');
  document.getElementById('tabBtnLayers').classList.toggle('active', name === 'layers');
  document.getElementById('tab-place').classList.toggle('active', name === 'place');
  document.getElementById('tab-nav').classList.toggle('active', name === 'nav');
  document.getElementById('tab-rtnav').classList.toggle('active', name === 'rtnav');
  document.getElementById('tab-layers').classList.toggle('active', name === 'layers');

  map.closePopup();
  if (name !== 'nav') { targetEditMode = false; if(routeEditorDraft) routeEditorMapMode = 'none'; }
  updateRouteEditorUI();
  updateMapInteractivity();

  renderRTTrack();
  renderRTMarker();
  updateNavUI();
  updateRTUI();
  updateSpeedHudVisibility();
  refreshHSIPanel();

  if (name === 'rtnav') centerFollowedAircraft(false);
}

function changeMenuSide(right) {
  const btn = document.getElementById('toggleBtn');
  btn.classList.toggle('menu-right', !!right);
  document.getElementById('infoBtn').classList.toggle('menu-right', !!right);
  document.getElementById('routeEditorBanner').classList.toggle('route-editor-menu-right', !!right);
  document.getElementById('menuButtonRight').checked = !!right;
  try { localStorage.setItem(MENU_SIDE_KEY, right ? 'right' : 'left'); } catch (e) {}
}

function togglePanel() {
  const p = document.getElementById('panel');
  p.classList.toggle('hidden');
  document.getElementById('toggleBtn').textContent = p.classList.contains('hidden') ? '☰' : '✕';
  document.getElementById('infoBtn').hidden = !p.classList.contains('hidden');
}
if (window.innerWidth <= 600) {
  document.getElementById('panel').classList.add('hidden');
  document.getElementById('toggleBtn').textContent = '☰';
  document.getElementById('infoBtn').hidden = false;
}
function openInstallHelp() {
  const overlay=document.getElementById('installHelpOverlay');
  overlay.hidden=false;
  document.getElementById('infoBtn').setAttribute('aria-expanded','true');
  document.getElementById('installHelpClose').focus();
}
function closeInstallHelp() {
  document.getElementById('installHelpOverlay').hidden=true;
  document.getElementById('infoBtn').setAttribute('aria-expanded','false');
  const btn=document.getElementById('infoBtn');if(!btn.hidden)btn.focus();
}
window.addEventListener('keydown', e => {
  if(e.key==='Escape'&&!document.getElementById('installHelpOverlay').hidden)closeInstallHelp();
});
// === КОНЕЦ БЛОКА 12 ===

// === БЛОК 13: MAP ===
const map = L.map('map').setView(ACTIVE_PROFILE.airfield.initialCenter, ACTIVE_PROFILE.airfield.initialZoom);
let currentLayer = null;

function switchMap() {
  const provider = document.getElementById('mapStyle').value;
  if (currentLayer) map.removeLayer(currentLayer);
  try {
    currentLayer = L.tileLayer.provider(provider).addTo(map);
  } catch (e) {
    currentLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
  }
}
switchMap();
// === КОНЕЦ БЛОКА 13 ===

// === БЛОК 14: DATA: ОПРС ===
// Координаты Красноармейска: сборник маршрутов ОВД РФ от 03.12.2020 (исторический источник).
const PRESET = ACTIVE_PROFILE.stations;
// Индекс VOR в PRESET (после добавления 4-го NDB стал 4)
const VOR_IDX = ACTIVE_PROFILE.vorIndex;
// === КОНЕЦ БЛОКА 14 ===

// === БЛОК 15: DATA: ROUTES ===
const ROUTES = ACTIVE_PROFILE.routes;
let routeLayers = { A4: [], A5: [], LOCAL: [], GAGARIN_FWD: [], GAGARIN_BACK: [] };
const USER_ROUTES_KEY = 'naebacia_user_routes_v1';
const USER_ROUTE_PREFIX = 'USER_';
let userRoutes = [];
let userRoutesLoadFailed = false;
let routeEditorDraft = null;
let routeEditorSavedId = null;
let routeEditorSavedSnapshot = '';
let routeEditorMapMode = 'none';
let routeEditorBannerDismissed = false;
let routeEditorMoveIndex = -1;
let routeEditorHistory = [];
let routeEditorHistoryIndex = -1;
let routeEditorLayers = [];
let jokeMarker = null;
const JOKE_KEY = 'naebacia_joke_arrow_v1';
// === КОНЕЦ БЛОКА 15 ===

// === БЛОК 16: DATA: ZONES / SECTORS ===
// Зоны (ПЗ) — данные из таблицы, R = 2,5 км.
// zmpu — ЗМПУ в зону (магнитное), s — удаление от КТА в км.
const ZONES = ACTIVE_PROFILE.zones;
// Сектора (ЗПП) — данные из таблицы, R = 5 км.
// zmpu — ЗМПУ в зону (магнитное), s — удаление от ДПРМ в км.
const SECTORS = ACTIVE_PROFILE.sectors;
let areaLayers = { zones: [], sectors: [] };

// Форматирование ЗМПУ как «017°» (три цифры с ведущим нулём, как в таблице)
function fmtZmpu(v) {
  return String(Math.round(v)).padStart(3, '0') + '°';
}
// === КОНЕЦ БЛОКА 16 ===

// === БЛОК 17: STATE ===
let oprsMarkers = [null, null, null, null, null];
let stationLines = [];
let errorLines = [];
let trackSegments = [];
let trackPointLayers = [];
let posMarker = null;
let gpsMarker = null;

let track = [];
let trackGps = [];

let navTarget = null;
let navLineStart = null;
let navTargetMarker = null;
let navLine = null;
let hsiGuideLine = null;
let hsiState = { mode:'direct', routeKey:'', legIndex:0, obsCourse:0,
  obsRef:'target', obsAnchor:null, scaleKm:5, awaitingRouteFix:0 };
let hsiLastRouteAdvanceAt = 0;
let hsiNeedsInitialLegFix = false;
let windChangeDebounce = null;
let targetEditMode = false;

let rtTracking = false;
let rtWatchId = null;
let rtCurrentPosition = null;
let rtTrack = [];
let rtFlightLog = null;  // общий журнал с отдельными полётами; продолжается до очистки
let rtLogSaveWarning = '';
let lastFlightSaveAt = 0;
let rtSessionId = null;
let rtLineLayer = null;
let rtStartMarker = null;
let rtMarker = null;

let windMeasuring = false;
let windMeasureStart = 0;
let windMeasureDuration = 30;
let windMeasureData = [];
let windMeasureTick = null;

let openPopupLayer = null;
const popupContentFns = new WeakMap();

// Слой круга полётов
let circleLayer = [];
// === КОНЕЦ БЛОКА 17 ===

// === БЛОК 18: WAKELOCK ===
let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { console.warn('Wake Lock недоступен:', e.message); }
}

function releaseWakeLock() {
  if (wakeLock !== null) {
    try { wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    await requestWakeLock();
  }
});
// === КОНЕЦ БЛОКА 18 ===

// === БЛОК 19: MATH ===
function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }
function norm360(d) { return ((d % 360) + 360) % 360; }
function norm180(a) {
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return a;
}

function ddToDM(val, isLat) {
  const hemi = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return deg + '°' + min.toFixed(2) + '′' + hemi;
}

function distance(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x = dLat;
  const y = dLon * Math.cos(toRad((a.lat + b.lat) / 2));
  return Math.sqrt(x * x + y * y) * R;
}

function trueBearing(a, b) {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return norm360(toDeg(Math.atan2(y, x)));
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(sec) {
  sec = Math.round(sec);
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  return m + ':' + String(s).padStart(2, '0');
}

function fmtEtaAbs(etaSec) {
  const d = new Date(Date.now() + etaSec * 1000);
  return String(d.getHours()).padStart(2, '0') + ':' +
         String(d.getMinutes()).padStart(2, '0');
}

function getCourseMag() {
  const v = document.getElementById('course').value.trim();
  if (v === '') return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function getDecl() {
  const v = document.getElementById('decl').value;
  const n = parseFloat(v);
  return isNaN(n) ? 11 : n;
}

function parseDistance(v) {
  if (v === '') return null;
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) ? null : n;
}

function bindLivePopup(layer, content, options) {
  if (typeof content === 'function') {
    popupContentFns.set(layer, content);
  }
  layer.bindPopup(content, options || { autoPan: true });
  return layer;
}

function refreshOpenPopup() {
  if (!openPopupLayer) return;
  const fn = popupContentFns.get(openPopupLayer);
  if (!fn) return;
  try {
    openPopupLayer.setPopupContent(fn());
  } catch (e) { /* слой мог быть удалён */ }
}

function freshnessWarning(cur) {
  if (!cur || !cur.t) return '';
  const age = (Date.now() - cur.t) / 1000;
  if (age < GPS_STALE_SEC) return '';
  const m = Math.floor(age / 60);
  return '<br><span style="color:#c00;font-size:11px">⚠ данные устарели (' + m + ' мин)</span>';
}

function makeClickableLine(latlngs, options, popupContent) {
  const visible = L.polyline(latlngs, Object.assign({}, options, { interactive: false })).addTo(map);
  const hitbox = L.polyline(latlngs, {
    color: options.color, weight: HITBOX_WEIGHT, opacity: 0, interactive: true
  }).addTo(map);
  bindLivePopup(hitbox, popupContent, { autoPan: true });
  return [visible, hitbox];
}

map.on('popupopen', (e) => {
  openPopupLayer = e.popup._source || null;
  if (followMode) {
    followMode = false;
    localStorage.setItem(FOLLOW_KEY, '0');
    updateFollowBtn();
  }
});

map.on('popupclose', () => {
  openPopupLayer = null;
});
// === КОНЕЦ БЛОКА 19 ===

// === БЛОК 20: OFFSET ===
function computeOffset(P, A, B) {
  const R = 6371000;
  const lat0 = (A.lat + B.lat + P.lat) / 3;
  const lon0 = (A.lon + B.lon + P.lon) / 3;
  const cosLat0 = Math.cos(toRad(lat0));
  const proj = (pt) => ({
    x: R * toRad(pt.lon - lon0) * cosLat0,
    y: R * toRad(pt.lat - lat0)
  });
  const pA = proj(A);
  const pB = proj(B);
  const pP = proj(P);
  const dxAB = pB.x - pA.x, dyAB = pB.y - pA.y;
  const dxAP = pP.x - pA.x, dyAP = pP.y - pA.y;
  const lenAB2 = dxAB * dxAB + dyAB * dyAB;
  if (lenAB2 < 1) return null;
  const t = (dxAP * dxAB + dyAP * dyAB) / lenAB2;
  const hx = pA.x + t * dxAB;
  const hy = pA.y + t * dyAB;
  const lbu = Math.sqrt((pP.x - hx) ** 2 + (pP.y - hy) ** 2);
  const s_proj = Math.sqrt((hx - pA.x) ** 2 + (hy - pA.y) ** 2);
  const cross = dxAB * dyAP - dyAB * dxAP;
  const side = Math.abs(cross) < 1e-6 ? 'on' : (cross > 0 ? 'left' : 'right');
  return { lbu, s_proj, side, t };
}

function fmtDist(meters) {
  if (meters < 1000) return meters.toFixed(0) + ' м';
  return (meters / 1000).toFixed(2) + ' км';
}

function fmtOffset(P, A, B) {
  const off = computeOffset(P, A, B);
  if (!off) return null;
  let sideStr = '';
  if (off.side === 'left') sideStr = ' <span style="color:#c00">влево</span>';
  else if (off.side === 'right') sideStr = ' <span style="color:#c00">вправо</span>';
  else sideStr = ' <span style="color:#888">на линии</span>';
  let html = '<b>ЛБУ:</b> ' + fmtDist(off.lbu) + sideStr;
  let spNote = '';
  if (off.t < 0) spNote = ' <span style="color:#888">(до начала)</span>';
  else if (off.t > 1) spNote = ' <span style="color:#888">(за концом)</span>';
  html += '<br><b>Пройдено по линии:</b> ' + fmtDist(off.s_proj) + spNote;
  return html;
}
// === КОНЕЦ БЛОКА 20 ===

// === БЛОК 21: SPEED ===
function convertSpeed(mps) {
  if (mps === null || mps === undefined || isNaN(mps)) return null;
  return mps * SPEED_UNITS[rtSpeedUnit].factor;
}

function updateSpeedUnitLabel() {
  document.getElementById('speedUnitLabel').textContent = SPEED_UNITS[rtSpeedUnit].label;
  document.getElementById('speedHudUnit').textContent = SPEED_UNITS[rtSpeedUnit].label;
  document.getElementById('hudSpeedUnit').value = rtSpeedUnit;
}

function setSpeedUnit(unit) {
  if (!SPEED_UNITS[unit]) return;
  rtSpeedUnit = unit;
  localStorage.setItem(SPEED_UNIT_KEY, rtSpeedUnit);
  updateSpeedUnitLabel();
  updateRTUI();
}

function cycleSpeedUnit() {
  const idx = SPEED_UNITS_ORDER.indexOf(rtSpeedUnit);
  setSpeedUnit(SPEED_UNITS_ORDER[(idx + 1) % SPEED_UNITS_ORDER.length]);
}
// === КОНЕЦ БЛОКА 21 ===

// === БЛОК 22: FOLLOW ===
let followMode = localStorage.getItem(FOLLOW_KEY) !== '0';

function isFollowOn() { return followMode; }

// Когда HSI открыт, центрирование приходится на свободную область НАД прибором,
// а не на геометрический центр всей карты, который скрыт панелью HSI.
function centerFollowedAircraft(animate = false) {
  if (!followMode || !rtTracking || currentTab !== 'rtnav' || !rtCurrentPosition) return;
  const latlng = [rtCurrentPosition.lat, rtCurrentPosition.lon];
  const hsi = document.getElementById('hsiPanel');
  const z = map.getZoom();
  if (!hsi || hsi.classList.contains('hidden')) {
    map.setView(latlng, z, { animate });
    return;
  }

  const mapRect = document.getElementById('map').getBoundingClientRect();
  const hsiRect = hsi.getBoundingClientRect();
  const size = map.getSize();
  // Координата верхнего края HSI относительно контейнера карты.
  // Центр свободного пространства берём с запасом 14 px перед панелью.
  const freeHeight = Math.max(0, Math.min(size.y, hsiRect.top - mapRect.top - 14));
  const targetY = Math.max(20, Math.min(size.y - 20, freeHeight / 2));
  const targetX = size.x / 2;
  // Смещаем ЦЕНТР карты, а не маркер: вся геометрия Leaflet остаётся привязана к GPS.
  const aircraftPoint = map.project(latlng, z);
  const centerPoint = aircraftPoint.add(L.point(size.x / 2 - targetX, size.y / 2 - targetY));
  map.setView(map.unproject(centerPoint, z), z, { animate });
}

function toggleFollowMode() {
  followMode = !followMode;
  localStorage.setItem(FOLLOW_KEY, followMode ? '1' : '0');
  updateFollowBtn();
  if (followMode) centerFollowedAircraft(true);
}

function updateFollowBtn() {
  const btn = document.getElementById('followBtn');
  const icon = document.getElementById('followBtnIcon');
  if (!btn || !icon) return;
  if (followMode) {
    btn.classList.add('active');
    btn.classList.remove('inactive');
    icon.textContent = '🎯';
    btn.title = 'Слежу за позицией (нажмите — свободный режим)';
  } else {
    btn.classList.remove('active');
    btn.classList.add('inactive');
    icon.textContent = '✋';
    btn.title = 'Свободный режим (нажмите — следить за позицией)';
  }
}
// === КОНЕЦ БЛОКА 22 ===

// === БЛОК 23: HUD ===
function setHudHeadingVisible(show) {
  document.getElementById('hudShowHeading').checked = !!show;
  document.getElementById('speedHudHeading').hidden = !show;
  try { localStorage.setItem(HUD_HEADING_KEY, show ? '1' : '0'); } catch (e) {}
  updateHudHeading();
}
function updateHudHeading() {
  const el = document.getElementById('speedHudHeading');
  if (!el || el.hidden) return;
  // ФМПУ показываем только при свежем GPS, чтобы не вводить в заблуждение.
  const good = rtTracking && rtCurrentPosition &&
    Date.now() - rtCurrentPosition.t < GPS_STALE_SEC * 1000;
  const heading = good ? getGPSHeadingMag() : null;
  el.textContent = heading === null ? '—' : heading.toFixed(0) + '°';
}
function toggleHudSettings(event) {
  if (event) event.stopPropagation();
  const popup = document.getElementById('hudSettings');
  const nextOpen = popup.classList.contains('hidden');
  popup.classList.toggle('hidden', !nextOpen);
  document.getElementById('speedHud').setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
}
function hideHudSettings() {
  document.getElementById('hudSettings').classList.add('hidden');
  document.getElementById('speedHud').setAttribute('aria-expanded', 'false');
}
document.addEventListener('pointerdown', e => {
  if (!document.getElementById('hudSettings').contains(e.target) &&
      !document.getElementById('speedHud').contains(e.target)) hideHudSettings();
});

function updateSpeedHudVisibility() {
  const hud = document.getElementById('hudContainer');
  if (currentTab === 'rtnav' && rtTracking) {
    hud.classList.remove('hidden');
    updateFollowBtn();
  } else {
    hud.classList.add('hidden');
    hideHudSettings();
  }
  const hsi=document.getElementById('hsiPanel');
  if(hsi)hsi.classList.toggle('no-hud',hud.classList.contains('hidden'));
}

map.on('dragstart', () => {
  if (followMode && currentTab === 'rtnav') {
    followMode = false;
    localStorage.setItem(FOLLOW_KEY, '0');
    updateFollowBtn();
  }
});
// === КОНЕЦ БЛОКА 23 ===

// === БЛОК 24: ICONS ===
function planeIconSvg(courseDeg, color) {
  // Одноцветный силуэт лёгкой высокопланной Cessna, вид сверху.
  // Нос направлен вверх, длинные почти прямые крылья, узкий фюзеляж,
  // небольшой горизонтальный стабилизатор и хвостовое оперение.
  const fill = color || '#2a7';
  return '<svg viewBox="0 0 60 60" width="52" height="52" ' +
    'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ' +
    'style="transform:rotate(' + norm360(courseDeg) + 'deg);transform-origin:50% 50%;' +
    'filter:drop-shadow(0 1px 2px rgba(0,0,0,.7));">' +
    '<path d="M30 2 ' +
      'C27.9 2 27 5.1 27 8.4 ' +
      'L26.5 18.8 ' +
      'L4 18.0 Q1.7 18.0 1.7 20.2 L1.7 27.8 ' +
      'Q1.7 29.5 3.6 29.5 L26.4 28.6 ' +
      'L27.3 47.3 L18.3 49.7 Q17.6 50.0 17.6 51.2 ' +
      'L17.6 55.8 L27.9 54.4 L28.4 57.7 ' +
      'Q30 59 31.6 57.7 L32.1 54.4 L42.4 55.8 ' +
      'L42.4 51.2 Q42.4 50.0 41.7 49.7 L32.7 47.3 ' +
      'L33.6 28.6 L56.4 29.5 ' +
      'Q58.3 29.5 58.3 27.8 L58.3 20.2 ' +
      'Q58.3 18.0 56 18.0 L33.5 18.8 ' +
      'L33 8.4 C33 5.1 32.1 2 30 2 Z" ' +
      'fill="' + fill + '" stroke="#fff" stroke-width="1.15" stroke-linejoin="round"/>' +
    '</svg>';
}
function planeIcon(c) { return L.divIcon({ className: '', html: planeIconSvg(c, '#2a7'), iconSize: [52, 52], iconAnchor: [26, 26] }); }
function planeIconBlue(c) { return L.divIcon({ className: '', html: planeIconSvg(c, '#08c'), iconSize: [52, 52], iconAnchor: [26, 26] }); }

function dotIcon(color) {
  const c = color || '#2a7';
  return L.divIcon({
    className: '',
    html: '<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;">' +
          '<div style="background:' + c + ';border-radius:50%;width:10px;height:10px;border:2px solid white;box-shadow:0 0 3px #000;pointer-events:none;"></div>' +
          '</div>',
    iconSize: [44, 44], iconAnchor: [22, 22]
  });
}
function routeDotIcon(color) {
  return L.divIcon({
    className: '',
    html: '<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;">' +
          '<div style="background:' + color + ';border-radius:50%;width:8px;height:8px;border:1.5px solid white;box-shadow:0 0 3px rgba(0,0,0,0.5);pointer-events:none;"></div>' +
          '</div>',
    iconSize: [44, 44], iconAnchor: [22, 22]
  });
}
function gpsIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="position:relative;width:44px;height:44px;">' +
          '<div style="position:absolute;left:9px;top:9px;width:26px;height:26px;background:rgba(0,136,204,0.3);border-radius:50%;"></div>' +
          '<div style="position:absolute;left:16px;top:16px;width:12px;height:12px;background:#08c;border:2px solid white;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.6);"></div>' +
          '</div>',
    iconSize: [44, 44], iconAnchor: [22, 22]
  });
}
function rtStartIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;background:#08c;border:2px solid white;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.6);"></div>',
    iconSize: [14, 14], iconAnchor: [7, 7]
  });
}
function targetIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="position:relative;width:32px;height:32px;">' +
          '<div style="position:absolute;left:0;top:0;width:32px;height:32px;border:2px solid #e67e22;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,0.4);"></div>' +
          '<div style="position:absolute;left:11px;top:11px;width:10px;height:10px;background:#e67e22;border-radius:50%;border:2px solid white;"></div>' +
          '</div>',
    iconSize: [32, 32], iconAnchor: [16, 16]
  });
}
function turnIcon(color) {
  return L.divIcon({
    className: '',
    html: '<div style="width:22px;height:22px;background:' + color + ';border:2px solid white;border-radius:50%;' +
          'box-shadow:0 0 4px rgba(0,0,0,0.6);"></div>',
    iconSize: [22, 22], iconAnchor: [11, 11]
  });
}
// === КОНЕЦ БЛОКА 24 ===

// === БЛОК 25: POSITION ===
function getCurrentPosition() {
  if (rtTracking && rtCurrentPosition) {
    return {
      lat: rtCurrentPosition.lat,
      lon: rtCurrentPosition.lon,
      t: rtCurrentPosition.t,
      source: 'GPS (РВ)'
    };
  }
  const lastOprs = track.length > 0 ? track[track.length - 1] : null;
  const lastGps = trackGps.length > 0 ? trackGps[trackGps.length - 1] : null;
  let last = null, src = '';
  if (lastOprs && lastGps) {
    if (lastGps.t > lastOprs.t) { last = lastGps; src = 'GPS (Получить МС)'; }
    else { last = lastOprs; src = 'трек (расчёт ОПРС)'; }
  } else if (lastOprs) { last = lastOprs; src = 'трек (расчёт ОПРС)'; }
  else if (lastGps) { last = lastGps; src = 'GPS (Получить МС)'; }
  if (last) return { lat: last.lat, lon: last.lon, t: last.t, source: src };
  if (gpsMarker) {
    const ll = gpsMarker.getLatLng();
    return { lat: ll.lat, lon: ll.lng, t: null, source: 'GPS' };
  }
  return null;
}
// === КОНЕЦ БЛОКА 25 ===

// === БЛОК 26: STATION POPUPS ===
function buildStationPopup(idx) {
  const p = PRESET[idx];
  let html = '<b>' + p.name + '</b><br>' + p.freq + '<br>' +
             ddToDM(p.lat, true) + ' ' + ddToDM(p.lon, false);
  const cur = getCurrentPosition();
  if (!cur) {
    html += '<br><span style="color:#888;font-size:11px">Нет известного местоположения</span>';
    return html;
  }
  const decl = parseFloat(document.getElementById('decl').value) || 0;
  const brgTrue = trueBearing(cur, p);
  const mpr = norm360(brgTrue - decl);
  const mps = norm360(mpr + 180);
  const dist = distance(cur, p) / 1000;
  html += '<hr style="margin:4px 0;border:0;border-top:1px solid #ddd">';
  html += '<b>От последнего местоположения:</b><br>';
  html += 'МПР: <b>' + mpr.toFixed(0) + '°</b><br>';
  html += 'МПС: <b>' + mps.toFixed(0) + '°</b><br>';
  html += 'Расстояние: <b>' + dist.toFixed(1) + ' км</b>';
  html += freshnessWarning(cur);
  return html;
}

function updateMarker(idx) {
  const p = PRESET[idx];
  if (oprsMarkers[idx]) map.removeLayer(oprsMarkers[idx]);
  oprsMarkers[idx] = L.marker([p.lat, p.lon], { draggable: false }).addTo(map);
  bindLivePopup(oprsMarkers[idx], () => buildStationPopup(idx), { autoPan: true });
}

function loadPreset() {
  PRESET.forEach((p, i) => {
    document.getElementById('label' + (i + 1)).textContent = '(' + p.name + ')';
    const fEl = document.getElementById('freq' + (i + 1));
    fEl.textContent = p.freq;
    if (p.type === 'VOR') fEl.classList.add('vor');
    updateMarker(i);
  });
  map.fitBounds(PRESET.slice(0, 3).map(p => [p.lat, p.lon]), { padding: [60, 60] });
}
// === КОНЕЦ БЛОКА 26: STATION POPUPS ===

// === БЛОК 27: ROUTES RENDER ===
// Поле U отображает выбранную единицу; расчёты всегда получают км/ч.
function getWindSpeedKmh() {
  const raw = document.getElementById('windSpd').value.trim().replace(',', '.');
  if (!raw) return NaN;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return NaN;
  return document.getElementById('windSpeedUnit').checked ? amount * 3.6 : amount;
}
function changeWindSpeedUnit() {
  const input = document.getElementById('windSpd');
  const current = Number(input.value.trim().replace(',', '.'));
  if (input.value.trim() && Number.isFinite(current)) {
    // При переводе в м/с делим на 3,6, обратно — умножаем.
    const converted = document.getElementById('windSpeedUnit').checked ? current / 3.6 : current * 3.6;
    input.value = String(Number(converted.toFixed(3)));
  }
  try { localStorage.setItem(WIND_SPEED_UNIT_KEY, document.getElementById('windSpeedUnit').checked ? 'ms' : 'kmh'); } catch (e) {}
  updateNavUI();
  updateRTUI();
  saveWindNavPreference();
  recordConfigurationEvent('wind-unit');
  refreshOpenPopup();
}

function dedupeRoutePoints(points, threshold = 20) {
  const unique = [];
  points.forEach((pt, idx) => {
    const hit = unique.find(u => distance(u.pt, pt) < threshold);
    if (hit) hit.indices.push(idx);
    else unique.push({ pt, indices: [idx] });
  });
  return unique;
}

function buildRouteSegmentPopup(routeKey, idx) {
  const route = ROUTES[routeKey];
  const A = route.points[idx];
  const B = route.points[idx + 1];
  const segLen = distance(A, B) / 1000;
  const decl = parseFloat(document.getElementById('decl').value) || 0;
  const zmpu = norm360(trueBearing(A, B) - decl);

  let html = '<b>' + route.name + '</b><br>';
  html += A.name + ' → ' + B.name + '<br>';
  html += 'Длина участка: <b>' + segLen.toFixed(2) + ' км</b><br>';
  html += '<b>ЗМПУ:</b> <span style="color:#2a7"><b>' + zmpu.toFixed(0) + '°</b></span>';

  const wdRaw = document.getElementById('windDir').value.trim();
  const wsRaw = document.getElementById('windSpd').value.trim();
  const asRaw = document.getElementById('airspeed').value.trim();
  const wd = wdRaw === '' ? NaN : parseFloat(wdRaw);
  const ws = getWindSpeedKmh();
  const as = asRaw === '' ? NaN : parseFloat(asRaw.replace(',', '.'));

  if (!isNaN(wd) && !isNaN(ws) && !isNaN(as) && as > 0) {
    let uv = norm360(zmpu - wd);
    if (uv > 180) uv -= 360;
    const sinUS = (ws / as) * Math.sin(toRad(uv));
    const clampedSin = Math.max(-1, Math.min(1, sinUS));
    const usDeg = toDeg(Math.asin(clampedSin));
    html += '<br><b>УСр:</b> ' + usDeg.toFixed(1) + '°';
    if (Math.abs(usDeg) > 0.5) {
      html += usDeg > 0
        ? ' <span style="color:#c00">вправо</span>'
        : ' <span style="color:#c00">влево</span>';
    }
    const mk = norm360(zmpu - usDeg);
    html += '<br><b>МК:</b> ' + mk.toFixed(0) + '°';
  }

  const cur = getCurrentPosition();
  if (cur) {
    const offHtml = fmtOffset(cur, A, B);
    if (offHtml) {
      html += '<hr style="margin:4px 0;border:0;border-top:1px solid #ddd">';
      html += offHtml;
    }
    html += freshnessWarning(cur);
  } else {
    html += '<hr style="margin:4px 0;border:0;border-top:1px solid #ddd">';
    html += '<span style="color:#888;font-size:11px">Нет текущего местоположения</span>';
  }
  return html;
}

function buildRoutePointPopup(routeKey, idx, allIndices) {
  const route = ROUTES[routeKey];
  const pt = route.points[idx];

  let html = '<b>' + route.name + '</b><br>';
  html += 'Точка ' + (idx + 1) + ': <b>' + pt.name + '</b>';

  if (allIndices && allIndices.length > 1) {
    const others = allIndices.slice(1).map(i => 'ППМ ' + (i + 1)).join(', ');
    html += '<br><span style="color:#888;font-size:11px">(также ' + others + ')</span>';
  }
  html += '<br>' + ddToDM(pt.lat, true) + ' ' + ddToDM(pt.lon, false);

  const cur = getCurrentPosition();
  if (cur) {
    const distKm = distance(cur, pt) / 1000;
    const decl = parseFloat(document.getElementById('decl').value) || 0;
    const mpu = norm360(trueBearing(cur, pt) - decl);
    html += '<hr style="margin:4px 0;border:0;border-top:1px solid #ddd">';
    html += '<b>От текущего положения:</b><br>';
    html += 'Расстояние: <b>' + distKm.toFixed(2) + ' км</b><br>';
    html += 'МПУ: <b>' + mpu.toFixed(0) + '°</b>';

    const spdKmh = getCurrentSpeedKmh(pt);
    if (spdKmh !== null && spdKmh > 1) {
      const etaSec = (distKm / spdKmh) * 3600;
      const v = convertSpeed(spdKmh / 3.6);
      html += '<hr style="margin:4px 0;border:0;border-top:1px solid #ddd">';
      html += '<b>Скорость:</b> ' + v.toFixed(0) + ' ' + SPEED_UNITS[rtSpeedUnit].label;
      html += '<br><b>ETE:</b> ' + fmtDuration(etaSec);
      html += '<br><b>ETA:</b> <span style="color:#2a7"><b>' + fmtEtaAbs(etaSec) + '</b></span>';
    }
    html += freshnessWarning(cur);
  } else {
    html += '<br><span style="color:#888;font-size:11px">Нет текущего местоположения</span>';
  }
  return html;
}

function renderRoutes() {
  ['A4', 'A5', 'LOCAL', 'GAGARIN_FWD', 'GAGARIN_BACK'].forEach(key => {
    routeLayers[key].forEach(l => map.removeLayer(l));
    routeLayers[key] = [];
    const cb = document.getElementById('route' + key);
    if (!cb || !cb.checked) return;
    const route = ROUTES[key];

    for (let i = 0; i < route.points.length - 1; i++) {
      const A = route.points[i];
      const B = route.points[i + 1];
      const pair = makeClickableLine(
        [[A.lat, A.lon], [B.lat, B.lon]],
        { color: route.color, weight: 3, opacity: 0.75 },
        () => buildRouteSegmentPopup(key, i)
      );
      routeLayers[key].push(pair[0], pair[1]);
    }

    const uniquePoints = dedupeRoutePoints(route.points);
    uniquePoints.forEach(({ pt, indices }) => {
      const primaryIdx = indices[0];
      const m = L.marker([pt.lat, pt.lon], { icon: routeDotIcon(route.color) }).addTo(map);
      bindLivePopup(m, () => buildRoutePointPopup(key, primaryIdx, indices), { autoPan: true });
      routeLayers[key].push(m);
    });
  });
  renderUserRoutes();
}
// === КОНЕЦ БЛОКА 27 ===

// === БЛОК 28: AREAS RENDER ===

function metersPerPixel(lat, zoom) {
  return 156543.03392 * Math.cos(toRad(lat)) / Math.pow(2, zoom);
}

function makeAreaLabel(lat, radiusM, color, num) {
  const mpp = metersPerPixel(lat, map.getZoom());
  const diamPx = (2 * radiusM) / mpp;
  const fontSize = Math.min(240, Math.max(14, Math.round(diamPx * 0.85)));
  const sizePx = Math.round(fontSize * 1.3);
  return L.divIcon({
    className: '',
    html: '<div style="' +
      'width:' + sizePx + 'px;height:' + sizePx + 'px;' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;' +
      'font-size:' + fontSize + 'px;font-weight:800;line-height:1;' +
      'color:' + color + ';opacity:0.65;' +
      'pointer-events:none;user-select:none;' +
      'text-shadow:0 0 8px rgba(255,255,255,0.55);' +
    '">' + num + '</div>',
    iconSize: [sizePx, sizePx],
    iconAnchor: [sizePx / 2, sizePx / 2]
  });
}

function makeAreaDot() {
  return L.circleMarker([0, 0], {
    radius: 4, color: '#ffffff', weight: 1.5,
    fillColor: '#e01010', fillOpacity: 1, interactive: false
  });
}

function extractNum(id) {
  const m = id.match(/\d+/);
  return m ? m[0] : id;
}

function buildZonePopup(z) {
  let html = '<b>' + z.id + '</b> · ' + z.name;
  html += '<hr style="margin:4px 0;border:0;border-top:1px solid #ddd">';
  html += 'Удаление от КТА: <b>' + z.s + ' км</b><br>';
  html += 'ЗМПУ в зону: <b>' + fmtZmpu(z.zmpu) + '</b>';
  return html;
}

function buildSectorPopup(s) {
  let html = '<b>' + s.id + '</b> · ' + s.name;
  html += '<hr style="margin:4px 0;border:0;border-top:1px solid #ddd">';
  html += 'Удаление от ДПРМ: <b>' + s.s + ' км</b><br>';
  html += 'ЗМПУ в зону: <b>' + fmtZmpu(s.zmpu) + '</b>';
  return html;
}

function renderAreas() {
  // --- Зоны (ПЗ), R = 2,5 км ---
  areaLayers.zones.forEach(l => map.removeLayer(l));
  areaLayers.zones = [];
  if (document.getElementById('toggleZones').checked) {
    ZONES.forEach(z => {
      const circle = L.circle([z.lat, z.lon], {
        radius: 2500, color: '#dc3232', weight: 2, opacity: 0.8,
        fillColor: '#dc3232', fillOpacity: 0.15
      }).addTo(map);
      bindLivePopup(circle, () => buildZonePopup(z), { autoPan: true });
      areaLayers.zones.push(circle);

      const dot = makeAreaDot();
      dot.setLatLng([z.lat, z.lon]).addTo(map);
      areaLayers.zones.push(dot);

      const label = L.marker([z.lat, z.lon], {
        icon: makeAreaLabel(z.lat, 2500, '#ffc8c8', extractNum(z.id)),
        interactive: false, keyboard: false
      }).addTo(map);
      areaLayers.zones.push(label);
    });
  }

  // --- Сектора (ЗПП), R = 5 км ---
  areaLayers.sectors.forEach(l => map.removeLayer(l));
  areaLayers.sectors = [];
  if (document.getElementById('toggleSectors').checked) {
    SECTORS.forEach(s => {
      const circle = L.circle([s.lat, s.lon], {
        radius: 5000, color: '#3232dc', weight: 2, opacity: 0.8,
        fillColor: '#3232dc', fillOpacity: 0.15
      }).addTo(map);
      bindLivePopup(circle, () => buildSectorPopup(s), { autoPan: true });
      areaLayers.sectors.push(circle);

      const dot = makeAreaDot();
      dot.setLatLng([s.lat, s.lon]).addTo(map);
      areaLayers.sectors.push(dot);

      const label = L.marker([s.lat, s.lon], {
        icon: makeAreaLabel(s.lat, 5000, '#c8c8ff', extractNum(s.id)),
        interactive: false, keyboard: false
      }).addTo(map);
      areaLayers.sectors.push(label);
    });
  }
}

map.on('zoomend', () => {
  if (document.getElementById('toggleZones').checked ||
      document.getElementById('toggleSectors').checked) {
    renderAreas();
  }
});
// === КОНЕЦ БЛОКА 28 ===

// === БЛОК 28-B: CIRCLE RENDER ===

// Локальная плоская СК относительно КТА: x — восток, y — север (м)
function ktaCosLat() { return Math.cos(toRad(KTA_POINT.lat)); }

function toXYkta(p) {
  const R = 6371000;
  const c = ktaCosLat();
  return {
    x: toRad(p.lon - KTA_POINT.lon) * R * c,
    y: toRad(p.lat - KTA_POINT.lat) * R
  };
}
function fromXYkta(xy) {
  const R = 6371000;
  const c = ktaCosLat();
  return {
    lat: KTA_POINT.lat + toDeg(xy.y / R),
    lon: KTA_POINT.lon + toDeg(xy.x / (R * c))
  };
}
function dirVec(magDeg, decl) {
  const t = magDeg + decl;
  return { x: Math.sin(toRad(t)), y: Math.cos(toRad(t)) };
}
function advancePt(xy, magDeg, distM, decl) {
  const d = dirVec(magDeg, decl);
  return { x: xy.x + d.x * distM, y: xy.y + d.y * distM };
}
function bearingXY(from, to) {
  return norm360(toDeg(Math.atan2(to.x - from.x, to.y - from.y)));
}

// Поиск точки на луче, где МПР к targetXY = targetMpr
function findMprPoint(start, magDeg, targetMpr, targetXY, decl) {
  const dir = dirVec(magDeg, decl);
  const step = 25;
  const maxT = 60000;
  const mprAt = (t) => {
    const P = { x: start.x + dir.x * t, y: start.y + dir.y * t };
    return norm360(bearingXY(P, targetXY) - decl);
  };
  let prevDiff = norm180(mprAt(0) - targetMpr);
  for (let t = step; t <= maxT; t += step) {
    const diff = norm180(mprAt(t) - targetMpr);
    if (prevDiff * diff <= 0) {
      const frac = Math.abs(prevDiff) / (Math.abs(prevDiff) + Math.abs(diff));
      const tHit = t - step + frac * step;
      return { x: start.x + dir.x * tHit, y: start.y + dir.y * tHit, t: tHit };
    }
    prevDiff = diff;
  }
  return null;
}

function rayIntersectXY(p1, d1, p2, d2) {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-12) return null;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const t = (dx * d2.y - dy * d2.x) / denom;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y, t };
}

function buildSmallCircleXY(decl) {
  const p0 = { x: 0, y: 0 };
  const p1 = advancePt(p0, 16,  3000, decl);
  const p2 = advancePt(p1, 286, 3000, decl);
  const p3 = advancePt(p2, 196, 6000, decl);
  const p4 = advancePt(p3, 106, 3000, decl);
  const p5 = advancePt(p4, 16,  3000, decl);
  // Замыкаем на КТА — независимо от накопленной погрешности
  return { points: [p0, p1, p2, p3, p4, p5, { x: 0, y: 0 }], turns: null };
}

function buildBigCircleXY(decl) {
  const DPRM_xy = toXYkta(DPRM_POINT);
  const p0 = { x: 0, y: 0 };
  const p1 = advancePt(p0, 16,  3000, decl);
  const p2 = advancePt(p1, 286, 3000, decl);

  // Б3: вдоль 196 mag до МПР ДПРМ = 057
  let p3 = findMprPoint(p2, 196, 57, DPRM_xy, decl);
  if (!p3) p3 = advancePt(p2, 196, 11000, decl); // fallback

  // Б4: вдоль 106 mag до пересечения с линией через КТА в направлении 196 mag
  let p4 = rayIntersectXY(p3, dirVec(106, decl), { x: 0, y: 0 }, dirVec(196, decl));
  if (!p4 || p4.t < 0) p4 = advancePt(p3, 106, 3000, decl); // fallback

  // Траверз ДПРМ на участке Б3 (МК 196°): КУР 270° = МПР 106°.
  // Находим ортогональную проекцию ДПРМ на линию p2 → p3.
  const downwindDir = dirVec(196, decl);
  const traverseDist = (DPRM_xy.x - p2.x) * downwindDir.x +
                       (DPRM_xy.y - p2.y) * downwindDir.y;
  const legLen = (p3.x - p2.x) * downwindDir.x +
                 (p3.y - p2.y) * downwindDir.y;
  const traverse = traverseDist >= 0 && traverseDist <= legLen
    ? { x: p2.x + downwindDir.x * traverseDist,
        y: p2.y + downwindDir.y * traverseDist }
    : null;

  // Б5: замыкаем в КТА. Фиолетовая точка МПР 029° не отображается.
  return {
    points: [p0, p1, p2, p3, p4, { x: 0, y: 0 }],
    turns: { p3, p4, traverse }
  };
}

// ВПП 20: сначала разворот маршрута 02 на 180° относительно КТА,
// затем зеркальное отражение относительно ОСИ ВПП, проходящей через КТА.
// Ось параллельна длинной стороне круга (Б3). Поэтому начальная/конечная
// точка остаётся на КТА, северная вытянутая часть сохраняется, а все четыре
// поворота становятся ПРАВЫМИ. Отражение относительно самой линии Б3
// сдвинуло бы КТА и привело к неверному началу/концу маршрута.
function buildBigCircle20XY(decl) {
  const circle02 = buildBigCircleXY(decl);
  const axis = dirVec(16, decl); // ось ВПП 02/20 через КТА
  const turnAndMirror = p => {
    if (!p) return null;
    // Центральная симметрия: (x, y) -> (-x, -y).
    const rx = -p.x, ry = -p.y;
    // Отражение относительно прямой через КТА с единичным вектором axis.
    const projection = rx * axis.x + ry * axis.y;
    return {
      x: 2 * projection * axis.x - rx,
      y: 2 * projection * axis.y - ry
    };
  };
  return {
    points: circle02.points.map(turnAndMirror),
    turns: circle02.turns ? {
      p3: turnAndMirror(circle02.turns.p3),
      p4: turnAndMirror(circle02.turns.p4),
      // Условный траверз на том же удалении от начала Б3, что и у ВПП 02.
      // Это НЕ реальный траверз ДПРМ по КУР — только геометрическая метка.
      traverse: turnAndMirror(circle02.turns.traverse)
    } : null
  };
}

function fmtTurnMpr(decl) {
  return 'МПР ДПРМ';
}

function renderCircle() {
  circleLayer.forEach(l => map.removeLayer(l));
  circleLayer = [];

  const cb = document.getElementById('toggleCircle');
  const typeEl = document.getElementById('circleType');
  const type = typeEl && typeEl.checked ? 'big' : 'small';
  if (!cb || !cb.checked) return;

  const runway20 = !!document.getElementById('circleRunway20')?.checked;
  const decl = getDecl();

  let built, color, dash;

  if (type === 'small') {
    built = buildSmallCircleXY(decl);
    color = '#2a7';
    dash = null;
  } else {
    built = runway20 ? buildBigCircle20XY(decl) : buildBigCircleXY(decl);
    color = '#e33';
    dash = '8,4';
  }

  const latlngs = built.points.map(xy => {
    const p = fromXYkta(xy);
    return [p.lat, p.lon];
  });

  const line = L.polyline(latlngs, {
    color: color, weight: 3, opacity: 0.85,
    dashArray: dash, interactive: false
  }).addTo(map);
  circleLayer.push(line);

  // Маркеры разворотов для большого круга
  if (type === 'big' && built.turns) {
    const t3 = fromXYkta(built.turns.p3);
    const m3 = L.marker([t3.lat, t3.lon], { icon: turnIcon('#e67e22') }).addTo(map);
    m3.bindPopup(
      '<b>3-й разворот</b><br>' +
      (runway20 ? 'Правый круг ВПП 20 (геометрический вариант)<br>' : 'МПР ДПРМ = 057°<br>') +
      '<span style="color:#888;font-size:11px">' + ddToDM(t3.lat, true) + ' ' + ddToDM(t3.lon, false) + '</span>'
    );
    circleLayer.push(m3);

    if (built.turns.p4) {
      const t4 = fromXYkta(built.turns.p4);
      const m4 = L.marker([t4.lat, t4.lon], { icon: turnIcon('#888') }).addTo(map);
      m4.bindPopup(
        '<b>Конец 4-го разворота (расчёт)</b><br>' +
        (runway20
          ? 'Правый круг ВПП 20, расчётная точка<br>'
          : 'Пересечение курса 106° с линией 016° через КТА<br>') +
        '<span style="color:#888;font-size:11px">' + ddToDM(t4.lat, true) + ' ' + ddToDM(t4.lon, false) + '</span>'
      );
      circleLayer.push(m4);
    }

    // Траверз ВПП 02 — действительная геометрическая проекция ДПРМ.
    // Для ВПП 20 метка ТОЛЬКО условная: зеркальный перенос на то же
    // расстояние от второго разворота вдоль длинной стороны круга.
    if (built.turns.traverse) {
      const tv = fromXYkta(built.turns.traverse);
      const marker = L.marker([tv.lat, tv.lon], { icon: turnIcon(runway20 ? '#7186a1' : '#08c') }).addTo(map);
      marker.bindPopup(runway20
        ? '<b>Виртуальный траверз — ВПП 20</b><br>' +
          'Условная точка на длинной стороне, на том же удалении от 2-го разворота, что и траверз ВПП 02.<br>' +
          '<span style="color:#b45b00">Не является реальным траверзом ДПРМ или точкой по КУР.</span><br>' +
          '<span style="color:#888;font-size:11px">' + ddToDM(tv.lat, true) + ' ' + ddToDM(tv.lon, false) + '</span>'
        : '<b>Траверз ДПРМ — ВПП 02</b><br>' +
          'МК 196° / КУР 270° (−90°)<br>' +
          'МПР ДПРМ = 106°<br>' +
          '<span style="color:#888;font-size:11px">' + ddToDM(tv.lat, true) + ' ' + ddToDM(tv.lon, false) + '</span>'
      );
      circleLayer.push(marker);
    }
  }

  // Метка на КТА (для наглядности)
  const ktaLL = KTA_POINT;
  const ktaMark = L.marker([ktaLL.lat, ktaLL.lon], {
    icon: L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;background:#d00;border:2px solid white;border-radius:50%;' +
            'box-shadow:0 0 4px rgba(0,0,0,0.6);"></div>',
      iconSize: [16, 16], iconAnchor: [8, 8]
    }),
    interactive: false
  }).addTo(map);
  circleLayer.push(ktaMark);
}
// === КОНЕЦ БЛОКА 28-B ===

// === БЛОК 29: ERROR LINES ===
function drawErrorLines(sources) {
  errorLines.forEach(l => map.removeLayer(l));
  errorLines = [];
  sources.forEach(s => {
    const rad = toRad(s.ips);
    const R = 6371000;
    const cosLat = Math.cos(toRad(s.data.lat));
    const dLat = toDeg(Math.cos(rad) * ERROR_LINE_KM * 1000 / R);
    const dLon = toDeg(Math.sin(rad) * ERROR_LINE_KM * 1000 / (R * cosLat));
    const lat2 = s.data.lat + dLat;
    const lon2 = s.data.lon + dLon;
    const popup = '<b>' + s.name + '</b><br>' + s.inputLabel + ' → ИПС ' + s.ips.toFixed(0) + '°<br>' +
                  '<span style="color:#888;font-size:11px">Линия при ошибке (50 км)</span>';
    const pair = makeClickableLine(
      [[s.data.lat, s.data.lon], [lat2, lon2]],
      { color: s.color, weight: 2, opacity: 0.7, dashArray: '6,4' }, popup
    );
    errorLines.push(pair[0], pair[1]);
  });
}

function clearErrorLines() {
  errorLines.forEach(l => map.removeLayer(l));
  errorLines = [];
}
// === КОНЕЦ БЛОКА 29 ===

// === БЛОК 30: CLEAR ===
function clearFields() {
  ['brg1','brg2','brg3','brg4','vorRadial','vorDist','course','courseRT'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('decl').value = '11';
  for (let i = 1; i <= 5; i++) document.getElementById('calc' + i).innerHTML = '';
  stationLines.forEach(l => map.removeLayer(l));
  stationLines = [];
  clearErrorLines();
  if (posMarker) { map.removeLayer(posMarker); posMarker = null; }
  renderTrack();
  document.getElementById('result').textContent = 'Поля очищены. Введите новые данные.';
  document.getElementById('result').classList.remove('error');
}

function clearTrack() {
  track = [];
  saveTrack();
  renderTrack();
  document.getElementById('result').textContent = 'Трек ОПРС очищен.';
  document.getElementById('result').classList.remove('error');
}

function clearGps() {
  trackGps = [];
  saveTrackGps();
  if (gpsMarker) { map.removeLayer(gpsMarker); gpsMarker = null; }
  renderTrack();
  document.getElementById('result').textContent = 'Трек GPS очищен.';
  document.getElementById('result').classList.remove('error');
  updateNavUI();
}
// === КОНЕЦ БЛОКА 30 ===

// === БЛОК 31: PREVIEW ===
function preview() {
  const decl = parseFloat(document.getElementById('decl').value) || 0;
  for (let i = 0; i < 4; i++) {
    const v = document.getElementById('brg' + (i + 1)).value.trim();
    const el = document.getElementById('calc' + (i + 1));
    if (v === '') { el.innerHTML = ''; continue; }
    const mpr = parseFloat(v);
    if (isNaN(mpr)) { el.innerHTML = ''; continue; }
    const mps = norm360(mpr + 180);
    const ips = norm360(mps + decl);
    el.innerHTML = 'МПР ' + mpr.toFixed(0) + '° → МПС ' + mps.toFixed(0) +
                   '° → <b>ИПС ' + ips.toFixed(0) + '°</b>';
  }
  const rv = document.getElementById('vorRadial').value.trim();
  const el5 = document.getElementById('calc5');
  if (rv !== '') {
    const radial = parseFloat(rv);
    if (!isNaN(radial)) {
      const ips = norm360(radial + decl);
      el5.innerHTML = 'Радиал (МПС) ' + radial.toFixed(0) + '° → <b>ИПС ' + ips.toFixed(0) + '°</b>';
    } else el5.innerHTML = '';
  } else el5.innerHTML = '';
}
// === КОНЕЦ БЛОКА 31 ===

// === БЛОК 32: ALIGN GPS ===
function alignToGPS() {
  const resultEl = document.getElementById('result');
  resultEl.classList.remove('error');
  if (!gpsMarker) {
    resultEl.classList.add('error');
    resultEl.textContent = '⚠️ Сначала нажмите «📍 Получить МС», чтобы получить точку GPS.';
    return;
  }
  const ll = gpsMarker.getLatLng();
  const gpsPt = { lat: ll.lat, lon: ll.lng };
  const decl = parseFloat(document.getElementById('decl').value) || 0;

  for (let i = 0; i < 4; i++) {
    const s = PRESET[i];
    const brgTrue = trueBearing(gpsPt, s);
    const mpr = norm360(brgTrue - decl);
    document.getElementById('brg' + (i + 1)).value = mpr.toFixed(0);
  }
  preview();
  resultEl.textContent = '📍 Поля МПР приведены к GPS: ' +
    ddToDM(gpsPt.lat, true) + ' ' + ddToDM(gpsPt.lon, false) +
    '. Нажмите «Рассчитать» — результат должен совпасть с GPS-точкой.';
}
// === КОНЕЦ БЛОКА 32 ===

// === БЛОК 33: TRACK ===
function saveTrack() {
  try { localStorage.setItem(TRACK_KEY, JSON.stringify(track)); } catch (e) {}
}
function loadTrack() {
  try {
    const raw = localStorage.getItem(TRACK_KEY);
    if (raw) track = JSON.parse(raw) || [];
  } catch (e) { track = []; }
}
function saveTrackGps() {
  try { localStorage.setItem(TRACK_GPS_KEY, JSON.stringify(trackGps)); } catch (e) {}
}
function loadTrackGps() {
  try {
    const raw = localStorage.getItem(TRACK_GPS_KEY);
    if (raw) trackGps = JSON.parse(raw) || [];
  } catch (e) { trackGps = []; }
}

function buildSegmentPopup(arr, fromIdx) {
  const a = arr[fromIdx];
  const b = arr[fromIdx + 1];
  const distKm = distance(a, b) / 1000;
  const dtSec = (b.t - a.t) / 1000;
  const timeStr = fmtDuration(dtSec);
  const speedKmh = dtSec > 0 ? (distKm * 3600 / dtSec) : 0;
  return '<b>Участок #' + (fromIdx + 1) + ' → #' + (fromIdx + 2) + '</b><br>' +
         'Время: <b>' + timeStr + '</b><br>' +
         'Скорость: <b>' + speedKmh.toFixed(1) + ' км/ч</b><br>' +
         'Длина: ' + distKm.toFixed(2) + ' км';
}

function drawOneTrack(arr, color, label) {
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i];
    const b = arr[i + 1];
    const pair = makeClickableLine(
      [[a.lat, a.lon], [b.lat, b.lon]],
      { color: color, weight: 2, opacity: 0.7, dashArray: '6,4' },
      () => buildSegmentPopup(arr, i)
    );
    trackSegments.push(pair[0], pair[1]);
  }
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    const m = L.marker([p.lat, p.lon], { icon: dotIcon(color) })
      .addTo(map)
      .bindPopup(label + ' #' + (i + 1) + '<br>' + fmtTime(p.t) + '<br>' +
                 p.lat.toFixed(5) + ', ' + p.lon.toFixed(5));
    trackPointLayers.push(m);
  }
}

function renderTrack() {
  trackSegments.forEach(l => map.removeLayer(l));
  trackSegments = [];
  trackPointLayers.forEach(m => map.removeLayer(m));
  trackPointLayers = [];
  if (posMarker) { map.removeLayer(posMarker); posMarker = null; }

  drawOneTrack(track, '#2a7', 'Измерение ОПРС');
  drawOneTrack(trackGps, '#e67e22', 'Точка GPS');

  const lastOprs = track.length > 0 ? track[track.length - 1] : null;
  const lastGps = trackGps.length > 0 ? trackGps[trackGps.length - 1] : null;
  let plane = null;
  if (lastOprs && lastGps) plane = (lastOprs.t > lastGps.t) ? lastOprs : lastGps;
  else if (lastOprs) plane = lastOprs;
  else if (lastGps) plane = lastGps;

  if (plane) {
    const courseMag = getCourseMag();
    const decl = parseFloat(document.getElementById('decl').value) || 0;
    const courseTrue = norm360(courseMag + decl);
    posMarker = L.marker([plane.lat, plane.lon], { icon: planeIcon(courseTrue) })
      .addTo(map)
      .bindPopup('Последнее местоположение<br>' + fmtTime(plane.t) + '<br>' +
                 plane.lat.toFixed(5) + ', ' + plane.lon.toFixed(5));
    trackPointLayers.push(posMarker);
  }

  updateNavUI();
  updateRTUI();
}
// === КОНЕЦ БЛОКА 33 ===

// === БЛОК 34: NAV ===
function getGPSHeadingMag() {
  if (!rtTracking || !rtCurrentPosition) return null;
  let heading = rtCurrentPosition.heading;
  if (heading === null || heading === undefined || isNaN(heading)) {
    if (rtTrack.length >= 2) {
      const a = rtTrack[rtTrack.length - 2];
      const b = rtTrack[rtTrack.length - 1];
      if (a.flightId === b.flightId && distance(a, b) > 1) heading = trueBearing(a, b);
    }
  }
  if (heading === null || heading === undefined || isNaN(heading)) return null;
  const decl = parseFloat(document.getElementById('decl').value) || 0;
  return norm360(heading - decl);
}

function getGPSSpeedKmh() {
  if (!rtTracking || !rtCurrentPosition) return null;
  if (rtCurrentPosition.speed === null || rtCurrentPosition.speed === undefined || isNaN(rtCurrentPosition.speed)) return null;
  return rtCurrentPosition.speed * 3.6;
}

function getCurrentSpeedKmh(targetPt) {
  const gpsV = getGPSSpeedKmh();
  if (gpsV !== null && gpsV > 1) return gpsV;

  const wdRaw = document.getElementById('windDir').value.trim();
  const wsRaw = document.getElementById('windSpd').value.trim();
  const asRaw = document.getElementById('airspeed').value.trim();
  const wd = wdRaw === '' ? NaN : parseFloat(wdRaw);
  const ws = getWindSpeedKmh();
  const as = asRaw === '' ? NaN : parseFloat(asRaw.replace(',', '.'));
  if (isNaN(wd) || isNaN(ws) || isNaN(as) || as <= 0) return null;

  const cur = getCurrentPosition();
  if (!cur || !targetPt) return null;
  const ipu = trueBearing(cur, targetPt);
  const decl = parseFloat(document.getElementById('decl').value) || 0;
  const mpu = norm360(ipu - decl);
  let uv = norm360(mpu - wd);
  if (uv > 180) uv -= 360;
  const sinUS = (ws / as) * Math.sin(toRad(uv));
  const clampedSin = Math.max(-1, Math.min(1, sinUS));
  const usDeg = toDeg(Math.asin(clampedSin));
  const wGround = as * Math.cos(toRad(usDeg)) + ws * Math.cos(toRad(uv));
  return wGround > 0.1 ? wGround : null;
}

function startTargetEdit() {
  targetEditMode = !targetEditMode;
  if(targetEditMode && routeEditorDraft) {routeEditorMapMode='none';routeEditorMoveIndex=-1;updateRouteEditorUI();}
  // На телефоне сразу показываем карту: пользователь выбирает цель касанием.
  // В режиме отмены меню остаётся открытым, а на десктопе поведение не меняется.
  const touchScreen = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (targetEditMode && (window.innerWidth <= 600 || touchScreen)) {
    const panel = document.getElementById('panel');
    if (panel && !panel.classList.contains('hidden')) togglePanel();
  }
  updateMapInteractivity();
  updateNavUI();
}

function setNavTarget(lat, lon) {
  navTarget = { lat, lon };
  hsiState.mode = 'direct';
  persistHSISettings();
  const cur = getCurrentPosition();
  if (cur) navLineStart = { lat: cur.lat, lon: cur.lon };
  else navLineStart = null;
  recordConfigurationEvent('target-changed');
  targetEditMode = false;
  updateMapInteractivity();
  updateNavUI();
  updateRTUI();
}

function clearNavTarget() {
  navTarget = null;
  navLineStart = null;
  targetEditMode = false;
  updateMapInteractivity();
  recordConfigurationEvent('target-cleared');
  updateNavUI();
  updateRTUI();
}

function refreshRoute() {
  if (!navTarget) { alert('Сначала задайте цель.'); return; }
  const cur = getCurrentPosition();
  if (!cur) { alert('Нет текущего положения. Включите GPS или посчитайте по ОПРС.'); return; }
  navLineStart = { lat: cur.lat, lon: cur.lon };
  recordConfigurationEvent('direct-route-refreshed');
  updateNavUI();
  updateRTUI();
}

function computeNav() {
  const cur = getCurrentPosition();
  if (!cur || !navTarget) return null;
  const distKm = distance(cur, navTarget) / 1000;
  const ipu = trueBearing(cur, navTarget);
  const decl = parseFloat(document.getElementById('decl').value) || 0;
  const mpu = norm360((navLineStart ? trueBearing(navLineStart, navTarget) : ipu) - decl);

  const wdRaw = document.getElementById('windDir').value.trim();
  const wsRaw = document.getElementById('windSpd').value.trim();
  const asRaw = document.getElementById('airspeed').value.trim();
  const wd = wdRaw === '' ? NaN : parseFloat(wdRaw);
  const ws = getWindSpeedKmh();
  const as = asRaw === '' ? NaN : parseFloat(asRaw.replace(',', '.'));

  let wind = null;
  if (!isNaN(wd) && !isNaN(ws) && !isNaN(as) && as > 0) {
    let uv = norm360(mpu - wd);
    if (uv > 180) uv -= 360;
    const sinUS = (ws / as) * Math.sin(toRad(uv));
    const clampedSin = Math.max(-1, Math.min(1, sinUS));
    const usDeg = toDeg(Math.asin(clampedSin));
    const mk = norm360(mpu - usDeg);
    const wGround = as * Math.cos(toRad(usDeg)) + ws * Math.cos(toRad(uv));
    let etaSec = null;
    if (wGround > 0.1) etaSec = (distKm / wGround) * 3600;
    wind = { uv, usDeg, mk, wGround, etaSec };
  }
  return { cur, distKm, ipu, mpu, wind };
}

function buildNavPopupHtml() {
  const n = computeNav();
  if (!n) return '🎯 Цель';
  let html = '<b>🎯 Цель</b><br>';
  html += '<b>Расстояние:</b> ' + n.distKm.toFixed(1) + ' км<br>';
  html += '<b>ЗМПУ:</b> ' + n.mpu.toFixed(0) + '°';

  if (navLineStart) {
    const cur = getCurrentPosition();
    if (cur) {
      const offHtml = fmtOffset(cur, navLineStart, navTarget);
      if (offHtml) {
        html += '<hr style="margin:4px 0;border:0;border-top:1px solid #ddd">';
        html += offHtml;
      }
    }
  }

  let etaSec = null;
  const gpsSpeedKmh = getGPSSpeedKmh();
  if (gpsSpeedKmh !== null && gpsSpeedKmh > 1) {
    etaSec = (n.distKm / gpsSpeedKmh) * 3600;
  } else if (n.wind && n.wind.etaSec !== null) {
    etaSec = n.wind.etaSec;
  }

  const hasWind = !!n.wind;
  const hasEta = etaSec !== null;

  if (hasWind || hasEta) {
    html += '<hr style="margin:4px 0;border:0;border-top:1px solid #ddd">';
    if (hasWind) {
      html += '<b>УС:</b> ' + n.wind.usDeg.toFixed(1) + '°';
      if (Math.abs(n.wind.usDeg) > 0.5) {
        html += n.wind.usDeg > 0 ? ' <span style="color:#c00">вправо</span>' : ' <span style="color:#c00">влево</span>';
      }
      html += '<br><b>МК:</b> <span style="color:#2a7"><b>' + n.wind.mk.toFixed(0) + '°</b></span>';
    }
    if (hasEta) {
      if (hasWind) html += '<br>';
      html += '<b>ETE:</b> ' + fmtDuration(etaSec);
      html += '<br><b>ETA:</b> ' + fmtEtaAbs(etaSec);
    }
  } else {
    html += '<hr style="margin:4px 0;border:0;border-top:1px solid #ddd">';
    html += '<span style="color:#888;font-size:11px">Заполните ветер и скорость или включите GPS</span>';
  }
  return html + freshnessWarning(n.cur);
}

function updateNavUI() {
  if (navLine) { navLine.forEach(l => map.removeLayer(l)); navLine = null; }
  if (navTargetMarker) { map.removeLayer(navTargetMarker); navTargetMarker = null; }
  const cur = getCurrentPosition();
  if (navTarget && !navLineStart && hsiState.mode === 'direct' && cur) {
    navLineStart = { lat:cur.lat, lon:cur.lon };
    recordConfigurationEvent('direct-start-fixed');
  }

  if (navTarget) {
    const popupFn = () => buildNavPopupHtml();
    navTargetMarker = L.marker([navTarget.lat, navTarget.lon], { icon: targetIcon() }).addTo(map);
    bindLivePopup(navTargetMarker, popupFn, { autoPan: true });
    if (navLineStart && hsiState.mode === 'direct') {
      navLine = makeClickableLine(
        [[navLineStart.lat, navLineStart.lon], [navTarget.lat, navTarget.lon]],
        { color: '#e67e22', weight: 3, opacity: 0.85, dashArray: '8,4' },
        popupFn
      );
    }
  }

  const posEl = document.getElementById('nav-pos');
  if (cur) {
    posEl.innerHTML = '<b>' + cur.source + '</b><br>' +
                      ddToDM(cur.lat, true) + ' ' + ddToDM(cur.lon, false) +
                      freshnessWarning(cur);
  } else {
    posEl.innerHTML = '<span style="color:#c00">Не определено. Включите GPS или посчитайте по ОПРС.</span>';
  }

  const tgtEl = document.getElementById('nav-target');
  if (navTarget) tgtEl.innerHTML = ddToDM(navTarget.lat, true) + ' ' + ddToDM(navTarget.lon, false);
  else tgtEl.innerHTML = '<span style="color:#888">Цель не задана</span>';

  const setBtn = document.getElementById('setTargetBtn');
  const hint = document.getElementById('targetEditHint');
  if (setBtn) {
    if (targetEditMode) {
      setBtn.classList.add('target-edit-active');
      setBtn.textContent = '✕ Отменить';
    } else {
      setBtn.classList.remove('target-edit-active');
      setBtn.textContent = '🎯 Задать цель';
    }
  }
  if (hint) hint.style.display = targetEditMode ? 'block' : 'none';

  const resEl = document.getElementById('nav-result');
  resEl.classList.remove('error');
  if (!cur) { resEl.innerHTML = 'Сначала определите своё местоположение (GPS или расчёт ОПРС).'; return; }
  if (hsiState.mode !== 'direct') {
    resEl.innerHTML = guidanceSummaryHtml(cur);
    renderHSIGuideLine();
    refreshHSIPanel();
    return;
  }
  if (!navTarget) {
    resEl.innerHTML = targetEditMode
      ? 'Кликните по карте — там будет цель.'
      : 'Нажмите «🎯 Задать цель», чтобы поставить цель.';
    return;
  }

  const n = computeNav();
  if (!n) { resEl.innerHTML = '—'; return; }

  let html = '<b>Расстояние:</b> ' + n.distKm.toFixed(1) + ' км<br>';
  html += '<b>ЗМПУ:</b> ' + n.mpu.toFixed(0) + '°';

  if (navLineStart) {
    const offHtml = fmtOffset(cur, navLineStart, navTarget);
    if (offHtml) {
      html += '<hr style="margin:6px 0;border:0;border-top:1px solid #ddd">';
      html += offHtml;
    }
  }

  let etaSec = null;
  const gpsSpeedKmh = getGPSSpeedKmh();
  if (gpsSpeedKmh !== null && gpsSpeedKmh > 1) etaSec = (n.distKm / gpsSpeedKmh) * 3600;
  else if (n.wind && n.wind.etaSec !== null) etaSec = n.wind.etaSec;

  if (n.wind || etaSec !== null) {
    html += '<hr style="margin:6px 0;border:0;border-top:1px solid #ddd">';
    if (n.wind) {
      html += '<b>УВ:</b> ' + n.wind.uv.toFixed(0) + '°';
      html += n.wind.uv > 0 ? ' <span style="color:#888">(справа)</span>' : (n.wind.uv < 0 ? ' <span style="color:#888">(слева)</span>' : '');
      html += '<br><b>УС:</b> ' + n.wind.usDeg.toFixed(1) + '°';
      if (Math.abs(n.wind.usDeg) > 0.5) {
        html += n.wind.usDeg > 0 ? ' <span style="color:#c00">вправо</span>' : ' <span style="color:#c00">влево</span>';
      }
      html += '<br><b style="color:#2a7">МК: ' + n.wind.mk.toFixed(0) + '°</b><br>';
      html += '<b>Путевая:</b> ' + n.wind.wGround.toFixed(0) + ' км/ч<br>';
    }
    if (etaSec !== null) {
      html += '<b>ETE:</b> ' + fmtDuration(etaSec) + '<br>';
      html += '<b>ETA:</b> ' + fmtEtaAbs(etaSec);
    }
  } else {
    html += '<hr style="margin:6px 0;border:0;border-top:1px solid #ddd">';
    html += '<span style="color:#888;font-size:11px">Заполните поля ветра и скорости, чтобы рассчитать УС и МК</span>';
  }
  resEl.innerHTML = html;
  renderHSIGuideLine();
  refreshHSIPanel();
}

map.on('click', e => {
  if (currentTab !== 'nav') return;
  if (routeEditorDraft && routeEditorMapMode === 'add') {
    routeEditorAddPoint(e.latlng.lat,e.latlng.lng);
    return;
  }
  if (routeEditorDraft && routeEditorMapMode === 'move' && routeEditorMoveIndex >= 0) {
    routeEditorPlaceMovedPoint(e.latlng.lat,e.latlng.lng);
    return;
  }
  if (targetEditMode) setNavTarget(e.latlng.lat, e.latlng.lng);
});
// === КОНЕЦ БЛОКА 34 ===


// === БЛОК 34-A: РЕДАКТОР ПОЛЬЗОВАТЕЛЬСКИХ МАРШРУТОВ ===
// Исторические маршруты профиля не редактируем. В localStorage лежат только свои маршруты.
function safeText(value) {
  return String(value).replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
function cloneRoute(v) { return JSON.parse(JSON.stringify(v)); }
function validRoutePoint(p) {
  return p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)) &&
    Number(p.lat)>=-90 && Number(p.lat)<=90 && Number(p.lon)>=-180 && Number(p.lon)<=180;
}
function parseImportedRoute(v) {
  if (!v || !Array.isArray(v.points) || v.points.length < 2 || v.points.length > 150)
    throw new Error('В маршруте должно быть от 2 до 150 ППМ');
  const points = v.points.map((p,i)=> {
    if (!validRoutePoint(p)) throw new Error('Некорректные координаты ППМ №'+(i+1));
    return {name: String(p.name||'ППМ '+(i+1)).slice(0,65),lat:Number(p.lat),lon:Number(p.lon)};
  });
  if (points.some((p,i)=>i>0 && distance(p,points[i-1])<5))
    throw new Error('Соседние ППМ совпадают (или ближе 5 м)');
  return {name:String(v.name||'Мой маршрут').trim().slice(0,65)||'Мой маршрут',points};
}
function newUserRouteId() {
  let id;
  do { id=USER_ROUTE_PREFIX+Date.now().toString()+'_'+Math.floor(Math.random()*10000); }
  while (userRoutes.some(r=>r.id===id));
  return id;
}
function persistUserRoutes(next) {
  if(userRoutesLoadFailed)throw new Error('Нечитаемая прежняя база маршрутов: данные не перезаписаны');
  if (next.length>60) throw new Error('Не более 60 сохранённых маршрутов');
  // Сначала подтверждаем запись в хранилище, только потом меняем активные данные.
  localStorage.setItem(USER_ROUTES_KEY,JSON.stringify({format:'naebacia-user-routes',version:1,routes:next}));
  userRoutes=next;
  syncUserRouteCatalog();
}
function loadUserRoutes() {
  try {
    const raw=localStorage.getItem(USER_ROUTES_KEY);
    if(!raw) return;
    const parsed=JSON.parse(raw);
    if(!parsed || parsed.format!=='naebacia-user-routes' || !Array.isArray(parsed.routes))
      throw new Error('Неподдерживаемый формат');
    userRoutes=parsed.routes.slice(0,60).map(r=>{
      const clean=parseImportedRoute(r);
      const id=typeof r.id==='string' && /^USER_\d+_\d+$/.test(r.id)?r.id:newUserRouteId();
      return {id,name:clean.name,points:clean.points,createdAt:Number(r.createdAt)||Date.now(),updatedAt:Number(r.updatedAt)||Date.now()};
    });
    syncUserRouteCatalog();
  } catch(e) {
    userRoutesLoadFailed=true;
    console.warn('Свои маршруты не прочитаны; старые данные НЕ удалены:',e);
    const status=document.getElementById('myRouteStatus');
    if(status) status.textContent='⚠ Не удалось прочитать маршруты: данные в памяти браузера не удалены. Не перезаписывайте их до резервного копирования.';
  }
}
function syncUserRouteCatalog() {
  Object.keys(ROUTES).filter(k=>k.startsWith(USER_ROUTE_PREFIX)).forEach(k=>delete ROUTES[k]);
  for(const route of userRoutes) ROUTES[route.id]={name:route.name,color:'#ef871e',points:cloneRoute(route.points),custom:true};
  if (hsiState && hsiState.routeKey && !ROUTES[hsiState.routeKey]) {
    hsiState.routeKey=''; hsiState.legIndex=0; hsiState.awaitingRouteFix=0;
    hsiNeedsInitialLegFix=false; persistHSISettings();
  }
  renderUserRoutes();
  if (document.getElementById('hsiRouteSelect')) {
    buildHSISelects();refreshHSIPanel();
  }
  updateRouteEditorUI();
}
function renderUserRoutes() {
  const container=document.getElementById('userRouteLayerToggles');
  if(!container)return;
  const previous=Array.from(container.querySelectorAll('input')).filter(e=>e.checked).map(e=>e.value);
  const enabled=new Set(previous);
  // Сохраняем ранее включённые слои при переключении других штатных маршрутов.
  for(const route of userRoutes) {
    const layers=routeLayers[route.id]||[];
    layers.forEach(l=>map.removeLayer(l));routeLayers[route.id]=[];
  }
  Object.keys(routeLayers).filter(k=>k.startsWith(USER_ROUTE_PREFIX) && !userRoutes.some(r=>r.id===k))
    .forEach(k=>{routeLayers[k].forEach(l=>map.removeLayer(l));delete routeLayers[k];});
  container.innerHTML=userRoutes.map(r=>'<div class="route-toggle"><input type="checkbox" value="'+r.id+'" id="route'+r.id+'" onchange="renderUserRoutes()" '+(enabled.has(r.id)?'checked':'')+'><span class="route-swatch" style="background:#ef871e"></span><label for="route'+r.id+'">'+safeText(r.name)+'</label></div>').join('') || '<div class="hint">Своих маршрутов пока нет</div>';
  for(const r of userRoutes){
    if(!enabled.has(r.id)) continue;
    const route=ROUTES[r.id];
    const layers=routeLayers[r.id];
    for(let i=0;i<r.points.length-1;i++){
      const a=r.points[i], b=r.points[i+1];
      const pair=makeClickableLine([[a.lat,a.lon],[b.lat,b.lon]],
        {color:'#ef871e',weight:3,opacity:.8},()=>buildRouteSegmentPopup(r.id,i));
      layers.push(...pair);
    }
    r.points.forEach((p,i)=>{
      const marker=L.marker([p.lat,p.lon],{icon:routeDotIcon('#ef871e')}).addTo(map);
      bindLivePopup(marker,()=>buildRoutePointPopup(r.id,i,[i]),{autoPan:true});layers.push(marker);
    });
  }
}
function editorOpen() {
  const section=document.getElementById('myRouteEditor');
  section.hidden=!section.hidden;
  updateRouteEditorUI();
}
function editorStartDraft(draft, savedId) {
  if(routeEditorDraft && editorIsDirty() && !confirm('Закрыть текущий несохранённый черновик?'))return;
  targetEditMode=false;
  routeEditorDraft=cloneRoute(draft);
  routeEditorSavedId=savedId||null;
  routeEditorSavedSnapshot=savedId?JSON.stringify(draft):'';
  routeEditorHistory=[cloneRoute(routeEditorDraft)];routeEditorHistoryIndex=0;
  routeEditorMoveIndex=-1;routeEditorMapMode='add';routeEditorBannerDismissed=false;
  document.getElementById('myRouteEditor').hidden=false;
  updateMapInteractivity(); updateNavUI();updateRouteEditorUI();renderRouteEditorOnMap();
}
function editorCreate() {
  editorStartDraft({name:'Мой маршрут '+(userRoutes.length+1),points:[]},null);
}
function editorEdit(id) {
  const found=userRoutes.find(r=>r.id===id);
  if(!found)return;
  editorStartDraft({name:found.name,points:found.points},id);
}
function editorIsDirty() {
  if(!routeEditorDraft)return false;
  return JSON.stringify(routeEditorDraft)!==routeEditorSavedSnapshot;
}
function editorCommit(change) {
  if(!routeEditorDraft)return;
  const next=cloneRoute(routeEditorDraft);
  change(next);
  if(JSON.stringify(next)===JSON.stringify(routeEditorDraft))return;
  routeEditorDraft=next;
  routeEditorHistory=routeEditorHistory.slice(0,routeEditorHistoryIndex+1);
  routeEditorHistory.push(cloneRoute(next));
  if(routeEditorHistory.length>80)routeEditorHistory.shift();
  routeEditorHistoryIndex=routeEditorHistory.length-1;
  renderRouteEditorOnMap();updateRouteEditorUI();
}
function editorUndo() {
  if(routeEditorHistoryIndex<=0)return;
  routeEditorDraft=cloneRoute(routeEditorHistory[--routeEditorHistoryIndex]);
  routeEditorMapMode='none';routeEditorMoveIndex=-1;
  renderRouteEditorOnMap();updateRouteEditorUI();
}
function editorRedo() {
  if(routeEditorHistoryIndex>=routeEditorHistory.length-1)return;
  routeEditorDraft=cloneRoute(routeEditorHistory[++routeEditorHistoryIndex]);
  routeEditorMapMode='none';routeEditorMoveIndex=-1;
  renderRouteEditorOnMap();updateRouteEditorUI();
}
function editorSetMapMode(mode,index=-1) {
  if(!routeEditorDraft)return;
  routeEditorMapMode=mode;routeEditorMoveIndex=mode==='move'?index:-1;
  routeEditorBannerDismissed=false;
  if(mode==='add'||mode==='move'){
    // На телефоне сразу раскрываем карту, как для постановки обычной цели.
    if(window.innerWidth<=600 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)){
      const p=document.getElementById('panel'); if(p&&!p.classList.contains('hidden'))togglePanel();
    }
  }
  updateRouteEditorUI();
}
function editorHideMapBanner() {
  // Закрываем только плавающую панель; черновик и история сохраняются.
  routeEditorBannerDismissed=true;
  routeEditorMapMode='none';routeEditorMoveIndex=-1;
  updateRouteEditorUI();
}
function editorShowMapBanner() {
  if(!routeEditorDraft)return;
  routeEditorBannerDismissed=false;
  updateRouteEditorUI();
}
function renumberDefaultRoutePoints(points) {
  points.forEach((p,i)=>{if(/^ППМ \d+$/.test(p.name))p.name='ППМ '+(i+1);});
}
function editorAddCoordinate(lat,lon,index) {
  if(!validRoutePoint({lat,lon}))return;
  if(routeEditorDraft.points.length>=150){alert('Максимум 150 ППМ в маршруте');return;}
  editorCommit(d=>{d.points.splice(index,0,{name:'ППМ '+(index+1),lat,lon});renumberDefaultRoutePoints(d.points);});
}
function routeEditorAddPoint(lat,lon) {
  editorAddCoordinate(lat,lon,routeEditorDraft.points.length);
}
function editorShowInsert(index,lat,lon) {
  if(!routeEditorDraft)return;
  const popup=L.popup({closeButton:true,maxWidth:220}).setLatLng([lat,lon])
    .setContent('<div style="font:14px sans-serif"><b>Участок '+(index+1)+'–'+(index+2)+'</b><br><button style="margin-top:8px;padding:9px" onclick="editorInsertPoint('+index+','+lat+','+lon+')">➕ Добавить ППМ здесь</button></div>');
  popup.openOn(map);
}
function editorInsertPoint(index,lat,lon) {
  map.closePopup();editorAddCoordinate(lat,lon,index+1);
}
function routeEditorPlaceMovedPoint(lat,lon) {
  const i=routeEditorMoveIndex;
  if(i<0||i>=routeEditorDraft.points.length)return;
  editorCommit(d=>{d.points[i].lat=lat;d.points[i].lon=lon;});
  routeEditorMapMode='none';routeEditorMoveIndex=-1;updateRouteEditorUI();
}
function editorNameChanged(value) {
  editorCommit(d=>{d.name=String(value).trim().slice(0,65)||'Мой маршрут';});
}
function editorRenamePoint(index,value) {
  editorCommit(d=>{if(d.points[index])d.points[index].name=String(value).trim().slice(0,65)||'ППМ '+(index+1);});
}
function editorShiftPoint(index,dir) {
  const newIndex=index+dir;
  if(newIndex<0||newIndex>=routeEditorDraft.points.length)return;
  editorCommit(d=>{const p=d.points.splice(index,1)[0];d.points.splice(newIndex,0,p);renumberDefaultRoutePoints(d.points);});
}
function editorDeletePoint(index) {
  if(!routeEditorDraft || !routeEditorDraft.points[index])return;
  editorCommit(d=>{d.points.splice(index,1);renumberDefaultRoutePoints(d.points);});
}
function editorDeletePointFromMap(index) {
  const p=routeEditorDraft?.points[index];
  if(!p)return;
  if(!confirm('Удалить ППМ №'+(index+1)+' «'+p.name+'» из черновика маршрута?'))return;
  map.closePopup();
  editorDeletePoint(index);
}
function editorCoordinates(index) {
  const p=routeEditorDraft?.points[index];if(!p)return;
  const raw=prompt('Координаты ППМ (широта; долгота), десятичные градусы:',p.lat.toFixed(6)+'; '+p.lon.toFixed(6));
  if(raw===null)return;
  const parts=raw.trim().split(/\s*[; ]\s*/).filter(Boolean);
  if(parts.length!==2){alert('Формат: 50.123456; 46.123456');return;}
  const lat=Number(parts[0].replace(',','.')),lon=Number(parts[1].replace(',','.'));
  if(!validRoutePoint({lat,lon})){alert('Неверные координаты');return;}
  editorCommit(d=>{d.points[index].lat=lat;d.points[index].lon=lon;});
}
function editorPointGo(index) {
  const p=routeEditorDraft?.points[index];if(p)map.panTo([p.lat,p.lon]);
}
function clearRouteEditorOnMap(){routeEditorLayers.forEach(l=>map.removeLayer(l));routeEditorLayers=[];}
function renderRouteEditorOnMap() {
  clearRouteEditorOnMap();
  if(!routeEditorDraft)return;
  const pts=routeEditorDraft.points;
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1];
    const coords=[[a.lat,a.lon],[b.lat,b.lon]];
    const line=L.polyline(coords,{color:'#ff8b16',weight:5,opacity:.96,interactive:false,dashArray:'10,5'}).addTo(map);
    const hit=L.polyline(coords,{color:'#ff8b16',weight:28,opacity:0.01,bubblingMouseEvents:false}).addTo(map);
    hit.on('click',(e)=>{
      if(currentTab!=='nav')return;
      if(e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
      editorShowInsert(i,e.latlng.lat,e.latlng.lng);
    });
    routeEditorLayers.push(line,hit);
  }
  pts.forEach((p,i)=>{
    const marker=L.marker([p.lat,p.lon],{draggable:true,autoPan:true,
      icon:L.divIcon({className:'',html:'<div class="route-editor-dot">'+(i+1)+'</div>',iconSize:[44,44],iconAnchor:[22,22]})}).addTo(map);
    marker.on('dragend',()=>{const ll=marker.getLatLng();editorCommit(d=>{d.points[i].lat=ll.lat;d.points[i].lon=ll.lng;});});
    marker.on('click',()=>{routeEditorMapMode='none';routeEditorMoveIndex=-1;updateRouteEditorUI();const p=routeEditorDraft.points[i];
      marker.bindPopup('<b>'+safeText(p.name)+'</b><br>'+ 
        '<button type="button" onclick="editorSetMapMode(\'move\','+i+')">Перенести касанием карты</button>'+ 
        '<br><button type="button" style="margin-top:7px;color:#b32727" onclick="editorDeletePointFromMap('+i+')">Удалить ППМ</button>').openPopup();});
    routeEditorLayers.push(marker);
  });
}
function editorSave() {
  if(!routeEditorDraft)return false;
  let clean;
  try {clean=parseImportedRoute(routeEditorDraft);}catch(e){alert('Маршрут не сохранён: '+e.message);return false;}
  const id=routeEditorSavedId||newUserRouteId();
  const old=userRoutes.find(r=>r.id===id);
  const now=Date.now();
  const item={id,name:clean.name,points:clean.points,createdAt:old?.createdAt||now,updatedAt:now};
  const next=userRoutes.filter(r=>r.id!==id).concat(item);
  try {persistUserRoutes(next);}catch(e){alert('Не удалось записать маршрут на телефоне: '+e.message+' — экспортируйте его.');return false;}
  routeEditorSavedId=id;
  routeEditorDraft={name:clean.name,points:clean.points};
  routeEditorSavedSnapshot=JSON.stringify(routeEditorDraft);
  routeEditorHistory=[cloneRoute(routeEditorDraft)];routeEditorHistoryIndex=0;
  routeEditorMapMode='none';routeEditorMoveIndex=-1;
  if(hsiState.routeKey===id){
    const fix=hsiCurrentFix();hsiState.legIndex=fix?hsiRouteBestLeg(ROUTES[id],fix):0;
    hsiNeedsInitialLegFix=!fix;persistHSISettings();renderHSIGuideLine();
  }
  const shown=document.getElementById('route'+id);if(shown)shown.checked=true;
  renderRoutes();renderRouteEditorOnMap();updateRouteEditorUI();
  recordConfigurationEvent('custom-route-saved');
  return true;
}
function editorClose() {
  if(routeEditorDraft && editorIsDirty()&&!confirm('Закрыть черновик без сохранения?'))return;
  clearRouteEditorOnMap();routeEditorDraft=null;routeEditorSavedId=null;
  routeEditorMapMode='none';routeEditorMoveIndex=-1;
  updateRouteEditorUI();
}
function editorDeleteSaved(id) {
  const r=userRoutes.find(x=>x.id===id);if(!r)return;
  if(!confirm('Удалить маршрут «'+r.name+'»? Это действие нельзя отменить.'))return;
  if(routeEditorSavedId===id){clearRouteEditorOnMap();routeEditorDraft=null;routeEditorSavedId=null;routeEditorMapMode='none';}
  try {persistUserRoutes(userRoutes.filter(x=>x.id!==id));}catch(e){alert('Не удалось удалить маршрут: '+e.message);}
}
function editorToHSI(id) {
  if(!ROUTES[id])return;
  if(routeEditorDraft && editorIsDirty()){
    if(!confirm('В HSI будет загружен СОХРАНЁННЫЙ маршрут. Продолжить без сохранения черновика?'))return;
  }
  setHSIMode('route');selectHSIRoute(id);
  const show=document.getElementById('route'+id);if(show){show.checked=true;renderUserRoutes();}
  updateRouteEditorUI();
}
function editorDownload(data,name) {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);
}
function editorExport(id) {
  const r=userRoutes.find(x=>x.id===id);if(!r)return;
  editorDownload({format:'naebacia-custom-route',version:1,name:r.name,points:r.points},'naebacia_route_'+id+'.json');
}
function editorExportAll() {
  if(!userRoutes.length){alert('Сохранённых маршрутов нет');return;}
  editorDownload({format:'naebacia-user-routes',version:1,routes:userRoutes},'naebacia_all_routes.json');
}
async function editorImportFile(input) {
  const file=input.files?.[0];if(!file)return;
  try {
    if(file.size>1000000)throw new Error('Файл слишком большой');
    const obj=JSON.parse(await file.text());
    let candidates;
    if(obj.format==='naebacia-custom-route')candidates=[obj];
    else if(obj.format==='naebacia-user-routes' && Array.isArray(obj.routes))candidates=obj.routes;
    else throw new Error('Неизвестный формат маршрута');
    if(!candidates.length||candidates.length>60)throw new Error('Некорректное число маршрутов');
    const clean=candidates.map(parseImportedRoute);
    if(userRoutes.length+clean.length>60)throw new Error('Недостаточно места для новых маршрутов (максимум 60)');
    const now=Date.now();
    const used=new Set(userRoutes.map(r=>r.id));
    const additional=clean.map(r=>{
      let id;
      do{id=USER_ROUTE_PREFIX+Date.now()+'_'+Math.floor(Math.random()*1000000000);}while(used.has(id));
      used.add(id);
      return {id,name:r.name,points:r.points,createdAt:now,updatedAt:now};
    });
    persistUserRoutes(userRoutes.concat(additional));
    alert('Импортировано маршрутов: '+additional.length+'; их можно проверить и открыть в редакторе.');
  } catch(e){alert('Импорт не выполнен: '+e.message);}
  finally {input.value='';}
}
function updateRouteEditorUI() {
  const section=document.getElementById('myRouteEditor');if(!section)return;
  const editing=!!routeEditorDraft;
  const banner=document.getElementById('routeEditorBanner');
  if(banner){
    banner.hidden=!editing||currentTab!=='nav'||routeEditorBannerDismissed;
    if(!banner.hidden){
      const instruction=routeEditorMapMode==='move'?'Коснись нового положения ППМ №'+(routeEditorMoveIndex+1):
        routeEditorMapMode==='add'?'Коснись карты для нового ППМ. Нажми на участок, чтобы вставить ППМ между точками.':'Перетаскивай ППМ или выбери действие в меню.';
      document.getElementById('routeEditorBannerText').textContent=instruction;
      for(const [id,selected] of [['routeBannerMap',routeEditorMapMode==='none'],['routeBannerAdd',routeEditorMapMode==='add']]){
        const button=document.getElementById(id);
        button.classList.toggle('selected',selected);
        button.setAttribute('aria-pressed',selected?'true':'false');
      }
    }
  }
  const list=document.getElementById('mySavedRoutes');
  if(list)list.innerHTML=userRoutes.length?userRoutes.map(r=>
    '<div class="my-route-saved"><div><b>'+safeText(r.name)+'</b><span>'+r.points.length+' ППМ</span></div><div class="my-route-buttons">'+
    '<button type="button" onclick="editorEdit(\''+r.id+'\')">✎ Править</button>'+ 
    '<button type="button" onclick="editorToHSI(\''+r.id+'\')">🧭 HSI</button>'+ 
    '<button type="button" onclick="editorExport(\''+r.id+'\')">⬇ JSON</button>'+ 
    '<button type="button" class="danger" onclick="editorDeleteSaved(\''+r.id+'\')">×</button></div></div>'
  ).join(''):'<div class="hint">Сохранённых маршрутов нет</div>';
  const draftEl=document.getElementById('myRouteDraft');
  if(!draftEl)return;
  draftEl.hidden=!editing;
  if(!editing) return;
  const name=document.getElementById('routeDraftName');
  if(name && document.activeElement!==name)name.value=routeEditorDraft.name;
  const points=document.getElementById('myRoutePoints');
  points.innerHTML=routeEditorDraft.points.map((p,i)=>
    '<div class="my-route-point"><div class="my-route-point-head"><b>ППМ '+(i+1)+'</b>'+ 
    '<span>'+p.lat.toFixed(5)+'; '+p.lon.toFixed(5)+'</span></div>'+ 
    '<input aria-label="Название ППМ '+(i+1)+'" maxlength="65" value="'+safeText(p.name)+'" onchange="editorRenamePoint('+i+',this.value)">'+
    '<div class="my-route-buttons">'+
    '<button onclick="editorPointGo('+i+')">⌖</button>'+ 
    '<button onclick="editorShiftPoint('+i+',-1)" '+(i===0?'disabled':'')+'>↑</button>'+ 
    '<button onclick="editorShiftPoint('+i+',1)" '+(i===routeEditorDraft.points.length-1?'disabled':'')+'>↓</button>'+ 
    '<button onclick="editorSetMapMode(\'move\','+i+')">Перенести</button>'+ 
    '<button onclick="editorCoordinates('+i+')">Коорд.</button>'+ 
    '<button class="danger" onclick="editorDeletePoint('+i+')">×</button>'+ 
    '</div></div>').join('')||'<div class="hint">Коснись карты, чтобы добавить первый ППМ.</div>';
  document.getElementById('routeUndo').disabled=routeEditorHistoryIndex<=0;
  document.getElementById('routeRedo').disabled=routeEditorHistoryIndex>=routeEditorHistory.length-1;
  document.getElementById('routeDraftState').textContent=editorIsDirty()?'● Несохранённый черновик':'✓ Сохранено';
  document.getElementById('routeAddMode').classList.toggle('selected',routeEditorMapMode==='add');
  document.getElementById('routeStopMode').classList.toggle('selected',routeEditorMapMode==='none');
}
// === КОНЕЦ БЛОКА 34-A ===

// === БЛОК 34-C: НЕОБЯЗАТЕЛЬНАЯ ПАСХАЛКА ===
function initJokePreference(){
  const el=document.getElementById('toggleJokeArrow');
  if(el)el.checked=localStorage.getItem(JOKE_KEY)==='1';
  updateJokeMarker();
}
function toggleJokeArrow(){
  try {localStorage.setItem(JOKE_KEY,document.getElementById('toggleJokeArrow').checked?'1':'0');}catch(_){ }
  updateJokeMarker();
}
function updateJokeMarker(){
  if(jokeMarker){map.removeLayer(jokeMarker);jokeMarker=null;}
  if(!document.getElementById('toggleJokeArrow')?.checked||!rtTracking||!rtCurrentPosition)return;
  const html='<div class="joke-caption"><span>Гей</span><svg width="143" height="62" viewBox="0 0 143 62" aria-hidden="true"><path d="M10 8 Q68 10 134 54" fill="none" stroke="#ff8b16" stroke-width="6" stroke-linecap="round"/><path d="M111 51 L135 55 L129 31" fill="none" stroke="#ff8b16" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
  jokeMarker=L.marker([rtCurrentPosition.lat,rtCurrentPosition.lon],{
    icon:L.divIcon({className:'',html,iconSize:[160,110],iconAnchor:[144,96]}),
    interactive:false,keyboard:false,zIndexOffset:1150
  }).addTo(map);
}
// === КОНЕЦ БЛОКА 34-C ===

// === БЛОК 34-B: HSI / OBS / ROUTE ===
// HSI: маршрут ROUTE выбирается вручную, активный участок выбирается и сменяется автоматически по GPS.
function hsiValidPoint(p) { return p && Number.isFinite(p.lat) && Number.isFinite(p.lon); }
function hsiCurrentFix() {
  if (rtTracking && rtCurrentPosition) {
    const age = Date.now() - rtCurrentPosition.t;
    return age >= 0 && age <= GPS_STALE_SEC * 1000 ? rtCurrentPosition : null;
  }
  const p = getCurrentPosition();
  if (!hsiValidPoint(p)) return null;
  if (Number.isFinite(p.t) && Date.now() - p.t > GPS_STALE_SEC * 1000) return null;
  return p;
}
function hsiDecl() { return getDecl(); }
function hsiCourseBetween(a,b) { return norm360(trueBearing(a,b) - hsiDecl()); }
function hsiPointAlong(anchor, trueCourse, meters) {
  const R=6371000, d=meters/R, lat=toRad(anchor.lat), lon=toRad(anchor.lon), c=toRad(trueCourse);
  const newLat=Math.asin(Math.sin(lat)*Math.cos(d)+Math.cos(lat)*Math.sin(d)*Math.cos(c));
  const newLon=lon+Math.atan2(Math.sin(c)*Math.sin(d)*Math.cos(lat),Math.cos(d)-Math.sin(lat)*Math.sin(newLat));
  return {lat:toDeg(newLat),lon:((toDeg(newLon)+540)%360)-180};
}
function hsiRouteInfo() {
  const route = ROUTES[hsiState.routeKey];
  if (!route || route.points.length < 2) return null;
  const idx=Math.max(0,Math.min(route.points.length-2,hsiState.legIndex));
  return {route,idx,A:route.points[idx],B:route.points[idx+1]};
}
function getHSIGuidance() {
  if (hsiState.mode === 'route') {
    const leg=hsiRouteInfo();
    if (!leg) return null;
    return {mode:'route',from:leg.A,to:leg.B,reference:leg.B,
      courseMag:hsiCourseBetween(leg.A,leg.B), name:leg.route.name+': '+leg.A.name+' → '+leg.B.name,
      index:leg.idx, routeKey:hsiState.routeKey};
  }
  if (hsiState.mode === 'obs') {
    if (!hsiValidPoint(hsiState.obsAnchor)) return null;
    const c=norm360(hsiState.obsCourse);
    const bearingTrue=norm360(c+hsiDecl());
    return {mode:'obs',from:hsiPointAlong(hsiState.obsAnchor,bearingTrue+180,45000),
      to:hsiPointAlong(hsiState.obsAnchor,bearingTrue,45000),reference:hsiState.obsAnchor,
      courseMag:c,name:'OBS · '+String(Math.round(c)).padStart(3,'0')+'°'};
  }
  if (!hsiValidPoint(navTarget)) return null;
  const start=navLineStart || hsiCurrentFix();
  if (!start) return null;
  return {mode:'direct',from:start,to:navTarget,reference:navTarget,
    courseMag:hsiCourseBetween(start,navTarget),name:'DIRECT · Цель'};
}
function hsiDeviation(p,g) {
  if (!hsiValidPoint(p) || !g) return null;
  const off=computeOffset(p,g.from,g.to);
  if (!off) return null;
  const signedKm=(off.side==='left'?1:off.side==='right'?-1:0)*(off.lbu/1000);
  let toFrom='—';
  if (g.mode==='obs') {
    // Отношение к выбранной опорной точке вдоль выбранного курса.
    const targetT=computeOffset(g.reference,g.from,g.to)?.t;
    toFrom=Number.isFinite(targetT) && off.t <= targetT ? 'TO' : 'FROM';
  } else {
    toFrom=off.t > 1 ? 'FROM' : 'TO';
  }
  return {signedKm,absKm:Math.abs(signedKm),side:off.side,toFrom,t:off.t};
}
// При ручном выборе маршрута выбираем наиболее близкий участок,
// затем переключаем только вперёд по порядку при достижении конечного ППМ.
function hsiRouteBestLeg(route,p) {
  if (!route || !hsiValidPoint(p)) return 0;
  let best=0,score=Infinity;
  for (let i=0;i<route.points.length-1;i++) {
    const A=route.points[i],B=route.points[i+1];
    const off=computeOffset(p,A,B);
    if (!off) continue;
    const len=distance(A,B);
    const beyond=(off.t<0?-off.t:off.t>1?off.t-1:0)*len;
    const current=off.lbu+1.25*beyond;
    if (current<score) {score=current;best=i;}
  }
  return best;
}
function maybeAdvanceHSIRoute(p) {
  if (hsiState.mode!=='route' || !rtTracking || !hsiValidPoint(p) || hsiNeedsInitialLegFix) return;
  const leg=hsiRouteInfo();
  if (!leg || leg.idx>=leg.route.points.length-2) return;
  const off=computeOffset(p,leg.A,leg.B);
  if (!off) return;
  // Защита от случайного переключения при стоянке или скачке GPS.
  const moving=Number.isFinite(p.speed) && p.speed>5;
  const accurate=!Number.isFinite(p.acc) || p.acc<=300;
  const near=moving && accurate && off.lbu<=2500 && off.t>=.985 && distance(p,leg.B)<=3500;
  if (!near) { hsiState.awaitingRouteFix=0; return; }
  hsiState.awaitingRouteFix++;
  if (hsiState.awaitingRouteFix<2 || Date.now()-hsiLastRouteAdvanceAt<7000) return;
  hsiState.legIndex=leg.idx+1;
  hsiState.awaitingRouteFix=0;
  hsiLastRouteAdvanceAt=Date.now();
  persistHSISettings();
  recordConfigurationEvent('route-leg-auto');
  renderHSIGuideLine();
  updateNavUI();
}
function setHSIMode(next) {
  stopHSICourseHold();
  if(!['direct','route','obs'].includes(next)) return;
  if(next==='obs' && hsiState.mode!=='obs') {
    const guidance=getHSIGuidance();
    if(guidance){
      hsiState.obsCourse=guidance.courseMag;
      if(guidance.mode==='route')hsiState.obsRef='route:'+hsiState.routeKey+':'+(hsiState.legIndex+1);
      else hsiState.obsRef='target';
      hsiState.obsAnchor={lat:guidance.reference.lat,lon:guidance.reference.lon};
    } else if(!hsiValidPoint(hsiState.obsAnchor)) {
      const p=hsiCurrentFix();
      if(p){hsiState.obsRef='position';hsiState.obsAnchor={lat:p.lat,lon:p.lon};}
    }
  }
  hsiState.mode=next;
  hsiState.awaitingRouteFix=0;
  if (next==='route' && hsiState.routeKey) {
    const fix=hsiCurrentFix();
    if (fix) hsiState.legIndex=hsiRouteBestLeg(ROUTES[hsiState.routeKey],fix);
    hsiNeedsInitialLegFix=!fix;
  }
  persistHSISettings();
  recordConfigurationEvent('hsi-mode');
  updateNavUI();updateRTUI();renderHSIGuideLine();refreshHSIPanel();
}
function selectHSIRoute(key) {
  if(!Object.prototype.hasOwnProperty.call(ROUTES,key)) {
    hsiState.routeKey=''; hsiState.legIndex=0; hsiNeedsInitialLegFix=false;
  } else {
    hsiState.routeKey=key;
    const fix=hsiCurrentFix();
    hsiState.legIndex=fix?hsiRouteBestLeg(ROUTES[key],fix):0;
    hsiNeedsInitialLegFix=!fix;
    const toggle=document.getElementById('route'+key);
    if(toggle && !toggle.checked){toggle.checked=true;renderRoutes();}
  }
  hsiState.awaitingRouteFix=0;
  hsiLastRouteAdvanceAt=0;
  persistHSISettings();recordConfigurationEvent('route-selected');
  updateNavUI();updateRTUI();renderHSIGuideLine();refreshHSIPanel();
}
function makeHSIReferenceOptions() {
  const items=[{key:'target',name:'Выбранная цель'}, {key:'position',name:'Положение при установке'}];
  PRESET.forEach((p,i)=>items.push({key:'station:'+i,name:p.name}));
  Object.entries(ROUTES).forEach(([key,r])=>(r.custom?r.points:r.points.slice(0,-1)).forEach((p,i)=>
    items.push({key:'route:'+key+':'+i,name:r.name+' · '+(i+1)+' '+p.name})));
  return items;
}
function hsiResolveRef(spec) {
  if(spec==='position'){
    const p=hsiCurrentFix();return hsiValidPoint(p)?{lat:p.lat,lon:p.lon}:null;
  }
  if(spec==='target')return hsiValidPoint(navTarget)?{...navTarget}:null;
  let m=/^station:(\d+)$/.exec(spec);
  if(m){const p=PRESET[+m[1]];return p?{lat:p.lat,lon:p.lon}:null;}
  m=/^route:([A-Z0-9_]+):(\d+)$/.exec(spec);
  if(m){const p=ROUTES[m[1]]?.points[+m[2]];return p?{lat:p.lat,lon:p.lon}:null;}
  return null;
}
function setHSIReference(spec) {
  const p=hsiResolveRef(spec);
  if(!p){alert('Для выбранной опорной точки пока нет координат. Сначала задайте цель или получите GPS.'); refreshHSIPanel();return;}
  hsiState.obsRef=spec;hsiState.obsAnchor=p;
  persistHSISettings();recordConfigurationEvent('obs-anchor');
  updateNavUI();updateRTUI();renderHSIGuideLine();refreshHSIPanel();
}
let hsiRepeatDelay = null;
let hsiRepeatInterval = null;
let hsiPointerStepAt = 0;
function stepHSICourse(n) { enterHSICourse(norm360(Math.round(hsiState.obsCourse)+n)); }
function stopHSICourseHold() {
  clearTimeout(hsiRepeatDelay); clearInterval(hsiRepeatInterval);
  hsiRepeatDelay = hsiRepeatInterval = null;
}
function startHSICourseHold(e, n) {
  if (e.button !== undefined && e.button !== 0) return;
  if (hsiState.mode !== 'obs') return;
  e.preventDefault();
  stopHSICourseHold();
  hsiPointerStepAt = Date.now();
  if (e.currentTarget.setPointerCapture) {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  }
  stepHSICourse(n);
  hsiRepeatDelay = setTimeout(() => {
    hsiRepeatDelay = null;
    hsiRepeatInterval = setInterval(() => stepHSICourse(n), 90);
  }, 430);
}
function clickHSICourse(e, n) {
  // Pointer event already changed the course; click only handles keyboard activation.
  if (e.detail === 0) stepHSICourse(n);
}
function enterHSICourse(v) {
  const text=String(v).trim();
  const c=Number(text);
  if(!/^\d{1,3}$/.test(text) || !Number.isFinite(c) || c<0 || c>359){
    document.getElementById('hsiCourseInput').value=String(Math.round(hsiState.obsCourse));
    refreshHSIPanel();return;
  }
  if(hsiState.mode!=='obs')return;
  hsiState.obsCourse=c;
  persistHSISettings();recordConfigurationEvent('obs-course');
  updateNavUI();updateRTUI();renderHSIGuideLine();refreshHSIPanel();
}
function persistHSISettings() {
  try {localStorage.setItem(HSI_SETTINGS_KEY,JSON.stringify({mode:hsiState.mode,
    routeKey:hsiState.routeKey,legIndex:hsiState.legIndex,obsCourse:hsiState.obsCourse,
    obsRef:hsiState.obsRef,obsAnchor:hsiState.obsAnchor}));}catch(e){}
}
function loadHSISettings() {
  try {
    const o=JSON.parse(localStorage.getItem(HSI_SETTINGS_KEY)||'null');if(!o)return;
    if(['direct','route','obs'].includes(o.mode))hsiState.mode=o.mode;
    if(Object.prototype.hasOwnProperty.call(ROUTES,o.routeKey))hsiState.routeKey=o.routeKey;
    if(Number.isInteger(o.legIndex)&&o.legIndex>=0)hsiState.legIndex=o.legIndex;
    if(Number.isFinite(o.obsCourse))hsiState.obsCourse=norm360(o.obsCourse);
    if(typeof o.obsRef==='string')hsiState.obsRef=o.obsRef;
    if(hsiValidPoint(o.obsAnchor))hsiState.obsAnchor=o.obsAnchor;
    hsiNeedsInitialLegFix=hsiState.mode==='route' && !!hsiState.routeKey;
    hsiState.scaleKm=5; // Предыдущие настройки масштаба больше не применяются.
  }catch(e){console.warn('HSI settings:',e);}
}
function renderHSIGuideLine() {
  if(hsiGuideLine){map.removeLayer(hsiGuideLine);hsiGuideLine=null;}
  if(hsiState.mode==='direct')return;
  const g=getHSIGuidance();if(!g)return;
  hsiGuideLine=L.polyline([[g.from.lat,g.from.lon],[g.to.lat,g.to.lon]],{
    color:g.mode==='obs'?'#bd6fe5':'#ffb94a',weight:4,opacity:.92,
    dashArray:g.mode==='obs'?'11,7':null, interactive:false
  }).addTo(map);
}
function guidanceSummaryHtml(p) {
  const g=getHSIGuidance();
  if(!g)return hsiState.mode==='route'
    ? 'ROUTE: выберите маршрут в HSI.'
    : 'OBS: выберите опорную точку или получите GPS.';
  const dev=hsiDeviation(p,g);
  let html='<b>'+g.mode.toUpperCase()+'</b>: '+g.name+'<br>'+
    '<b>ЗМПУ:</b> '+g.courseMag.toFixed(0)+'°';
  if(dev){html+='<br><b>ЛБУ:</b> '+fmtDist(dev.absKm*1000)+
    (dev.side==='left'?' влево':dev.side==='right'?' вправо':' на линии')+
    ' · <b>'+dev.toFrom+'</b>';}
  if(g.reference && p) html+='<br><b>До точки:</b> '+(distance(p,g.reference)/1000).toFixed(1)+' км';
  if(p)html+=freshnessWarning(p);
  return html;
}
function buildHSISelects() {
  const r=document.getElementById('hsiRouteSelect');
  const routeSignature=Object.entries(ROUTES).map(([key,v])=>key+':'+v.name+':'+v.points.length).join('|');
  if(r.dataset.signature!==routeSignature){
    r.innerHTML='<option value="">Выберите маршрут</option>';
    Object.entries(ROUTES).forEach(([key,route])=>r.add(new Option(route.name,key)));
    r.dataset.signature=routeSignature;
  }
  const ref=document.getElementById('hsiObsReference');
  if(ref.dataset.signature!==routeSignature){
    ref.innerHTML='';
    makeHSIReferenceOptions().forEach(x=>ref.add(new Option(x.name,x.key)));
    ref.dataset.signature=routeSignature;
  }
}
function refreshHSIPanel() {
  const panel=document.getElementById('hsiPanel'); if(!panel)return;
  document.querySelectorAll('[data-hsi-mode]').forEach(btn=>{
    const active=btn.dataset.hsiMode===hsiState.mode;
    btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',active?'true':'false');
  });
  const navSummary=document.getElementById('hsiNavSummary');
  if(navSummary)navSummary.textContent=hsiState.mode==='route'
    ?'ROUTE · '+(hsiRouteInfo()?.route.name||'выберите маршрут')
    :hsiState.mode==='obs'?'OBS · '+Math.round(hsiState.obsCourse)+'°':'DIRECT · цель на карте';
  buildHSISelects();
  const routeControls=document.getElementById('hsiRouteControls');
  const obsControls=document.getElementById('hsiObsControls');
  routeControls.hidden=hsiState.mode!=='route';obsControls.hidden=hsiState.mode!=='obs';
  const routeSelect=document.getElementById('hsiRouteSelect');routeSelect.value=hsiState.routeKey;
  const leg=hsiRouteInfo();
  document.getElementById('hsiLegRead').textContent=leg
    ? (leg.idx+1)+'. '+leg.A.name+' → '+leg.B.name
    : '—';
  const obsRefSelect=document.getElementById('hsiObsReference');
  if([...obsRefSelect.options].some(o=>o.value===hsiState.obsRef))obsRefSelect.value=hsiState.obsRef;
  document.getElementById('hsiCourseManual').hidden=hsiState.mode!=='obs';
  document.getElementById('hsiCourseAuto').hidden=hsiState.mode==='obs';
  const input=document.getElementById('hsiCourseInput');
  if(document.activeElement!==input)input.value=String(Math.round(hsiState.obsCourse));
  document.getElementById('hsiCourseAuto').firstElementChild.lastElementChild.textContent=
    hsiState.mode==='obs'?'ЗМПУ':'ЗМПУ (авто)';
  // Масштаб ЛБУ постоянный: от −5 до +5 км.
  const g=getHSIGuidance(), p=hsiCurrentFix();
  const d=hsiDeviation(p,g);
  const txt=document.getElementById('hsiXtk');
  const courseTxt=document.getElementById('hsiCourseRead');
  courseTxt.textContent=g?String(Math.round(g.courseMag)).padStart(3,'0')+'°':'—°';
  document.getElementById('hsiFromToName').textContent=g?g.name:'Нет активной ЛЗП';
  document.getElementById('hsiToFrom').textContent=d?d.toFrom:'—';
  const label=d?(d.absKm<1?(d.absKm*1000).toFixed(0)+' м':d.absKm.toFixed(2)+' км'):'—';
  txt.textContent='ЛБУ '+label+(d?(d.side==='left'?' · СЛЕВА':d.side==='right'?' · СПРАВА':' · НА ЛИНИИ'):'');
  const x=d?Math.max(-116,Math.min(116,d.signedKm/hsiState.scaleKm*116)):0;
  document.getElementById('hsiCdiNeedle').setAttribute('transform','translate('+x.toFixed(1)+' 0)');
  // CDI-планка отклоняется к ЛЗП: самолёт левее линии => планка справа.
  document.getElementById('hsiScaleLeft').textContent='−5 км';
  document.getElementById('hsiScaleRight').textContent='+5 км';
  const distanceEl=document.getElementById('hsiDistance');
  const distanceLabel=g?.mode==='route'?'До ППМ':g?.mode==='direct'?'До цели':'До точки';
  const distM=(g&&p&&hsiValidPoint(g.reference))?distance(p,g.reference):null;
  distanceEl.textContent=distanceLabel+' '+(distM===null?'—':fmtDist(distM));
}
// Режим компактного индикатора не меняет расчет ЛБУ/курса и выбор маршрута.
function toggleHSICompact() {
  const panel=document.getElementById('hsiPanel');
  const compact=panel.classList.toggle('compact');
  const btn=document.getElementById('hsiCompactToggle');
  btn.textContent=compact?'▢':'▁';
  btn.setAttribute('aria-label',compact?'Развернуть HSI':'Свернуть HSI');
  btn.setAttribute('title',compact?'Развернуть HSI':'Компактный HSI');
  btn.setAttribute('aria-pressed',compact?'true':'false');
  requestAnimationFrame(()=>centerFollowedAircraft(false));
}
function openHSI() {
  hideHudSettings();
  const el=document.getElementById('hsiPanel');
  const hud=document.getElementById('hudContainer');
  el.classList.toggle('no-hud',hud.classList.contains('hidden'));
  el.classList.remove('hidden');refreshHSIPanel();
  // Дождаться размеров панели после открытия и поднять самолёт над ней.
  requestAnimationFrame(() => centerFollowedAircraft(false));
  document.getElementById('hsiClose').focus();
}
function closeHSI() {
  stopHSICourseHold();
  document.getElementById('hsiPanel').classList.add('hidden');
  // После закрытия HSI возвращаем обычное центрирование на самолёт.
  centerFollowedAircraft(false);
}
// Подстраиваем положение при повороте телефона и изменении высоты панели HSI.
window.addEventListener('resize', () => requestAnimationFrame(() => centerFollowedAircraft(false)));
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => {
    const panel = document.getElementById('hsiPanel');
    if (panel && !panel.classList.contains('hidden')) {
      requestAnimationFrame(() => centerFollowedAircraft(false));
    }
  }).observe(document.getElementById('hsiPanel'));
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeHSI();});
// === КОНЕЦ БЛОКА 34-B ===

// Запись настроек, которые действительно действовали на каждом участке полёта.
// Используются для последующего восстановления расчётных МК, УС и заданной TAS.
function getWindNavConfiguration() {
  const num=id=>{const x=document.getElementById(id).value.trim().replace(',','.');return x!==''&&Number.isFinite(Number(x))?Number(x):null;};
  const g=getHSIGuidance();
  const delta=num('windDir'), u=getWindSpeedKmh(), tasNav=num('airspeed');
  const tasRT=getTASKmh();
  const rtCourse=num('courseRT');
  let planned=null;
  if(g&&delta!==null&&Number.isFinite(u)&&tasNav!==null&&tasNav>0){
    const uv=norm180(g.courseMag-delta);
    const sinUS=(u/tasNav)*Math.sin(toRad(uv));
    if(Math.abs(sinUS)<=1){
      const us=toDeg(Math.asin(sinUS));
      planned={desiredTrackMagDeg:g.courseMag,windCorrectionDeg:us,
        projectedMagHeadingDeg:norm360(g.courseMag-us),
        projectedGroundspeedKmh:tasNav*Math.cos(toRad(us))+u*Math.cos(toRad(uv))};
    } else planned={desiredTrackMagDeg:g.courseMag,unachievableCrosswind:true};
  }
  return {
    windFromMagDeg:delta,windSpeedKmh:Number.isFinite(u)?u:null,
    displayedWindUnit:document.getElementById('windSpeedUnit').checked?'ms':'kmh',
    navTrueAirspeedKmh:tasNav,rtTrueAirspeedKmh:Number.isFinite(tasRT)?tasRT:null,
    enteredMagCourseDeg:rtCourse,magneticDeclinationDeg:getDecl(),
    guidance:g?{mode:g.mode,desiredTrackMagDeg:g.courseMag,
      from:{lat:g.from.lat,lon:g.from.lon},to:{lat:g.to.lat,lon:g.to.lon},
      reference:{lat:g.reference.lat,lon:g.reference.lon},
      routeKey:g.routeKey||null,legIndex:Number.isInteger(g.index)?g.index:null}:null,
    calculated:planned
  };
}
function recordConfigurationEvent(reason) {
  const flight=getActiveFlight();
  if(!rtTracking||!flight)return;
  const config=getWindNavConfiguration();
  const events=flight.settingsEvents||(flight.settingsEvents=[]);
  if(events.length&&JSON.stringify(events[events.length-1].config)===JSON.stringify(config))return;
  events.push({t:Date.now(),reason,config});
  rtFlightLog.downloaded=false;
  saveFlightLog(true);
}
function saveWindNavPreference() {
  try {localStorage.setItem(WIND_NAV_KEY,JSON.stringify({
    windDir:document.getElementById('windDir').value,
    windSpd:document.getElementById('windSpd').value,
    windSpeedUnit:document.getElementById('windSpeedUnit').checked?'ms':'kmh',
    airspeed:document.getElementById('airspeed').value
  }));}catch(e){}
}
function loadWindNavPreference() {
  try {const o=JSON.parse(localStorage.getItem(WIND_NAV_KEY)||'null');if(!o)return;
    for(const key of ['windDir','windSpd','airspeed'])if(typeof o[key]==='string')document.getElementById(key).value=o[key];
    if(['ms','kmh'].includes(o.windSpeedUnit))document.getElementById('windSpeedUnit').checked=o.windSpeedUnit==='ms';
  }catch(e){}
}
function navConfigurationChanged(reason) {
  saveWindNavPreference();
  // Не пишем незаконченные числа после каждой клавиши. При потере фокуса — сразу,
  // иначе после короткой паузы. Изменение применённых данных попадёт в журнал.
  if(windChangeDebounce)clearTimeout(windChangeDebounce);
  if(reason==='change')recordConfigurationEvent('settings-edited');
  else windChangeDebounce=setTimeout(()=>recordConfigurationEvent('settings-edited'),900);
}
function setupConfigurationTracking() {
  for(const id of ['windDir','windSpd','airspeed','courseRT','windTAS']){
    const el=document.getElementById(id);
    el.addEventListener('input',()=>navConfigurationChanged('input'));
    el.addEventListener('change',()=>navConfigurationChanged('change'));
  }
  document.getElementById('tasUnit').addEventListener('change',()=>navConfigurationChanged('change'));
}

// === БЛОК 35: RTNAV ===
function toggleRT() { if (rtTracking) stopRT(); else startRT(); }

// Формат v2: один журнал смены, отдельный массив точек для каждого запуска РВ.
// Дата создания журнала не меняется, пока не выполнена «Очистить трек РВ».
function makeNewFlightLog() {
  return {
    format: 'naebacia-flight-log', version: 3,
    createdAt: Date.now(), nextFlightId: 1,
    downloaded: false, flights: []
  };
}

function getActiveFlight() {
  if (!rtFlightLog || rtSessionId === null) return null;
  return rtFlightLog.flights.find(f => f.id === rtSessionId) || null;
}

function beginFlightSegment() {
  if (!rtFlightLog) rtFlightLog = makeNewFlightLog();
  const flight = {
    id: rtFlightLog.nextFlightId++, startedAt: Date.now(),
    endedAt: null, status: 'recording', points: [], settingsEvents: []
  };
  rtFlightLog.flights.push(flight);
  rtSessionId = flight.id;
  rtFlightLog.downloaded = false;
  return flight;
}

function getFlightPointCount() {
  return rtFlightLog ? rtFlightLog.flights.reduce((n, f) => n + f.points.length, 0) : 0;
}

function rebuildVisibleTrack() {
  rtTrack = [];
  if (!rtFlightLog) return;
  for (const flight of rtFlightLog.flights) {
    for (const p of flight.points) rtTrack.push({ ...p, flightId: flight.id });
  }
  rtTrack = rtTrack.slice(-RT_MAX_POINTS);
}

function startRT() {
  if (!navigator.geolocation) { alert('Геолокация не поддерживается.'); return; }
  if (rtTracking) return;
  if (rtLogSaveWarning && !rtFlightLog) {
    alert('Прежний журнал не удалось прочитать. Новая запись может его перезаписать. Сначала сохраните резервную копию данных браузера.');
    return;
  }
  // Новый старт — новый сегмент того же журнала. Старые полёты не удаляем.
  rtCurrentPosition = null;
  beginFlightSegment();
  rtLogSaveWarning = '';
  saveFlightLog(true);
  try { localStorage.removeItem(RT_TRACK_KEY); } catch (e) {}
  renderRTTrack();
  renderRTMarker();
  rtTracking = true;
  document.getElementById('rtToggleBtn').innerHTML = '<b>⏸ Стоп РВ</b>';
  document.getElementById('rtToggleBtn').classList.remove('gps');
  document.getElementById('rtToggleBtn').classList.add('stop');

  try {
    rtWatchId = navigator.geolocation.watchPosition(
      onRTPosition, onRTError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  } catch (err) {
    stopRT();
    const el = document.getElementById('rt-result');
    el.classList.add('error');
    el.textContent = '⚠️ Не удалось запустить GPS: ' + err.message;
    return;
  }
  document.getElementById('rt-result').innerHTML = 'Определение позиции...';
  document.getElementById('rt-result').classList.remove('error');
  requestWakeLock();
  updateRTUI();
  updateSpeedHudVisibility();
  recordConfigurationEvent('flight-start');
  updateFlightLogUI();
}

function stopRT() {
  if (rtWatchId !== null) {
    navigator.geolocation.clearWatch(rtWatchId);
    rtWatchId = null;
  }
  rtTracking = false;
  if (windMeasuring) cancelWindMeasure();
  const flight = getActiveFlight();
  if (flight && flight.status === 'recording') {
    flight.endedAt = Date.now();
    flight.status = 'completed';
  }
  rtSessionId = null;
  saveFlightLog(true);
  document.getElementById('rtToggleBtn').innerHTML = '<b>▶ Старт РВ</b>';
  document.getElementById('rtToggleBtn').classList.remove('stop');
  document.getElementById('rtToggleBtn').classList.add('gps');
  releaseWakeLock();
  renderRTMarker();
  updateRTUI();
  updateSpeedHudVisibility();
  updateFlightLogUI();
}

function finiteOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function onRTPosition(pos) {
  if (!rtTracking) return;
  const flight = getActiveFlight();
  if (!flight) return;
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const acc = finiteOrNull(pos.coords.accuracy);
  const speed = finiteOrNull(pos.coords.speed);
  const heading = finiteOrNull(pos.coords.heading);
  const alt = finiteOrNull(pos.coords.altitude); // WGS84, не QNH
  const altAcc = finiteOrNull(pos.coords.altitudeAccuracy);
  const receivedAt = Date.now();
  const t = Number.isFinite(pos.timestamp) && pos.timestamp > 0 ? pos.timestamp : receivedAt;
  const last = flight.points.length ? flight.points[flight.points.length - 1] : null;
  // Каждый полёт начинается собственной первой точкой: предыдущий полёт не влияет на фильтр.
  const validNewTime = !last || t > last.t;
  let shouldAdd = false;
  if (validNewTime && !last) shouldAdd = true;
  else if (validNewTime && distance(last, { lat, lon }) >= RT_MIN_STEP_M) shouldAdd = true;
  else if (validNewTime && t - last.t >= 5000) shouldAdd = true;

  if (shouldAdd) {
    const sample = { lat, lon, t, speed, heading, acc, alt, altAcc };
    flight.points.push(sample);
    rtFlightLog.downloaded = false;
    rtTrack.push({ ...sample, flightId: flight.id });
    if (rtTrack.length > RT_MAX_POINTS) rtTrack.shift();
    saveFlightLog(flight.points.length === 1);
    renderRTTrack();
  }
  rtCurrentPosition = { lat, lon, t, speed, heading, acc };
  // Если цель была поставлена без определения места, начало DIRECT фиксируется
  // на первом полученном положении и затем больше не перемещается.
  if (hsiState.mode === 'direct' && navTarget && !navLineStart) {
    navLineStart = { lat, lon };
    recordConfigurationEvent('direct-start-fixed');
    updateNavUI();
  }
  // Маршрут выбирается вручную; GPS определяет текущий участок при первом
  // позиционировании и затем переключает его при прохождении ППМ.
  if (hsiState.mode==='route' && hsiNeedsInitialLegFix && hsiState.routeKey &&
      receivedAt>=t && receivedAt-t<=GPS_STALE_SEC*1000 &&
      (!Number.isFinite(acc) || acc<=300)) {
    hsiState.legIndex=hsiRouteBestLeg(ROUTES[hsiState.routeKey],rtCurrentPosition);
    hsiNeedsInitialLegFix=false;
    hsiState.awaitingRouteFix=0;
    persistHSISettings();
    recordConfigurationEvent('route-leg-initial');
    renderHSIGuideLine();
  } else if (receivedAt>=t && receivedAt-t<=GPS_STALE_SEC*1000) {
    maybeAdvanceHSIRoute(rtCurrentPosition);
  }
  if (windMeasuring) windMeasureData.push({ lat, lon, t });

  renderRTMarker();
  updateRTUI();
  updateFlightLogUI();
  refreshOpenPopup();
  refreshHSIPanel();
  if (isFollowOn() && currentTab === 'rtnav') centerFollowedAircraft(false);
}

function onRTError(err) {
  let msg = '⚠️ Ошибка GPS: ';
  switch (err.code) {
    case err.PERMISSION_DENIED: msg += 'доступ к геолокации запрещён.'; break;
    case err.POSITION_UNAVAILABLE: msg += 'GPS недоступен.'; break;
    case err.TIMEOUT: msg += 'превышено время ожидания.'; break;
    default: msg += err.message;
  }
  const el = document.getElementById('rt-result');
  el.classList.add('error');
  el.textContent = msg;
}

function saveFlightLog(force) {
  if (!rtFlightLog) return;
  const now = Date.now();
  if (!force && now - lastFlightSaveAt < FLIGHT_SAVE_INTERVAL_MS) return;
  try {
    localStorage.setItem(FLIGHT_LOG_KEY, JSON.stringify(rtFlightLog));
    lastFlightSaveAt = now;
    rtLogSaveWarning = '';
  } catch (e) {
    rtLogSaveWarning = '⚠ Не удалось сохранить журнал на телефоне. Скачайте JSON до закрытия страницы.';
  }
}

function normalizeStoredPoint(p) {
  const lat = Number(p.lat), lon = Number(p.lon);
  const t = Number(p.t);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(t)) return null;
  return {
    lat, lon, t,
    speed: finiteOrNull(p.speed), heading: finiteOrNull(p.heading),
    acc: finiteOrNull(p.acc), alt: finiteOrNull(p.alt), altAcc: finiteOrNull(p.altAcc)
  };
}

function migrateOldFlightLog(parsed) {
  // Сохраняем точки v1.56, где весь журнал был одним массивом points.
  if (parsed.version >= 2 && Array.isArray(parsed.flights)) {
    const flights = parsed.flights.map((f, index) => ({
      id: Number.isInteger(f.id) ? f.id : index + 1,
      startedAt: f.startedAt, endedAt: f.endedAt ?? null,
      status: f.status || 'completed',
      points: Array.isArray(f.points) ? f.points.map(normalizeStoredPoint).filter(Boolean) : [],
      settingsEvents: Array.isArray(f.settingsEvents) ? f.settingsEvents.filter(e => e && Number.isFinite(e.t)).map(e => ({t:e.t,reason:e.reason,config:e.config})) : []
    }));
    return {
      format: 'naebacia-flight-log', version: 3,
      createdAt: parsed.createdAt || (flights[0] && flights[0].startedAt) || Date.now(),
      nextFlightId: Math.max(0, ...flights.map(f => f.id)) + 1,
      downloaded: !!parsed.downloaded, flights
    };
  }
  if (Array.isArray(parsed.points)) {
    const points = parsed.points.map(normalizeStoredPoint).filter(Boolean);
    const startedAt = parsed.startedAt || (points[0] && points[0].t) || Date.now();
    return {
      format: 'naebacia-flight-log', version: 3,
      createdAt: startedAt, nextFlightId: 2,
      downloaded: !!parsed.downloaded,
      flights: [{ id: 1, startedAt, endedAt: parsed.endedAt ?? null,
        status: parsed.status || 'completed', points, settingsEvents: [] }]
    };
  }
  return null;
}

function loadRTTrack() {
  try {
    const raw = localStorage.getItem(FLIGHT_LOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.format !== 'naebacia-flight-log') throw new Error('Неподдерживаемый формат журнала');
      rtFlightLog = migrateOldFlightLog(parsed);
      if (!rtFlightLog) throw new Error('Не удалось прочитать журнал');
      let interrupted = parsed.version !== 3;
      for (const flight of rtFlightLog.flights) {
        if (flight.status === 'recording') {
          flight.status = 'interrupted';
          flight.endedAt = flight.points.length ? flight.points[flight.points.length-1].t : flight.startedAt;
          interrupted = true;
        }
      }
      rebuildVisibleTrack();
      if (interrupted) saveFlightLog(true);
      return;
    }
    // Совместимость со старым РВ до v1.56: переносим трек в первый сегмент.
    const old = localStorage.getItem(RT_TRACK_KEY);
    if (old) {
      const points = JSON.parse(old);
      if (Array.isArray(points) && points.length) {
        const valid = points.map(normalizeStoredPoint).filter(Boolean);
        if (valid.length) {
          rtFlightLog = makeNewFlightLog();
          rtFlightLog.createdAt = valid[0].t;
          rtFlightLog.nextFlightId = 2;
          rtFlightLog.flights.push({ id: 1, startedAt: valid[0].t,
            endedAt: valid[valid.length-1].t, status: 'imported', points: valid, settingsEvents: [] });
          rebuildVisibleTrack();
          saveFlightLog(true);
        }
      }
    }
  } catch (e) {
    // Не уничтожаем нечитаемые данные в localStorage и не перезаписываем их автоматически.
    rtFlightLog = null; rtTrack = [];
    rtLogSaveWarning = '⚠ Не удалось прочитать прежний журнал. Сохранённые данные не удалены; сначала сделайте резервную копию браузера.';
  }
}

function saveRTTrack() { saveFlightLog(); }

function clearRTTrack() {
  if (getFlightPointCount() > 0) {
    if (!confirm('Очистить весь трек и все полёты в журнале? Убедитесь, что нужный JSON сохранён.')) return;
  }
  rtTrack = [];
  rtCurrentPosition = null;
  rtSessionId = null;
  rtFlightLog = null;
  rtLogSaveWarning = '';
  try {
    localStorage.removeItem(RT_TRACK_KEY);
    localStorage.removeItem(FLIGHT_LOG_KEY);
  } catch (e) {}
  if (rtTracking) {
    beginFlightSegment(); // При активном РВ очистка начинает свежий пустой журнал.
    saveFlightLog(true);
  }
  renderRTTrack();
  renderRTMarker();
  updateRTUI();
  updateFlightLogUI();
  document.getElementById('rt-result').textContent = 'Трек РВ очищен.';
  document.getElementById('rt-result').classList.remove('error');
}

function flightLogExportObject() {
  if (!rtFlightLog) return null;
  const toIso = t => Number.isFinite(Number(t)) ? new Date(Number(t)).toISOString() : null;
  return {
    format: 'naebacia-flight-log',
    version: 3, appVersion: '1.60',
    source: 'browser-geolocation',
    createdAt: toIso(rtFlightLog.createdAt),
    exportedAt: new Date().toISOString(),
    units: {
      coordinates: 'WGS84 decimal degrees',
      altitude: 'meters above WGS84 ellipsoid (GPS, not barometric/QNH)',
      speed: 'm/s', heading: 'true degrees', accuracy: 'meters'
    },
    flights: rtFlightLog.flights.map(f => ({
      id: f.id,
      startedAt: toIso(f.startedAt),
      endedAt: f.status === 'recording' ? null : toIso(f.endedAt),
      status: rtTracking && f.id === rtSessionId ? 'recording' : f.status,
      settingsHistory: (f.settingsEvents || []).map(e => ({
        timestamp: toIso(e.t), reason: e.reason, configuration: e.config
      })),
      points: f.points.map(p => ({
        timestamp: toIso(p.t),
        latitude: p.lat, longitude: p.lon,
        groundSpeedMps: p.speed ?? null,
        trueTrackDeg: p.heading ?? null,
        horizontalAccuracyM: p.acc ?? null,
        gpsAltitudeM: p.alt ?? null,
        altitudeAccuracyM: p.altAcc ?? null
      }))
    }))
  };
}

function downloadRTLog() {
  if (getFlightPointCount() === 0) {
    alert('Нет записанных GPS-точек. Включите РВ и дождитесь координат.');
    return;
  }
  const json = JSON.stringify(flightLogExportObject(), null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const d = new Date(rtFlightLog.createdAt);
  const stamp = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0') + '_' + String(d.getHours()).padStart(2,'0') + '-' +
    String(d.getMinutes()).padStart(2,'0');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'NAEBACIA_' + stamp + '.json';
  document.body.appendChild(a);
  a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  rtFlightLog.downloaded = true;
  saveFlightLog(true);
  updateFlightLogUI();
}

function updateFlightLogUI() {
  const btn = document.getElementById('downloadRTLogBtn');
  const el = document.getElementById('rt-log-status');
  if (!btn || !el) return;
  const count = getFlightPointCount();
  const flights = rtFlightLog ? rtFlightLog.flights.length : 0;
  btn.disabled = count === 0;
  if (rtLogSaveWarning) {
    el.textContent = rtLogSaveWarning;
    el.classList.add('warning');
  } else {
    el.classList.remove('warning');
    if (!rtFlightLog || !flights) el.textContent = 'Нет записанного полёта.';
    else if (rtTracking) el.textContent = 'Запись РВ · полётов: ' + flights + ' · точек: ' + count + '.';
    else el.textContent = 'Сохранено полётов: ' + flights + ' · точек: ' + count + '. Новый старт РВ добавит следующий полёт.';
  }
}

const ALTITUDE_PALETTE = ['#e84c4c', '#f58b3d', '#f7c344', '#dfce44', '#91ce49', '#71c96a', '#20bca6', '#20aaae', '#267fdb', '#3674ed'];
function toggleAltitudeView() {
  const enabled = document.getElementById('toggleAltitudeColors').checked;
  try { localStorage.setItem(ALT_COLORS_KEY, enabled ? '1' : '0'); } catch (e) {}
  document.getElementById('altitudeLegend').style.display = enabled ? 'block' : 'none';
  renderRTTrack();
}

function altitudeSegmentColor(a, b, min, max) {
  if (!Number.isFinite(a.alt) || !Number.isFinite(b.alt)) return '#888888';
  // Когда разброс меньше 50 м, не разукрашиваем шум высотомера во все цвета.
  const ratio = max - min < 50 ? 0.5 : Math.max(0, Math.min(1, ((a.alt + b.alt)/2 - min)/(max-min)));
  return ALTITUDE_PALETTE[Math.min(ALTITUDE_PALETTE.length-1, Math.floor(ratio*ALTITUDE_PALETTE.length))];
}

// Трек разбит на полёты: между разными запусками РВ линии не строятся.
function splitRTTrack() {
  const segments = [];
  for (const p of rtTrack) {
    const last = segments[segments.length - 1];
    if (!last || last[0].flightId !== p.flightId) segments.push([p]);
    else last.push(p);
  }
  return segments;
}

function renderRTTrack() {
  const show = currentTab === 'rtnav';
  if (rtLineLayer) { map.removeLayer(rtLineLayer); rtLineLayer = null; }
  if (rtStartMarker) { map.removeLayer(rtStartMarker); rtStartMarker = null; }
  if (!show || rtTrack.length === 0) return;
  const colored = document.getElementById('toggleAltitudeColors').checked;
  const altitudes = rtTrack.map(p => p.alt).filter(v => Number.isFinite(v));
  const min = altitudes.length ? Math.min(...altitudes) : 0;
  const max = altitudes.length ? Math.max(...altitudes) : 0;
  const lines = [], startMarkers = [];
  for (const flightPts of splitRTTrack()) {
    if (!flightPts.length) continue;
    const first = flightPts[0];
    const fullFlight = rtFlightLog && rtFlightLog.flights.find(f => f.id === first.flightId);
    // Если первые точки очень длинного полёта уже вытеснены из карты, ложный «старт» не рисуем.
    if (fullFlight && fullFlight.points.length && fullFlight.points[0].t === first.t) {
      startMarkers.push(L.marker([first.lat, first.lon], { icon: rtStartIcon(), interactive: false }));
    }
    if (flightPts.length < 2) continue;
    if (!colored) {
      lines.push(L.polyline(flightPts.map(p => [p.lat,p.lon]), {
        color: '#08c', weight: 3, opacity: 0.85, interactive: false
      }));
      continue;
    }
    let currentColor = null, coordinates = null;
    function emit() {
      if (coordinates && coordinates.length >= 2) {
        lines.push(L.polyline(coordinates, { color: currentColor, weight: 4, opacity: 0.9, interactive: false }));
      }
    }
    for (let i=1; i<flightPts.length; i++) {
      const a=flightPts[i-1], b=flightPts[i];
      const c=altitudeSegmentColor(a,b,min,max);
      if (c !== currentColor) {
        emit(); currentColor=c; coordinates=[[a.lat,a.lon],[b.lat,b.lon]];
      } else coordinates.push([b.lat,b.lon]);
    }
    emit();
  }
  rtLineLayer = L.layerGroup(lines).addTo(map);
  rtStartMarker = L.layerGroup(startMarkers).addTo(map);
}

function renderRTMarker() {
  // Пока РВ запущен, самолёт отображается на любой вкладке.
  const show = rtTracking;
  if (!show || !rtCurrentPosition) {
    if (rtMarker) { map.removeLayer(rtMarker); rtMarker = null; }
    updateJokeMarker();
    return;
  }
  let course = rtCurrentPosition.heading;
  if (course === null || course === undefined || isNaN(course)) {
    if (rtTrack.length >= 2) {
      const a = rtTrack[rtTrack.length - 2];
      const b = rtTrack[rtTrack.length - 1];
      if (a.flightId === b.flightId && distance(a, b) > 1) course = trueBearing(a, b); else course = 0;
    } else course = 0;
  }
  const lat = rtCurrentPosition.lat;
  const lon = rtCurrentPosition.lon;
  if (rtMarker) {
    rtMarker.setLatLng([lat, lon]);
    rtMarker.setIcon(planeIconBlue(course));
  } else {
    rtMarker = L.marker([lat, lon], {
      icon: planeIconBlue(course), interactive: false, zIndexOffset: 1200
    }).addTo(map);
  }
  updateJokeMarker();
}

function updateRTUI() {
  const posEl = document.getElementById('rt-pos');
  const spEl = document.getElementById('rt-speed');
  const hdEl = document.getElementById('rt-heading');
  const acEl = document.getElementById('rt-acc');
  const agEl = document.getElementById('rt-age');
  const ptEl = document.getElementById('rt-points');
  const dsEl = document.getElementById('rt-dist');
  const tmEl = document.getElementById('rt-time');
  const avEl = document.getElementById('rt-avg');

  if (!rtCurrentPosition) {
    posEl.textContent = rtTracking ? 'Ожидание GPS...' : 'GPS не активен';
    spEl.textContent = '—'; hdEl.textContent = '—'; acEl.textContent = '—'; agEl.textContent = '—';
  } else {
    posEl.innerHTML = '<b>' + ddToDM(rtCurrentPosition.lat, true) + '</b><br>' +
                      '<b>' + ddToDM(rtCurrentPosition.lon, false) + '</b>';
    if (rtCurrentPosition.speed !== null) {
      const v = convertSpeed(rtCurrentPosition.speed);
      spEl.textContent = v.toFixed(0) + ' ' + SPEED_UNITS[rtSpeedUnit].label;
    } else spEl.textContent = '—';

    const fmpu = getGPSHeadingMag();
    if (fmpu !== null) hdEl.textContent = fmpu.toFixed(0) + '°';
    else hdEl.textContent = '—';

    acEl.textContent = Number.isFinite(rtCurrentPosition.acc) ? '±' + rtCurrentPosition.acc.toFixed(0) + ' м' : '—';
    const age = (Date.now() - rtCurrentPosition.t) / 1000;
    agEl.textContent = age.toFixed(1) + ' с';
  }

  ptEl.textContent = getFlightPointCount();
  let totalDist = 0, totalSec = 0;
  // Статистика учитывает весь журнал, а не только последние 10 000 видимых на карте точек.
  const allFlights = rtFlightLog ? rtFlightLog.flights : [];
  for (const flight of allFlights) {
    const points = flight.points;
    if (points.length < 2) continue;
    for (let i=1; i<points.length; i++) totalDist += distance(points[i-1], points[i]);
    totalSec += Math.max(0, (points[points.length-1].t-points[0].t)/1000);
  }
  totalDist /= 1000;
  dsEl.textContent = totalDist.toFixed(2) + ' км';
  tmEl.textContent = fmtDuration(totalSec);
  avEl.textContent = totalSec > 0 ? (totalDist*3600/totalSec).toFixed(0)+' км/ч' : '—';

  const tgtEl = document.getElementById('rt-target');
  const guide=getHSIGuidance();
  if (guide && hsiState.mode !== 'direct') tgtEl.textContent = guide.name;
  else if (navTarget) tgtEl.innerHTML = ddToDM(navTarget.lat, true) + ' ' + ddToDM(navTarget.lon, false);
  else tgtEl.innerHTML = '<span style="color:#888">Задайте цель на вкладке Навигация</span>';

  if (rtCurrentPosition && rtCurrentPosition.speed !== null) {
    const v = convertSpeed(rtCurrentPosition.speed);
    document.getElementById('speedHudValue').textContent = v.toFixed(0);
  } else {
    document.getElementById('speedHudValue').textContent = '—';
  }
  updateHudHeading();

  const resEl = document.getElementById('rt-result');
  if (!resEl) return;
  resEl.classList.remove('error');
  if (!rtTracking && !rtCurrentPosition) { resEl.innerHTML = 'Нажмите «Старт РВ», чтобы начать.'; return; }
  if (!rtCurrentPosition) { resEl.innerHTML = 'Ожидание первой позиции GPS...'; return; }
  if (hsiState.mode !== 'direct') { resEl.innerHTML = guidanceSummaryHtml(rtCurrentPosition); return; }
  if (!navTarget) { resEl.innerHTML = 'Задайте цель на вкладке Навигация.'; return; }

  const n = computeNav();
  if (!n) { resEl.innerHTML = '—'; return; }
  const fmpu = getGPSHeadingMag();
  const gpsSpeedKmh = getGPSSpeedKmh();

  let html = '<b>До цели:</b> ' + n.distKm.toFixed(2) + ' км<br>';
  html += '<b>ЗМПУ:</b> ' + n.mpu.toFixed(0) + '°';

  if (navLineStart) {
    const offHtml = fmtOffset(rtCurrentPosition, navLineStart, navTarget);
    if (offHtml) {
      html += '<hr style="margin:6px 0;border:0;border-top:1px solid #ddd">';
      html += offHtml;
    }
  }

  if (fmpu !== null) {
    html += '<br><b>ФМПУ:</b> <span style="color:#08c">' + fmpu.toFixed(0) + '°</span>';
    let delta = norm360(fmpu - n.mpu);
    if (delta > 180) delta -= 360;
    if (Math.abs(delta) >= 3) {
      html += ' <span style="color:#c00">(' + (delta > 0 ? '+' : '') + delta.toFixed(0) + '°)</span>';
    }
  }
  if (n.wind) html += ' &nbsp; <b>МК:</b> ' + n.wind.mk.toFixed(0) + '°';
  if (gpsSpeedKmh !== null && gpsSpeedKmh > 1) {
    const v = convertSpeed(gpsSpeedKmh / 3.6);
    const etaSec = (n.distKm / gpsSpeedKmh) * 3600;
    html += '<br><b>Путевая (GPS):</b> ' + v.toFixed(0) + ' ' + SPEED_UNITS[rtSpeedUnit].label;
    html += '<br><b>ETE:</b> ' + fmtDuration(etaSec);
    html += '<br><b>ETA:</b> ' + fmtEtaAbs(etaSec);
  }
  resEl.innerHTML = html;
}

// ================================================================
// ============== РАСЧЁТ ВЕТРА ПО ФАКТУ ПОЛЁТА ====================
// ================================================================

function updateTasHint() {
  const unit = document.getElementById('tasUnit').value;
  document.getElementById('windTAS').placeholder = unit === 'kt' ? '92' : '170.4';
}
function getTASKmh() {
  const raw = document.getElementById('windTAS').value.trim().replace(',', '.');
  // Пустое поле всегда означает 92 узла независимо от выбранных единиц.
  if (!raw) return 92 * 1.852;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return null;
  const unit = document.getElementById('tasUnit').value;
  return unit === 'kt' ? v * 1.852 : v;
}

function updateMeasureLabel() {
  const s = document.getElementById('measureDuration').value;
  document.getElementById('measureDurationLabel').textContent = s + ' с';
}

function windMeasureBtnClick() {
  if (windMeasuring) cancelWindMeasure();
  else startWindMeasure();
}

function checkStraight(pts) {
  if (pts.length < 3) return { ok: false, spread: 0 };
  const bearings = [];
  for (let i = 1; i < pts.length; i++) {
    const d = distance(pts[i-1], pts[i]);
    if (d < 3) continue;
    bearings.push(trueBearing(pts[i-1], pts[i]));
  }
  if (bearings.length < 2) return { ok: false, spread: 0 };
  let sx = 0, sy = 0;
  for (const b of bearings) { sx += Math.cos(toRad(b)); sy += Math.sin(toRad(b)); }
  const avgB = toDeg(Math.atan2(sy, sx));
  let maxDev = 0;
  for (const b of bearings) {
    let d = Math.abs(norm360(b - avgB + 180) - 180);
    if (d > maxDev) maxDev = d;
  }
  return { ok: maxDev < 15, spread: maxDev };
}

function doWindCalc(pts) {
  const resultEl = document.getElementById('windResult');
  const V = getTASKmh();
  if (V === null) {
    resultEl.innerHTML = '<span class="warn">Укажите истинную скорость V.</span>';
    return;
  }
  const MK = getCourseMag();
  const decl = parseFloat(document.getElementById('decl').value) || 0;

  const first = pts[0];
  const last = pts[pts.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt < 3) {
    resultEl.innerHTML = '<span class="warn">Слишком короткий интервал.</span>';
    return;
  }
  const distKm = distance(first, last) / 1000;
  const W = distKm * 3600 / dt;
  const FMPU_true = trueBearing(first, last);
  const FMPU = norm360(FMPU_true - decl);

  let US = norm360(FMPU - MK);
  if (US > 180) US -= 360;

  const Ux = V * Math.sin(toRad(MK)) - W * Math.sin(toRad(FMPU));
  const Uy = V * Math.cos(toRad(MK)) - W * Math.cos(toRad(FMPU));
  const U = Math.sqrt(Ux*Ux + Uy*Uy);
  const delta = norm360(toDeg(Math.atan2(Ux, Uy)));

  const uKmh = U;
  const uMs = U / 3.6;
  const uKt = U / 1.852;

  resultEl.innerHTML =
    '<b>Результат:</b><br>' +
    '<b>ФМПУ:</b> ' + FMPU.toFixed(0) + '°<br>' +
    '<b>W (путевая):</b> ' + W.toFixed(0) + ' км/ч<br>' +
    '<b>УС:</b> ' + US.toFixed(1) + '°' +
      (Math.abs(US) > 0.3 ? (US > 0 ? ' <span style="color:#c00">вправо</span>' : ' <span style="color:#c00">влево</span>') : '') + '<br>' +
    '<hr style="margin:4px 0;border:0;border-top:1px solid #ddd">' +
    '<b>δ (ветер от):</b> <span style="color:#2a7"><b>' + delta.toFixed(0) + '°</b></span><br>' +
    '<b>U:</b> <span style="color:#2a7"><b>' + uKmh.toFixed(1) + ' км/ч / ' +
      uMs.toFixed(1) + ' м/с / ' + uKt.toFixed(1) + ' уз</b></span>' +
    '<button class="primary" onclick="applyWindToFields(' + delta.toFixed(1) + ',' + U.toFixed(1) + ')" style="width:100%;margin-top:6px;">Применить к полям ветра</button>';
}

function applyWindToFields(delta, uKmh) {
  document.getElementById('windDir').value = delta.toFixed(0);
  const showMs = document.getElementById('windSpeedUnit').checked;
  document.getElementById('windSpd').value = (showMs ? uKmh / 3.6 : uKmh).toFixed(showMs ? 1 : 0);
  saveWindNavPreference();
  recordConfigurationEvent('wind-measurement-applied');
  updateNavUI();
  document.getElementById('windResult').innerHTML += '<br><span style="color:#2a7">✓ Применено к полям ветра на вкладке Навигация</span>';
}

function calcWindInstant() {
  const resultEl = document.getElementById('windResult');
  if (!rtTracking) {
    resultEl.innerHTML = '<span class="warn">Сначала запустите РВ.</span>';
    return;
  }
  const cutoff = Date.now() - 60000;
  const seg = rtTrack.filter(p => p.flightId === rtSessionId && p.t >= cutoff);
  if (seg.length < 5) {
    resultEl.innerHTML = '<span class="warn">Мало данных за последнюю минуту. Полетайте ещё.</span>';
    return;
  }
  const straight = checkStraight(seg);
  if (!straight.ok) {
    resultEl.innerHTML = '<span class="warn">Трек не прямолинейный (разброс ' + straight.spread.toFixed(1) + '°). Летите ровнее или используйте «Измерить».</span>';
    return;
  }
  doWindCalc(seg);
}

function startWindMeasure() {
  const resultEl = document.getElementById('windResult');
  if (!rtTracking) {
    resultEl.innerHTML = '<span class="warn">Сначала запустите РВ.</span>';
    return;
  }
  if (windMeasuring) return;

  windMeasureDuration = parseInt(document.getElementById('measureDuration').value) || 30;
  windMeasureStart = Date.now();
  windMeasureData = [];
  windMeasuring = true;

  const btn = document.getElementById('windMeasureBtn');
  btn.disabled = false;
  btn.classList.add('stop');
  btn.innerHTML = '✕ Отмена';

  windMeasureTick = setInterval(() => {
    const left = Math.ceil((windMeasureStart + windMeasureDuration * 1000 - Date.now()) / 1000);
    if (left <= 0) {
      stopWindMeasure();
    } else {
      btn.innerHTML = '✕ Отмена (' + left + ' с)';
    }
  }, 200);

  resultEl.innerHTML = 'Измерение... ' + windMeasureDuration + ' с. Летите прямо с постоянным курсом.';
}

function stopWindMeasure() {
  if (windMeasureTick) {
    clearInterval(windMeasureTick);
    windMeasureTick = null;
  }
  windMeasuring = false;
  restoreWindMeasureButton();

  const data = windMeasureData;
  windMeasureData = [];

  const resultEl = document.getElementById('windResult');
  if (data.length < 5) {
    resultEl.innerHTML = '<span class="warn">Мало данных за интервал измерения.</span>';
    return;
  }
  const straight = checkStraight(data);
  if (!straight.ok) {
    resultEl.innerHTML = '<span class="warn">Трек не прямолинейный (разброс ' + straight.spread.toFixed(1) + '°). Летите ровнее и повторите.</span>';
    return;
  }
  doWindCalc(data);
}

function cancelWindMeasure() {
  if (windMeasureTick) {
    clearInterval(windMeasureTick);
    windMeasureTick = null;
  }
  windMeasuring = false;
  windMeasureData = [];
  restoreWindMeasureButton();
  document.getElementById('windResult').innerHTML = '<span style="color:#888">Измерение отменено.</span>';
}

function restoreWindMeasureButton() {
  const btn = document.getElementById('windMeasureBtn');
  btn.classList.remove('stop');
  btn.disabled = false;
  btn.innerHTML = '⏱ Измерить';
}
// === КОНЕЦ БЛОКА 35: RTNAV ===

// === БЛОК 36: GPS ONCE ===
function getMyPosition() {
  const resultEl = document.getElementById('result');
  resultEl.classList.remove('error');
  if (!navigator.geolocation) {
    resultEl.classList.add('error');
    resultEl.textContent = '⚠️ Геолокация не поддерживается устройством.';
    return;
  }
  const btn = document.getElementById('gpsBtn');
  btn.disabled = true;
  btn.innerHTML = '<b>📍 Определение...</b>';
  resultEl.textContent = 'Определение местоположения по GPS...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.disabled = false;
      btn.innerHTML = '<b>📍 Получить МС</b>';
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const acc = pos.coords.accuracy;

      if (gpsMarker) map.removeLayer(gpsMarker);
      gpsMarker = L.marker([lat, lon], { icon: gpsIcon() }).addTo(map);
      map.setView([lat, lon], Math.max(map.getZoom(), 12));

      let html = '<b>📍 МС по GPS</b><br>' +
                 '<b>Широта:</b> ' + ddToDM(lat, true) + '<br>' +
                 '<b>Долгота:</b> ' + ddToDM(lon, false) + '<br>' +
                 '<b>Точность:</b> ±' + acc.toFixed(0) + ' м';
      html += '<hr style="margin:4px 0;border:0;border-top:1px solid #ccc">';
      html += '<b>Пеленги от МС:</b><br>';
      const decl = parseFloat(document.getElementById('decl').value) || 0;
      for (let i = 0; i < PRESET.length; i++) {
        const s = PRESET[i];
        const dkm = distance({ lat, lon }, s) / 1000;
        if (s.type === 'VOR') {
          const rad = norm360(trueBearing(s, { lat, lon }) - decl);
          html += '<b>' + s.name + '</b>: радиал <b>' + rad.toFixed(0) + '°</b> / ' + dkm.toFixed(1) + ' км<br>';
        } else {
          const mpr = norm360(trueBearing({ lat, lon }, s) - decl);
          html += '<b>' + s.name + '</b>: МПР <b>' + mpr.toFixed(0) + '°</b> / ' + dkm.toFixed(1) + ' км<br>';
        }
      }
      html += '<br><span style="color:#666;font-size:11px">Нажмите «📍 Привести к GPS», чтобы подставить пеленги.</span>';
      gpsMarker.bindPopup(html);

      trackGps.push({ lat, lon, t: Date.now() });
      saveTrackGps();
      renderTrack();
      refreshOpenPopup();

      resultEl.innerHTML = html;
      updateNavUI();
      updateRTUI();
    },
    (err) => {
      btn.disabled = false;
      btn.innerHTML = '<b>📍 Получить МС</b>';
      resultEl.classList.add('error');
      let msg = '⚠️ Не удалось получить координаты. ';
      switch (err.code) {
        case err.PERMISSION_DENIED: msg += 'Доступ к геолокации запрещён.'; break;
        case err.POSITION_UNAVAILABLE: msg += 'GPS недоступен.'; break;
        case err.TIMEOUT: msg += 'Превышено время ожидания.'; break;
        default: msg += err.message;
      }
      resultEl.textContent = msg;
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}
// === КОНЕЦ БЛОКА 36 ===

// === БЛОК 37: CALC ===
function calculate() {
  const decl = parseFloat(document.getElementById('decl').value) || 0;
  const sources = [];

  // 4 NDB (0..3)
  for (let i = 0; i < 4; i++) {
    const v = document.getElementById('brg' + (i + 1)).value.trim();
    if (v === '') continue;
    const mpr = parseFloat(v);
    if (isNaN(mpr)) continue;
    const ips = norm360(mpr + 180 + decl);
    sources.push({
      idx: i, type: 'NDB', name: PRESET[i].name,
      data: { lat: PRESET[i].lat, lon: PRESET[i].lon },
      ips: ips, inputLabel: 'МПР ' + mpr.toFixed(0) + '°', color: PRESET[i].color
    });
  }

  // VOR — индекс 4
  const rv = document.getElementById('vorRadial').value.trim();
  const radial = rv === '' ? null : parseFloat(rv);
  const vorDist = parseDistance(document.getElementById('vorDist').value.trim());
  if (radial !== null && !isNaN(radial)) {
    sources.push({
      idx: VOR_IDX, type: 'VOR', name: PRESET[VOR_IDX].name,
      data: { lat: PRESET[VOR_IDX].lat, lon: PRESET[VOR_IDX].lon },
      ips: norm360(radial + decl),
      inputLabel: 'Радиал ' + radial.toFixed(0) + '°',
      color: PRESET[VOR_IDX].color, dist: vorDist
    });
  }

  const resultEl = document.getElementById('result');
  resultEl.classList.remove('error');
  stationLines.forEach(l => map.removeLayer(l));
  stationLines = [];
  clearErrorLines();
  if (posMarker) { map.removeLayer(posMarker); posMarker = null; }

  if (sources.length === 0) { resultEl.textContent = 'Введите хотя бы один МПР / радиал.'; return; }

  const lat0 = sources.reduce((s, x) => s + x.data.lat, 0) / sources.length;
  const lon0 = sources.reduce((s, x) => s + x.data.lon, 0) / sources.length;
  const R = 6371000;
  const cosLat0 = Math.cos(toRad(lat0));
  const project = (lat, lon) => ({ x: R * toRad(lon - lon0) * cosLat0, y: R * toRad(lat - lat0) });
  const unproject = (x, y) => ({ lat: lat0 + toDeg(y / R), lon: lon0 + toDeg(x / (R * cosLat0)) });

  let pos = null, resultNote = '', usedForLines = sources, errorMsg = null;

  const vorDirect = sources.find(s => s.type === 'VOR' && s.dist !== null);
  if (vorDirect) {
    const rad = toRad(vorDirect.ips);
    const vp = project(vorDirect.data.lat, vorDirect.data.lon);
    const dx = Math.sin(rad) * vorDirect.dist * 1000;
    const dy = Math.cos(rad) * vorDirect.dist * 1000;
    pos = unproject(vp.x + dx, vp.y + dy);
    resultNote = 'Точка по VOR (радиал + дальность).';
    usedForLines = [vorDirect];
  } else if (sources.length >= 2) {
    const vecs = sources.map(s => ({
      p: project(s.data.lat, s.data.lon),
      v: { x: Math.sin(toRad(s.ips)), y: Math.cos(toRad(s.ips)) }
    }));
    let bestScore = -1, bestPos = null, bestPair = null;
    for (let i = 0; i < vecs.length; i++) {
      for (let j = i + 1; j < vecs.length; j++) {
        const a = vecs[i], b = vecs[j];
        const cross = a.v.x * b.v.y - a.v.y * b.v.x;
        if (Math.abs(cross) < 1e-9) continue;
        const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y;
        const t1 = (dx * b.v.y - dy * b.v.x) / cross;
        const t2 = (dx * a.v.y - dy * a.v.x) / cross;
        if (t1 < 0 || t2 < 0) continue;
        const ix = a.p.x + t1 * a.v.x, iy = a.p.y + t1 * a.v.y;
        const candPos = unproject(ix, iy);
        const d1 = distance(sources[i].data, candPos) / 1000;
        const d2 = distance(sources[j].data, candPos) / 1000;
        if (d1 > MAX_DIST_KM || d2 > MAX_DIST_KM) continue;
        let diff = norm360(sources[i].ips - sources[j].ips);
        if (diff > 180) diff = 360 - diff;
        const ang = Math.min(diff, 180 - diff);
        if (ang < ANGLE_ERROR_DEG) continue;
        const score = 90 - Math.abs(90 - ang);
        if (score > bestScore) { bestScore = score; bestPos = candPos; bestPair = [i, j, ang]; }
      }
    }
    if (!bestPos) {
      errorMsg = 'Линии пеленгов не пересекаются в правдоподобной точке:<br>' +
        '— параллельны, или<br>' +
        '— угол между ними < ' + ANGLE_ERROR_DEG + '°, или<br>' +
        '— пересечение позади одной из станций, или<br>' +
        '— точка дальше ' + MAX_DIST_KM + ' км от станции.';
    } else {
      pos = bestPos;
      resultNote = 'Пересечение: ' + sources[bestPair[0]].name + ' + ' + sources[bestPair[1]].name +
                   ' (угол ' + bestPair[2].toFixed(1) + '°).';
      usedForLines = [sources[bestPair[0]], sources[bestPair[1]]];
    }
  } else {
    errorMsg = 'Для расчёта нужно: либо VOR с дальностью, либо минимум два МПР/радиала.';
  }

  if (pos) {
    usedForLines.forEach(s => {
      const popup = '<b>' + s.name + '</b><br>' + s.inputLabel + ' → ИПС ' + s.ips.toFixed(0) + '°<br>' +
                    'Расстояние: <b>' + (distance(s.data, pos) / 1000).toFixed(1) + ' км</b>';
      const pair = makeClickableLine(
        [[s.data.lat, s.data.lon], [pos.lat, pos.lon]],
        { color: s.color, weight: 2, opacity: 0.85 }, popup
      );
      stationLines.push(pair[0], pair[1]);
    });

    track.push({ lat: pos.lat, lon: pos.lon, t: Date.now() });
    saveTrack();
    renderTrack();
    refreshOpenPopup();

    let geomWarning = '';
    if (usedForLines.length === 2) {
      let diff = norm360(usedForLines[0].ips - usedForLines[1].ips);
      if (diff > 180) diff = 360 - diff;
      const ang = Math.min(diff, 180 - diff);
      if (ang >= ANGLE_ERROR_DEG && ang < ANGLE_WARN_DEG) {
        geomWarning = '<br><span class="warn">⚠️ Средняя геометрия (' + ang.toFixed(1) + '°). Возможна погрешность.</span>';
      }
    }

    const courseMag = getCourseMag();
    let html = '<b>' + resultNote + '</b><br>' +
               '<b>Широта:</b> ' + pos.lat.toFixed(5) + ' (' + ddToDM(pos.lat, true) + ')<br>' +
               '<b>Долгота:</b> ' + pos.lon.toFixed(5) + ' (' + ddToDM(pos.lon, false) + ')<br>' +
               '<b>Курс МК:</b> ' + courseMag.toFixed(0) + '°';
    usedForLines.forEach(s => {
      const dkm = distance(s.data, pos) / 1000;
      html += '<br>«' + s.name + '» (' + s.inputLabel + ') → <b>' + dkm.toFixed(1) + ' км</b>';
    });
    html += geomWarning;
    html += '<br><span style="color:#666;font-size:11px">Точек в треке ОПРС: ' + track.length + '</span>';
    resultEl.innerHTML = html;
    resultEl.classList.remove('error');
  } else {
    drawErrorLines(sources);
    resultEl.classList.add('error');
    resultEl.innerHTML = '⚠️ <b>Данные недостоверны.</b><br>' + errorMsg +
      '<br>Проверьте пеленги. Линии показаны на карте (50 км).';
  }

  updateNavUI();
  updateRTUI();

  if (window.innerWidth <= 600) {
    document.getElementById('panel').classList.add('hidden');
    document.getElementById('toggleBtn').textContent = '☰';
    document.getElementById('infoBtn').hidden = false;
  }
}

function onCourseChange() {
  const a = document.getElementById('course');
  const b = document.getElementById('courseRT');
  if (a && b && a.value !== b.value) b.value = a.value;
  if (track.length > 0 || trackGps.length > 0) renderTrack();
}

function onCourseRTInput() {
  const a = document.getElementById('course');
  const b = document.getElementById('courseRT');
  if (a && b) a.value = b.value;
  onCourseChange();
}
// === КОНЕЦ БЛОКА 37 ===

// === БЛОК 38: INIT ===
setInterval(() => {
  if (rtTracking && rtCurrentPosition && currentTab === 'rtnav') {
    updateRTUI();
  }
}, 1000);

document.getElementById('decl').value = String(ACTIVE_PROFILE.magneticDeclinationDeg);
loadPreset();
loadTrack();
loadTrackGps();
loadRTTrack();
loadUserRoutes();
loadHSISettings();
buildHSISelects();
changeMenuSide(localStorage.getItem(MENU_SIDE_KEY) === 'right');
document.getElementById('windSpeedUnit').checked = localStorage.getItem(WIND_SPEED_UNIT_KEY) === 'ms';
setHudHeadingVisible(localStorage.getItem(HUD_HEADING_KEY) === '1');
loadWindNavPreference();
setupConfigurationTracking();
updateTasHint();
// Автономный запрос разрешения при загрузке не включает РВ и не записывает трек.
requestGpsPermissionAtStartup();

updateFollowBtn();
updateSpeedUnitLabel();

renderTrack();
renderRoutes();
updateRouteEditorUI();
initJokePreference();
renderCircle();
renderAreas();
document.getElementById('toggleAltitudeColors').checked = localStorage.getItem(ALT_COLORS_KEY) === '1';
toggleAltitudeView();
updateNavUI();
updateRTUI();
updateFlightLogUI();
renderHSIGuideLine();
refreshHSIPanel();

// Браузер сам решает, показать ли диалог повторно для разрешения «только сейчас».
function requestGpsPermissionAtStartup() {
  if (!navigator.geolocation) return;
  try {
    navigator.geolocation.getCurrentPosition(
      () => { /* Разрешение получено: это НЕ старт записи. */ },
      () => { /* Ничего не пишем; кнопки РВ и «Получить МС» остаются доступны. */ },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  } catch (e) { console.warn('Запрос GPS при запуске:', e); }
}

// Сохраняем данные при уходе браузера в фон; iOS может выгружать вкладку.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveFlightLog(true);
});
window.addEventListener('pagehide', () => saveFlightLog(true));
// === КОНЕЦ БЛОКА 38 ===
