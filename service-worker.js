// service-worker.js

// Import Firebase SDK (compat verzia pre jednoduchšie použitie v SW)
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js');

console.log("SW: Začínam vykonávať service-worker.js (verzia s IndexedDB sync)");

// Firebase konfigurácia (MUSÍ BYŤ ROVNAKÁ AKO V index.html)
const firebaseConfig = { // NAHRAĎTE TOTO VAŠOU REÁLNOU KONFIGURÁCIOU!
    apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk", // Príklad, použite vlastný
    authDomain: "uuuuu-f7ef9.firebaseapp.com",     // Príklad, použite vlastný
    projectId: "uuuuu-f7ef9",               // Príklad, použite vlastný
    storageBucket: "uuuuu-f7ef9.appspot.com",  // Príklad, použite vlastný
    messagingSenderId: "456105865458",         // Príklad, použite vlastný
    appId: "1:456105865458:web:101f0a4dcb455f174b606b" // Príklad, použite vlastný
};

let firebaseAppInstanceSW;
function getFirebaseAppSW() {
    if (!firebaseAppInstanceSW) {
        console.log("SW: Pokus o inicializáciu Firebase app...");
        try {
            firebaseAppInstanceSW = firebase.initializeApp(firebaseConfig);
            console.log("SW: Firebase aplikácia úspešne inicializovaná v Service Workeri.");
        } catch (e) {
            console.error("SW: KRITICKÁ CHYBA pri inicializácii Firebase v Service Workeri!", e);
            firebaseAppInstanceSW = null; 
        }
    }
    return firebaseAppInstanceSW;
}

// --- IndexedDB Helper Functions pre Service Worker ---
const DB_NAME_SW = 'DochadzkaDB';
const DB_VERSION_SW = 1; 
const PENDING_STORE_NAME_SW = 'pendingSyncs';

function openDBSW() {
    return new Promise((resolve, reject) => {
        // console.log(`[DB/SW] Pokus o otvorenie DB: ${DB_NAME_SW} v${DB_VERSION_SW}`);
        const request = indexedDB.open(DB_NAME_SW, DB_VERSION_SW);
        request.onerror = (event) => {
            console.error("SW: Chyba otvorenia IndexedDB:", event.target.error);
            reject("SW: Chyba otvorenia IndexedDB: " + event.target.error);
        };
        request.onsuccess = (event) => {
            // console.log("[DB/SW] IndexedDB úspešne otvorená.");
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
    console.log("SW: getAllPendingSyncsSW - pokus o otvorenie DB.");
    const db = await openDBSW();
    console.log("SW: getAllPendingSyncsSW - DB otvorená, vytváram transakciu.");
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(PENDING_STORE_NAME_SW, 'readonly');
        const store = transaction.objectStore(PENDING_STORE_NAME_SW);
        const request = store.getAll();
        request.onsuccess = () => {
            console.log(`SW: getAllPendingSyncsSW - načítaných ${request.result ? request.result.length : 0} itemov.`);
            resolve(request.result || []);
        };
        request.onerror = (event) => {
            console.error("SW: Chyba čítania všetkých pending syncs z IDB:", event.target.error);
            reject("SW: Chyba čítania všetkých pending syncs: " + event.target.error);
        };
    });
}

async function deletePendingSyncSW(id) {
    console.log(`SW: deletePendingSyncSW - pokus o vymazanie itemu s ID: ${id}`);
    const db = await openDBSW();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(PENDING_STORE_NAME_SW, 'readwrite');
        const store = transaction.objectStore(PENDING_STORE_NAME_SW);
        const request = store.delete(id);
        request.onsuccess = () => {
            console.log(`SW: deletePendingSyncSW - item s ID: ${id} úspešne vymazaný.`);
            resolve();
        };
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
        console.error("SW: Nepodarilo sa načítať pending items z IndexedDB v performBackgroundSync:", dbError);
        throw dbError; // Nech Background Sync API zopakuje neskôr
    }

    if (!itemsToSync || itemsToSync.length === 0) {
        console.log("SW: Žiadne dáta na synchronizáciu v IndexedDB.");
        return Promise.resolve();
    }

    console.log(`SW: Nájdených ${itemsToSync.length} itemov na synchronizáciu.`);
    const appSWLocal = getFirebaseAppSW(); // Lokálna premenná pre túto funkciu
    if (!appSWLocal) {
        console.error("SW: Firebase app nie je inicializovaná v SW, nemôžem synchronizovať.");
        throw new Error("SW: Firebase app nie je inicializovaná.");
    }
    const dbFs = firebase.firestore(appSWLocal);
    if (!dbFs) {
        console.error("SW: Firestore inštancia (dbFs) nie je dostupná v SW.");
        throw new Error("SW: Firestore inštancia nie je dostupná.");
    }
    console.log("SW: Firestore inštancia je dostupná. Začínam spracovávať itemy.");

    const syncPromises = itemsToSync.map(async (item) => {
        if (!item || !item.userId || item.year === undefined || item.month === undefined || !item.dataToSync) {
            console.warn("SW: Chybný item v IndexedDB, preskakujem:", item);
            if (item && item.id) {
                try { await deletePendingSyncSW(item.id); } catch (e) { console.error("SW: Chyba pri mazaní chybného itemu", e); }
            }
            return Promise.resolve(); // Vrátime vyriešený Promise, aby Promise.allSettled pokračoval
        }
        console.log(`SW: Synchronizujem item s ID ${item.id} pre usera ${item.userId}, ${item.year}-${item.month}`);
        try {
            const docRef = dbFs.collection('users').doc(item.userId).collection('workDays').doc(`${item.year}-${item.month}`);
            console.log(`SW: Pripravený na zápis do Firestore pre item ${item.id}. Cesta: ${docRef.path}`);
            await docRef.set(item.dataToSync, { merge: true });
            console.log(`SW: Item ${item.id} úspešne zosynchronizovaný.`);
            await deletePendingSyncSW(item.id);
            console.log(`SW: Item ${item.id} odstránený z IndexedDB.`);
        } catch (error) {
            console.error(`SW: Chyba pri synchronizácii itemu ${item.id} (user ${item.userId}, ${item.year}-${item.month}):`, error);
            if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
                console.warn(`SW: Permanentná chyba pre item ${item.id}, odstraňujem z fronty.`);
                try { await deletePendingSyncSW(item.id); } catch (eDel) { console.error("SW: Chyba pri mazaní itemu s permanentnou chybou:", eDel); }
                // Nevyhadzujeme chybu ďalej, aby sa sync nepokúšal znova o tento konkrétny item
                // Alebo by sme mali vrátiť vyriešený Promise, aby Promise.allSettled nezaznamenal toto ako chybu, ktorá by mala opakovať celý sync
                return Promise.resolve(); // Označ ako spracované (aj keď chybou)
            } else {
                throw error; 
            }
        }
    });

    return Promise.allSettled(syncPromises).then(results => {
        console.log("SW: Všetky pokusy o synchronizáciu dokončené.");
        let hasRetryableError = false;
        results.forEach(result => {
            if (result.status === 'rejected') {
                console.warn("SW: Jeden alebo viac itemov sa nepodarilo zosynchronizovať:", result.reason);
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

const CACHE_NAME = 'dochadzka-cache-v2.1'; // ZVÝŠTE VERZIU PRI ZMENÁCH!
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './offline.html', // Uistite sa, že tento súbor existuje
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
];

self.addEventListener('install', event => {
  console.log('SW: Install event - verzia', CACHE_NAME);
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
  console.log('SW: Activate event - verzia', CACHE_NAME);
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

  // Ignorovať Firebase, gstatic, cloudflare, googleapis - vždy sieť
  if (requestUrl.hostname.includes('firebase') ||
      requestUrl.hostname.includes('gstatic.com') ||
      requestUrl.hostname.includes('cloudflare.com') ||
      requestUrl.hostname.includes('googleapis.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Pre navigačné požiadavky (HTML stránky) - Network first, potom cache, potom offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Ak úspešné, môžeme zvážiť cachovanie, ak je to precache asset
          if (response && response.status === 200 && PRECACHE_ASSETS.includes(requestUrl.pathname === '/' ? './' : `.${requestUrl.pathname}`)) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
          }
          return response;
        })
        .catch(() => {
          console.log(`SW: Navigácia pre ${event.request.url} zlyhala, skúšam cache.`);
          return caches.match(event.request) // Skús nájsť presnú stránku v cache
            .then(cachedResponse => {
              return cachedResponse || caches.match('./offline.html'); // Ak nie je, vráť offline.html
            });
        })
    );
    return;
  }

  // Pre ostatné assety - Cache first, then network
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        return cachedResponse || fetch(event.request).then(networkResponse => {
          // Tu by sme mohli chcieť cachovať nové assety, ak je to bezpečné (napr. obrázky, css, js z vlastnej domény)
          // if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic' && !PRECACHE_ASSETS.some(asset => requestUrl.pathname.endsWith(asset.substring(1)))) {
          //   const responseToCache = networkResponse.clone();
          //   caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
          // }
          return networkResponse;
        });
      })
  );
});

self.addEventListener('sync', function(event) {
  console.log(`SW: Prijatá sync udalosť s tagom: ${event.tag}`);
  if (event.tag === 'sync-pending-data-idb') {
    console.log('SW: Spracovávam ' + event.tag);
    event.waitUntil(performBackgroundSync());
  } else {
    console.log(`SW: Neznámy alebo nespracovaný sync tag: ${event.tag}`);
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('SW: Prijatá správa SKIP_WAITING od klienta.');
    self.skipWaiting();
  }
});

console.log('SW (v1.9 - s IndexedDB sync): Service Worker načítaný a pripravený.');
