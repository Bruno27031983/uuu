// service-worker.js

// Import Firebase SDK (používame compat verziu pre jednoduchší import cez importScripts)
// Uistite sa, že tieto verzie zodpovedajú tým, ktoré používate v hlavnej aplikácii, ak je to relevantné.
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js');
// Ak by ste potrebovali Auth v SW (napr. pre overenie tokenu, aj keď tu to primárne nepotrebujeme, lebo UID berieme z DB):
// importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js');

const CACHE_NAME = 'bruno-calculator-cache-v10'; // <-- ZVÝŠTE TÚTO VERZIU PRI ZMENÁCH!
const OFFLINE_FALLBACK_PAGE = './offline.html';

// Názvy pre IndexedDB musia byť rovnaké ako v hlavnom skripte
const DB_NAME_SW = 'bruno-calculator-db';
const DB_VERSION_SW = 1; // Verzia DB by mala byť konzistentná
const PENDING_SYNC_STORE_NAME_SW = 'pendingSync';
const USER_STORE_NAME_SW = 'userProfile';

const urlsToCache = [
  './', // Alias pre index.html
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  OFFLINE_FALLBACK_PAGE,
  // Knižnice tretích strán
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.15/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Roboto&display=swap&subset=latin-ext',
  // CSS pre fonty (načítavané cez link vyššie)
  // Ak by ste mali lokálne font súbory, pridajte ich sem
];

// Firebase konfigurácia (musí byť aj tu, rovnaká ako v index.html)
const firebaseConfig = {
    apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk",
    authDomain: "uuuuu-f7ef9.firebaseapp.com",
    projectId: "uuuuu-f7ef9",
    storageBucket: "uuuuu-f7ef9.appspot.com",
    messagingSenderId: "456105865458",
    appId: "1:456105865458:web:101f0a4dcb455f174b606b",
};

// Inicializácia Firebase v Service Workeri
let dbSw; // Firestore inštancia pre SW
try {
    // Inicializujeme Firebase app len raz, ak ešte nebola
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("SW: Firebase App inicializovaná.");
    } else {
        firebase.app(); // Získame default app, ak už existuje
        console.log("SW: Firebase App už bola inicializovaná.");
    }
    dbSw = firebase.firestore();
    console.log("SW: Firebase Firestore (dbSw) inicializovaný.");
} catch (e) {
    console.error("SW: Chyba inicializácie Firebase:", e);
}

// --- Pomocné funkcie pre IndexedDB v Service Workeri ---
let swDbPromise;
function openSwDB() {
    if (swDbPromise) return swDbPromise;
    swDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME_SW, DB_VERSION_SW);
        request.onerror = event => { console.error("SW DB Error:", event.target.error); reject(event.target.error);};
        request.onsuccess = event => { /* console.log("SW DB Opened"); */ resolve(event.target.result); };
        // onupgradeneeded by sa mal spustiť z hlavného vlákna pri prvej inicializácii DB
        request.onupgradeneeded = event => {
            console.log('SW: Upgrade IndexedDB (mal by byť zriedkavý z SW)...');
            const db = event.target.result;
            if (!db.objectStoreNames.contains(PENDING_SYNC_STORE_NAME_SW)) {
                db.createObjectStore(PENDING_SYNC_STORE_NAME_SW, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(USER_STORE_NAME_SW)) {
                db.createObjectStore(USER_STORE_NAME_SW, { keyPath: 'id' });
            }
        };
    });
    return swDbPromise;
}

async function swDbGet(storeName, key) {
    const db = await openSwDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : undefined); // Vraciame .value z objektu
        request.onerror = event => { console.error(`SW DB Get Error (${storeName}, ${key}):`, event.target.error); reject(event.target.error);};
    });
}

async function swDbDelete(storeName, key) {
    const db = await openSwDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = event => { console.error(`SW DB Delete Error (${storeName}, ${key}):`, event.target.error); reject(event.target.error);};
    });
}
// --- Koniec IndexedDB Pomocných Funkcií v SW ---


self.addEventListener('install', event => {
  console.log('SW: Install event');
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
  console.log('SW: Activate event');
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

async function syncPendingDataWithFirebase(tag) {
    console.log(`SW: Spúšťam Firebase synchronizáciu pre tag: ${tag}`);
    if (!dbSw) {
        console.error("SW: Firestore (dbSw) nie je inicializovaný. Synchronizácia nemôže prebehnúť.");
        throw new Error("Firestore nie je inicializovaný v SW.");
    }

    try {
        const userDataFromDB = await swDbGet(USER_STORE_NAME_SW, 'currentUser');
        if (!userDataFromDB || !userDataFromDB.uid) {
            console.warn("SW: UID používateľa nenájdený v IndexedDB. Synchronizácia bude pravdepodobne vyžadovať opätovné prihlásenie používateľa v aplikácii.");
            // Ak nemáme UID, nemôžeme bezpečne synchronizovať dáta konkrétneho používateľa.
            // Úloha zostane a skúsi sa neskôr, keď sa možno UID objaví.
            throw new Error("UID používateľa nenájdený pre synchronizáciu.");
        }
        const userId = userDataFromDB.uid;
        console.log("SW: Používateľ UID pre synchronizáciu:", userId);

        const dataToSync = await swDbGet(PENDING_SYNC_STORE_NAME_SW, tag);
        
        if (dataToSync) {
            console.log("SW: Nájdené dáta v IndexedDB na synchronizáciu pre tag", tag);
            
            const tagParts = tag.split('-'); // napr. ["pendingSync", "2025", "4"] (indexy 0, 1, 2)
            const year = tagParts[1];
            const month = tagParts[2]; // Mesiac je 0-11, takže ak ukladáte 0-11, je to OK
            const firestoreDocPath = `${year}-${month}`;

            // Používame compat API pre Firestore
            const docRef = dbSw.collection('users').doc(userId).collection('workDays').doc(firestoreDocPath);
            await docRef.set(dataToSync, { merge: true }); // dataToSync by mali byť priamo objekt ukladaný do Firestore
            
            await swDbDelete(PENDING_SYNC_STORE_NAME_SW, tag); // Vymažeme až po úspešnom uložení
            console.log(`SW: Dáta pre tag ${tag} úspešne synchronizované s Firebase a odstránené z IndexedDB.`);
            
            // Informujeme otvorené klienty (stránky)
            const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
            clients.forEach(client => {
                client.postMessage({ type: 'SYNC_COMPLETED', tag: tag, status: 'success' });
            });

        } else {
            console.log(`SW: Žiadne dáta na synchronizáciu v IndexedDB pre tag ${tag}. Mohli byť už synchronizované.`);
        }
    } catch (error) {
        console.error(`SW: Chyba pri Firebase synchronizácii pre tag ${tag}:`, error);
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
            clients.forEach(client => {
                client.postMessage({ type: 'SYNC_COMPLETED', tag: tag, status: 'error', message: error.message });
            });
        throw error; // Necháme chybu, aby sa SyncManager pokúsil znova
    }
}

self.addEventListener('sync', event => {
  console.log(`SW: Zachytená udalosť sync, tag: ${event.tag}`);
  if (event.tag.startsWith('pendingSync-')) { // Náš prefix pre synchronizačné úlohy
    event.waitUntil(syncPendingDataWithFirebase(event.tag));
  }
});


self.addEventListener('fetch', event => {
  // Stratégia Network first, fallback to Cache, potom Offline pre navigačné požiadavky
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          return cachedResponse || caches.match(OFFLINE_FALLBACK_PAGE);
        })
    );
    return;
  }

  // Stratégia Cache first, fallback to Network pre ostatné zdroje
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 && 
              event.request.method === 'GET' &&
              !event.request.url.includes('firestore.googleapis.com') &&
              !event.request.url.includes('firebaseappcheck.googleapis.com') &&
              !event.request.url.includes('google.com/recaptcha') // Pre recaptchu
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
