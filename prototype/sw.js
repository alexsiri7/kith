// Keeps the last page the server sent for /, so Kith opens offline with the world it saved in this browser.
// Nothing else is cached: /api/, sign-in and every other request go straight to the network.
const CACHE = 'kith-shell', SHELL = '/';
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.add(SHELL))));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname !== SHELL) return;
  // Network first, so signing in or out and new releases show up as soon as there is a connection.
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(SHELL, copy))); }
    return res;
  }, () => caches.match(SHELL)));
});
