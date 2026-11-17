// Подача тестовой папки в «запасной способ» с точными размерами и датами (без Playwright-загрузки).
module.exports = async function feed(page, side, root, list) {
  await page.evaluate(({ side, root, list }) => {
    const files = list.map(([name, size, m]) => {
      const f = new File([new Uint8Array(size)], name, { lastModified: m });
      Object.defineProperty(f, 'webkitRelativePath', { value: root + '/' + name });
      return f;
    });
    const inp = document.querySelector(`#side-${side} [data-f="dirinput"]`);
    Object.defineProperty(inp, 'files', { configurable: true, value: files });
    inp.dispatchEvent(new Event('change'));
  }, { side, root, list });
};
