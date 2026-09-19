// Minimal App Shell service worker for the FlexiTrack HR web console.
//
// Scope: static shell only (index.html + hashed /assets/*.js/css + icons).
// Everything dynamic — /api/*, /socket.io/*, any cross-origin request (the
// backend, Google Fonts) — is explicitly bypassed below and always goes
// straight to the network. The backend API stays the sole source of truth
// for auth, attendance, polls and every other business record; this worker
// never sees, let alone caches, that traffic.
//
// Bump CACHE_VERSION on any shell change you want old clients to drop
// immediately (it's what activate() uses to clear out prior caches).
const CACHE_VERSION = 'flexitrack-shell-v1';
const SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-static-assets`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE];

// Only stable, always-present URLs go here — hashed /assets/*.js|css chunks
// are cached opportunistically at runtime instead (see fetch handler), since
// their filenames change on every build and can't be known in advance.
const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => !CURRENT_CACHES.includes(name)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

function isDynamicRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/');
}

// Network-first for navigations: an online user always gets the latest
// index.html (so a redeploy is picked up on next load) while an offline one
// still gets the app shell instead of the browser's default error page —
// React Router then takes over client-side, so deep links keep working too.
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put('/', response.clone());
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('/')) || Response.error();
  }
}

// Cache-first for build output: filenames are content-hashed by Vite, so a
// cached copy is never stale — it either matches the current index.html's
// references exactly or it's for a build no longer linked from anywhere.
async function handleStaticAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || isDynamicRequest(url)) {
    return; // let the browser handle it untouched — no caching, no interception
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleStaticAsset(request));
  }
});
