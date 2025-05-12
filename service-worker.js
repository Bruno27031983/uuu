// service-worker.js

// Názov cache (verzia sa hodí pri aktualizácii)
const CACHE_NAME = 'bruno-calculator-cache-v1';

// Zoznam URL adries na uloženie do cache pri inštalácii
// Dôležité: Cesty musia presne zodpovedať tomu, ako ich prehliadač požaduje.
const URLS_TO_CACHE = [
  './', // Hlavná stránka (index.html) - './' zvyčajne funguje dobre
  './manifest.json', // Manifest súbor

  // Knižnice z CDN (presné URL ako v HTML)
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.15/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js',

  // Firebase SDK knižnice (presné URL ako v HTML)
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-check.js',

  // Prípadne ďalšie statické zdroje ako ikony definované v manifeste, ak existujú
  // napr. './images/icon-192x192.png',
];

// --- Inštalácia Service Workera ---
self.addEventListener('install', event => {
  console.log('[Service Worker] Inštalácia...');
  // Počkáme, kým sa všetky kľúčové súbory uložia do cache
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Ukladám App Shell do cache:', URLS_TO_CACHE);
        // addAll stiahne a uloží všetky URL
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => {
        console.log('[Service Worker] Všetky súbory úspešne uložené do cache.');
        // Aktivujeme SW hneď po úspešnej inštalácii (môže byť presunuté do activate eventu)
        // return self.skipWaiting(); // Môže byť užitočné, ale niekedy spôsobuje problémy pri prvom načítaní
      })
      .catch(error => {
        console.error('[Service Worker] Chyba pri ukladaní do cache počas inštalácie:', error);
      })
  );
});

// --- Aktivácia Service Workera ---
self.addEventListener('activate', event => {
  console.log('[Service Worker] Aktivácia...');
  // Odstránenie starých cache, ak existujú
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Ak názov cache nie je aktuálny, vymažeme ju
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Odstraňujem starú cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[Service Worker] Aktivovaný a staré cache vyčistené.');
      // Po vyčistení necháme SW prevziať kontrolu nad otvorenými klientmi
      return self.clients.claim();
    })
  );
});

// --- Zachytávanie Fetch požiadaviek ---
self.addEventListener('fetch', event => {
  // Odpovedáme na požiadavku buď dátami z cache alebo zo siete
  event.respondWith(
    // 1. Skúsime nájsť požiadavku v cache
    caches.match(event.request)
      .then(cachedResponse => {
        // Ak nájdeme odpoveď v cache, vrátime ju
        if (cachedResponse) {
          // console.log('[Service Worker] Načítavam z cache:', event.request.url);
          return cachedResponse;
        }

        // Ak odpoveď nie je v cache, pokúsime sa ju získať zo siete
        // console.log('[Service Worker] Načítavam zo siete:', event.request.url);
        return fetch(event.request).then(
          networkResponse => {
            // Ak bola sieťová požiadavka úspešná, skúsime ju uložiť do cache pre budúcnosť
            // Ukladáme len platné odpovede (status 200) a typy, ktoré chceme cachovať
            // (vyhneme sa cachovaniu napr. Chrome extension requestov)
            if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
               // Dôležité: Odpoveď musíme klonovať, lebo stream sa dá použiť len raz
               // (raz pre prehliadač, raz pre uloženie do cache)
               const responseToCache = networkResponse.clone();

               caches.open(CACHE_NAME)
                 .then(cache => {
                   // console.log('[Service Worker] Ukladám do cache zo siete:', event.request.url);
                   cache.put(event.request, responseToCache);
                 });
            }
            // Vrátime pôvodnú odpoveď zo siete prehliadaču
            return networkResponse;
          }
        ).catch(error => {
           // Chyba siete a zároveň zdroj nie je v cache
           console.error('[Service Worker] Chyba siete pri fetch a zdroj nie je v cache:', event.request.url, error);
           // Tu by sme mohli vrátiť nejakú offline fallback stránku, ak ju máme
           // return caches.match('/offline.html');
           // Alebo jednoducho necháme požiadavku zlyhať, ako by to bolo bez SW
        });
      })
  );
});
