/* НАЕБАЦИЯ v1.65 — редактор маршрутов, обновлённый PWA-кэш */
const CACHE = 'naebacia-v1-65-r5-sasovo-ruler-drag';
const SHELL = ['./','./index.html','./app.js','./assets/aircraft/aircraft-skins.js','./manifest.json','./assets/data/navaids-russia.json',
  './regions/krasny-kut.json','./regions/saint-petersburg.json','./regions/lipetsk.json',
  './regions/sasovo.json','./regions/ulyanovsk.json','./regions/buguruslan.json','./assets/icons/icon-192.png','./assets/icons/icon-512.png',
  './assets/aircraft/standard.svg', './assets/aircraft/liner.svg', './assets/aircraft/tu154.svg', './assets/aircraft/fighter.svg', './assets/aircraft/shuttle.svg', './assets/aircraft/rocket.svg', './assets/aircraft/funny.svg', './assets/aircraft/da40.svg', './assets/aircraft/da42.svg', './assets/aircraft/mi8.svg', './assets/aircraft/yacht.svg', './assets/aircraft/carrier.svg', './assets/aircraft/f117.svg', './assets/aircraft/spitfire.svg', './assets/aircraft/sr71.svg', './assets/aircraft/s37.svg', './assets/aircraft/zhiguli.svg', './assets/aircraft/a380.svg', './assets/aircraft/b787.svg', './assets/aircraft/mriya.svg']; 
const LEAFLET_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-providers@1.13.0/leaflet-providers.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/leaflet-providers@1.13.0/leaflet-providers.js',
  'https://unpkg.com/@tomickigrzegorz/leaflet-rotate@0.3.0/dist/leaflet-rotate.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@tomickigrzegorz/leaflet-rotate@0.3.0/dist/leaflet-rotate.umd.min.js'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Не срываем установку SW из-за временно отсутствующего JSON/CDN.
    await Promise.allSettled(SHELL.map(async path => {
      const res = await fetch(path, {cache:'reload'});
      if (res.ok) await cache.put(path,res);
    }));
    await Promise.allSettled(LEAFLET_ASSETS.map(async url => {
      const resp = await fetch(new Request(url, {mode:'no-cors'}));
      await cache.put(url,resp);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('naebacia-') && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
  const leaflet = LEAFLET_ASSETS.includes(url.href);
  if (!own && !leaflet) return; // Тайлы не сохраняем без отдельного решения.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (leaflet) {
      const cached = await cache.match(req);
      if (cached) return cached;
      const resp = await fetch(req);
      if (resp.ok || resp.type === 'opaque') await cache.put(req,resp.clone());
      return resp;
    }
    try {
      const resp = await fetch(req);
      if (resp.ok) {
        await cache.put(req,resp.clone());
        return resp;
      }
      // Если GitHub временно возвращает 404/5xx, используем уже сохранённый файл.
      const cached = await cache.match(req, {ignoreSearch:true});
      return cached || resp;
    } catch (e) {
      const cached = await cache.match(req, {ignoreSearch:true});
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const home = await cache.match('./index.html');
        if (home) return home;
      }
      throw e;
    }
  })());
});
