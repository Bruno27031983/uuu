// service-worker.js

const CACHE_NAME_PREFIX = 'bruno-calc-cache-';
const CACHE_VERSION = 'v1.5'; // ZVÝŠTE VERZIU pri zmenách v ASSETS_TO_CACHE alebo logike
const CACHE_NAME = `${CACHE_NAME_PREFIX}${CACHE_VERSION}`;

// Zoznam kľúčových statických assetov pre precaching
const ASSETS_TO_CACHE = [
  './', // Hlavná stránka (index.html)
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png', // Ak existuje, pre lepšiu PWA podporu
  // Fonty používané v CSS
  'https://fonts.gstatic.com/s/inter/v12/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7W0Q5nw.woff2',
  // Firebase SDK skripty (načítané s `defer` v HTML, SW ich môže kešovať)
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-check.js',
  // Externé knižnice (načítavané dynamicky, ale SW ich môže kešovať pri prvom použití)
  // Ich pridanie sem zabezpečí, že ak ich raz aplikácia načíta online,
  // budú dostupné offline cez cache, ak ich `cacheFirstElseNetwork` alebo `networkFirstElseCache` uloží.
  // Ak ich tu neuvedieme, budú kešované len ak ich explicitne načíta logika v 'fetch'.
  // Pre dynamicky importované knižnice je ich precaching menej kritický, ale môže pomôcť
  // ak ich užívateľ raz použil online a potom chce offline.
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.15/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf' // Font pre PDF
];

// --- Inštalácia Service Workera ---
self.addEventListener('install', event => {
  console.log(`[Service Worker] Inštalácia novej verzie: ${CACHE_NAME}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Ukladanie základných assetov do cache...');
        const cachePromises = ASSETS_TO_CACHE.map(assetUrl => {
          return cache.add(assetUrl).catch(error => {
            console.warn(`[Service Worker] Nepodarilo sa pridať do cache (počas inštalácie): ${assetUrl}`, error);
            // Pre kritické assety (napr. './') by sme mohli zvážiť `throw error` na zlyhanie inštalácie.
          });
        });
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log('[Service Worker] Základné assety úspešne (alebo s varovaním) pridané do cache.');
        return self.skipWaiting(); // Aktivuje nový SW hneď po inštalácii
      })
      .catch(error => {
        console.error('[Service Worker] Chyba počas `install` udalosti:', error);
      })
  );
});

// --- Aktivácia Service Workera ---
self.addEventListener('activate', event => {
  console.log(`[Service Worker] Aktivácia novej verzie: ${CACHE_NAME}`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName.startsWith(CACHE_NAME_PREFIX) && cacheName !== CACHE_NAME) {
            console.log(`[Service Worker] Mazanie starej cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Staré cache vymazané.');
      return self.clients.claim(); // Prevezme kontrolu nad všetkými otvorenými stránkami
    }).catch(error => {
      console.error('[Service Worker] Chyba počas `activate` udalosti:', error);
    })
  );
});

// --- Fetch Event Handler: Interceptovanie sieťových požiadaviek ---
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Ignoruj požiadavky, ktoré nie sú HTTP/HTTPS (napr. chrome-extension://)
  if (!requestUrl.protocol.startsWith('http')) {
    return;
  }

  // Stratégia: Network Only pre Firebase API volania a Google API
  // Tieto požiadavky by nemali byť kešované Service Workerom kvôli dynamickej povahe a autentifikácii.
  if (
    requestUrl.hostname.includes('firestore.googleapis.com') ||
    requestUrl.hostname.includes('identitytoolkit.googleapis.com') || // Firebase Auth
    requestUrl.hostname.includes('firebaseappcheck.googleapis.com') || // Firebase App Check
    requestUrl.hostname.includes('www.googleapis.com/recaptcha') // reCAPTCHA pre App Check
    // Prípadne ďalšie Firebase backend služby, ak ich používate
  ) {
    // console.log(`[Service Worker] Network Only pre API: ${requestUrl.href}`);
    // Pre POST, PUT, DELETE vždy na sieť (nie je potrebné explicitne, lebo len GET sa kešuje nižšie)
    // Pre GET na tieto API, nechceme ani fallback na cache.
    return; // Nechaj prehliadač spracovať požiadavku normálne (Network Only)
  }

  // Stratégia: Cache First (fallback to Network) pre statické zdroje z CDN a gstatic
  // (Firebase SDK skripty, fonty, externé knižnice)
  if (
    requestUrl.hostname === 'www.gstatic.com' || // Firebase SDK
    requestUrl.hostname === 'fonts.gstatic.com' || // Google Fonts
    requestUrl.hostname === 'cdnjs.cloudflare.com' // Knižnice z CDNJS
  ) {
    if (event.request.method === 'GET') {
      // console.log(`[Service Worker] Cache First pre CDN/gstatic: ${requestUrl.href}`);
      event.respondWith(cacheFirstElseNetwork(event.request, CACHE_NAME));
    }
    return;
  }

  // Stratégia pre zdroje z vlastnej domény (origin)
  if (requestUrl.origin === self.location.origin) {
    if (event.request.method === 'GET') {
      // Pre hlavný HTML súbor (navigácia): Network First (fallback to Cache)
      // Aby používateľ vždy dostal najnovšiu verziu aplikácie, ak je online.
      if (event.request.mode === 'navigate' || requestUrl.pathname.endsWith('.html') || requestUrl.pathname === (new URL('./', self.location.origin)).pathname) {
        // console.log(`[Service Worker] Network First pre navigáciu/HTML: ${requestUrl.href}`);
        event.respondWith(networkFirstElseCache(event.request, CACHE_NAME));
      } else {
        // Pre ostatné lokálne statické assety (CSS, JS, ikony): Cache First (fallback to Network)
        // console.log(`[Service Worker] Cache First pre lokálny asset: ${requestUrl.href}`);
        event.respondWith(cacheFirstElseNetwork(event.request, CACHE_NAME));
      }
    }
    // Pre non-GET požiadavky na vlastnú doménu (ak by nejaké boli, napr. API), nechaj prejsť
    return;
  }

  // Pre všetky ostatné GET požiadavky (ak neboli pokryté vyššie), použijeme Network First
  // Toto je bezpečná predvolená stratégia.
  if (event.request.method === 'GET') {
    // console.log(`[Service Worker] Network First (default) pre: ${requestUrl.href}`);
    event.respondWith(networkFirstElseCache(event.request, CACHE_NAME));
  }
  // Pre non-GET požiadavky na cudzie domény, ktoré neboli explicitne ošetrené, nechaj prejsť
});


// --- Cachovacie Stratégie ---

// Stratégia: Cache first, potom network
// Ideálne pre statické assety, ktoré sa nemenia často (ikony, fonty, knižnice).
async function cacheFirstElseNetwork(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      // console.log(`[Service Worker] Cache Hit (CacheFirst): ${request.url}`);
      return cachedResponse;
    }

    // console.log(`[Service Worker] Cache Miss (CacheFirst), idem na sieť: ${request.url}`);
    const networkResponse = await fetch(request);
    // Ulož do cache iba ak je odpoveď úspešná (status 2xx)
    if (networkResponse && networkResponse.ok) {
      // console.log(`[Service Worker] Ukladám do cache po úspešnom fetch (CacheFirst): ${request.url}`);
      // .clone() je potrebné, lebo Response je stream a môže byť prečítaný len raz.
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error(`[Service Worker] Chyba v cacheFirstElseNetwork pre ${request.url}:`, error);
    // Ak nastane chyba (napr. sieť je nedostupná a nie je v cache),
    // môžeme vrátiť generickú offline stránku, ak ju máme v cache.
    // const offlineFallback = await caches.match('./offline.html');
    // if (offlineFallback) return offlineFallback;
    throw error; // Preposlať chybu ďalej, aby prehliadač zobrazil štandardnú chybu
  }
}

// Stratégia: Network first, potom cache
// Ideálne pre zdroje, kde chceme najaktuálnejšiu verziu, ak je dostupná (napr. hlavný HTML súbor).
async function networkFirstElseCache(request, cacheName) {
  try {
    // console.log(`[Service Worker] Skúšam sieť (NetworkFirst): ${request.url}`);
    const networkResponse = await fetch(request);
    // Ak je odpoveď zo siete úspešná, ulož ju do cache.
    if (networkResponse && networkResponse.ok) {
      // console.log(`[Service Worker] Ukladám do cache po úspešnom fetch (NetworkFirst): ${request.url}`);
      const cache = await caches.open(cacheName);
      await cache.put(request, networkResponse.clone());
    }
    // Vráť odpoveď zo siete (aj keď nebola 'ok', napr. 404, aby sa chyba prejavila v aplikácii)
    return networkResponse;
  } catch (error) {
    // Ak sieť zlyhá (napr. offline), skús nájsť v cache.
    // console.warn(`[Service Worker] Sieť zlyhala (NetworkFirst), skúšam cache: ${request.url}`, error);
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      // console.log(`[Service Worker] Cache Hit po zlyhaní siete (NetworkFirst): ${request.url}`);
      return cachedResponse;
    }
    // Ak nie je ani v sieti, ani v cache, chyba.
    console.error(`[Service Worker] Chyba v networkFirstElseCache a nie je v cache pre ${request.url}:`, error);
    // const offlineFallback = await caches.match('./offline.html');
    // if (offlineFallback) return offlineFallback;
    throw error;
  }
}
