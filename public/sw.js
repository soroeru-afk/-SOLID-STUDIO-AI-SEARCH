const CACHE_NAME = 'solid-studio-ai-search-v1';
const urlsToCache = [
  '/-SOLID-STUDIO-AI-SEARCH/',
  '/-SOLID-STUDIO-AI-SEARCH/index.html'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
