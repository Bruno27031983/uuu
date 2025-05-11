// service-worker.js

const CACHE_NAME = 'dochadzka-cache-v14'; // Zvýšte verziu pri zmene assetov na precache
const PRECACHE_ASSETS = [
  './', // Koreňová stránka
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  // Pridajte ďalšie kľúčové assety, napr. hlavné CSS, ak máte samostatný súbor
  // Knižnice načítané cez CDN (jspdf, xlsx, firebase) nie sú typicky precachované tu,
  // pokiaľ nechcete explicitne manažovať ich offline verzie.
];

// Install event: precache aplikácie
self.addEventListener('install', event => {
  console.log('Service Worker: Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        // Používame addAll, aby sa v prípade chyby nezaregistroval SW
        return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, {cache: 'reload'})));
      })
      .then(() => self.skipWaiting()) // Aktivuje nový SW okamžite
      .catch(error => {
        console.error('Service Worker: Precache failed:', error);
        // Neúspešné precache môže zabrániť inštalácii SW, čo je žiaduce správanie,
        // aby sa neaktivoval chybný SW.
      })
  );
});

// Activate event: vyčistenie starých cache
self.addEventListener('activate', event => {
  console.log('Service Worker: Activate event');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Prevezme kontrolu nad všetkými klientmi
  );
});

// Fetch event: stratégia Cache First pre precachované assety, Network First pre navigáciu
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Ignorovať Firebase requesty a externé CDN, aby ich SW neovplyvňoval nechcene
  if (requestUrl.hostname.includes('firebase') || 
      requestUrl.hostname.includes('gstatic.com') ||
      requestUrl.hostname.includes('cloudflare.com') ||
      requestUrl.hostname.includes('googleapis.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Pre navigačné požiadavky (HTML stránky) skúsime najprv sieť
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Ak je odpoveď úspešná a je to jedna z našich hlavných stránok, môžeme ju cachovať
          // Toto je voliteľné pre navigáciu, ale môže zlepšiť offline znovunačítanie
          if (response && response.status === 200) {
            const path = requestUrl.pathname === '/' ? './' : `.${requestUrl.pathname}`;
            if (PRECACHE_ASSETS.includes(path)) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
            }
          }
          return response;
        })
        .catch(() => {
          // Ak sieť zlyhá, skúsime nájsť v cache (napr. pre offline prístup)
          return caches.match(event.request)
            .then(cachedResponse => {
                return cachedResponse || caches.match('./index.html'); // Fallback na index.html
            });
        })
    );
    return;
  }

  // Pre ostatné požiadavky (assety ako CSS, JS lokálne, obrázky) použijeme Cache First
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Ak nie je v cache, skúsime načítať zo siete
        return fetch(event.request).then(
          networkResponse => {
            // Voliteľne môžeme cachovať nové assety dynamicky
            // Buďte opatrní, aby ste necachovali všetko (napr. API volania tretích strán)
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              // const responseToCache = networkResponse.clone();
              // caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          }
        ).catch(error => {
            console.error('Service Worker: Fetch error for:', event.request.url, error);
            // Tu by ste mohli vrátiť vlastnú offline fallback stránku/obrázok pre špecifické typy assetov
            // Napríklad pre obrázky: return caches.match('./images/offline-placeholder.png');
        });
      })
  );
});


// Background Sync Event Listener
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-pending-data') {
    console.log('Service Worker: Background sync event triggered for sync-pending-data.');
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        let clientNotified = false;
        if (windowClients && windowClients.length > 0) {
            // Pokúsime sa nájsť viditeľného klienta
            for (const client of windowClients) {
              if (client.visibilityState === "visible") { // client.url je tiež dobré skontrolovať
                client.postMessage({ type: 'TRIGGER_SYNC_FROM_SW' });
                console.log('Service Worker: Notified a visible client to trigger sync.');
                clientNotified = true;
                break; 
              }
            }
            // Ak sme nenašli viditeľného, pošleme prvému v zozname
            if (!clientNotified && windowClients[0]) {
                 windowClients[0].postMessage({ type: 'TRIGGER_SYNC_FROM_SW' });
                 console.log('Service Worker: Notified a non-visible client to trigger sync.');
                 clientNotified = true;
            }
        }
        
        if (clientNotified) {
          return Promise.resolve(); // Synchronizáciu sa pokúsi vykonať klient
        } else {
          // Ak nie sú otvorení žiadni klienti, alebo správa nebola doručená,
          // synchronizácia sa spolieha na existujúcu logiku v aplikácii pri jej ďalšom otvorení online.
          // Pre "skutočnú" synchronizáciu riadenú SW by SW musel vykonať fetch dát a sieťovú požiadavku sám,
          // typicky s dátami z IndexedDB a vlastnou inicializáciou Firebase.
          // Táto časť je zjednodušená kvôli súčasnej závislosti aplikácie na localStorage a client-side autentifikácii.
          console.log('Service Worker: No suitable open clients to notify for immediate sync. Sync will occur on next app load if pending and online.');
          // Pre splnenie waitUntil musíme vrátiť promise.
          // Keďže SW teraz nevykonáva synchronizáciu sám, okamžite sa vyrieši.
          return Promise.resolve();
        }
      }).catch(err => {
        console.error('Service Worker: Error during sync event client matching:', err);
        return Promise.resolve(); // Aj pri chybe musíme vrátiť promise
      })
    );
  }
});

// Počúvanie správ od klientov (voliteľné, ale môže byť užitočné)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('Service Worker: Received SKIP_WAITING message from client.');
    self.skipWaiting();
  }
});
