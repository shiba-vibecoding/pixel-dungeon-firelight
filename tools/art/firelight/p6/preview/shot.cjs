// Firelight · part 6: screenshots of the effect sheets and the boss cards.
// usage: node shot.cjs out_dir "page?query,w,h,dpr,full(0|1),name" ...   (the preview served on 127.0.0.1:8792, `npm run serve`)
// boss.html takes b=goo|tengu|dm300|king|yog, lang=en|ru and t=<ms> (the card frozen at that moment of its entrance; none = settled).
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const [,, out, ...jobs] = process.argv;
  const b = await chromium.launch();
  for (const j of jobs) {
    const [q, w, h, dpr, full, name] = j.split(',');
    const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
    p.on('pageerror', (e) => console.log('pageerror:', name, e.message));
    await p.goto('http://127.0.0.1:8792/' + q);
    try { await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }); } catch (e) { console.log('timeout', name); }
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: full === '1' });
    console.log(name);
    await p.close();
  }
  await b.close();
})();
