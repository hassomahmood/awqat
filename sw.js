/* ═══════════════════════════════════════════════════════════════
   Awqat al-Salat — Service Worker
   Caches core app shell for offline use.
   API calls (prayer times) always fetch live.
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'awqat-v1';

// Core app shell — these are cached on install
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  // Google Fonts (cached on first use via runtime caching below)
];

// ── Install: pre-cache the app shell ─────────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(SHELL_ASSETS);
      })
      .then(function() {
        // Activate immediately without waiting for old tabs to close
        return self.skipWaiting();
      })
  );
});

// ── Activate: remove stale caches ────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      // Take control of all open pages immediately
      return self.clients.claim();
    })
  );
});

// ── Fetch: smart caching strategy ────────────────────────────────────
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // 1. Always network-first for API calls (live prayer times)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .catch(function() {
          // Offline fallback for API — return a JSON error response
          return new Response(
            JSON.stringify({ error: 'You are offline. Please check your connection.' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // 2. Google Fonts & CDN assets — cache first, fallback to network
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdn.jsdelivr.net'
  ) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        return fetch(e.request).then(function(response) {
          // Cache a clone for next time
          var toCache = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, toCache);
          });
          return response;
        });
      })
    );
    return;
  }

  // 3. App shell — cache first, fallback to network
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        // Cache successful GET responses for the app origin
        if (
          e.request.method === 'GET' &&
          response.status === 200 &&
          url.hostname === self.location.hostname
        ) {
          var toCache = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, toCache);
          });
        }
        return response;
      }).catch(function() {
        // Offline: serve cached index.html as fallback for navigation
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ── Message: force update from app ───────────────────────────────────
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
