const CACHE = 'timmy-shell-v1';
const SHELL = ['/', '/styles.css', '/app.js', '/manifest.webmanifest', '/assets/icon-192.png', '/assets/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
 const req = event.request;
 if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
 if (!SHELL.includes(new URL(req.url).pathname)) return; // Do not cache API calls, authenticated data or external responses
 event.respondWith(fetch(req).then(response => {
  if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(req, copy)); }
  return response;
 }).catch(() => caches.match(req)));
});
