// Работа без интернета. При обновлении приложения меняйте VERSION.
// На домене mrtekhnik.github.io живут и другие приложения со своими кэшами,
// поэтому этот файл трогает ТОЛЬКО кэши с префиксом PREFIX.
const PREFIX = 'sravnenie-';
const VERSION = PREFIX + 'v1.1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

// Удаляем только свои старые кэши; чужие (razmery-*, shablony-*, apps-* и др.) не трогаем.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Ищем только в своём кэше, чтобы не взять файл из кэша другого приложения.
const fromCache = req => caches.open(VERSION).then(c => c.match(req));

// Страница: сначала сеть (чтобы сразу видеть новые версии), без сети — из кэша.
// Остальное: из кэша, иначе из сети.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put('index.html', copy)); }
      return r;
    }).catch(() => fromCache('index.html')));
    return;
  }
  e.respondWith(fromCache(e.request).then(r => r || fetch(e.request)));
});
