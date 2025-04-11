// Import Firebase SDK skriptov (používame compat verziu pre jednoduchší import v SW)
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js");

// Vaša Firebase konfigurácia (MUSÍ byť rovnaká ako v hlavnom HTML)
const firebaseConfig = {
    apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk",
    authDomain: "uuuuu-f7ef9.firebaseapp.com",
    projectId: "uuuuu-f7ef9",
    storageBucket: "uuuuu-f7ef9.firebasestorage.app",
    messagingSenderId: "456105865458",
    appId: "1:456105865458:web:101f0a4dcb455f174b606b",
};

// Inicializácia Firebase app v Service Workeri
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
    console.log("[Service Worker] Firebase app initialized.");
} else {
    firebase.app(); // Získanie existujúcej default app
    console.log("[Service Worker] Firebase app already initialized.");
}


// Získanie Messaging inštancie (len ak je messaging podporovaný)
let messaging;
try {
    if (firebase.messaging.isSupported()) {
        messaging = firebase.messaging();
        console.log("[Service Worker] Firebase Messaging instance obtained.");

        // Handler pre push správy prijaté, keď je aplikácia zatvorená alebo na pozadí
        messaging.onBackgroundMessage((payload) => {
            console.log("[Service Worker] Received background message: ", payload);

            // Extrahujeme dáta pre notifikáciu
            const notificationTitle = payload.notification?.title || 'Nová správa';
            const notificationOptions = {
                body: payload.notification?.body || 'Máte novú správu.',
                icon: payload.notification?.icon || './images/ikona.png', // --> UPRAVTE CESTU k vašej ikone (napr. 192x192 z manifestu)
                data: payload.data // Pridá dáta k notifikácii pre prípadné spracovanie po kliknutí
            };

            // Zobrazíme notifikáciu
            // `self.registration` odkazuje na registráciu tohto service workera
            return self.registration.showNotification(notificationTitle, notificationOptions)
                .then(() => console.log("[Service Worker] Background notification shown."))
                .catch(err => console.error("[Service Worker] Error showing background notification:", err));
        });

    } else {
        console.log("[Service Worker] Firebase Messaging is not supported in this browser environment.");
    }
} catch (err) {
    console.error("[Service Worker] Error initializing Firebase Messaging:", err);
}


// Základné event listenery pre Service Worker lifecycle (môžete rozšíriť pre PWA caching atď.)
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing.');
  // Príklad: Preskočenie čakania, aby sa nový SW aktivoval hneď
  // self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating.');
  // Príklad: Odstránenie starých kešiek
  // event.waitUntil(clients.claim()); // Prevzatie kontroly nad otvorenými stránkami
});

// (Voliteľné) Listener na kliknutie na notifikáciu
self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification click Received.', event.notification);

    // Zatvorí notifikáciu
    event.notification.close();

    // Príklad: Otvorí okno aplikácie alebo sa naň prepne, ak je už otvorené
    // Môžete pridať logiku na základe event.notification.data
    const urlToOpen = new URL('/', self.location.origin).href; // Otvorí koreňovú stránku

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            let matchingClient = null;
            for (let i = 0; i < windowClients.length; i++) {
                const windowClient = windowClients[i];
                if (windowClient.url === urlToOpen) {
                    matchingClient = windowClient;
                    break;
                }
            }

            if (matchingClient) {
                return matchingClient.focus(); // Prepne sa na existujúce okno
            } else {
                return clients.openWindow(urlToOpen); // Otvorí nové okno
            }
        })
    );
});
