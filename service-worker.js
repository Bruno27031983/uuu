// service-worker.js

const CACHE_NAME = 'bruno-calculator-pro-v2.6'; // Major sync fixes: conflict detection, hasPendingWrites, clearMonthData
const ASSETS_TO_CACHE = [
  './', // Alias pre index.html
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192x192.webp',
  './icons/icon-512x512.webp',
  './vendor/jspdf.umd.min.js',
  './vendor/jspdf.plugin.autotable.min.js',
  './vendor/xlsx.full.min.js',
  // Font
  'https://fonts.gstatic.com/s/inter/v12/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7W0Q5nw.woff2'
];

// Zoznam CDN, ktorých obsah chceme tiež cachovať (stratégia Cache, then Network s aktualizáciou)
const CDN_ORIGINS_TO_CACHE_REFRESH = [
  'https://www.gstatic.com',      // Pre Firebase
  'https://fonts.gstatic.com'     // Pre Google Fonts
];

self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install event - v:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Precaching App Shell and critical assets');
        const promises = ASSETS_TO_CACHE.map(assetUrl => {
          // Pre kritické assety, ak zlyhá pridanie, môže to byť problém
          // Tu by sa mohla pridať robustnejšia logika, ak sú niektoré menej kritické
          return cache.add(assetUrl).catch(err => {
            console.warn(`[ServiceWorker] Failed to cache ${assetUrl} during install:`, err);
          });
        });
        return Promise.all(promises);
      })
      .then(() => {
        console.log('[ServiceWorker] All assets precached, activating new SW immediately.');
        return self.skipWaiting(); // Aktivuje nový SW hneď po inštalácii
      })
      .catch(error => {
        console.error('[ServiceWorker] Precaching failed:', error);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate event - v:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[ServiceWorker] Old caches deleted, claiming clients.');
      return self.clients.claim(); // Prevezme kontrolu nad otvorenými klientmi
    })
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Ignorovať Chrome extension požiadavky
  if (requestUrl.protocol === 'chrome-extension:') {
    return;
  }

  // Ignorovať Firebase Auth a Firestore požiadavky - tie si rieši Firebase SDK
  if (requestUrl.hostname.includes('firebaseapp.com') || // *.firebaseapp.com (authDomain)
      requestUrl.hostname.includes('firebaseio.com') || // *.firebaseio.com (databaseURL)
      requestUrl.hostname.includes('googleapis.com') // identitytoolkit.googleapis.com (Auth), firestore.googleapis.com (Firestore)
     ) {
    // Nechať tieto požiadavky prejsť na sieť
    return;
  }

  // Stratégia: Cache-First s Network fallbackom a aktualizáciou cache pre statické assety a CDN zdroje
  if (ASSETS_TO_CACHE.some(asset => requestUrl.pathname.endsWith(asset.substring(1))) ||
      CDN_ORIGINS_TO_CACHE_REFRESH.some(origin => requestUrl.origin === origin)) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            // Skontrolovať, či je odpoveď platná pred cachovaním
            if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          }).catch(error => {
            console.error('[ServiceWorker] Network fetch failed for asset:', event.request.url, error);
            // Ak zlyhá sieť a máme niečo v cache (pre tento blok by to nemalo nastať, lebo sme to už kontrolovali),
            // vrátime cachedResponse. Ak nemáme nič, chyba sa prenesie.
            if (cachedResponse) return cachedResponse;
            throw error; // Ak nie je ani v cache a sieť zlyhala, necháme chybu prejsť
          });

          // Ak je v cache, vrátiť z cache, inak čakať na fetchPromise
          return cachedResponse || fetchPromise;
        })
    );
  }
  // Stratégia: Stale-While-Revalidate pre hlavnú HTML stránku (navigácie)
  else if (event.request.mode === 'navigate' ||
           (event.request.method === 'GET' && event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(error => {
            console.warn('[ServiceWorker] Network fetch failed for navigation. Serving stale if available.', error);
            // Ak sieť zlyhá A nemáme nič v cache, tu by sa mohol zobraziť offline fallback page
            // if (!cachedResponse) return caches.match('./offline.html'); // ak existuje
          });
          // Vrátiť z cache ak je k dispozícii, inak čakať na sieť
          return cachedResponse || fetchPromise;
        });
      })
    );
  }
  // Pre ostatné požiadavky (napr. POST, alebo iné GET ktoré nespadajú do kategórií vyššie)
  // ich môžeme nechať ísť priamo na sieť (default browser behavior).
});

// Počúvanie na 'message' event od klientov
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Received SKIP_WAITING message, skipping wait.');
    self.skipWaiting();
  }
});

// Počúvanie na online event a posielanie správy klientom
self.addEventListener('online', () => {
  console.log('[ServiceWorker] Detected online status.');
  // Informuj všetkých otvorených klientov (karty s PWA)
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
    if (clients && clients.length) {
      clients.forEach((client) => {
        client.postMessage({ type: 'NETWORK_STATUS_ONLINE' });
      });
      console.log('[ServiceWorker] Sent NETWORK_STATUS_ONLINE message to clients.');
    } else {
      console.log('[ServiceWorker] No clients to send NETWORK_STATUS_ONLINE message to.');
      // V budúcnosti by tu mohol byť pokus o Background Sync, ak by bol implementovaný
    }
  });
});

// Voliteľné: počúvanie na offline event pre logovanie alebo inú logiku
self.addEventListener('offline', () => {
  console.log('[ServiceWorker] Detected offline status.');
});


