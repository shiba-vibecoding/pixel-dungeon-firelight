const { chromium } = require('playwright');
(async () => {
  const [,, out, ...jobs] = process.argv;  // jobs: page?query,w,h,dpr,full,name
  const b = await chromium.launch();
  for (const j of jobs) {
    const [q, w, h, dpr, full, name] = j.split(',');
    const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
    p.on('pageerror', e => console.log('pageerror:', e.message));
    p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
    await p.goto('http://127.0.0.1:8765/' + q);
    await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: full === '1' });
    const sh = await p.evaluate(() => document.documentElement.scrollHeight);
    console.log(name, sh);
    await p.close();
  }
  await b.close();
})();
