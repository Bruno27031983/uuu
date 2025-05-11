// service-worker.js (ZJEDNODUŠENÁ VERZIA - LEN PRE CACHOVANIE A OFFLINE FALLBACK)

const CACHE_NAME = 'dochadzka-cache-v3.0'; // ZVÝŠTE VERZIU!
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './offline.html', // Uistite sa, že tento súbor existuje
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  // Pridajte sem ďalšie kľúčové lokálne assety (CSS, hlavný JS súbor ak by bol externý)
];

console.log(`SW (${CACHE_NAME}): Service Worker sa načítal.`);

self.addEventListener('install', event => {
  console.log(`SW (${CACHE_NAME}): Install event`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log(`SW (${CACHE_NAME}): Caching app shell:`, PRECACHE_ASSETS);
        return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, {cache: 'reload'})));
      })
      .then(() => {
        console.log(`SW (${CACHE_NAME}): Precaching dokončený, volám skipWaiting.`);
        return self.skipWaiting();
      })
      .catch(error => console.error(`SW (${CACHE_NAME}): Precache failed:`, error))
  );
});

self.addEventListener('activate', event => {
  console.log(`SW (${CACHE_NAME}): Activate event`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log(`SW (${CACHE_NAME}): Mazanie starej cache:`, cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log(`SW (${CACHE_NAME}): Staré cache vymazané, volám clients.claim.`);
        return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Ignorovať Firebase a iné externé CDN, nech idú priamo na sieť
  if (requestUrl.protocol === 'chrome-extension:' ||
      requestUrl.hostname.includes('firebase') ||
      requestUrl.hostname.includes('gstatic.com') ||
      requestUrl.hostname.includes('cloudflare.com') ||
      requestUrl.hostname.includes('googleapis.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Pre navigačné požiadavky (HTML stránky) - Network first, potom cache, potom offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          console.log(`SW (${CACHE_NAME}): Navigácia pre ${event.request.url} zlyhala, servírujem offline.html`);
          return caches.match('./offline.html');
        })
    );
    return;
  }

  // Pre ostatné assety - Cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        return cachedResponse || fetch(event.request).then(networkResponse => {
          // Tu by sme mohli chcieť cachovať nové assety dynamicky, ak je to bezpečné
          return networkResponse;
        });
      })
  );
});

// Odstránili sme 'sync' listener, pretože SW už nebude aktívne synchronizovať
// Odstránili sme 'message' listener pre 'SKIP_WAITING', ale môžeme ho nechať, ak ho klient volá

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log(`SW (${CACHE_NAME}): Prijatá správa SKIP_WAITING od klienta.`);
    self.skipWaiting();
  }
});

console.log(`SW (${CACHE_NAME}): Service Worker pripravený (zjednodušená verzia).`);
