// service-worker.js (TESTOVACIA VERZIA PRE BACKGROUND SYNC UDALOSŤ)

const CACHE_NAME = 'dochadzka-cache-v-test-sync'; // Nové meno cache pre istotu

console.log('SW (TEST SYNC): Service Worker sa načítal.');

self.addEventListener('install', event => {
  console.log('SW (TEST SYNC): Install event');
  event.waitUntil(self.skipWaiting()); // Aktivuj okamžite
});

self.addEventListener('activate', event => {
  console.log('SW (TEST SYNC): Activate event');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) { // Vymaž všetky staré cache
            console.log('SW (TEST SYNC): Mazanie starej cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('SW (TEST SYNC): Aktivovaný a preberá kontrolu.');
        return self.clients.claim();
    })
  );
});

// Fetch listener necháme veľmi jednoduchý, aby nezasahoval
self.addEventListener('fetch', event => {
  // console.log('SW (TEST SYNC): Fetch pre:', event.request.url);
  // Pre testovanie Background Sync ho môžeme dočasne nechať len prejsť na sieť
  event.respondWith(fetch(event.request).catch(() => {
      // Veľmi jednoduchý fallback, ak by niečo bolo potrebné
      if (event.request.mode === 'navigate') {
          // return caches.match('./offline.html'); // Ak máte offline.html a chcete ho testovať
      }
  }));
});


// Hlavný testovací Background Sync Event Listener
self.addEventListener('sync', function(event) {
  console.log(`SW (TEST SYNC): Sync udalosť prijatá! Tag: ${event.tag}`);

  if (event.tag === 'sync-pending-data-idb') { // Tag, ktorý registrujete v index.html
    console.log('SW (TEST SYNC): Spracovávam tag sync-pending-data-idb.');
    event.waitUntil(
      new Promise(async (resolve, reject) => {
        console.log("SW (TEST SYNC): Začínam testovaciu operáciu v rámci sync udalosti.");
        try {
          // 1. Skúsime jednoduchý fetch na verejnú API
          console.log("SW (TEST SYNC): Pokus o testovací fetch na jsonplaceholder...");
          const response = await fetch('https://jsonplaceholder.typicode.com/todos/1');
          
          if (!response.ok) {
            console.error(`SW (TEST SYNC): Testovací fetch zlyhal! Status: ${response.status}`);
            // Aj keď zlyhá, pre Background Sync je dôležité, aby sa Promise vyriešil,
            // inak sa bude sync donekonečna opakovať, ak je to sieťová chyba.
            // Alebo môžeme rejectnúť, aby sa to skúsilo znova. Pre test teraz resolve.
            // reject(new Error(`Test fetch failed with status ${response.status}`));
            // Pre účely tohto testu, ak fetch zlyhá, len to zalogujeme a resolveme, aby sme videli, či sa sync ukončí.
            resolve(); 
            return;
          }
          
          const data = await response.json();
          console.log("SW (TEST SYNC): Testovací fetch úspešný! Dáta:", data);
          
          // Tu by normálne nasledovala logika pre IndexedDB a Firestore
          console.log("SW (TEST SYNC): Testovacia operácia dokončená úspešne.");
          resolve();

        } catch (error) {
          console.error("SW (TEST SYNC): Chyba v testovacej sync operácii:", error);
          // Ak chceme, aby Background Sync zopakoval pokus, musíme Promise rejectnúť
          reject(error); 
        }
      })
    );
  } else {
    console.log(`SW (TEST SYNC): Prijatý iný sync tag: ${event.tag}`);
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('SW (TEST SYNC): Prijatá správa SKIP_WAITING.');
    self.skipWaiting();
  }
});
