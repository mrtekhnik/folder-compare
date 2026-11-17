// Автотест вида «Две панели» (ПК и телефон). Нужен локальный сервер приложения на :8765 и tests/feed.js.
const { chromium } = require('playwright'); const feed = require('./feed.js');
const t = 1739000000000, P = 'АЮИА.320-02.03.00.00.';
const COMMON = [[P + '01 Основа блоку.pdf', 39915, t], [P + '01-St-16-K1.dxf', 44683, t + 10000], [P + '02 Стінка блоку.pdf', 43439, t + 20000], [P + '03 Косинка.pdf', 41650, t + 30000]];
const LA = [...COMMON, [P + '03-St-20-K2.dxf', 195403, t + 40000], [P + '02-St-16-K1.dxf', 50087, t + 50000], [P + '06 Планка кріплення.pdf', 37131, t + 60000], [P + '06-St-2-K1.dxf', 24674, t + 70000]];
const LB = [...COMMON, [P + '03-St-20-K2.dxf', 195611, t + 86400000], [P + '02-St-16-K2.dxf', 50087, t + 50000], [P + '061 Планка кріплення.pdf', 37131, t + 60000], [P + '061-St-2-K1.dxf', 24674, t + 70000]];
const load = async pg => { await feed(pg, 'A', 'Proj', LA); await feed(pg, 'B', 'Proj', LB); await pg.waitForTimeout(300); };
let fails = 0; const check = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 760 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  await load(p);
  console.log('ПК, две панели');
  check(await p.$eval('#vtable', e => e.classList.contains('two')), 'по умолчанию вид «Две панели»');
  check((await p.textContent('#hA')) === 'Слева (A): Proj' && (await p.textContent('#hB')) === 'Справа (B): Proj', 'заголовки панелей с именами папок');
  const rows = await p.$$eval('#vcontent .vr.t', els => els.map(e => ({ st: e.className.match(/st-(\w+)/)[1],
    a: e.querySelector('.an').textContent, b: e.querySelector('.bn').textContent, mid: e.querySelector('.mid').textContent,
    aBg: getComputedStyle(e.querySelector('.an')).backgroundImage !== 'none' })));
  rows.forEach(r => console.log('      ', r.mid.padEnd(12), '|', (r.a || '·····').padEnd(40), '|', r.b || '·····'));
  const same = rows.filter(r => r.st === 'same'); check(same.length === 4 && same.every(r => r.a === r.b && r.mid === '='), 'идентичные: одно имя слева и справа, «=»');
  const chg = rows.find(r => r.st === 'chg'); check(chg && chg.a === chg.b && chg.mid.startsWith('≠'), 'изменённый: напротив друг друга, «≠ разм.+дата»: ' + (chg && chg.mid));
  const del = rows.filter(r => r.st === 'del'); check(del.length === 3 && del.every(r => r.a && !r.b && r.mid === '−'), 'только в A: имя слева, справа пусто, «−»');
  const nw = rows.filter(r => r.st === 'new'); check(nw.length === 3 && nw.every(r => !r.a && r.b && r.mid === '+' && r.aBg), 'только в B: имя справа, слева пусто (штриховка), «+»');
  const iK1 = rows.findIndex(r => r.a.endsWith('02-St-16-K1.dxf')), iK2 = rows.findIndex(r => r.b.endsWith('02-St-16-K2.dxf'));
  check(iK2 === iK1 + 1, 'переименованные K1 и K2 стоят рядом (строки ' + iK1 + ' и ' + iK2 + ')');
  check(await p.evaluate(() => document.querySelector('.vwrap').scrollWidth <= document.querySelector('.vwrap').clientWidth + 1), 'на ПК 1500 px таблица без горизонтальной прокрутки');
  check(await p.$$eval('#vcontent .vr.t .ad:not(.none), #vcontent .vr.t .bd:not(.none), #vcontent .vr.t .mid', els => els.every(e => e.scrollWidth <= e.clientWidth + 1)), 'на ПК даты и пометка «≠ разм.+дата» помещаются полностью');
  await p.$eval('#resultsCard', e => e.scrollIntoView()); await p.screenshot({ path: '/tmp/claude-0/-home-claude/28b56914-0eb6-5dc5-acbf-324cc200c8bd/scratchpad/two-pc.png' });
  // переключение на список и обратно
  await p.click('#viewSeg [data-v="list"]'); await p.waitForTimeout(100);
  check(await p.locator('#vcontent .vr.f').count() === 11 && await p.isVisible('.vhead.h1') && await p.isHidden('.vhead.h2'), 'вид «Список» работает как раньше');
  await p.reload(); await p.waitForTimeout(300);
  check(await p.$eval('#viewSeg [data-v="list"]', e => e.classList.contains('on')), 'выбранный вид запоминается');
  await p.click('#viewSeg [data-v="two"]');
  // фильтры
  await load(p);
  await p.check('#onlyDiff'); await p.waitForTimeout(100);
  check(await p.locator('#vcontent .vr.t').count() === 7, '«Только различия» в двух панелях: 7 строк');
  await p.fill('#search', 'планка'); await p.waitForTimeout(300);
  check(await p.locator('#vcontent .vr.t').count() === 2, 'поиск «планка»: 2 строки (06 и 061)');
  check(errs.length === 0, 'ошибок нет' + (errs.length ? ': ' + errs : ''));
  // телефон
  console.log('Телефон 360');
  const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
  const m = await ctx.newPage(); await m.goto('http://localhost:8765/'); await m.waitForTimeout(300);
  await load(m);
  const mr = await m.$$eval('#vcontent .vr.t', els => els.map(e => { const a = e.querySelector('.an').getBoundingClientRect(), b = e.querySelector('.bn').getBoundingClientRect(), r = e.getBoundingClientRect();
    return { h: Math.round(r.height), twoTier: b.top > a.top + 5, fits: r.right <= innerWidth + 1, txt: e.innerText.replace(/\s+/g, ' ') }; }));
  mr.slice(0, 4).forEach(r => console.log('      ', r.txt));
  check(mr.length && mr.every(r => r.h === 52 && r.twoTier && r.fits), 'на телефоне каждая строка: сверху A, снизу B, в пределах экрана');
  check(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'на телефоне нет горизонтальной прокрутки');
  const ends = await m.$$eval('#vcontent .vr.t .an:not(.none), #vcontent .vr.t .bn:not(.none)', els => els.map(e => ({ txt: e.textContent, cut: e.scrollWidth > e.clientWidth + 1 })));
  check(ends.some(e => e.txt.endsWith('02-St-16-K1.dxf')) && ends.some(e => e.txt.endsWith('02-St-16-K2.dxf')) && ends.some(e => e.txt.endsWith('061-St-2-K1.dxf')),
    'на телефоне конец имени виден (…02-St-16-K1.dxf / …K2.dxf / …061-St-2-K1.dxf)');
  check(ends.every(e => !e.cut), 'на телефоне имена не обрезаются по краю (сокращены в середине)');
  await m.$eval('#resultsCard', e => e.scrollIntoView()); await m.screenshot({ path: '/tmp/claude-0/-home-claude/28b56914-0eb6-5dc5-acbf-324cc200c8bd/scratchpad/two-phone.png' });
  await b.close();
  console.log(fails ? 'ИТОГ: ошибок ' + fails : 'ИТОГ: все проверки пройдены'); process.exit(fails ? 1 : 0);
})();
