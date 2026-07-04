const CACHE_NAME = 'baroque-archive-v3';

// Installation - activate the new SW immediately
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Clean up old caches and take control of all clients
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      // Clean up old versions
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      }),
      // SW takes control of all tabs immediately
      self.clients.claim()
    ])
  );
});

// Intercepting requests
self.addEventListener('fetch', (e) => {
  // Only handle local files
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // If the response is valid, save it to the cache
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // If offline, return from the cache
        return caches.match(e.request);
      })
  );
});