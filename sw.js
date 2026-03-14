// ════════════════════════════════════════════════════════════
//  ARTHALEKHA — Service Worker v2.0
//  Offline-first strategy: cache-first for app shell,
//  network-first for Firebase API calls.
// ════════════════════════════════════════════════════════════

const CACHE_NAME    = 'arthalekha-v2';
const FIREBASE_HOST = 'arthalekha-a8e5b-default-rtdb.firebaseio.com';
const GOOGLE_APIS   = 'identitytoolkit.googleapis.com';

// App shell — the single HTML file that contains everything
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
];

// ── Install: pre-cache app shell ─────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: smart routing ─────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST to Firebase, etc.)
  if (request.method !== 'GET') return;

  // Skip Chrome extensions
  if (url.protocol === 'chrome-extension:') return;

  // ── Firebase & Google APIs: network-only (never cache) ───
  if (
    url.hostname.includes(FIREBASE_HOST) ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes(GOOGLE_APIS) ||
    url.hostname.includes('googleapis.com')
  ) {
    return; // Let the browser handle Firebase normally
  }

  // ── Google Fonts: cache-first (rarely changes) ────────────
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // ── CDN scripts (Recharts, SheetJS, React, Firebase): cache-first ──
  if (
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // ── App shell (index.html and local assets): cache-first with
  //    background network update (stale-while-revalidate) ────
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        const networkFetch = fetch(request).then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => cached);

        // Return cached version immediately, update in background
        return cached || networkFetch;
      })
    )
  );
});

// ── Background sync message handler ──────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
