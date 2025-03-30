
// service-worker.js

const CACHE_NAME = 'bruno-calculator-cache-v1'; // Zmeňte verziu pri aktualizácii assetov
const urlsToCache = [
  './', // Koreňový adresár (zvyčajne index.html)
  './index.html', // Explicitne hlavný súbor HTML (ak sa volá inak, upravte)
  // Pridajte sem ďalšie dôležité statické súbory, ak nejaké máte (napr. externý CSS, JS)
  // './styles.css',
  // './app.js',

  // Knižnice z CDN (budú cachované)
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.15/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf', // Font pre PDF

  // Cesty k ikonám z manifestu (upravte podľa potreby)
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',

  // Firebase SDK (môžu byť cachované, ale Firebase má aj vlastný offline mechanizmus)
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-check.js',
];

// Inštalácia Service Workera
self.addEventListener('install', event => {
  console.log('SW: Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Caching app shell');
        return cache.addAll(urlsToCache).catch(error => {
            // Log error if any URL fails to cache, but let install succeed
            console.error('SW: Failed to cache one or more resources during install:', error);
        });
      })
      .then(() => self.skipWaiting()) // Aktivuje nový SW hneď
  );
});

// Aktivácia Service Workera
self.addEventListener('activate', event => {
  console.log('SW: Activate event');
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
    }).then(() => self.clients.claim()) // Prevezme kontrolu nad otvorenými stránkami
  );
});

// Fetch event (zachytenie sieťových požiadaviek)
self.addEventListener('fetch', event => {
  // Ignorujeme non-GET požiadavky a Firebase API
  if (event.request.method !== 'GET' || event.request.url.includes('firestore.googleapis.com')) {
    // console.log('SW: Bypassing non-GET or Firestore request:', event.request.url);
    return;
  }

  // Stratégia: Cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Ak je v cache, vrátime ju
        if (cachedResponse) {
          // console.log('SW: Serving from cache:', event.request.url);
          return cachedResponse;
        }

        // Ak nie je v cache, skúsime sieť
        // console.log('SW: Fetching from network:', event.request.url);
        return fetch(event.request).then(
          networkResponse => {
            // Ak úspešne načítané zo siete, uložíme do cache pre budúcnosť
            // Overíme, či je odpoveď validná pred cachovaním
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                // console.log('SW: Not caching invalid response:', event.request.url, networkResponse.status);
                return networkResponse;
            }

            const responseToCache = networkResponse.clone(); // Klonujeme, lebo response sa dá použiť len raz
            caches.open(CACHE_NAME)
              .then(cache => {
                // console.log('SW: Caching new resource:', event.request.url);
                cache.put(event.request, responseToCache);
              });

            // Vrátime odpoveď zo siete
            return networkResponse;
          }
        ).catch(error => {
          // Chyba siete (offline)
          console.error('SW: Network fetch failed:', event.request.url, error);
          // Tu by sa dala vrátiť fallback offline stránka, ak ju máte
          // return caches.match('./offline.html');
          // Alebo jednoducho necháme prehliadač zobraziť štandardnú offline chybu
          // pre zdroje, ktoré nie sú v cache.
        });
      })
  );
});
