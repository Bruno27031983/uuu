// service-worker.js
const CACHE_NAME = 'bruno-calculator-cache-v11'; // <-- ZVÝŠTE TÚTO VERZIU PRI ZMENÁCH V CACHOVANÝCH SÚBOROCH ALEBO SW!
const OFFLINE_FALLBACK_PAGE = './offline.html';

const urlsToCache = [
  './', // Alias pre index.html
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  OFFLINE_FALLBACK_PAGE,
  // Knižnice tretích strán
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.15/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Roboto&display=swap&subset=latin-ext',
  // Ak máte vlastné CSS alebo JS súbory, pridajte ich sem
  // napr. './css/style.css', './js/main.js'
];

// Inštalácia Service Workera
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Otvorená cache:', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Núti čakajúceho service workera, aby sa stal aktívnym
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Chyba pri cachovaní počas inštalácie SW:', error);
      })
  );
});

// Aktivácia Service Workera
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Vymaže staré cache, ktoré nie sú aktuálnou verziou
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Vymazáva sa stará cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Povie service workerovi, aby okamžite prevzal kontrolu nad stránkou
      return self.clients.claim();
    })
  );
});

// Fetch event handler
self.addEventListener('fetch', event => {
  // Pre navigačné požiadavky (HTML stránky) použijeme Network first, fallback to Cache, potom Offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request) // Najprv skúsime sieť
        .then(networkResponse => {
          // Ak je odpoveď zo siete OK, uložíme ju do cache a vrátime
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => { // Ak sieť zlyhá, skúsime cache
          return caches.match(event.request)
            .then(cachedResponse => {
              return cachedResponse || caches.match(OFFLINE_FALLBACK_PAGE); // Ak nie je v cache, vrátime offline stránku
            });
        })
    );
    return;
  }

  // Pre ostatné požiadavky (CSS, JS, obrázky, fonty, CDN) použijeme Cache first, fallback to Network
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Ak je v cache, vrátime ju
        if (response) {
          return response;
        }
        // Ak nie je v cache, skúsime sieť
        return fetch(event.request).then(
          networkResponse => {
            // Ak je odpoveď zo siete OK a nie je to Firestore, uložíme ju do cache
            if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET' && !event.request.url.includes('firestore.googleapis.com') && !event.request.url.includes('firebaseappcheck.googleapis.com')) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          }
        ).catch(error => {
          console.warn('Fetch request zlyhal pre zdroj:', event.request.url, error);
          // Pre ne-navigačné requesty nevrátime offline.html, ale necháme prehliadač spracovať chybu
        });
      })
  );
});
