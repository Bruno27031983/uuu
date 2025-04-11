// Import Firebase SDK skriptov
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js");

// --- CACHING ---
const CACHE_NAME = 'bruno-calc-cache-v1'; // Zmeňte verziu pri aktualizácii súborov
const urlsToCache = [
  './', // Hlavná stránka (index.html)
  './index.html', // Explicitne pre istotu
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
  // Pridajte sem ďalšie dôležité statické súbory (CSS, JS, fonty), ak nejaké máte externe
];

// Install event - Uloženie základných súborov do cache
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing.');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('[Service Worker] Failed to cache app shell:', error);
      })
      .then(() => {
          console.log('[Service Worker] Installation complete, skipping waiting.');
          return self.skipWaiting(); // Aktivuje nový SW okamžite
      })
  );
});

// Activate event - Odstránenie starých cache a prevzatie kontroly
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('[Service Worker] Claiming clients.');
        return self.clients.claim(); // Prevezme kontrolu nad otvorenými stránkami
    })
  );
});

// Fetch event - Odchytenie sieťových požiadaviek (Cache first)
self.addEventListener('fetch', (event) => {
    // Ignorujeme požiadavky, ktoré nie sú GET (napr. POST do Firestore/FCM)
    // a požiadavky na Chrome extension
    if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
        return;
    }

    // Stratégia: Cache first, falling back to network
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    // Nájdené v cache, vrátime z cache
                    // console.log('[Service Worker] Serving from cache:', event.request.url);
                    return response;
                }
                // Nenájdené v cache, skúsime sieť
                // console.log('[Service Worker] Fetching from network:', event.request.url);
                return fetch(event.request).then(
                    (networkResponse) => {
                        // Voliteľné: Ak chcete ukladať nové veci do cache dynamicky
                        // if (networkResponse && networkResponse.status === 200) {
                        //     const responseToCache = networkResponse.clone();
                        //     caches.open(CACHE_NAME).then((cache) => {
                        //         cache.put(event.request, responseToCache);
                        //     });
                        // }
                        return networkResponse;
                    }
                ).catch(error => {
                    console.warn('[Service Worker] Fetch failed; returning offline page or error for:', event.request.url, error);
                    // Tu by ste mohli vrátiť nejakú defaultnú offline stránku, ak by fetch zlyhal
                    // return caches.match('./offline.html'); // Príklad
                });
            })
    );
});
// --- KONIEC CACHING ---


// --- FIREBASE MESSAGING (bez zmien) ---
const firebaseConfig = {
    apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk",
    authDomain: "uuuuu-f7ef9.firebaseapp.com",
    projectId: "uuuuu-f7ef9",
    storageBucket: "uuuuu-f7ef9.firebasestorage.app",
    messagingSenderId: "456105865458",
    appId: "1:456105865458:web:101f0a4dcb455f174b606b",
};
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); console.log("[Service Worker] Firebase app initialized."); }
else { firebase.app(); console.log("[Service Worker] Firebase app already initialized."); }
let messaging;
try {
    if (firebase.messaging.isSupported()) {
        messaging = firebase.messaging();
        console.log("[Service Worker] Firebase Messaging instance obtained.");
        messaging.onBackgroundMessage((payload) => {
            console.log("[Service Worker] Received background message: ", payload);
            const notificationTitle = payload.notification?.title || 'Nová správa';
            const notificationOptions = {
                body: payload.notification?.body || 'Máte novú správu.',
                icon: payload.notification?.icon || './icons/icon-192x192.png',
                data: payload.data
            };
            return self.registration.showNotification(notificationTitle, notificationOptions)
                .then(() => console.log("[Service Worker] Background notification shown."))
                .catch(err => console.error("[Service Worker] Error showing background notification:", err));
        });
    } else { console.log("[Service Worker] Firebase Messaging is not supported."); }
} catch (err) { console.error("[Service Worker] Error initializing Firebase Messaging:", err); }
self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification click Received.', event.notification);
    event.notification.close();
    const urlToOpen = new URL('./index.html', self.location.origin).href;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const windowClient = windowClients[i];
                if (windowClient.url.split(/[?#]/)[0] === urlToOpen.split(/[?#]/)[0]) {
                    return windowClient.focus();
                }
            }
            return clients.openWindow(urlToOpen);
        })
    );
});
// --- KONIEC FIREBASE MESSAGING ---
