const CACHE_NAME = 'baroque-archive-v3';

// Namestitev - takoj aktiviramo nov SW brez čakanja
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Čiščenje starih predpomnilnikov ob posodobitvi
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Lovljenje zahtevkov in sprotno shranjevanje v cache
self.addEventListener('fetch', (e) => {
  // Shranjujemo samo lokalne datoteke iz naše domene (ne npr. Leaflet ali Gemini API)
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Če je odgovor veljaven, ga shranimo v cache za offline delovanje
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Če ni povezave (offline), poskusimo vrniti datoteko iz cache-a
        return caches.match(e.request);
      })
  );
});