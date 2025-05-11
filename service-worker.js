// service-worker.js

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js');

console.log("SW: Začínam vykonávať service-worker.js (verzia s IndexedDB sync a logovaním klientovi)");

const firebaseConfig = { // NAHRAĎTE TOTO VAŠOU REÁLNOU KONFIGURÁCIOU!
    apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk",
    authDomain: "uuuuu-f7ef9.firebaseapp.com",
    projectId: "uuuuu-f7ef9",
    storageBucket: "uuuuu-f7ef9.appspot.com",
    messagingSenderId: "456105865458",
    appId: "1:456105865458:web:101f0a4dcb455f174b606b",
};

let firebaseAppInstanceSW;

function logToClients(message, type = 'log', alsoLogToSWConsole = true) {
    if (alsoLogToSWConsole) {
        if (type === 'error') console.error(message);
        else if (type === 'warn') console.warn(message);
        else console.log(message);
    }
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
        if (windowClients && windowClients.length) {
            windowClients.forEach(client => {
                client.postMessage({
                    type: 'SW_LOG',
                    payload: {
                        message: `[SW ${new Date().toLocaleTimeString()}] ${message}`,
                        logType: type
                    }
                });
            });
        }
    });
}

function getFirebaseAppSW() {
    if (!firebaseAppInstanceSW) {
        logToClients("SW: Pokus o inicializáciu Firebase app...", 'info', true);
        try {
            firebaseAppInstanceSW = firebase.initializeApp(firebaseConfig);
            logToClients("SW: Firebase aplikácia úspešne inicializovaná v Service Workeri.", 'info', true);
        } catch (e) {
            logToClients("SW: KRITICKÁ CHYBA pri inicializácii Firebase v Service Workeri! " + e.message, 'error', true);
            firebaseAppInstanceSW = null; 
        }
    }
    return firebaseAppInstanceSW;
}

const DB_NAME_SW = 'DochadzkaDB';
const DB_VERSION_SW = 1; 
const PENDING_STORE_NAME_SW = 'pendingSyncs';

function openDBSW() { /* ... telo funkcie s logToClients ... */ return new Promise((resolve, reject) => { logToClients(`[DB/SW] Pokus o otvorenie DB: ${DB_NAME_SW} v${DB_VERSION_SW}`, 'debug', true); const request = indexedDB.open(DB_NAME_SW, DB_VERSION_SW); request.onerror = (event) => { logToClients("SW: Chyba otvorenia IndexedDB: " + event.target.error, 'error', true); reject("SW: Chyba otvorenia IndexedDB: " + event.target.error); }; request.onsuccess = (event) => { logToClients("[DB/SW] IndexedDB úspešne otvorená.", 'debug', true); resolve(event.target.result); }; request.onupgradeneeded = (event) => { logToClients("SW: onupgradeneeded pre IndexedDB.", 'info', true); const db = event.target.result; if (!db.objectStoreNames.contains(PENDING_STORE_NAME_SW)) { const store = db.createObjectStore(PENDING_STORE_NAME_SW, { keyPath: 'id', autoIncrement: true }); store.createIndex('userMonthYear', ['userId', 'year', 'month'], { unique: true }); logToClients("SW: Object store 'pendingSyncs' vytvorený s indexom 'userMonthYear'.", 'info', true); } }; }); }
async function getAllPendingSyncsSW() { /* ... telo funkcie s logToClients ... */ logToClients("SW: getAllPendingSyncsSW - pokus o otvorenie DB.", 'debug', true); const db = await openDBSW(); logToClients("SW: getAllPendingSyncsSW - DB otvorená, vytváram transakciu.", 'debug', true); return new Promise((resolve, reject) => { const transaction = db.transaction(PENDING_STORE_NAME_SW, 'readonly'); const store = transaction.objectStore(PENDING_STORE_NAME_SW); const request = store.getAll(); request.onsuccess = () => { logToClients(`SW: getAllPendingSyncsSW - načítaných ${request.result ? request.result.length : 0} itemov.`, 'info', true); resolve(request.result || []); }; request.onerror = (event) => { logToClients("SW: Chyba čítania všetkých pending syncs z IDB: " + event.target.error, 'error', true); reject("SW: Chyba čítania všetkých pending syncs: " + event.target.error); }; }); }
async function deletePendingSyncSW(id) { /* ... telo funkcie s logToClients ... */ logToClients(`SW: deletePendingSyncSW - pokus o vymazanie itemu s ID: ${id}`, 'debug', true); const db = await openDBSW(); return new Promise((resolve, reject) => { const transaction = db.transaction(PENDING_STORE_NAME_SW, 'readwrite'); const store = transaction.objectStore(PENDING_STORE_NAME_SW); const request = store.delete(id); request.onsuccess = () => { logToClients(`SW: deletePendingSyncSW - item s ID: ${id} úspešne vymazaný.`, 'info', true); resolve(); }; request.onerror = (event) => { logToClients("SW: Chyba mazania pending sync s ID " + id + ": " + event.target.error, 'error', true); reject("SW: Chyba mazania pending sync s ID " + id + ": " + event.target.error); }; }); }

async function performBackgroundSync() {
    logToClients("SW: Spúšťam performBackgroundSync...", 'info', true);
    let itemsToSync = [];
    try {
        logToClients("SW: Pokus o načítanie itemov z IndexedDB...", 'debug', true);
        itemsToSync = await getAllPendingSyncsSW();
        logToClients(`SW: Nájdených ${itemsToSync ? itemsToSync.length : 0} itemov na synchronizáciu.`, 'info', true);
    } catch (dbError) {
        logToClients("SW: Nepodarilo sa načítať pending items z IndexedDB v performBackgroundSync: " + dbError, 'error', true);
        throw dbError;
    }

    if (!itemsToSync || itemsToSync.length === 0) {
        logToClients("SW: Žiadne dáta na synchronizáciu v IndexedDB.", 'info', true);
        return Promise.resolve();
    }

    logToClients("SW: Pokus o získanie/inicializáciu Firebase app v SW...", 'debug', true);
    const appSWLocal = getFirebaseAppSW(); 
    if (!appSWLocal) {
        logToClients("SW: Firebase app nie je inicializovaná v SW, nemôžem synchronizovať.", 'error', true);
        throw new Error("SW: Firebase app nie je inicializovaná.");
    }
    logToClients("SW: Firebase app je dostupná. Pokus o získanie Firestore inštancie...", 'debug', true);
    const dbFs = firebase.firestore(appSWLocal);
    if (!dbFs) {
        logToClients("SW: Firestore inštancia (dbFs) nie je dostupná v SW.", 'error', true);
        throw new Error("SW: Firestore inštancia nie je dostupná.");
    }
    logToClients("SW: Firestore inštancia je dostupná. Začínam spracovávať itemy.", 'info', true);

    const syncPromises = itemsToSync.map(async (item) => {
        if (!item || !item.userId || item.year === undefined || item.month === undefined || !item.dataToSync) {
            logToClients("SW: Chybný item v IndexedDB, preskakujem: " + JSON.stringify(item), 'warn', true);
            if (item && item.id) {
                try { await deletePendingSyncSW(item.id); } catch (e) { logToClients("SW: Chyba pri mazaní chybného itemu: " + e, 'error', true); }
            }
            return Promise.resolve(); 
        }
        logToClients(`SW: Synchronizujem item s ID ${item.id} pre usera ${item.userId}, ${item.year}-${item.month}`, 'info', true);
        try {
            const docRef = dbFs.collection('users').doc(item.userId).collection('workDays').doc(`${item.year}-${item.month}`);
            logToClients(`SW: Pripravený na zápis do Firestore pre item ${item.id}. Cesta: ${docRef.path}`, 'debug', true);
            await docRef.set(item.dataToSync, { merge: true });
            logToClients(`SW: Item ${item.id} úspešne zosynchronizovaný.`, 'info', true);
            await deletePendingSyncSW(item.id);
            logToClients(`SW: Item ${item.id} odstránený z IndexedDB.`, 'info', true);
        } catch (error) {
            logToClients(`SW: Chyba pri synchronizácii itemu ${item.id} (user ${item.userId}, ${item.year}-${item.month}): ${error.message}`, 'error', true);
            if (error.code === 'permission-denied' || error.code === 'unauthenticated') {
                logToClients(`SW: Permanentná chyba pre item ${item.id}, odstraňujem z fronty.`, 'warn', true);
                try { await deletePendingSyncSW(item.id); } catch (eDel) { logToClients("SW: Chyba pri mazaní itemu s permanentnou chybou:" + eDel, 'error', true); }
                return Promise.resolve(); 
            } else {
                throw error; 
            }
        }
    });

    return Promise.allSettled(syncPromises).then(results => {
        logToClients("SW: Všetky pokusy o synchronizáciu v rámci jedného 'sync' eventu dokončené.", 'info', true);
        let hasRetryableError = false;
        results.forEach(result => {
            if (result.status === 'rejected') {
                logToClients("SW: Jeden alebo viac itemov sa nepodarilo zosynchronizovať: " + result.reason, 'warn', true);
                if (result.reason && result.reason.code !== 'permission-denied' && result.reason.code !== 'unauthenticated') {
                    hasRetryableError = true;
                }
            }
        });
        if (hasRetryableError) {
            logToClients("SW: Niektoré synchronizačné úlohy zlyhali a mali by sa zopakovať.", 'warn', true);
            throw new Error("SW: Niektoré synchronizačné úlohy zlyhali a mali by sa zopakovať.");
        }
        logToClients("SW: Všetky spracovateľné itemy v tomto 'sync' evente boli buď úspešné alebo označené ako permanentne neúspešné.", 'info', true);
    });
}

const CACHE_NAME = 'dochadzka-cache-v2.4'; // ZVÝŠTE VERZIU!
const PRECACHE_ASSETS = [ './', './index.html', './offline.html', './manifest.json', './icons/icon-192x192.png', './icons/icon-512x512.png', ];
self.addEventListener('install', event => { logToClients('SW: Install event - verzia ' + CACHE_NAME, 'info', true); event.waitUntil( caches.open(CACHE_NAME) .then(cache => { logToClients('SW: Caching app shell: ' + PRECACHE_ASSETS.join(", "), 'info', true); return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, {cache: 'reload'}))); }) .then(() => { logToClients('SW: Precaching dokončený, volám skipWaiting.', 'info', true); return self.skipWaiting(); }) .catch(error => logToClients('SW: Precache failed: ' + error, 'error', true)) ); });
self.addEventListener('activate', event => { logToClients('SW: Activate event - verzia ' + CACHE_NAME, 'info', true); event.waitUntil( caches.keys().then(cacheNames => { return Promise.all( cacheNames.map(cacheName => { if (cacheName !== CACHE_NAME) { logToClients('SW: Deleting old cache: ' + cacheName, 'info', true); return caches.delete(cacheName); } }) ); }).then(() => { logToClients('SW: Staré cache vymazané, volám clients.claim.', 'info', true); return self.clients.claim(); }) ); });
self.addEventListener('fetch', event => { const requestUrl = new URL(event.request.url); if (requestUrl.protocol === 'chrome-extension:') { return; } if (requestUrl.hostname.includes('firebase') || requestUrl.hostname.includes('gstatic.com') || requestUrl.hostname.includes('cloudflare.com') || requestUrl.hostname.includes('googleapis.com')) { event.respondWith(fetch(event.request)); return; } if (event.request.mode === 'navigate') { event.respondWith( fetch(event.request) .catch(() => { logToClients(`SW: Navigácia pre ${event.request.url} zlyhala, servírujem offline.html`, 'warn', true); return caches.match('./offline.html'); }) ); return; } event.respondWith( caches.match(event.request) .then(cachedResponse => { return cachedResponse || fetch(event.request).then(networkResponse => { return networkResponse; }); }) ); });

self.addEventListener('sync', function(event) {
  logToClients(`SW: === SYNC EVENT PRIJATÝ === TAG: ${event.tag} - Čas: ${new Date().toLocaleTimeString()}`, 'log', true); 
  if (event.tag === 'sync-pending-data-idb') {
    logToClients('SW: Spracovávam tag sync-pending-data-idb.', 'info', true);
    event.waitUntil(performBackgroundSync());
  } else {
    logToClients(`SW: Neznámy alebo nespracovaný sync tag: ${event.tag}`, 'warn', true);
  }
});

self.addEventListener('message', event => { if (event.data && event.data.type === 'SKIP_WAITING') { logToClients('SW: Prijatá správa SKIP_WAITING od klienta.', 'info', true); self.skipWaiting(); } });

logToClients(`SW (${CACHE_NAME}): Service Worker načítaný a pripravený.`, 'info', true);
