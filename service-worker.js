// service-worker.js (ZJEDNODUŠENÁ VERZIA - LEN PRE CACHOVANIE A OFFLINE FALLBACK)

const CACHE_NAME = 'dochadzka-cache-v3.1'; // ZVÝŠTE VERZIU pri každej zmene SW alebo PRECACHE_ASSETS!
const PRECACHE_ASSETS = [
  './', // Koreňová stránka (index.html)
  './index.html',
  './offline.html', // Uistite sa, že tento súbor existuje a má zmysluplný obsah
  './manifest.json',
  './icons/icon-192x192.png', // Príklad ikon
  './icons/icon-512x512.png',
  // Pridajte sem odkazy na vaše CSS súbory, ak sú externé a chcete ich cachovať
  // Napr. './css/style.css'
];

console.log(`SW (${CACHE_NAME}): Service Worker sa načítal.`);

self.addEventListener('install', event => {
  console.log(`SW (${CACHE_NAME}): Install event`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log(`SW (${CACHE_NAME}): Caching app shell:`, PRECACHE_ASSETS);
        // Používame {cache: 'reload'} aby sme si boli istí, že sa vždy stiahnu čerstvé verzie pri inštalácii/aktualizácii SW
        return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, {cache: 'reload'})));
      })
      .then(() => {
        console.log(`SW (${CACHE_NAME}): Precaching dokončený, volám skipWaiting.`);
        return self.skipWaiting(); // Aktivuje nový SW okamžite po inštalácii
      })
      .catch(error => {
        console.error(`SW (${CACHE_NAME}): Precache failed:`, error);
        // Neúspešné precache zabráni inštalácii SW, čo je zvyčajne žiaduce
      })
  );
});

self.addEventListener('activate', event => {
  console.log(`SW (${CACHE_NAME}): Activate event`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) { // Vymaže všetky staré cache, ktoré nemajú aktuálne meno
            console.log(`SW (${CACHE_NAME}): Mazanie starej cache:`, cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log(`SW (${CACHE_NAME}): Staré cache vymazané, volám clients.claim.`);
        return self.clients.claim(); // Prevezme kontrolu nad všetkými otvorenými klientmi okamžite
    })
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Ignorovať Firebase a iné externé CDN, nech idú priamo na sieť
  // Toto je dôležité, aby Firebase SDK mohlo samo manažovať svoju offline perzistenciu a komunikáciu
  if (requestUrl.protocol === 'chrome-extension:' || // Ignorovať requesty rozšírení
      requestUrl.hostname.includes('firebase') ||
      requestUrl.hostname.includes('firestore.googleapis.com') || // Explicitne pre Firestore
      requestUrl.hostname.includes('firebaseappcheck.googleapis.com') || // Pre App Check
      requestUrl.hostname.includes('gstatic.com') || 
      requestUrl.hostname.includes('cloudflare.com') ||
      requestUrl.hostname.includes('googleapis.com')) { // Pre Google Fonts
    // console.log(`SW (${CACHE_NAME}): Ignorujem fetch pre externú doménu: ${event.request.url}`);
    event.respondWith(fetch(event.request));
    return;
  }

  // Pre navigačné požiadavky (HTML stránky) - Network first, potom cache, potom offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Ak je odpoveď úspešná, môžeme ju cachovať (ak je v PRECACHE_ASSETS)
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
          console.log(`SW (${CACHE_NAME}): Navigácia pre ${event.request.url} zlyhala, servírujem offline.html`);
          return caches.match('./offline.html');
        })
    );
    return;
  }

  // Pre ostatné lokálne assety - Cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // console.log(`SW (${CACHE_NAME}): Servírujem z cache: ${event.request.url}`);
          return cachedResponse;
        }
        // Ak nie je v cache, skúsime načítať zo siete a prípadne uložiť do cache
        return fetch(event.request).then(networkResponse => {
            // console.log(`SW (${CACHE_NAME}): Načítavam zo siete a cachujem: ${event.request.url}`);
            // Voliteľné: Cachovať nové assety dynamicky (buďte opatrní)
            // if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            //   const responseToCache = networkResponse.clone();
            //   caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
            // }
            return networkResponse;
          }).catch(error => {
            console.error(`SW (${CACHE_NAME}): Fetch error pre asset ${event.request.url}:`, error);
            // Tu by ste mohli vrátiť nejaký placeholder, napr. pre obrázky
          });
      })
  );
});

// Odstránime sync listener, pretože SW už nebude aktívne synchronizovať
// self.addEventListener('sync', ... ); 

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log(`SW (${CACHE_NAME}): Prijatá správa SKIP_WAITING od klienta.`);
    self.skipWaiting();
  }
});

console.log(`SW (${CACHE_NAME}): Service Worker pripravený (zjednodušená cachovacia verzia).`);
