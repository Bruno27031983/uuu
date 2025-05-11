// service-worker.js (Zjednodušená verzia pre cachovanie)

const CACHE_NAME = 'dochadzka-cache-v2.0'; // ZVÝŠTE VERZIU!
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './offline.html', // Uistite sa, že tento súbor existuje a je funkčný
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  // Pridajte sem ďalšie kľúčové lokálne assety (CSS, JS), ak ich máte
];

// Install event: precache aplikácie
self.addEventListener('install', event => {
  console.log('SW (Simple): Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW (Simple): Caching app shell:', PRECACHE_ASSETS);
        return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, {cache: 'reload'})));
      })
      .then(() => {
        console.log('SW (Simple): Precaching dokončený, volám skipWaiting.');
        return self.skipWaiting();
      })
      .catch(error => console.error('SW (Simple): Precache failed:', error))
  );
});

// Activate event: vyčistenie starých cache
self.addEventListener('activate', event => {
  console.log('SW (Simple): Activate event');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW (Simple): Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('SW (Simple): Staré cache vymazané, volám clients.claim.');
        return self.clients.claim();
    })
  );
});

// Fetch event: stratégia Cache First, potom Network, s fallbackom na offline.html pre navigáciu
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Ignorovať Firebase a iné externé CDN, nech idú priamo na sieť
  if (requestUrl.hostname.includes('firebase') ||
      requestUrl.hostname.includes('gstatic.com') || // Pre Firebase SDK a fonty
      requestUrl.hostname.includes('cloudflare.com') || // Pre jsPDF atď.
      requestUrl.hostname.includes('googleapis.com')) { // Pre fonty
    event.respondWith(fetch(event.request));
    return;
  }

  // Pre navigačné požiadavky (HTML stránky)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          console.log('SW (Simple): Navigácia zlyhala, servírujem offline.html');
          return caches.match('./offline.html');
        })
    );
    return;
  }

  // Pre ostatné požiadavky (assety ako CSS, JS lokálne, obrázky) - Cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then(networkResponse => {
          // Voliteľne môžeme cachovať nové assety dynamicky tu, ak je to potrebné
          // napr. ak by ste mali obrázky, ktoré nie sú v PRECACHE_ASSETS
          // if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          //   const responseToCache = networkResponse.clone();
          //   caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
          // }
          return networkResponse;
        });
      })
      .catch(error => {
        console.error('SW (Simple): Fetch error for asset:', event.request.url, error);
        // Tu by ste mohli vrátiť placeholder pre obrázky, ak by zlyhalo načítanie
      })
  );
});

// Sync event listener - TENTO BUDE JEDNODUCHŠÍ, LEN POŠLE SPRÁVU KLIENTOVI
// Alebo ho môžeme dočasne úplne zakomentovať, ak chceme synchronizáciu len pri štarte appky.
// Pre teraz ho necháme, aby poslal správu, ak je klient otvorený.
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-pending-data-idb') { // Stále používame tento tag
    console.log('SW (Simple): Background sync (IDB) udalosť spustená, pokúšam sa upozorniť klienta.');
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        if (windowClients && windowClients.length > 0) {
          console.log('SW (Simple): Našiel sa otvorený klient, posielam správu TRIGGER_CLIENT_SYNC.');
          windowClients[0].postMessage({ type: 'TRIGGER_CLIENT_SYNC' }); // Iný typ správy
          return Promise.resolve();
        } else {
          console.log('SW (Simple): Žiadny otvorený klient na upozornenie. Sync prebehne pri ďalšom otvorení appky (ak je online).');
          return Promise.resolve();
        }
      })
    );
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('SW (Simple): Prijatá správa SKIP_WAITING od klienta.');
    self.skipWaiting();
  }
});

console.log('SW (Simple): Service Worker načítaný.');
