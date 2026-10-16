const { chromium } = require('playwright');
(async () => {
  const [,, out, ...jobs] = process.argv;  // page?query,w,h,dpr,full,name
  const b = await chromium.launch();
  for (const j of jobs) {
    const [q, w, h, dpr, full, name] = j.split(',');
    const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
    p.on('pageerror', e => console.log('pageerror:', name, e.message));
    p.on('console', m => { if (m.type() === 'error') console.log('console:', name, m.text()); });
    await p.goto('http://127.0.0.1:8790/' + q);
    try { await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }); } catch (e) { console.log('timeout', name); }
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: full === '1' });
    console.log(name);
    await p.close();
  }
  await b.close();
})();
