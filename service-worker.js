// service-worker.js

// Importy Firebase SDK (nechajte ich na začiatku)
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js');

console.log("SW: Začínam vykonávať service-worker.js (verzia s IndexedDB sync)");

// Firebase konfigurácia (UISTITE SA, ŽE JE SPRÁVNA A IDENTICKÁ S index.html)
const firebaseConfig = { 
    apiKey: "AIzaSyBdLtJlduT3iKiGLDJ0UfAakpf6wcresnk", // NAHRAĎTE
    authDomain: "uuuuu-f7ef9.firebaseapp.com",     // NAHRAĎTE
    projectId: "uuuuu-f7ef9",               // NAHRAĎTE
    storageBucket: "uuuuu-f7ef9.appspot.com",  // NAHRAĎTE
    messagingSenderId: "456105865458",         // NAHRAĎTE
    appId: "1:456105865458:web:101f0a4dcb455f174b606b" // NAHRAĎTE
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

// IndexedDB Helpery (openDBSW, getAllPendingSyncsSW, deletePendingSyncSW)
// (Skopírujte ich sem z predchádzajúcej kompletnej verzie service-worker.js)
const DB_NAME_SW = 'DochadzkaDB';
const DB_VERSION_SW = 1; 
const PENDING_STORE_NAME_SW = 'pendingSyncs';

function openDBSW() { /* ... celé telo funkcie ... */ return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME_SW, DB_VERSION_SW); request.onerror = (event) => { console.error("SW: Chyba otvorenia IndexedDB:", event.target.error); reject("SW: Chyba otvorenia IndexedDB: " + event.target.error); }; request.onsuccess = (event) => resolve(event.target.result); request.onupgradeneeded = (event) => { console.log("SW: onupgradeneeded pre IndexedDB."); const db = event.target.result; if (!db.objectStoreNames.contains(PENDING_STORE_NAME_SW)) { const store = db.createObjectStore(PENDING_STORE_NAME_SW, { keyPath: 'id', autoIncrement: true }); store.createIndex('userMonthYear', ['userId', 'year', 'month'], { unique: true }); console.log("SW: Object store 'pendingSyncs' vytvorený s indexom 'userMonthYear'."); } }; }); }
async function getAllPendingSyncsSW() { /* ... celé telo funkcie ... */ console.log("SW: getAllPendingSyncsSW - pokus o otvorenie DB."); const db = await openDBSW(); console.log("SW: getAllPendingSyncsSW - DB otvorená, vytváram transakciu."); return new Promise((resolve, reject) => { const transaction = db.transaction(PENDING_STORE_NAME_SW, 'readonly'); const store = transaction.objectStore(PENDING_STORE_NAME_SW); const request = store.getAll(); request.onsuccess = () => { console.log(`SW: getAllPendingSyncsSW - načítaných ${request.result ? request.result.length : 0} itemov.`); resolve(request.result || []); }; request.onerror = (event) => { console.error("SW: Chyba čítania všetkých pending syncs z IDB:", event.target.error); reject("SW: Chyba čítania všetkých pending syncs: " + event.target.error); }; }); }
async function deletePendingSyncSW(id) { /* ... celé telo funkcie ... */ console.log(`SW: deletePendingSyncSW - pokus o vymazanie itemu s ID: ${id}`); const db = await openDBSW(); return new Promise((resolve, reject) => { const transaction = db.transaction(PENDING_STORE_NAME_SW, 'readwrite'); const store = transaction.objectStore(PENDING_STORE_NAME_SW); const request = store.delete(id); request.onsuccess = () => { console.log(`SW: deletePendingSyncSW - item s ID: ${id} úspešne vymazaný.`); resolve(); }; request.onerror = (event) => { console.error("SW: Chyba mazania pending sync s ID " + id + ":", event.target.error); reject("SW: Chyba mazania pending sync s ID " + id + ": " + event.target.error); }; }); }

async function performBackgroundSync() {
    console.log("SW: Spúšťam performBackgroundSync...");
    let itemsToSync = [];
    try {
        console.log("SW: Pokus o načítanie itemov z IndexedDB...");
        itemsToSync = await getAllPendingSyncsSW();
        console.log(`SW: Nájdených ${itemsToSync ? itemsToSync.length : 0} itemov na synchronizáciu.`);
    } catch (dbError) {
        console.error("SW: Nepodarilo sa načítať pending items z IndexedDB v performBackgroundSync:", dbError);
        throw dbError; 
    }

    if (!itemsToSync || itemsToSync.length === 0) {
        console.log("SW: Žiadne dáta na synchronizáciu v IndexedDB.");
        return Promise.resolve();
    }

    console.log("SW: Pokus o získanie/inicializáciu Firebase app v SW...");
    const appSWLocal = getFirebaseAppSW(); 
    if (!appSWLocal) {
        console.error("SW: Firebase app nie je inicializovaná v SW, nemôžem synchronizovať.");
        throw new Error("SW: Firebase app nie je inicializovaná.");
    }
    console.log("SW: Firebase app je dostupná. Pokus o získanie Firestore inštancie...");
    const dbFs = firebase.firestore(appSWLocal); // Používame compat verziu
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
            return Promise.resolve(); 
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
                return Promise.resolve(); 
            } else {
                console.error(`SW: Došlo k chybe pri zápise itemu ${item.id}, chyba bude hodená pre opakovanie Background Sync.`, error);
                throw error; // Dôležité: Hodiť chybu, aby Background Sync vedel, že operácia zlyhala a má ju zopakovať.
            }
        }
    });

    return Promise.allSettled(syncPromises).then(results => {
        console.log("SW: Všetky pokusy o synchronizáciu v rámci jedného 'sync' eventu dokončené.");
        let hasRetryableError = false;
        results.forEach(result => {
            if (result.status === 'rejected') {
                console.warn("SW: Jeden alebo viac itemov sa nepodarilo zosynchronizovať (alebo bola chyba hodená pre opakovanie):", result.reason);
                // Ak chyba nie je permanentná (a item nebol vymazaný kvôli permanentnej chybe), označíme, že by sa malo opakovať
                if (result.reason && result.reason.code !== 'permission-denied' && result.reason.code !== 'unauthenticated') {
                    hasRetryableError = true;
                }
            }
        });
        if (hasRetryableError) {
            console.log("SW: Niektoré synchronizačné úlohy zlyhali chybou, ktorá by mala byť opakovaná prehliadačom.");
            throw new Error("SW: Niektoré synchronizačné úlohy zlyhali a mali by sa zopakovať.");
        }
        console.log("SW: Všetky spracovateľné itemy v tomto 'sync' evente boli buď úspešné alebo označené ako permanentne neúspešné.");
    });
}

// Zvyšok Service Workera (Caching, install, activate, fetch, message listenery)
// Skopírujte sem z predchádzajúcej kompletnej verzie service-worker.js
const CACHE_NAME = 'dochadzka-cache-v2.2'; // ZVÝŠTE VERZIU PRI ZMENÁCH!
const PRECACHE_ASSETS = [ './', './index.html', './offline.html', './manifest.json', './icons/icon-192x192.png', './icons/icon-512x512.png', ];
self.addEventListener('install', event => { console.log('SW: Install event - verzia', CACHE_NAME); event.waitUntil( caches.open(CACHE_NAME) .then(cache => { console.log('SW: Caching app shell:', PRECACHE_ASSETS); return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, {cache: 'reload'}))); }) .then(() => { console.log('SW: Precaching dokončený, volám skipWaiting.'); return self.skipWaiting(); }) .catch(error => console.error('SW: Precache failed:', error)) ); });
self.addEventListener('activate', event => { console.log('SW: Activate event - verzia', CACHE_NAME); event.waitUntil( caches.keys().then(cacheNames => { return Promise.all( cacheNames.map(cacheName => { if (cacheName !== CACHE_NAME) { console.log('SW: Deleting old cache:', cacheName); return caches.delete(cacheName); } }) ); }).then(() => { console.log('SW: Staré cache vymazané, volám clients.claim.'); return self.clients.claim(); }) ); });
self.addEventListener('fetch', event => { const requestUrl = new URL(event.request.url); if (requestUrl.protocol === 'chrome-extension:') { return; } if (requestUrl.hostname.includes('firebase') || requestUrl.hostname.includes('gstatic.com') || requestUrl.hostname.includes('cloudflare.com') || requestUrl.hostname.includes('googleapis.com')) { event.respondWith(fetch(event.request)); return; } if (event.request.mode === 'navigate') { event.respondWith( fetch(event.request) .catch(() => caches.match('./offline.html')) ); return; } event.respondWith( caches.match(event.request) .then(cachedResponse => { return cachedResponse || fetch(event.request).then(networkResponse => { return networkResponse; }); }) ); });
self.addEventListener('sync', function(event) { console.log(`SW: Prijatá sync udalosť s tagom: ${event.tag}`); if (event.tag === 'sync-pending-data-idb') { console.log('SW: Spracovávam ' + event.tag); event.waitUntil(performBackgroundSync()); } else { console.log(`SW: Neznámy alebo nespracovaný sync tag: ${event.tag}`); } });
self.addEventListener('message', event => { if (event.data && event.data.type === 'SKIP_WAITING') { console.log('SW: Prijatá správa SKIP_WAITING od klienta.'); self.skipWaiting(); } });
console.log('SW (v2.2 - s plným IndexedDB sync): Service Worker načítaný a pripravený.');
