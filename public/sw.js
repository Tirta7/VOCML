const CACHE_NAME = 'vocml-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/mobile-ios.css',
  '/js/app.js',
  '/js/ui.js',
  '/js/api.js',
  '/js/components.js',
  '/img/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Jangan cache request API
  if (event.request.url.includes('/api/')) return;
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
