
const CACHE_NAME = 'recipe-keeper-cache-v1';
const urlsToCache = [
  '/',
  '/index.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // We only want to cache GET requests for the app shell.
  if (event.request.method !== 'GET') {
    return;
  }
  
  // For navigation requests, use a network-first strategy to get the latest version.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }
  
  // For other requests (like scripts, styles from CDNs), use a cache-first strategy.
  // This makes the app load faster on subsequent visits.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Serve from cache
        }
        
        // If not in cache, fetch from network
        return fetch(event.request).then(
          networkResponse => {
            // Don't cache Google API/Auth calls or other dynamic content
            if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
              return networkResponse;
            }

            // Clone the response because it's a stream and can only be consumed once.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // Cache the new resource
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(() => {
          // If network fails, there is no fallback, just fail the request.
          // You could return a placeholder here if needed.
        });
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
