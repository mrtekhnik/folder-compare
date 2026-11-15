// Автотест уведомлений о версии. Запуск: скопировать файлы приложения в <root>, затем: node tests/notify.test.js <root>   (нужен playwright)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2], PORT = 8781;
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(d); });
}).listen(PORT);
let fails = 0; const check = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };
const vj = path.join(ROOT, 'version.json'); const origVJ = fs.readFileSync(vj, 'utf8');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const url = `http://localhost:${PORT}/`;
  // 1. Первый запуск: «что нового» не показывается
  await p.goto(url); await p.waitForTimeout(3500);
  check(await p.isHidden('#whatsNew'), 'первый запуск: сообщение «обновлено» не показано');
  check(await p.isHidden('#updateBanner'), 'версия актуальна: полосы «доступна новая версия» нет');
  check(await p.evaluate(() => localStorage.getItem('folder-compare-seen-version')) === 'v1.2', 'версия запомнена');
  // 2. После обновления с v1.1
  await p.evaluate(() => localStorage.setItem('folder-compare-seen-version', 'v1.1'));
  await p.reload(); await p.waitForTimeout(300);
  const wn = (await p.textContent('#whatsNew')).replace(/\s+/g, ' ').trim();
  console.log('  «Что нового»:', wn);
  check(await p.isVisible('#whatsNew') && wn.includes('v1.1 → v1.2') && wn.includes('Уведомление о новой версии'), 'после обновления показано «v1.1 → v1.2» со списком изменений');
  await p.click('#btnWhatsNewOk');
  check(await p.isHidden('#whatsNew'), 'кнопка «Понятно» скрывает сообщение');
  await p.reload(); await p.waitForTimeout(300);
  check(await p.isHidden('#whatsNew'), 'при следующем открытии сообщение больше не появляется');
  // 3. Опубликована новая версия
  fs.writeFileSync(vj, JSON.stringify({ version: 'v9.9', notes: ['Тестовое изменение А', 'Тестовое изменение Б'] }));
  await p.reload(); await p.waitForTimeout(3500);
  const ub = (await p.textContent('#updateBanner')).replace(/\s+/g, ' ').trim();
  console.log('  Полоса:', ub);
  check(await p.isVisible('#updateBanner') && ub.includes('v9.9') && ub.includes('Тестовое изменение Б'), 'полоса «Доступна новая версия v9.9» со списком изменений');
  check(await p.isVisible('#btnUpdate'), 'есть кнопка «Обновить»');
  // старый формат version.json без notes
  fs.writeFileSync(vj, JSON.stringify({ version: 'v9.8' }));
  await p.reload(); await p.waitForTimeout(3500);
  check((await p.textContent('#updateBanner')).includes('v9.8'), 'version.json без списка изменений тоже работает');
  // кнопка «Обновить» перезагружает страницу
  await Promise.all([p.waitForNavigation(), p.click('#btnUpdate')]);
  check(true, 'кнопка «Обновить» перезагружает страницу');
  fs.writeFileSync(vj, origVJ);
  check(errs.length === 0, 'ошибок на странице нет' + (errs.length ? ': ' + errs.join('; ') : ''));
  await b.close(); srv.close();
  console.log(fails ? `ИТОГ: ошибок ${fails}` : 'ИТОГ: все проверки пройдены'); process.exit(fails ? 1 : 0);
})();
