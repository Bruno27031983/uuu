// service-worker.js

const CACHE_NAME = 'bruno-calculator-pro-v1.3'; // Zvýšte verziu pri zmene assetov alebo logiky SW
const ASSETS_TO_CACHE = [
  './', // Alias pre index.html
  './index.html',
  './manifest.json',
  // Pridajte sem cesty k vašim ikonkám, ak sú iné ako v manifest.json
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png',
  // Font (ak ho chcete cachovať explicitne)
  'https://fonts.gstatic.com/s/inter/v12/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7W0Q5nw.woff2'
  // Tu by boli ďalšie statické assety (CSS, JS súbory), ak by neboli inline.
];

// Zoznam CDN, ktorých obsah chceme tiež cachovať
const CDN_ORIGINS = [
  'https://cdnjs.cloudflare.com', // Pre jspdf, xlsx
  'https://www.gstatic.com',      // Pre Firebase
  'https://fonts.gstatic.com'     // Pre Google Fonts
];

self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Precaching App Shell and critical assets');
        // Pridanie všetkých assetov naraz. Ak jedno zlyhá, celé precaching zlyhá.
        // Je možné pridať ich jednotlivo s .add() a ignorovať chyby, ak niektoré nie sú kritické.
        const promises = ASSETS_TO_CACHE.map(assetUrl => {
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
  console.log('[ServiceWorker] Activate event');
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

  // Ignorovať Firebase Auth a Firestore požiadavky - tie si rieši Firebase SDK vrátane offline perzistencie
  if (requestUrl.hostname.includes('firebaseapp.com') || // *.firebaseapp.com (authDomain)
      requestUrl.hostname.includes('firebaseio.com') || // *.firebaseio.com (databaseURL, ak by sa používala RTDB)
      requestUrl.hostname.includes('googleapis.com') // identitytoolkit.googleapis.com (Auth), firestore.googleapis.com (Firestore)
     ) {
    // Nechať tieto požiadavky prejsť na sieť, Firebase SDK má vlastnú logiku pre offline
    // console.log('[ServiceWorker] Letting Firebase SDK handle:', requestUrl.href);
    return;
  }

  // Stratégia: Cache-First s fallbackom na Network pre statické assety a CDN zdroje
  if (ASSETS_TO_CACHE.some(asset => requestUrl.pathname.endsWith(asset.substring(1))) ||
      CDN_ORIGINS.some(origin => requestUrl.origin === origin)) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            // console.log('[ServiceWorker] Serving from CACHE:', event.request.url);
            return cachedResponse;
          }
          // Ak nie je v cache, získať zo siete, uložiť do cache a vrátiť
          // console.log('[ServiceWorker] Fetching from NETWORK and caching:', event.request.url);
          return fetch(event.request).then(networkResponse => {
            // Skontrolovať, či je odpoveď platná pred cachovaním
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic' || networkResponse.type === 'cors') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          }).catch(error => {
            console.error('[ServiceWorker] Network fetch failed for asset:', event.request.url, error);
            // Tu by mohol byť fallback na nejaký generický offline asset, ak je to vhodné
          });
        })
    );
  }
  // Stratégia: Stale-While-Revalidate pre hlavnú HTML stránku (navigácie)
  // Umožní rýchle načítanie z cache a zároveň aktualizáciu na pozadí.
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
  // ich môžeme nechať ísť priamo na sieť.
  // else {
  //   // console.log('[ServiceWorker] Default network handling for:', event.request.url);
  //   return;
  // }
});

// Voliteľné: Počúvanie na 'message' event od klientov pre pokročilé interakcie (napr. vynútenie skipWaiting)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Received SKIP_WAITING message, skipping wait.');
    self.skipWaiting();
  }
});
