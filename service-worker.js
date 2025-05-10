// service-worker.js (jednoduchá verzia)
const CACHE_NAME = 'bruno-calculator-cache-v11'; // ZVÝŠTE VERZIU!
const OFFLINE_FALLBACK_PAGE = './offline.html';

const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  OFFLINE_FALLBACK_PAGE,
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.15/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Roboto&display=swap&subset=latin-ext',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Cachujem app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('SW: App shell úspešne nacachovaný. Preskakujem čakanie.');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('SW: Chyba pri cachovaní počas inštalácie:', error);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Vymazáva sa stará cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('SW: Staré cache vymazané. Preberám kontrolu.');
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(OFFLINE_FALLBACK_PAGE))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET' &&
              !event.request.url.includes('firestore.googleapis.com') &&
              !event.request.url.includes('firebaseappcheck.googleapis.com') &&
              !event.request.url.includes('google.com/recaptcha')
            ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
          }
          return networkResponse;
        });
      })
  );
});
