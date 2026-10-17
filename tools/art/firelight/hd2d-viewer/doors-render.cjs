// Firelight part 10: pictures of doors.html. usage:
//   node doors-render.cjs shot <out_dir> "w,h,dpr,query,name" ...      one picture per job
//   node doors-render.cjs anim <out_prefix> "w,h,dpr,query" from to step  a run of frames (window.__frame(ms))
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const PORT = process.env.PORT || 8765;
(async () => {
  const [,, mode, out, ...rest] = process.argv;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (j) => {
    const [w, h, dpr, q] = j.split(',');
    const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
    p.on('pageerror', (e) => console.log('pageerror:', e.message));
    await p.goto(`http://127.0.0.1:${PORT}/doors.html?${(q || '').replace(/;/g, '&')}`);
    await p.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
    return p;
  };
  if (mode === 'shot') {
    for (const j of rest) { const p = await open(j); const name = j.split(',')[4]; await p.screenshot({ path: `${out}/${name}.png` }); console.log(name); await p.close(); }
  } else {
    const [j, from, to, step] = rest; const p = await open(j); let k = 0;
    for (let t = +from; t < +to; t += +step) { await p.evaluate((ms) => window.__frame(ms), t); await p.screenshot({ path: `${out}-${String(k++).padStart(4, '0')}.png` }); }
    console.log(out, k);
  }
  await b.close();
})();
