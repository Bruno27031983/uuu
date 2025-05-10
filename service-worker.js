// service-worker.js

const CACHE_NAME = 'bruno-calculator-cache-v3'; // Zvýšte verziu pri každej zmene v urlsToCache
const urlsToCache = [
  // Základné súbory aplikácie
  './', // Koreňový adresár (index.html)
  './index.html',
  './manifest.json',
  './favicon.ico', // Za predpokladu, že existuje v koreni

  // Ikony
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',

  // Knižnice z CDN
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.15/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Roboto&display=swap&subset=latin-ext', // Hlavný font aplikácie
  // Font pre PDF (ak sa používa cez addFont s touto CDN cestou)
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf',

  // Firebase SDK (môžu byť cachované, ale Firebase má aj vlastný offline mechanizmus)
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-check.js',
];

// Inštalácia Service Workera
self.addEventListener('install', event => {
  console.log('SW: Install event - ' + CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Caching app shell');
        return cache.addAll(urlsToCache).catch(error => {
            console.error('SW: Failed to cache one or more resources during install:', error);
            // Nevoláme self.skipWaiting() ak nastala chyba pri cachovaní
            // Aby sme dali šancu starej verzii SW fungovať, kým sa problém nevyrieši
        });
      })
      .then(() => {
        console.log('SW: All resources cached. Skipping waiting.');
        return self.skipWaiting(); // Aktivuje nový SW hneď po úspešnom cachovaní
      })
      .catch(error => {
          console.error('SW: Installation failed:', error);
      })
  );
});

// Aktivácia Service Workera
self.addEventListener('activate', event => {
  console.log('SW: Activate event - ' + CACHE_NAME);
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
    }).then(() => {
        console.log('SW: Clients claimed.');
        return self.clients.claim(); // Prevezme kontrolu nad otvorenými stránkami
    })
  );
});

// Fetch event (zachytenie sieťových požiadaviek)
self.addEventListener('fetch', event => {
  // Ignorujeme non-GET požiadavky a špecifické Firebase API
  if (event.request.method !== 'GET' ||
      event.request.url.includes('firestore.googleapis.com') ||
      event.request.url.includes('firebaseappcheck.googleapis.com')) {
    return; // Necháme prehliadač spracovať tieto požiadavky normálne
  }

  // Stratégia: Network first, then cache (pre dynamický obsah a CDN knižnice)
  // Pre čisto statické lokálne súbory by bola lepšia "Cache first, then network"
  if (event.request.url.startsWith(self.location.origin) || event.request.url.includes('cdnjs.cloudflare.com') || event.request.url.includes('fonts.googleapis.com') || event.request.url.includes('gstatic.com')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          // Ak úspešne načítané zo siete
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Chyba siete (offline), skúsime vrátiť z cache
          // console.log('SW: Network fetch failed, trying cache for:', event.request.url);
          return caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Ak nie je ani v cache a ani v sieti, pre niektoré typy requestov by sa mohol vrátiť placeholder
            // Napríklad pre obrázky alebo hlavnú stránku. Pre knižnice je lepšie nechať zlyhať.
            if (event.request.destination === 'document' && event.request.url.endsWith('index.html')) {
                 // Mohli by ste mať offline.html stránku
                 // return caches.match('./offline.html');
            }
            return new Response("Network error and resource not in cache.", {
                status: 408,
                headers: { "Content-Type": "text/plain" },
            });
          });
        })
    );
  } else {
    // Pre ostatné (napr. externé API, ktoré nechceme cachovať)
    return;
  }
});
