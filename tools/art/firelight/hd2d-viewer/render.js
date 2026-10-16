// usage: node render.js out_dir [list of "r,boss,w,h"]
const { chromium } = require('playwright');
(async () => {
  const [,, out, ...jobs] = process.argv;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const j of jobs) {
    const [r, boss, w, h, dpr = '1', extra = ''] = j.split(',');
    const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 300)); });
    p.on('pageerror', e => console.log('pageerror:', e.message));
    const t0 = Date.now();
    await p.goto(`http://127.0.0.1:8765/index.html?r=${r}&boss=${boss}${extra ? '&' + extra.replace(/;/g, '&') : ''}`);
    await p.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    await p.waitForTimeout(200);
    const names = ['sewers', 'prison', 'caves', 'city', 'halls'];
    const f = `${out}/${names[r]}${boss === '1' ? '-boss' : ''}-${w}x${h}.png`;
    await p.screenshot({ path: f });
    console.log(f, Date.now() - t0, 'ms');
    await p.close();
  }
  await b.close();
})();
