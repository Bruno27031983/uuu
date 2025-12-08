const CACHE_NAME = 'bruno-calc-v1.2';
const urlsToCache = [
  '/uuu/',
  '/uuu/index.html',
  '/uuu/app.js',
  '/uuu/manifest.json',
  '/uuu/libs/dompurify.min.js',
  '/uuu/libs/jspdf.umd.min.js',
  '/uuu/libs/jspdf-autotable.min.js',
  '/uuu/libs/xlsx.full.min.js'
];

// Stale-While-Revalidate stratégia
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(response => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
        return response || fetchPromise;
      });
    })
  );
});
