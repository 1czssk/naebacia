/* НАЕБАЦИЯ v1.59 🎃 — оболочка PWA, не офлайн-карты. */
const CACHE = 'naebacia-v1-59-r1';
const SHELL = ['./','./index.html','./app.js','./manifest.json',
  './regions/krasny-kut.json','./icons/icon-192.png','./icons/icon-512.png'];
const LEAFLET_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-providers@1.13.0/leaflet-providers.js'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Лучшие усилия: библиотека Leaflet с CDN для повторного запуска без сети.
    await Promise.allSettled(LEAFLET_ASSETS.map(async url => {
      const resp = await fetch(new Request(url, { mode:'no-cors' }));
      await cache.put(url, resp);
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
  if (!own && !leaflet) return; // Не кэшируем картографические тайлы и GPS.
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
      if (resp.ok) await cache.put(req,resp.clone());
      return resp;
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
