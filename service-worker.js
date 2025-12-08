// ================== VYLEPŠENÝ SERVICE WORKER ==================
// Version - zmeňte pri každej aktualizácii
const CACHE_VERSION = 'v1.3';
const CACHE_NAME = `bruno-calc-${CACHE_VERSION}`;

// Súbory na okamžité cachovanie pri inštalácii
const PRECACHE_URLS = [
  '/uuu/',
  '/uuu/index.html',
  '/uuu/app.js',
  '/uuu/manifest.json',
  '/uuu/libs/dompurify.min.js',
  '/uuu/libs/jspdf.umd.min.js',
  '/uuu/libs/jspdf-autotable.min.js',
  '/uuu/libs/xlsx.full.min.js',
  '/uuu/icons/icon-192x192.png',
  '/uuu/icons/icon-512x512.png'
];

// Firebase a externe zdroje (necachujeme - vždy fresh)
const EXTERNAL_DOMAINS = [
  'firebaseio.com',
  'googleapis.com',
  'gstatic.com',
  'google.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// ================== INSTALL EVENT ==================
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('✅ Service Worker: Installed successfully');
        // Force activation (preskočí čakanie)
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('❌ Service Worker: Installation failed', error);
      })
  );
});

// ================== ACTIVATE EVENT ==================
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        // Vymaž staré cache verzie
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName.startsWith('bruno-calc-') && cacheName !== CACHE_NAME)
            .map(cacheName => {
              console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Activated successfully');
        // Okamžite prevezmi kontrolu nad všetkými stránkami
        return self.clients.claim();
      })
  );
});

// ================== FETCH EVENT - Stratégie ==================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignoruj non-GET požiadavky (POST, PUT, DELETE)
  if (request.method !== 'GET') {
    return;
  }

  // Ignoruj Chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Ignoruj externe domény (Firebase, Google Fonts, etc.)
  if (EXTERNAL_DOMAINS.some(domain => url.hostname.includes(domain))) {
    // Network-only pre Firebase a externe zdroje
    event.respondWith(fetch(request));
    return;
  }

  // Pre naše súbory: Cache First, fallback na Network
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          console.log('📦 Service Worker: Serving from cache:', url.pathname);
          
          // Stale-While-Revalidate: Vráť cache, ale aktualizuj na pozadí
          fetch(request)
            .then(networkResponse => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, networkResponse.clone());
                  console.log('🔄 Service Worker: Updated cache:', url.pathname);
                });
              }
            })
            .catch(() => {
              // Offline - cache už vrátime vyššie
            });
          
          return cachedResponse;
        }

        // Ak nie je v cache, fetch zo siete a cachni
        console.log('🌐 Service Worker: Fetching from network:', url.pathname);
        return fetch(request)
          .then(networkResponse => {
            // Cachuj len úspešné odpovede
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseToCache);
                console.log('💾 Service Worker: Cached new resource:', url.pathname);
              });
            }
            return networkResponse;
          })
          .catch(error => {
            console.error('❌ Service Worker: Network fetch failed:', url.pathname, error);
            
            // Offline fallback - ukáž základnú stránku
            if (request.destination === 'document') {
              return caches.match('/uuu/index.html');
            }
            
            // Pre obrázky môžete vrátiť placeholder
            if (request.destination === 'image') {
              return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><text x="50%" y="50%" text-anchor="middle" fill="#999">Offline</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            }
            
            throw error;
          });
      })
  );
});

// ================== MESSAGE EVENT - Komunikácia s app.js ==================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('⏩ Service Worker: Forcing update...');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('🗑️ Service Worker: Clearing cache...');
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      }).then(() => {
        console.log('✅ Service Worker: Cache cleared');
        event.ports[0].postMessage({ success: true });
      })
    );
  }
  
  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        return cache.keys().then(keys => {
          event.ports[0].postMessage({ 
            cacheSize: keys.length,
            cacheName: CACHE_NAME
          });
        });
      })
    );
  }
});

// ================== SYNC EVENT - Background Sync ==================
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log('🔄 Service Worker: Background sync triggered');
    event.waitUntil(
      // Tu môžete pridať logiku na synchronizáciu dát s Firebase
      Promise.resolve()
    );
  }
});

// ================== PUSH EVENT - Pre budúce notifikácie ==================
self.addEventListener('push', event => {
  console.log('🔔 Service Worker: Push notification received');
  
  const options = {
    body: event.data ? event.data.text() : 'Nová notifikácia',
    icon: '/uuu/icons/icon-192x192.png',
    badge: '/uuu/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      { action: 'explore', title: 'Otvoriť aplikáciu' },
      { action: 'close', title: 'Zavrieť' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Bruno\'s Calculator', options)
  );
});

// ================== NOTIFICATION CLICK EVENT ==================
self.addEventListener('notificationclick', event => {
  console.log('🔔 Service Worker: Notification clicked');
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/uuu/')
    );
  }
});

console.log('🚀 Service Worker: Script loaded');
