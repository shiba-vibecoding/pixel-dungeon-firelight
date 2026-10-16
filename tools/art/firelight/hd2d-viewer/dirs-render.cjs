// Firelight part 8: frames of the facings in 3D. usage:
//   node dirs-render.cjs shot out_dir "r,w,h,dpr,query,name" ...          one picture per job
//   node dirs-render.cjs walk out_prefix "r,w,h,dpr,query" from to step     the walk round the loop, frame by frame (window.__frame)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const PORT = process.env.PORT || 8765;   // the viewer's own server (npm run serve)
(async () => {
  const [,, mode, out, ...rest] = process.argv;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (j) => {
    const [r, w, h, dpr, q] = j.split(',');
    const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
    p.on('pageerror', (e) => console.log('pageerror:', e.message));
    await p.goto(`http://127.0.0.1:${PORT}/index.html?r=${r}&${(q || '').replace(/;/g, '&')}`);
    await p.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
    return p;
  };
  if (mode === 'shot') {
    for (const j of rest) { const p = await open(j); const name = j.split(',')[5]; await p.screenshot({ path: `${out}/${name}.png` }); console.log(name); await p.close(); }
  } else {
    const [j, from, to, step] = rest; const p = await open(j); let k = 0;
    for (let t = +from; t < +to; t += +step) { await p.evaluate((ms) => window.__frame(ms), t); await p.screenshot({ path: `${out}-${String(k++).padStart(4, '0')}.png` }); }
    console.log(out, k);
  }
  await b.close();
})();
