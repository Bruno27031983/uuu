// service-worker.js

const CACHE_NAME = 'bruno-calculator-pro-v1.5'; // <-- ZVÝŠTE VERZIU!
const ASSETS_TO_CACHE = [
  './', // Alias pre index.html
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  'https://fonts.gstatic.com/s/inter/v12/UcC73FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7W0Q5nw.woff2'
];

const CDN_ORIGINS = [
  'https://cdnjs.cloudflare.com',
  'https://www.gstatic.com',
  'https://fonts.gstatic.com'
];

self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install event - v:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Precaching App Shell and critical assets');
        const promises = ASSETS_TO_CACHE.map(assetUrl => {
          return cache.add(assetUrl).catch(err => {
            console.warn(`[ServiceWorker] Failed to cache ${assetUrl} during install:`, err);
          });
        });
        return Promise.all(promises);
      })
      .then(() => {
        console.log('[ServiceWorker] All assets precached, activating new SW immediately.');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[ServiceWorker] Precaching failed:', error);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate event - v:', CACHE_NAME);
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
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.protocol === 'chrome-extension:') {
    return;
  }

  if (requestUrl.hostname.includes('firebaseapp.com') ||
      requestUrl.hostname.includes('firebaseio.com') ||
      requestUrl.hostname.includes('googleapis.com')
     ) {
    return; // Nechaj Firebase SDK spravovať svoje požiadavky
  }

  if (ASSETS_TO_CACHE.some(asset => requestUrl.pathname.endsWith(asset.substring(1))) ||
      CDN_ORIGINS.some(origin => requestUrl.origin === origin)) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          }).catch(error => {
            console.error('[ServiceWorker] Network fetch failed for asset:', event.request.url, error);
          });
        })
    );
  } else if (event.request.mode === 'navigate' ||
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
          });
          return cachedResponse || fetchPromise;
        });
      })
    );
  }
});

// Počúvanie na 'message' event od klientov pre pokročilé interakcie
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] Received SKIP_WAITING message, skipping wait.');
    self.skipWaiting();
  }
});

// NOVÁ ČASŤ: Počúvanie na online event a posielanie správy klientom
self.addEventListener('online', () => {
  console.log('[ServiceWorker] Detected online status.');
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
    if (clients && clients.length) {
      clients.forEach((client) => {
        client.postMessage({ type: 'NETWORK_STATUS_ONLINE' });
      });
      console.log('[ServiceWorker] Sent NETWORK_STATUS_ONLINE message to clients.');
    } else {
      console.log('[ServiceWorker] No clients to send NETWORK_STATUS_ONLINE message to.');
    }
  });
});

self.addEventListener('offline', () => {
  console.log('[ServiceWorker] Detected offline status.');
});
