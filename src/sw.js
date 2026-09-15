const CACHE_NAME = 'app-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  // Only handle HTTP/HTTPS same-origin requests (avoid ws, extensions, or cross-origin)
  if (!url.protocol.startsWith('http') || url.origin !== self.location.origin) {
    return;
  }

  // Never cache version.json in Service Worker; always bypass HTTP cache
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // For navigation / HTML requests, use cache: 'no-cache' to revalidate with origin
  // server and avoid serving stale index.html from browser HTTP disk cache.
  const isNavigation =
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html');
  const fetchInit = isNavigation ? { cache: 'no-cache' } : undefined;

  // Network-first strategy: always fetch fresh from network, fallback to cache on network error
  event.respondWith(
    fetch(request, fetchInit)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    })
  );
});
