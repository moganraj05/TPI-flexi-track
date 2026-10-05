// FlexiTrack service worker — one worker at "/" for the whole site: the
// worker / incharge app at "/" and the HR console at "/staff".
//
// Two jobs:
//  1. App shell caching (static files only) so the installed app opens fast
//     and shows itself instead of the browser's error page when offline.
//     Everything dynamic — /api/*, /socket.io/*, any cross-origin request
//     (the backend, Google Fonts) — is bypassed and always goes to the
//     network. The API stays the only source of truth; this worker never
//     sees, let alone caches, attendance data or sign-in traffic.
//  2. Web Push: showing poll notifications sent by the backend, and opening
//     the right screen when one is tapped.
//
// Registered with ?dev=1 by the Vite dev server (main.jsx): caching is then
// switched off so it can't fight hot reload, but push still works — that is
// how notifications are tested locally on http://localhost.
//
// Bump CACHE_VERSION on any shell change old clients should drop at once.
const CACHE_VERSION = 'flexitrack-shell-v2';
const SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-static-assets`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE];
const DEV = new URL(self.location.href).searchParams.has('dev');

// Only stable, always-present URLs go here — hashed /assets/*.js|css chunks
// are cached opportunistically at runtime instead (see fetch handler), since
// their filenames change on every build and can't be known in advance.
const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  if (DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }
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
      .then((names) =>
        Promise.all(names.filter((name) => DEV || !CURRENT_CACHES.includes(name)).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  );
});

function isDynamicRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/');
}

// Network-first for navigations: an online user always gets the latest
// index.html (so a redeploy is picked up on next load) while an offline one
// still gets the app shell — React Router then takes over client-side, so
// deep links (/home, /incharge/poll/…, /staff/app/…) keep working too.
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/', response.clone());
    }
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
  if (DEV) return;

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

// ---- Web Push ----

// Payload sent by backend notification.service.js:
//   { title, body, url, tag, data: { pollId, type } }
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'FlexiTrack';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Same tag = the newer alert replaces the older one for the same poll
    // (e.g. the reminder replaces "poll open") instead of stacking up.
    tag: payload.tag || 'flexitrack',
    renotify: true,
    data: { url: payload.url || '/', ...(payload.data || {}) },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Tapping a notification opens the screen it is about. Reuses an open
// FlexiTrack window when there is one, instead of opening a second copy.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        if ('navigate' in existing && existing.url !== target) {
          try {
            await existing.navigate(target);
          } catch {
            // Some browsers refuse navigate() on an uncontrolled window; it's
            // focused either way and the app refreshes its data on focus.
          }
        }
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});
