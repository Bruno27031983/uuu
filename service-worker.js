// service-worker.js

// DÔLEŽITÉ: Používame compat knižnice pre jednoduchšiu syntax v SW
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Vaša Firebase konfigurácia (rovnaká ako v index.html)
const firebaseConfig = {
    apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk", // Nahraďte za Váš API kľúč ak je iný
    authDomain: "uuuuu-f7ef9.firebaseapp.com",
    projectId: "uuuuu-f7ef9",
    storageBucket: "uuuuu-f7ef9.firebasestorage.app",
    messagingSenderId: "456105865458",
    appId: "1:456105865458:web:101f0a4dcb455f174b606b",
};

// Inicializácia Firebase v Service Worker
let app;
try {
    app = firebase.initializeApp(firebaseConfig);
    console.log("[service-worker.js] Firebase Initialized.");
} catch (e) {
    console.error("[service-worker.js] Error initializing Firebase in SW:", e);
}


// Získanie inštancie Messaging (len ak inicializácia prebehla)
let messaging;
if (app) {
    try {
        messaging = firebase.messaging();
        console.log("[service-worker.js] Firebase Messaging Initialized.");

        // Listener pre správy na pozadí
        messaging.onBackgroundMessage((payload) => {
            console.log('[service-worker.js] Received background message ', payload);

            // Pokúsime sa extrahovať dáta z payloadu
            const notificationTitle = payload.notification?.title || 'Bruno\'s Calculator';
            const notificationOptions = {
                body: payload.notification?.body || 'Máte novú správu.',
                icon: payload.notification?.icon || './icons/icon-192x192.png', // Upravte cestu k ikone
                badge: './icons/badge-72x72.png', // Upravte cestu k ikone (voliteľné)
                data: { // Dáta pre notificationclick event
                    url: payload.data?.url || '/' // URL na otvorenie po kliknutí
                }
                // Ďalšie možnosti: tag, renotify, actions...
            };

             // Zobrazíme notifikáciu
            self.registration.showNotification(notificationTitle, notificationOptions)
                .then(() => console.log("[service-worker.js] Notification shown."))
                .catch(err => console.error("[service-worker.js] Error showing notification:", err));
        });
    } catch(e) {
        console.error("[service-worker.js] Error initializing Firebase Messaging in SW:", e);
    }

} else {
    console.error("[service-worker.js] Firebase app was not initialized. Messaging cannot be set up.");
}


// Listener pre kliknutie na notifikáciu
self.addEventListener('notificationclick', (event) => {
    console.log('[service-worker.js] Notification click Received.', event.notification);

    event.notification.close(); // Zatvorí notifikáciu

    const urlToOpen = event.notification.data?.url || '/'; // Získa URL z dát notifikácie

    // Otvorí okno/kartu alebo fokusuje existujúce
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Skontroluje, či už existuje okno s rovnakou URL (pathname)
            const targetUrl = new URL(urlToOpen, self.location.origin); // Vytvorí plnú URL
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                 const clientUrl = new URL(client.url);
                 // Porovnáme len cestu, nie query parametre alebo hash
                if (clientUrl.pathname === targetUrl.pathname && 'focus' in client) {
                    console.log("[service-worker.js] Focusing existing window:", client.url);
                    return client.focus();
                }
            }
            // Ak okno neexistuje, otvorí nové
            if (clients.openWindow) {
                 console.log("[service-worker.js] Opening new window:", targetUrl.href);
                return clients.openWindow(targetUrl.href);
            }
        }).catch(err => console.error("[service-worker.js] Error handling notification click:", err))
    );
});

// === Základné PWA Listenery (ponechajte alebo pridajte, ak ich nemáte) ===
// Mali by ste mať aspoň základnú offline stratégiu

// Príklad: Cache-first stratégia (upravte podľa vašich potrieb)
const CACHE_NAME = 'bruno-cache-v1';
const urlsToCache = [
  '/',
  './index.html', // Alebo len '/' ak index.html je koreňový
  './manifest.json',
  './icons/icon-192x192.png', // Pridajte všetky vaše ikony a dôležité assety
  './icons/icon-512x512.png',
  // Pridajte cesty k JS/CSS, ak nie sú inline
  // Pozor na externé knižnice (CDN) - tie sa cachujú ťažšie spoľahlivo
];

self.addEventListener('install', (event) => {
  console.log('[service-worker.js] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[service-worker.js] Opened cache, caching files...');
        return cache.addAll(urlsToCache).catch(err => {
            console.error("[service-worker.js] Failed to cache initial files:", err);
            // Chyba pri cachovaní môže byť spôsobená nedostupnosťou niektorého súboru
        });
      })
      .then(() => self.skipWaiting()) // Aktivuje nový SW hneď po inštalácii
  );
});

self.addEventListener('activate', (event) => {
  console.log('[service-worker.js] Activating...');
  // Odstránenie starých cache
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    }).then(() => clients.claim()) // Prevezme kontrolu nad otvorenými stránkami
  );
});

self.addEventListener('fetch', (event) => {
   // Ignorujeme non-GET requesty a requesty na Firebase/iné externé služby pre jednoduchosť
   if (event.request.method !== 'GET' ||
       event.request.url.includes('firestore.googleapis.com') ||
       event.request.url.includes('firebaseappcheck.googleapis.com') ||
       event.request.url.includes('google.com/recaptcha') ||
       event.request.url.includes('googleapis.com/identitytoolkit') ) {
     // console.log('[service-worker.js] Skipping fetch (non-GET or external API):', event.request.url);
     event.respondWith(fetch(event.request));
     return;
   }

  // Cache-first stratégia
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          // console.log('[service-worker.js] Serving from cache:', event.request.url);
          return response; // Nájdené v cache
        }
        // console.log('[service-worker.js] Fetching from network:', event.request.url);
        // Nie je v cache, skúsime sieť a uložíme do cache
        return fetch(event.request).then(
          (networkResponse) => {
            // Skontrolujeme, či je odpoveď platná
            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            // Klonujeme odpoveď, lebo ju potrebujeme použiť dvakrát (pre cache aj pre browser)
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
                // console.log('[service-worker.js] Cached new resource:', event.request.url);
              });
            return networkResponse;
          }
        ).catch(error => {
             console.error('[service-worker.js] Fetch failed; returning offline page instead.', error);
             // Voliteľné: Vrátiť offline stránku alebo inú fallback odpoveď
             // return caches.match('./offline.html');
        });
      })
  );
});
