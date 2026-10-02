// 联网优先加载最新页面；断网时回退到已保存的静态文件。业务数据在独立 IndexedDB 中。
const CACHE = 'finish-and-win-v11';
const ASSETS = ['./', './index.html', './style.css', './journey.css', './journey.js', './meadow.png', './traveler-forest.png', './app.js', './sound.js', './sound-check.wav', './core.js', './defaults.js', './config.js', './store.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async () => { for (const key of await caches.keys()) if (key.startsWith('finish-and-win-') && key !== CACHE) await caches.delete(key); await self.clients.claim(); })()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(event.request, { cache: 'no-store', signal: controller.signal });
      if (response.ok) return response;
      const saved = await cache.match(event.request, { ignoreSearch: true });
      return saved || response;
    } catch {
      const saved = await cache.match(event.request, { ignoreSearch: true });
      if (saved) return saved;
      return new Response('此页面尚未缓存，请联网后重试。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } finally { clearTimeout(timeout); }
  })());
});
