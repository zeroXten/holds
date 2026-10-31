// Offline support. App files: network first, so updates arrive straight away.
// MediaPipe library, WASM and model: cache first, since they're versioned and large.
const VERSION = '2.9.0';  // keep in step with js/version.js
const APP = `holds-app-${VERSION}`;
const LIBS = 'holds-libs-v1';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png',
  'js/app.js', 'js/version.js', 'js/audio.js', 'js/economy.js', 'js/figure.js', 'js/pixel.js', 'js/avatar.js', 'js/temple.js', 'js/framing.js', 'js/flow.js', 'js/holds.js', 'js/pose.js', 'js/tracker.js', 'js/progress.js', 'js/scoring.js', 'js/session.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== APP && k !== LIBS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'storage.googleapis.com') {
    e.respondWith(caches.open(LIBS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
  } else if (url.origin === location.origin) {
    // cache: 'no-cache' checks with the server every time, so a deploy never mixes old and new files.
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(APP).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
  }
});
