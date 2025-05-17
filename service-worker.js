const CACHE_NAME_PREFIX = 'bruno-calc-cache-';
const CACHE_VERSION = 'v1.3'; // Zvýšte verziu pri každej zmene v ASSETS_TO_CACHE alebo logike SW
const CACHE_NAME = `${CACHE_NAME_PREFIX}${CACHE_VERSION}`;

// Zoznam súborov, ktoré sa majú uložiť do cache pri inštalácii
// Pridajte sem všetky kľúčové statické assety vašej aplikácie.
// Ak váš hlavný HTML súbor má iný názov, zmeňte './' alebo pridajte konkrétny názov.
const ASSETS_TO_CACHE = [
  './', // Hlavná stránka (index.html alebo ekvivalent)
  // Môžete pridať priame cesty k vašim CSS a JS, ak nie sú inline,
  // napr. './style.css', './app.js'
  // Ikony a manifest, ak ich máte a chcete ich explicitne kešovať:
  // './manifest.json',
  // './icons/icon-192x192.png',
  // './icons/icon-512x512.png',
  // Externé knižnice, ktoré používate a chcete mať offline:
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.15/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf', // Font pre PDF
  // Firebase SDK (sú dynamicky načítavané, ale môžeme ich pridať pre lepší offline štart)
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-check.js'
];

// Inštalácia Service Workera: Uloženie assetov do cache
self.addEventListener('install', event => {
  console.log(`[Service Worker] Inštalácia novej verzie: ${CACHE_NAME}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Ukladanie assetov do cache...');
        // addAll zlyhá, ak niektorý zo súborov nie je dostupný
        // Pre externé zdroje je dôležité, aby podporovali CORS, ak ich chceme kešovať.
        // Firebase a cdnjs by mali byť v poriadku.
        return Promise.all(
            ASSETS_TO_CACHE.map(assetUrl => {
                return cache.add(assetUrl).catch(error => {
                    console.warn(`[Service Worker] Nepodarilo sa pridať do cache: ${assetUrl}`, error);
                });
            })
        );
      })
      .then(() => {
        console.log('[Service Worker] Všetky assety úspešne (alebo s varovaním) pridané do cache.');
        // Vynúti aktiváciu nového SW hneď po inštalácii
        // Toto je užitočné počas vývoja, pre produkciu zvážte.
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[Service Worker] Chyba pri inštalácii (otváranie cache alebo ukladanie assetov):', error);
      })
  );
});

// Aktivácia Service Workera: Vyčistenie starej cache
self.addEventListener('activate', event => {
  console.log(`[Service Worker] Aktivácia novej verzie: ${CACHE_NAME}`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Vymaž všetky cache, ktoré nepatria aktuálnej verzii a majú rovnaký prefix
          if (cacheName.startsWith(CACHE_NAME_PREFIX) && cacheName !== CACHE_NAME) {
            console.log(`[Service Worker] Mazanie starej cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Staré cache vymazané.');
      // Povie klientom (otvoreným stránkam), aby použili nový SW
      return self.clients.claim();
    })
  );
});

// Fetch Event Handler: Interceptovanie sieťových požiadaviek
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Ignoruj požiadavky, ktoré nie sú HTTP/HTTPS (napr. chrome-extension://)
  if (!requestUrl.protocol.startsWith('http')) {
    return;
  }

  // Pre Firebase a Google API (napr. reCAPTCHA) vždy choď na sieť,
  // lebo potrebujú čerstvé dáta a autentifikáciu.
  // Offline prístup k Firebase sa rieši perzistenciou v SDK, nie SW kešovaním.
  if (requestUrl.hostname.includes('firebase') ||
      requestUrl.hostname.includes('googleapis.com') ||
      requestUrl.hostname.includes('gstatic.com')) { // gstatic pre firebase moduly
    // Stratégia: Network first, potom cache pre GET (pre prípad, že by sme chceli kešovať SDK)
    if (event.request.method === 'GET') {
        event.respondWith(networkFirstElseCache(event.request));
    } else {
        // Pre POST/PUT atď. (napr. ukladanie dát) vždy choď na sieť, nekešuj
        return; // Nechaj prehliadač spracovať to normálne
    }
    return;
  }


  // Pre lokálne/statické assety: Cache first, fallback to network
  // Toto sú typicky súbory z ASSETS_TO_CACHE
  if (ASSETS_TO_CACHE.some(assetPath => requestUrl.pathname.endsWith(assetPath.replace('./', ''))) || requestUrl.origin === self.location.origin) {
     if (event.request.method === 'GET') {
        event.respondWith(cacheFirstElseNetwork(event.request));
     }
     // Iné metódy pre lokálne assety by nemali nastať, ale ak áno, necháme ich prejsť
     return;
  }

  // Pre všetky ostatné GET požiadavky (napr. CDN knižnice, ktoré nie sú explicitne v ASSETS_TO_CACHE)
  // Skúsime Network first, potom Cache
  if (event.request.method === 'GET') {
    event.respondWith(networkFirstElseCache(event.request));
  }
  // Pre non-GET požiadavky na iné domény, necháme ich prejsť (nekešujeme POST na cudzie API)
});


// Stratégia: Cache first, potom network
async function cacheFirstElseNetwork(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // console.log(`[Service Worker] Vraciam z cache: ${request.url}`);
    return cachedResponse;
  }
  // console.log(`[Service Worker] Nie je v cache, idem na sieť: ${request.url}`);
  try {
    const networkResponse = await fetch(request);
    // Ak je response OK a je to GET, ulož ju do cache pre budúce použitie
    if (networkResponse && networkResponse.ok && request.method === 'GET') {
      // console.log(`[Service Worker] Ukladám do cache po úspešnom fetch: ${request.url}`);
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error(`[Service Worker] Chyba pri fetch (cacheFirst): ${request.url}`, error);
    // Tu by ste mohli vrátiť nejakú generickú offline stránku/asset, ak existuje
    // napr. return caches.match('./offline.html');
    throw error; // Alebo len preposlať chybu ďalej
  }
}

// Stratégia: Network first, potom cache
async function networkFirstElseCache(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // console.log(`[Service Worker] Skúšam sieť (networkFirst): ${request.url}`);
    const networkResponse = await fetch(request);
    // Ak je response OK a je to GET, ulož ju do cache pre budúce použitie
    // a zároveň ju vráť
    if (networkResponse && networkResponse.ok && request.method === 'GET') {
      // console.log(`[Service Worker] Ukladám do cache po úspešnom fetch (networkFirst): ${request.url}`);
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Ak sieť zlyhá, skús nájsť v cache
    // console.warn(`[Service Worker] Sieť zlyhala (networkFirst), skúšam cache: ${request.url}`, error);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      // console.log(`[Service Worker] Vraciam z cache po zlyhaní siete: ${request.url}`);
      return cachedResponse;
    }
    // Ak nie je ani v sieti, ani v cache, chyba
    console.error(`[Service Worker] Chyba pri fetch a nie je v cache (networkFirst): ${request.url}`, error);
    throw error;
  }
}
