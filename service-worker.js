// service-worker.js

// Import Firebase SDK (compat verzia pre jednoduchšie použitie v SW)
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js');

// Firebase konfigurácia (MUSÍ BYŤ ROVNAKÁ AKO V index.html)
const firebaseConfig = { // NAHRAĎTE TOTO VAŠOU REÁLNOU KONFIGURÁCIOU!
    apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk",
    authDomain: "uuuuu-f7ef9.firebaseapp.com",
    projectId: "uuuuu-f7ef9",
    storageBucket: "uuuuu-f7ef9.appspot.com",
    messagingSenderId: "456105865458",
    appId: "1:456105865458:web:101f0a4dcb455f174b606b",
};

let firebaseAppInstanceSW;
function getFirebaseAppSW() {
    if (!firebaseAppInstanceSW) {
        try {
            firebaseAppInstanceSW = firebase.initializeApp(firebaseConfig);
            console.log("SW: Firebase aplikácia úspešne inicializovaná v Service Workeri.");
        } catch (e) {
            console.error("SW: KRITICKÁ CHYBA pri inicializácii Firebase v Service Workeri!", e);
            firebaseAppInstanceSW = null; // Zabezpeč, aby sme sa nepokúšali použiť neúspešnú inštanciu
        }
    }
    return firebaseAppInstanceSW;
}

// --- IndexedDB Helper Functions pre Service Worker ---
const DB_NAME_SW = 'DochadzkaDB';
const DB_VERSION_SW = 1; // Musí byť rovnaká alebo vyššia ako v klientovi
const PENDING_STORE_NAME_SW = 'pendingSyncs';

function openDBSW() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME_SW, DB_VERSION_SW);
        request.onerror = (event) => {
            console.error("SW: Chyba otvorenia IndexedDB:", event.target.error);
            reject("SW: Chyba otvorenia IndexedDB: " + event.target.error);
        };
        request.onsuccess = (event) => {
            // console.log("SW: IndexedDB úspešne otvorená.");
            resolve(event.target.result);
        };
        request.onupgradeneeded = (event) => {
            console.log("SW: onupgradeneeded pre IndexedDB.");
            const db = event.target.result;
            if (!db.objectStoreNames.contains(PENDING_STORE_NAME_SW)) {
                const store = db.createObjectStore(PENDING_STORE_NAME_SW, { keyPath: 'id', autoIncrement: true });
                store.createIndex('userMonthYear', ['userId', 'year', 'month'], { unique: true });
                console.log("SW: Object store 'pendingSyncs' vytvorený s indexom 'userMonthYear'.");
            }
        };
    });
}

async function getAllPendingSyncsSW() {
    const db = await openDBSW();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(PENDING_STORE_NAME_SW, 'readonly');
        const store = transaction.objectStore(PENDING_STORE_NAME_SW);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (event) => {
            console.error("SW: Chyba čítania všetkých pending syncs:", event.target.error);
            reject("SW: Chyba čítania všetkých pending syncs: " + event.target.error);
        };
    });
}

async function deletePendingSyncSW(id) {
    const db = await openDBSW();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(PENDING_STORE_NAME_SW, 'readwrite');
        const store = transaction.objectStore(PENDING_STORE_NAME_SW);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error("SW: Chyba mazania pending sync s ID " + id + ":", event.target.error);
            reject("SW: Chyba mazania pending sync s ID " + id + ": " + event.target.error);
        };
    });
}
// --- Koniec IndexedDB Helper Functions pre SW ---


async function performBackgroundSync() {
    console.log("SW: Spúšťam performBackgroundSync...");
    let itemsToSync = [];
    try {
        itemsToSync = await getAllPendingSyncsSW();
    } catch (dbError) {
        console.error("SW: Nepodarilo sa načítať pending items z IndexedDB:", dbError);
        throw dbError; // Nech Background Sync API zopakuje neskôr
    }

    if (!itemsToSync || itemsToSync.length === 0) {
        console.log("SW: Žiadne dáta na synchronizáciu v IndexedDB.");
        return Promise.resolve();
    }

    console.log(`SW: Nájdených ${itemsToSync.length} itemov na synchronizáciu.`);
    const app = getFirebaseAppSW();
    if (!app) { // Kontrola, či sa Firebase app podarilo inicializovať
        console.error("SW: Firebase app nie je inicializovaná, nemôžem synchronizovať.");
        throw new Error("SW: Firebase app nie je inicializovaná."); // Zlyhanie sync, aby sa zopakoval
    }
    const dbFs = firebase.firestore(app); // Používame compat verziu

    const syncPromises = itemsToSync.map(async (item) => {
        if (!item || !item.userId || item.year === undefined || item.month === undefined || !item.dataToSync) {
            console.warn("SW: Chybný item v IndexedDB, preskakujem:", item);
            if (item && item.id) {
                try { await deletePendingSyncSW(item.id); } catch (e) { console.error("SW: Chyba pri mazaní chybného itemu", e); }
            }
            return; // Vráti vyriešený Promise, aby Promise.allSettled pokračoval
        }
        console.log(`SW: Synchronizujem item s ID ${item.id} pre usera ${item.userId}, ${item.year}-${item.month}`);
        try {
            const docRef = dbFs.collection('users').doc(item.userId).collection('workDays').doc(`${item.year}-${item.month}`);
            await docRef.set(item.dataToSync, { merge: true });
            console.log(`SW: Item ${item.id} úspešne zosynchronizovaný.`);
            await deletePendingSyncSW(item.id);
            console.log(`SW: Item ${item.id} odstránený z IndexedDB.`);
        } catch (error) {
            console.error(`SW: Chyba pri synchronizácii itemu ${item.id} (user ${item.userId}, ${item.year}-${item.month}):`, error);
            if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
                console.warn(`SW: Permanentná chyba pre item ${item.id}, odstraňujem z fronty, aby sa neopakoval.`);
                try { await deletePendingSyncSW(item.id); } catch (eDel) { console.error("SW: Chyba pri mazaní itemu s permanentnou chybou:", eDel); }
                // Nevyhadzujeme chybu ďalej, aby sa sync nepokúšal znova o tento konkrétny item
            } else {
                throw error; // Pre ostatné chyby (napr. sieťové) nech sa Background Sync API postará o opakovanie.
            }
        }
    });

    return Promise.allSettled(syncPromises).then(results => {
        console.log("SW: Všetky pokusy o synchronizáciu dokončené.");
        let hasRetryableError = false;
        results.forEach(result => {
            if (result.status === 'rejected') {
                console.warn("SW: Jeden alebo viac itemov sa nepodarilo zosynchronizovať:", result.reason);
                // Ak chyba nie je permanentná (a item nebol vymazaný), označíme, že by sa malo opakovať
                if (result.reason && result.reason.code !== 'permission-denied' && result.reason.code !== 'unauthenticated') {
                    hasRetryableError = true;
                }
            }
        });
        if (hasRetryableError) {
            console.log("SW: Niektoré synchronizačné úlohy zlyhali a mali by sa zopakovať.");
            throw new Error("SW: Niektoré synchronizačné úlohy zlyhali a mali by sa zopakovať.");
        }
    });
}

const CACHE_NAME = 'dochadzka-cache-v1.8'; // ZVÝŠTE VERZIU PRI ZMENÁCH!
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './offline.html', // Pridajte, ak máte offline fallback stránku
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
];

self.addEventListener('install', event => {
  console.log('SW: Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Caching app shell:', PRECACHE_ASSETS);
        return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, {cache: 'reload'})));
      })
      .then(() => {
        console.log('SW: Precaching dokončený, volám skipWaiting.');
        return self.skipWaiting();
      })
      .catch(error => console.error('SW: Precache failed:', error))
  );
});

self.addEventListener('activate', event => {
  console.log('SW: Activate event');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('SW: Staré cache vymazané, volám clients.claim.');
        return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.protocol === 'chrome-extension:') { return; }

  if (requestUrl.hostname.includes('firebase') ||
      requestUrl.hostname.includes('gstatic.com') ||
      requestUrl.hostname.includes('cloudflare.com') ||
      requestUrl.hostname.includes('googleapis.com')) {
    event.respondWith(fetch(event.request)); // Pre externé zdroje vždy sieť
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('./offline.html')) // Fallback na offline stránku
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        return cachedResponse || fetch(event.request).then(networkResponse => {
          // Voliteľne cachovať dynamicky
          return networkResponse;
        });
      })
  );
});

self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-pending-data-idb') { // Nový tag pre IndexedDB synchronizáciu
    console.log('SW: Background sync (IDB) udalosť spustená.');
    event.waitUntil(performBackgroundSync());
  } else {
    console.log(`SW: Neznámy sync tag: ${event.tag}`);
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('SW: Prijatá správa SKIP_WAITING od klienta.');
    self.skipWaiting();
  }
});
