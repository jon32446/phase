// Bump this for every published change to the application shell.
const VERSION = '6';
const PREFIX = `phase-shell:${self.registration.scope}:`;
const CACHE = `${PREFIX}${VERSION}`;
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest', './icon.svg',
  './src/app.js', './src/offline.js', './src/dates.js', './src/records.js',
  './src/storage.js', './src/history.js', './src/predictions.js', './src/backup.js'
].map((path) => new URL(path, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (self.registration.active && await caches.has(CACHE)) {
      throw new Error('A published shell change requires a new VERSION.');
    }
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload', redirect: 'error' })));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'activate-update') event.waitUntil(self.skipWaiting());
  if (event.data === 'clean-old-shells') {
    event.waitUntil((async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.length !== 1 || windows[0].id !== event.source?.id) return;
      const names = await caches.keys();
      if (self.registration.waiting || self.registration.installing) return;
      await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== CACHE)
        .map((name) => caches.delete(name)));
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !ASSETS.includes(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(request) ?? fetch(request);
  })());
});
