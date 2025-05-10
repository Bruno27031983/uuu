// service-worker.js

const CACHE_NAME = 'bruno-calculator-cache-v6'; // <-- ZVÝŠTE TÚTO VERZIU! (napr. v3, v4, atď.)
const urlsToCache = [
  // Základné súbory aplikácie
  './', // Koreňový adresár PWA (uuu/index.html alebo uuu/)
  './index.html',
  './manifest.json',
  './favicon.ico',

  // Ikony
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',

  // Knižnice z CDN (tieto cesty sú absolútne a sú v poriadku)
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.15/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Roboto&display=swap&subset=latin-ext',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf',

  // Firebase SDK (tieto cesty sú absolútne a sú v poriadku)
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-check.js',
];

// Inštalácia Service Workera
self.addEventListener('install', event => {
  console.log('SW: Install event - ' + CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Caching app shell');
        return cache.addAll(urlsToCache); // Ak toto zlyhá, celá inštalácia SW zlyhá
      })
      .then(() => {
        console.log('SW: All resources cached successfully. Skipping waiting.');
        return self.skipWaiting(); // Aktivuje nový SW hneď len ak bolo cachovanie úspešné
      })
      .catch(error => {
          // Ak cache.addAll() zlyhá, tento catch sa vykoná a inštalácia SW sa považuje za neúspešnú.
          console.error('SW: Installation failed, one or more resources could not be cached:', error);
      })
  );
});

// Aktivácia Service Workera
self.addEventListener('activate', event => {
  console.log('SW: Activate event - ' + CACHE_NAME);
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('SW: Clients claimed.');
        return self.clients.claim();
    })
  );
});

// Fetch event (zachytenie sieťových požiadaviek)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' ||
      event.request.url.includes('firestore.googleapis.com') ||
      event.request.url.includes('firebaseappcheck.googleapis.com')) {
    return;
  }

  if (urlsToCache.includes(new URL(event.request.url).pathname.substring(1)) || // Pre lokálne súbory z urlsToCache (odstráni prvý / z pathname)
      event.request.url.includes('cdnjs.cloudflare.com') ||
      event.request.url.includes('fonts.googleapis.com') ||
      event.request.url.includes('gstatic.com')) {
    event.respondWith(
      caches.match(event.request) // Stratégia Cache first, then network pre tieto zdroje
        .then(cachedResponse => {
          if (cachedResponse) {
            // console.log('SW: Serving from cache:', event.request.url);
            return cachedResponse;
          }
          // console.log('SW: Fetching from network:', event.request.url);
          return fetch(event.request).then(
            networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, responseToCache);
                });
              }
              return networkResponse;
            }
          ).catch(error => {
            console.error('SW: Network fetch failed for:', event.request.url, error);
            // Vrátiť jednoduchú chybu, ak nie je ani v cache, ani v sieti
            return new Response("Resource not available offline and network error.", {
                status: 404, // Alebo 503 Service Unavailable
                headers: { "Content-Type": "text/plain" },
            });
          });
        })
    );
  } else {
    // Pre ostatné požiadavky, ktoré nechceme explicitne cachovať ani obsluhovať špeciálne
    // console.log('SW: Bypassing fetch for:', event.request.url);
    return;
  }
});
