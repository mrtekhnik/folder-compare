// Офлайн-кэш «Сравнение папок и файлов».
// ВАЖНО: при каждой публикации увеличивать VERSION здесь и APP_VERSION в index.html вместе —
// по изменению этого файла браузер узнаёт о новой версии и приложение показывает «Обновить».
// Новая версия скачивается целиком и ЖДЁТ нажатия «Обновить» (skipWaiting только по команде).
// Удаляются только свои старые кэши (sravnenie-*): на домене mrtekhnik.github.io живут и другие приложения.
const PREFIX = 'sravnenie-';
const VERSION = '1.5';
const CACHE = PREFIX + VERSION;
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

// показывается, только если сохранённой копии нет и сети нет
const OFFLINE_PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Сравнение папок и файлов</title>'
  + '<body style="margin:0;font-family:Segoe UI,sans-serif;background:#f4f5f7;color:#1d2330;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">'
  + '<div style="padding:24px"><h2>Нет сети</h2><p>Сохранённая копия приложения не найдена.<br>Подключитесь к интернету и нажмите «Повторить».</p>'
  + '<button onclick="location.reload()" style="font-size:16px;padding:10px 22px;border:0;border-radius:8px;background:#2563eb;color:#fff">Повторить</button></div>';

self.addEventListener('install', e => {
  // Новая версия скачивается в новый кэш и ждёт, пока пользователь нажмёт «Обновить».
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Сначала кэш (для навигации — index.html из своего кэша), иначе сеть.
// Сеть для страницы первой не используется: иначе новая версия загрузилась бы в обход кнопки «Обновить».
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const nav = req.mode === 'navigate';
  e.respondWith((async () => {
    try {
      const cache = await caches.open(CACHE);
      const key = nav ? './index.html' : req;
      let hit = await cache.match(key, { ignoreSearch: true });
      // запасной путь: копия из своего кэша прошлой версии (только sravnenie-*, чужие кэши не смотрим)
      if (!hit) {
        for (const k of (await caches.keys()).filter(k => k.startsWith(PREFIX) && k !== CACHE)) {
          hit = await (await caches.open(k)).match(key, { ignoreSearch: true });
          if (hit) break;
        }
      }
      if (hit) return hit;
      return await fetch(req);
    } catch (_) {
      if (!nav) return new Response('', { status: 503 });
      return new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  })());
});
