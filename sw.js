/* ═══════════════════════════════════════════════════════════════
   Awqat al-Salat — Service Worker
   Uses relative paths so it works on GitHub Pages (/awqat/),
   Vercel (/), or any subdirectory deployment.
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'awqat-v1';

// Derive base path from sw.js location — works in any subdirectory
const BASE = self.registration.scope;

// Core app shell assets to pre-cache
const SHELL_ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'app.js',
  BASE + 'style.css',
  BASE + 'manifest.json',
  BASE + 'icons/icon-192x192.png',
  BASE + 'icons/icon-512x512.png',
];

// Install: pre-cache the app shell
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return Promise.allSettled(
          SHELL_ASSETS.map(function(url) {
            return fetch(url)
              .then(function(res) { if (res.ok) return cache.put(url, res); })
              .catch(function() {});
          })
        );
      })
      .then(function() { return self.skipWaiting(); })
  );
});

// Activate: remove stale caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// Fetch: smart caching strategy
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Always network-first for API calls
  if (url.pathname.includes('/api/')) {
    e.respondWith(
      fetch(e.request).catch(function() {
        return new Response(
          JSON.stringify({ error: 'You are offline.' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // CDN assets — cache first
  if (url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com' ||
      url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        return fetch(e.request).then(function(res) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
          return res;
        });
      })
    );
    return;
  }

  // App shell — cache first, network fallback
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        if (e.request.method === 'GET' && res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
        }
        return res;
      }).catch(function() {
        if (e.request.mode === 'navigate') {
          return caches.match(BASE + 'index.html');
        }
      });
    })
  );
});

// Allow app to trigger SW update
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
