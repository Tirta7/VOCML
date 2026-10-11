// Service worker: network-first agar update aplikasi langsung terpakai (tidak tersangkut cache lama).
// Cache hanya dipakai sebagai cadangan saat offline.
const CACHE_NAME = 'vocml-cache-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/mobile-ios.css',
  '/js/app.js',
  '/js/ui.js',
  '/js/api.js',
  '/js/realtime.js',
  '/js/ios-scroll.js',
  '/js/components.js',
  '/img/favicon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Jangan cache request API / WebSocket
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
