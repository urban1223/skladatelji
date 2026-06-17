const CACHE_NAME = 'baroque-archive-v3';

// Namestitev - takoj aktiviramo nov SW
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Čiščenje starih predpomnilnikov in prevzem nadzora nad vsemi klienti
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      // Čiščenje starih verzij
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      }),
      // SW prevzame nadzor nad vsemi zavihki takoj
      self.clients.claim()
    ])
  );
});

// Lovljenje zahtevkov
self.addEventListener('fetch', (e) => {
  // Shranjujemo samo lokalne datoteke
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Če je odgovor veljaven, ga shranimo v cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Če smo offline, vrni iz cache-a
        return caches.match(e.request);
      })
  );
});