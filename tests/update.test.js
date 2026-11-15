// Автотест обновления: новая версия ждёт нажатия «Обновить», офлайн сохраняется, чужие кэши не трогаются.
// Запуск: node update.test.js <папка_новой_версии> [<папка_v1.2_для_проверки_перехода>]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const NEW = process.argv[2], OLD = process.argv[3], ONLY_B = process.argv[4] === 'B';
// текущая версия и дата берутся из файла; «следующие» версии — тестовые
const [, CUR, CUR_DATE] = fs.readFileSync(path.join(NEW, 'index.html'), 'utf8').match(/const APP_VERSION = '([^']+)', APP_DATE = '([^']+)'/);
const N1 = CUR + '.1', N2 = CUR + '.2';
let ROOT = null; const PORT = 8790;
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/blank.html') { r.writeHead(200, { 'Content-Type': 'text/html' }); r.end('<!doctype html><title>blank</title>'); return; }
  if (!u.startsWith('/folder-compare/')) { r.writeHead(404); r.end(); return; }
  u = u.slice('/folder-compare/'.length) || 'index.html';
  fs.readFile(path.join(ROOT, u), (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': T[path.extname(u)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); r.end(d); });
}).listen(PORT);
const base = `http://localhost:${PORT}`, APP = base + '/folder-compare/';
let fails = 0; const check = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'fcupd-'));
function publish(src, ver, date) { // копия src с подменой версии
  const dst = fs.mkdtempSync(path.join(tmp, 'v'));
  for (const f of fs.readdirSync(src)) if (fs.statSync(path.join(src, f)).isFile()) fs.copyFileSync(path.join(src, f), path.join(dst, f));
  const ixp = path.join(dst, 'index.html');
  fs.writeFileSync(ixp, fs.readFileSync(ixp, 'utf8').replace("'serviceWorker' in navigator && location.protocol === 'https:'", "'serviceWorker' in navigator"));
  if (ver) {
    const ix = path.join(dst, 'index.html');
    fs.writeFileSync(ix, fs.readFileSync(ix, 'utf8').replace(/const APP_VERSION = '[^']+', APP_DATE = '[^']+'/, `const APP_VERSION = '${ver}', APP_DATE = '${date}'`));
    const sw = path.join(dst, 'sw.js');
    fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const VERSION = '[^']+'/, `const VERSION = '${ver}'`));
  }
  ROOT = dst;
}
const ver = p => p.textContent('#verLabel');
const keys = p => p.evaluate(() => caches.keys());
const waitCtrl = p => p.evaluate(() => Promise.race([
  (async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    return true;
  })(),
  new Promise(r => setTimeout(() => r(false), 8000))
]));
async function makeForeign(p) {
  await p.goto(base + '/blank.html');
  await p.evaluate(async () => { for (const n of ['razmery-1.0', 'shablony-2.3', 'apps-1']) { const c = await caches.open(n); await c.put('/' + n + '/m.txt', new Response('data ' + n)); } });
}
async function foreignOk(p) {
  const k = await keys(p);
  const m = await p.evaluate(async () => (await (await caches.open('razmery-1.0')).match('/razmery-1.0/m.txt'))?.text());
  return ['razmery-1.0', 'shablony-2.3', 'apps-1'].every(x => k.includes(x)) && m === 'data razmery-1.0';
}

(async () => {
  const b = await chromium.launch();
  // ===== A. Обновление новой версии поверх работающей =====
  console.log('A. Публикация новой версии поверх работающей');
  if (!ONLY_B) { const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    publish(NEW);
    await makeForeign(p);
    await p.goto(APP); await waitCtrl(p); await p.reload(); await p.waitForTimeout(500);
    const v0 = await ver(p);
    check(v0.includes(CUR), 'установлена версия ' + CUR + ': ' + v0);
    check(await p.isHidden('#updateBanner'), 'панели «Обновить» нет, пока новой версии нет');
    await p.click('#menuBtn');
    check((await p.textContent('#menuFoot')) === `Версия ${CUR} от ${CUR_DATE}`, 'внизу меню: ' + await p.textContent('#menuFoot'));
    await p.click('#menu [data-m="up"]'); await p.waitForTimeout(2000);
    check((await p.textContent('#toast')).includes(`Установлена последняя версия (${CUR})`), '«Проверить обновления» без новой версии: ' + await p.textContent('#toast'));

    publish(NEW, N1, '16.11.2026');                          // «опубликовали» следующую версию
    await p.click('#menuBtn'); await p.click('#menu [data-m="up"]');
    await p.waitForSelector('#updateBanner:not([hidden])', { timeout: 8000 }).catch(() => {});
    check(await p.isVisible('#updateBanner'), 'после «Проверить обновления» появилась панель «Доступна новая версия — Обновить»');
    check((await ver(p)).endsWith(CUR), 'старая версия продолжает работать, пока не нажато «Обновить»');
    await p.reload(); await p.waitForTimeout(800);
    check((await ver(p)).endsWith(CUR), 'перезагрузка страницы без нажатия НЕ ставит новую версию: ' + await ver(p));
    check(await p.isVisible('#updateBanner'), 'при открытии панель «Обновить» показана сразу (новая версия ждёт)');
    await Promise.all([p.waitForNavigation({ timeout: 10000 }), p.click('#btnUpdate')]);
    await p.waitForTimeout(500);
    check((await ver(p)).endsWith(N1), 'после «Обновить» загружена новая версия: ' + await ver(p));
    check(await p.isHidden('#updateBanner'), 'панели «Обновить» больше нет');
    check((await p.textContent('#whatsNew')).includes(`${CUR} → ${N1}`), `показано «Приложение обновлено: ${CUR} → ${N1}»`);
    await p.click('#menuBtn'); check((await p.textContent('#menuFoot')) === `Версия ${N1} от 16.11.2026`, 'в меню новая версия и дата'); await p.keyboard.press('Escape');
    let k = await keys(p);
    check(await foreignOk(p), 'чужие кэши razmery-1.0, shablony-2.3, apps-1 на месте, содержимое цело');
    check(JSON.stringify(k.filter(x => x.startsWith('sravnenie-'))) === JSON.stringify(['sravnenie-' + N1]), 'свой кэш только новый: ' + k.filter(x => x.startsWith('sravnenie-')));

    await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(500);
    check((await ver(p)).endsWith(N1), 'без сети приложение открывается (новая версия)');
    await ctx.setOffline(false);

    publish(NEW, N2, '17.11.2026');                       // проверка через возврат в приложение
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await p.waitForSelector('#updateBanner:not([hidden])', { timeout: 8000 }).catch(() => {});
    check(await p.isVisible('#updateBanner'), 'при возврате в приложение новая версия найдена, панель «Обновить» показана');
    check((await ver(p)).endsWith(N1), 'и до нажатия работает прежняя версия');
    await Promise.all([p.waitForNavigation({ timeout: 10000 }), p.click('#btnUpdate')]); await p.waitForTimeout(400);
    check((await ver(p)).endsWith(N2), 'после «Обновить» — следующая версия');
    check(await foreignOk(p), 'чужие кэши снова на месте');
    check(errs.length === 0, 'ошибок на странице нет' + (errs.length ? ': ' + errs.join('; ') : ''));
    await ctx.close(); }

  // ===== B. Переход с опубликованной v1.2 =====
  if (OLD) { console.log('B. Переход с опубликованной v1.2 на ' + CUR);
    const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    publish(OLD);
    await p.goto(APP); check(await waitCtrl(p), 'v1.2 установила работу без интернета'); await p.reload(); await p.waitForTimeout(500);
    check((await ver(p)).includes('v1.2'), 'работает v1.2: ' + await ver(p));
    await makeForeign(p); await p.goto(APP); await p.waitForTimeout(300);
    publish(NEW);
    await p.reload(); await p.waitForTimeout(4500);           // v1.2 сама проверяет version.json
    check(await p.isVisible('#updateBanner'), 'v1.2 увидела новую версию и показала «Обновить»');
    await Promise.all([p.waitForNavigation({ timeout: 10000 }).catch(() => console.log('    (нет перезагрузки после 1-го нажатия)')), p.click('#btnUpdate')]);
    await p.waitForTimeout(1500);
    console.log('    после 1-го нажатия:', await ver(p), '| панель:', await p.isVisible('#updateBanner'));
    if ((await ver(p)).endsWith(CUR) && await p.isVisible('#updateBanner')) {
      await Promise.all([p.waitForNavigation({ timeout: 10000 }).catch(() => console.log('    (нет перезагрузки после 2-го нажатия)')), p.click('#btnUpdate')]); await p.waitForTimeout(600);
    }
    check((await ver(p)).endsWith(CUR), 'после обновления работает ' + CUR + ': ' + await ver(p));
    const sc = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r.active && r.active.scriptURL; });
    const k = await keys(p);
    check(JSON.stringify(k.filter(x => x.startsWith('sravnenie-'))) === JSON.stringify(['sravnenie-' + CUR]), 'свой кэш только новый: ' + k.filter(x => x.startsWith('sravnenie-')));
    check(await foreignOk(p), 'чужие кэши при переходе не тронуты');
    await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(500);
    check((await ver(p)).endsWith(CUR), 'без сети открывается ' + CUR); await ctx.setOffline(false);
    check(errs.length === 0, 'ошибок на странице нет' + (errs.length ? ': ' + errs.join('; ') : ''));
    await ctx.close(); }

  await b.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? `ИТОГ: ошибок ${fails}` : 'ИТОГ: все проверки пройдены'); process.exit(fails ? 1 : 0);
})();
