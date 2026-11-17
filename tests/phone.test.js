// Автотест раскладки для телефона и ПК. Нужны: локальный сервер приложения на :8765 и тестовые папки A/Proj, B/Proj.
const { chromium, devices } = require('playwright');
let fails = 0; const check = (c, m) => { console.log((c ? '  OK   ' : '  FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['телефон 393×851', { width: 393, height: 851 }], ['узкий телефон 360×780', { width: 360, height: 780 }]]) {
    console.log(name);
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(400);
    const hdr = await p.$eval('header', e => e.getBoundingClientRect().height);
    const h1 = await p.$eval('header h1', e => e.getBoundingClientRect());
    const mb = await p.$eval('#menuBtn', e => e.getBoundingClientRect());
    check(hdr < 56 && Math.abs((h1.top + h1.height / 2) - (mb.top + mb.height / 2)) < 12, 'шапка в одну строку (высота ' + Math.round(hdr) + ' px), меню рядом с названием');
    check(mb.right <= vp.width, 'кнопка меню в пределах экрана');
    check((await p.textContent('header h1')) === 'Сравнение папок и файлов', 'название приложения в шапке полностью');
    const noHScroll = async () => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check(await noHScroll(), 'нет горизонтальной прокрутки страницы');
    const btns = await p.$$eval('#side-A .row:first-of-type button', els => els.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.width]; }));
    check(btns.every(([l, r]) => l >= 0 && r <= vp.width), 'кнопки стороны A в пределах экрана');
    await p.click('#menuBtn'); const mr = await p.$eval('#menu', e => e.getBoundingClientRect());
    check(mr.left >= 0 && mr.right <= vp.width, 'меню открывается в пределах экрана'); await p.click('#menuBtn');
    await p.setInputFiles('#side-A [data-f="dirinput"]', '/tmp/claude-0/-home-claude/28b56914-0eb6-5dc5-acbf-324cc200c8bd/scratchpad/A/Proj'); await p.setInputFiles('#side-B [data-f="dirinput"]', '/tmp/claude-0/-home-claude/28b56914-0eb6-5dc5-acbf-324cc200c8bd/scratchpad/B/Proj'); await p.waitForTimeout(400);
    await p.click('#viewSeg [data-v="list"]'); await p.check('#onlyDiff'); await p.waitForTimeout(150);
    const rows = await p.$$eval('#vcontent .vr.f', els => els.slice(0, 4).map(e => { const r = e.getBoundingClientRect(); const nm = e.querySelector('.nm').getBoundingClientRect(); const st = e.querySelector('.stc').getBoundingClientRect();
      return { h: Math.round(r.height), twoLines: st.top > nm.top + 5, fits: r.right <= window.innerWidth + 1, txt: e.innerText.replace(/\s+/g, ' ') }; }));
    rows.forEach(r => console.log('       строка:', r.txt, '| высота', r.h));
    check(rows.length > 0 && rows.every(r => r.h === 52 && r.twoLines && r.fits), 'строки таблицы в два яруса (имя / статус, размеры, разница), в пределах экрана');
    check(await noHScroll(), 'после сравнения нет горизонтальной прокрутки');
    await p.$eval('#resultsCard', e => e.scrollIntoView()); await p.screenshot({ path: '/tmp/claude-0/-home-claude/28b56914-0eb6-5dc5-acbf-324cc200c8bd/scratchpad/phone-' + vp.width + '-res.png' });
    await p.click('#settingsCard summary'); await p.waitForTimeout(100);
    check(await noHScroll(), 'настройки открыты — нет горизонтальной прокрутки');
    await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: '/tmp/claude-0/-home-claude/28b56914-0eb6-5dc5-acbf-324cc200c8bd/scratchpad/phone-' + vp.width + '-top.png' });
    check(errs.length === 0, 'ошибок нет' + (errs.length ? ': ' + errs : ''));
    await ctx.close();
  }
  // ПК: шапка и таблица как раньше
  console.log('ПК 1400×900');
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); await p.goto('http://localhost:8765/'); await p.waitForTimeout(300);
  check((await p.textContent('#menuBtn')).includes('Меню'), 'на ПК кнопка «☰ Меню» с подписью');
  await p.setInputFiles('#side-A [data-f="dirinput"]', '/tmp/claude-0/-home-claude/28b56914-0eb6-5dc5-acbf-324cc200c8bd/scratchpad/A/Proj'); await p.setInputFiles('#side-B [data-f="dirinput"]', '/tmp/claude-0/-home-claude/28b56914-0eb6-5dc5-acbf-324cc200c8bd/scratchpad/B/Proj'); await p.waitForTimeout(300);
  await p.click('#viewSeg [data-v="list"]'); await p.waitForTimeout(100);
  check(await p.isVisible('.vhead.h1'), 'на ПК заголовок таблицы виден');
  check(await p.$eval('#vcontent .vr.f', e => Math.round(e.getBoundingClientRect().height)) === 28, 'на ПК строки в одну линию (28 px)');
  check(await p.isVisible('#vcontent .vr.f .da'), 'на ПК даты A и B показаны');
  await b.close();
  console.log(fails ? 'ИТОГ: ошибок ' + fails : 'ИТОГ: все проверки пройдены'); process.exit(fails ? 1 : 0);
})();
