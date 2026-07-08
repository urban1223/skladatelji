const CACHE_NAME = 'baroque-archive-v6';

// Seznam osnovnih datotek za takojšnje vnaprejšnje predpomnjenje
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './stil.css',
  './podatki.js',
  './manifest.json',
  './icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Installation - napolni predpomnilnik in aktiviraj nov SW takoj
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Čiščenje starih predpomnilnikov in prevzem kontrole nad vsemi zavihki
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// Prestrezanje zahtevkov
self.addEventListener('fetch', (e) => {
  // 1. Posebna obravnava za OpenStreetMap (ploščice zemljevida) - rešuje CORS in offline nalaganje
  if (e.request.url.includes('tile.openstreetmap.org')) {
    e.respondWith(
      caches.open('leaflet-maps-cache').then((cache) => {
        return cache.match(e.request).then((cachedResponse) => {
          // Prisili fetch v 'no-cors' način, da zaobideš varnostne blokade
          const fetchPromise = fetch(e.request, { mode: 'no-cors' }).then((networkResponse) => {
            cache.put(e.request, networkResponse.clone());
            return networkResponse;
          });
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 2. Preskoči zunanje zahteve (npr. Firebase login), razen če gre za Leaflet CDN (unpkg)
  if (!e.request.url.startsWith(self.location.origin) && !e.request.url.includes('unpkg.com')) {
    return;
  }

  // 3. Network First logika za lokalne datoteke in unpkg CDN
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((response) => {
        // Če je odgovor veljaven, ga shrani/posodobi v predpomnilniku
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Če ni povezave (offline), vrni datoteko iz predpomnilnika
        return caches.match(e.request);
      })
  );
});