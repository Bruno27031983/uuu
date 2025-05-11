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
        firebaseAppInstanceSW = firebase.initializeApp(firebaseConfig);
        console.log("SW: Firebase aplikácia inicializovaná v Service Workeri.");
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
        request.onerror = (event) => reject("SW: Chyba otvorenia IndexedDB: " + event.target.error);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onupgradeneeded = (event) => { // Toto by sa malo volať len raz pri prvej inicializácii/zmene verzie
            console.log("SW: onupgradeneeded pre IndexedDB.");
            const db = event.target.result;
            if (!db.objectStoreNames.contains(PENDING_STORE_NAME_SW)) {
                const store = db.createObjectStore(PENDING_STORE_NAME_SW, { keyPath: 'id', autoIncrement: true });
                store.createIndex('userMonthYear', ['userId', 'year', 'month'], { unique: true });
                console.log("SW: Object store 'pendingSyncs' vytvorený.");
            }
        };
    });
}

async function getAllPendingSyncsSW() {
    const db = await openDBSW();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(PENDING_STORE_NAME_SW, 'readonly');
        const store = transaction.objectStore(PENDING_STORE_NAME_SW);
        const request = store.getAll(); // Získa všetky objekty
        request.onsuccess = () => resolve(request.result || []); // Vráti pole, aj keď je prázdne
        request.onerror = (event) => reject("SW: Chyba čítania všetkých pending syncs: " + event.target.error);
    });
}

async function deletePendingSyncSW(id) {
    const db = await openDBSW();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(PENDING_STORE_NAME_SW, 'readwrite');
        const store = transaction.objectStore(PENDING_STORE_NAME_SW);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject("SW: Chyba mazania pending sync s ID " + id + ": " + event.target.error);
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
        return Promise.resolve(); // Musíme vrátiť Promise
    }

    console.log(`SW: Nájdených ${itemsToSync.length} itemov na synchronizáciu.`);
    const app = getFirebaseAppSW(); // Uisti sa, že Firebase app je inicializovaná
    const dbFs = firebase.firestore(app);

    const syncPromises = itemsToSync.map(async (item) => {
        if (!item || !item.userId || item.year === undefined || item.month === undefined || !item.dataToSync) {
            console.warn("SW: Chybný item v IndexedDB, preskakujem:", item);
            // Zvážiť vymazanie chybného itemu, aby nespôsoboval problémy opakovane
            if (item && item.id) {
                try { await deletePendingSyncSW(item.id); } catch (e) { console.error("SW: Chyba pri mazaní chybného itemu", e); }
            }
            return; // Preskoč tento item
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
            // Ak je chyba autentifikácie alebo oprávnení, nemá zmysel opakovať s rovnakými dátami
            if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
                console.warn(`SW: Permanentná chyba pre item ${item.id}, odstraňujem z fronty, aby sa neopakoval.`);
                try { await deletePendingSyncSW(item.id); } catch (eDel) { console.error("SW: Chyba pri mazaní itemu s permanentnou chybou:", eDel); }
                // Tu by bolo ideálne poslať notifikáciu používateľovi, že sync zlyhal kvôli auth.
                // To je však zložitejšie (vyžaduje Push API a povolenia).
            }
            // Pre ostatné chyby (napr. sieťové) sa Background Sync API postará o opakovanie.
            // Neodstraňujeme item z DB, aby sa mohol znova spracovať.
            throw error; // Dôležité: Hodiť chybu, aby Background Sync vedel, že operácia zlyhala a má ju zopakovať.
        }
    });

    return Promise.allSettled(syncPromises).then(results => {
        console.log("SW: Všetky pokusy o synchronizáciu dokončené.");
        results.forEach(result => {
            if (result.status === 'rejected') {
                console.warn("SW: Jeden alebo viac itemov sa nepodarilo zosynchronizovať (alebo už boli spracované):", result.reason);
            }
        });
        // Ak aspoň jeden zlyhal chybou, ktorá by sa mala opakovať, celkový waitUntil by mal zlyhať.
        // Ak všetky prešli alebo zlyhali permanentne (a boli odstránené), potom OK.
        if (results.some(r => r.status === 'rejected' && r.reason && r.reason.code !== 'permission-denied' && r.reason.code !== 'unauthenticated')) {
            throw new Error("SW: Niektoré synchronizačné úlohy zlyhali a mali by sa zopakovať.");
        }
    });
}

const CACHE_NAME = 'dochadzka-cache-v1.6'; // Zvýšte verziu pri zmene assetov
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
];

self.addEventListener('install', event => {
  console.log('SW: Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Caching app shell');
        return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, {cache: 'reload'})));
      })
      .then(() => self.skipWaiting())
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
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.protocol === 'chrome-extension:') { return; } // Ignoruj requesty rozšírení

  if (requestUrl.hostname.includes('firebase') ||
      requestUrl.hostname.includes('gstatic.com') ||
      requestUrl.hostname.includes('cloudflare.com') ||
      requestUrl.hostname.includes('googleapis.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('./offline.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        return cachedResponse || fetch(event.request).then(networkResponse => {
          // Voliteľne cachovať dynamicky, ak je to vhodné
          return networkResponse;
        });
      })
      .catch(error => {
        console.error('SW: Fetch error for:', event.request.url, error);
        // Pre navigačné requesty už máme fallback, pre ostatné assety môžeme zvážiť
      })
  );
});

self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-pending-data-idb') {
    console.log('SW: Background sync (IDB) udalosť spustená.');
    event.waitUntil(performBackgroundSync());
  } else if (event.tag === 'sync-pending-data') { // Starý tag, ak by ešte niekde bol
      console.warn("SW: Zachytený starý sync tag 'sync-pending-data'. Zvážte odstránenie alebo migráciu.");
      // Tu by mohla byť logika pre starý localStorage-based sync, alebo len ignorovanie.
      // Pre čistotu je lepšie používať len nový IDB mechanizmus.
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('SW: Prijatá správa SKIP_WAITING od klienta.');
    self.skipWaiting();
  } else if (event.data && event.data.type === 'TRIGGER_SYNC_FROM_CLIENT_DEBUG') { // Pre debugovanie
    console.log("SW: Manuálne spúšťam performBackgroundSync na žiadosť klienta.");
    event.waitUntil(performBackgroundSync());
  }
});
