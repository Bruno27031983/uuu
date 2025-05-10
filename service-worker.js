// service-worker.js

// Import Firebase SDK (použijeme compat verzie pre jednoduchší importScripts)
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js');

// POZOR: Tieto hodnoty musia byť rovnaké ako v hlavnej aplikácii
// A MUSÍTE ich nahradiť vašimi skutočnými Firebase konfiguračnými hodnotami
const firebaseConfig = {
    apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk", // VAŠA apiKey
    authDomain: "uuuuu-f7ef9.firebaseapp.com", // VAŠA authDomain
    projectId: "uuuuu-f7ef9", // VAŠA projectId
    storageBucket: "uuuuu-f7ef9.appspot.com", // VAŠA storageBucket
    messagingSenderId: "456105865458", // VAŠA messagingSenderId
    appId: "1:456105865458:web:101f0a4dcb455f174b606b", // VAŠA appId
};

// Inicializácia Firebase, ak ešte nebola inicializovaná
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

const CACHE_NAME = 'bruno-calc-cache-v1';
const urlsToCache = [
  './',
  './index.html', // Alebo aký je váš hlavný HTML súbor
  './manifest.json',
  './icons/icon-192x192.png',
  // Pridajte ďalšie dôležité statické assety, ak ich máte lokálne
  // Externé knižnice (CDN) sa zvyčajne cachujú prehliadačom, ale pre plnú offline funkčnosť by sa mali zvážiť
];

self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Aktivuje SW hneď po inštalácii
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Prevezme kontrolu nad otvorenými stránkami hneď
  );
});

self.addEventListener('fetch', event => {
  // Pre API requesty (napr. Firebase) vždy chceme ísť na sieť
  if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('firebaseapp.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Pre ostatné requesty (napr. assety aplikácie) skúsime Cache, potom Network
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request).then(fetchResponse => {
          // Ak chceme dynamicky cachovať nové assety
          /*
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
          */
          return fetchResponse;
        });
      })
  );
});

self.addEventListener('sync', event => {
  console.log('Service Worker: Sync event received', event.tag);
  if (event.tag === 'sync-work-data') {
    event.waitUntil(syncPendingDataWithFirebase());
  }
});

async function syncPendingDataWithFirebase() {
  console.log('Service Worker: Attempting to sync pending data...');
  try {
    const idb = await openPendingSyncDB();
    const tx = idb.transaction(IDB_STORE_NAME, 'readonly');
    const store = tx.objectStore(IDB_STORE_NAME);
    const pendingItems = await store.getAll(); // Získame objekty {key: '...', data: {...}}
    await tx.done;


    if (!pendingItems || pendingItems.length === 0) {
      console.log('Service Worker: No pending data found in IndexedDB to sync.');
      return;
    }

    console.log('Service Worker: Found pending items:', pendingItems.length);
    let allSyncsSuccessful = true;

    for (const item of pendingItems) {
      // Kľúč je uložený v item.key, dáta v item.data.data (ak sme ukladali objekt {key, data})
      // Alebo ak ukladáme priamo dáta pod kľúčom, tak item je priamo objekt s dátami, a kľúč získame inak.
      // Podľa našej `saveToPendingSyncIDB` ukladáme `dataToSync` pod kľúčom `idbKey`.
      // `store.getAll()` vráti pole hodnôt. Kľúče musíme získať cez `store.getAllKeys()`.

      const keysTx = idb.transaction(IDB_STORE_NAME, 'readonly');
      const keysStore = keysTx.objectStore(IDB_STORE_NAME);
      const allKeys = await keysStore.getAllKeys();
      await keysTx.done;

      for (const idbKey of allKeys) {
        const dataTx = idb.transaction(IDB_STORE_NAME, 'readonly');
        const dataStore = dataTx.objectStore(IDB_STORE_NAME);
        const recordToSync = await dataStore.get(idbKey); // recordToSync je { data: {...}, timestamp: ... }
        await dataTx.done;

        if (!recordToSync || !recordToSync.data) {
          console.warn(`Service Worker: No data found for key ${idbKey} in IndexedDB or data is malformed.`);
          // Ak je záznam poškodený, môžeme ho odstrániť
          const deleteTx = idb.transaction(IDB_STORE_NAME, 'readwrite');
          await deleteTx.objectStore(IDB_STORE_NAME).delete(idbKey);
          await deleteTx.done;
          continue;
        }
        
        const dataToSync = recordToSync.data;
        // Kľúč je formátu `pendingSync-${userId}-${year}-${month}`
        const parts = idbKey.toString().split('-');
        if (parts.length < 4 || parts[0] !== 'pendingSync') {
            console.warn(`Service Worker: Invalid key format ${idbKey}`);
            continue;
        }

        const userId = parts[1];
        const year = parts[2];
        const month = parts[3];
        
        console.log(`Service Worker: Syncing data for UID: ${userId}, Year: ${year}, Month: ${month}`);
        const docRefPath = `users/${userId}/workDays/${year}-${month}`;

        try {
          await db.doc(docRefPath).set(dataToSync, { merge: true });
          console.log(`Service Worker: Data for ${year}-${month} (UID: ${userId}) synced successfully.`);

          const deleteSuccessfulTx = idb.transaction(IDB_STORE_NAME, 'readwrite');
          await deleteSuccessfulTx.objectStore(IDB_STORE_NAME).delete(idbKey);
          await deleteSuccessfulTx.done;
          console.log(`Service Worker: Removed synced key ${idbKey} from IndexedDB.`);
          notifyClientsAboutSyncSuccess(idbKey);
        } catch (error) {
          console.error(`Service Worker: Error syncing data for ${year}-${month} (UID: ${userId}):`, error);
          allSyncsSuccessful = false;
          // Nevyhadzujeme chybu tu, aby sa SyncManager pokúsil znova pre ostatné dáta / pri ďalšom pokuse
        }
      }
    }

    if (!allSyncsSuccessful) {
      throw new Error('Service Worker: One or more sync operations failed. Will retry later.');
    } else {
      console.log('Service Worker: All pending data processed.');
    }

  } catch (error) {
    console.error('Service Worker: Error in syncPendingDataWithFirebase:', error);
    throw error; // Dôležité pre opätovné spustenie sync eventu
  }
}

// --- IndexedDB pre pending synchronizácie (v Service Workeri) ---
const IDB_DB_NAME = 'BrunoCalcPendingSyncDB';
const IDB_DB_VERSION = 1;
const IDB_STORE_NAME = 'pendingSyncStore';

function openPendingSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    request.onerror = (event) => reject("Error opening IndexedDB: " + (event.target.error ? event.target.error.name : "Unknown error"));
    request.onsuccess = (event) => resolve(event.target.result);
    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains(IDB_STORE_NAME)) {
        dbInstance.createObjectStore(IDB_STORE_NAME);
      }
    };
  });
}

async function notifyClientsAboutSyncSuccess(syncedKey) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => {
    client.postMessage({
      type: 'SYNC_SUCCESS',
      payload: { key: syncedKey }
    });
  });
}
