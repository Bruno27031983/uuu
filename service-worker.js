// V service-worker.js
self.addEventListener('sync', function(event) {
  console.log(`SW: === SYNC EVENT PRIJATÝ === TAG: ${event.tag}`);

  if (event.tag === 'sync-pending-data-idb') {
    console.log('SW: Spracovávam tag sync-pending-data-idb. Končím bez operácie (len test).');
    event.waitUntil(Promise.resolve()); // Len vrátime vyriešený Promise
  } else {
    console.log(`SW: Prijatý iný sync tag: ${event.tag}`);
    event.waitUntil(Promise.resolve());
  }
});
