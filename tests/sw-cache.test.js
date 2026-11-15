// Автотест: service worker не должен удалять кэши других приложений.
// Запуск: скопировать файлы приложения в <root>/folder-compare/, создать <root>/blank.html,
// затем: node tests/sw-cache.test.js <root> 8771   (нужен playwright)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2], PORT = +process.argv[3];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(d); });
}).listen(PORT);
const base = `http://localhost:${PORT}`;
let fails = 0;
const check = (cond, msg) => { console.log((cond ? '  OK   ' : '  FAIL ') + msg); if (!cond) fails++; };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
  // 1. Кэши других приложений + свой старый кэш
  await p.goto(base + '/blank.html');
  await p.evaluate(async () => {
    for (const n of ['razmery-1.0', 'shablony-2.3', 'apps-1']) { const c = await caches.open(n); await c.put('/' + n + '/marker.txt', new Response('data ' + n)); }
    await caches.open('sravnenie-v0.9');
  });
  // 2. Установка и активация SW приложения
  await p.goto(base + '/folder-compare/');
  const sw1 = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    const w = reg.active; if (w.state !== 'activated') await new Promise(r => w.addEventListener('statechange', () => w.state === 'activated' && r()));
    await new Promise(r => setTimeout(r, 300));
    const keys = await caches.keys();
    const marker = await (await caches.match('/razmery-1.0/marker.txt'))?.text();
    return { keys, marker };
  });
  console.log('После активации:', sw1.keys.join(', '));
  check(sw1.keys.includes('razmery-1.0'), 'чужой кэш razmery-1.0 на месте');
  check(sw1.keys.includes('shablony-2.3') && sw1.keys.includes('apps-1'), 'чужие кэши shablony-2.3 и apps-1 на месте');
  check(sw1.marker === 'data razmery-1.0', 'содержимое чужого кэша не тронуто');
  check(!sw1.keys.includes('sravnenie-v0.9'), 'свой старый кэш sravnenie-v0.9 удалён');
  const own = sw1.keys.filter(k => k.startsWith('sravnenie-'));
  check(own.length === 1, 'остался один свой кэш: ' + own.join(', '));

  // 3. Обновление на следующую версию
  const swPath = path.join(ROOT, 'folder-compare', 'sw.js');
  const orig = fs.readFileSync(swPath, 'utf8');
  fs.writeFileSync(swPath, orig.replace(/const VERSION = PREFIX \+ '[^']+'|const VERSION = '[^']+'/, m => m.replace(/'[^']+'$/, "'v9.9-test'").replace("'sravnenie-v9.9-test'", "'sravnenie-v9.9-test'")));
  const sw2 = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg.update();
    const w = reg.installing || reg.waiting || reg.active;
    if (w && w.state !== 'activated') await new Promise(r => w.addEventListener('statechange', () => w.state === 'activated' && r()));
    await new Promise(r => setTimeout(r, 300));
    return await caches.keys();
  });
  fs.writeFileSync(swPath, orig);
  console.log('После обновления:', sw2.join(', '));
  check(sw2.includes('razmery-1.0') && sw2.includes('shablony-2.3') && sw2.includes('apps-1'), 'после обновления чужие кэши на месте');
  const own2 = sw2.filter(k => k.startsWith('sravnenie-'));
  check(own2.length === 1 && own2[0] !== own[0], 'предыдущий свой кэш заменён новым: ' + own2.join(', '));

  // 4. Работа без интернета
  await ctx.setOffline(true);
  await p.reload();
  const title = await p.textContent('header h1').catch(() => null);
  check(title === 'Сравнение папок и файлов', 'без интернета приложение открывается из кэша');
  await ctx.setOffline(false);

  await b.close(); srv.close();
  console.log(fails ? `ИТОГ: ошибок ${fails}` : 'ИТОГ: все проверки пройдены');
  process.exit(fails ? 1 : 0);
})();
