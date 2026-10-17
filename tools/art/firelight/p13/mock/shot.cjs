// Firelight · part 11: pictures of the mock screens. node shot.cjs <out> "<query>|w|h|dpr|name" ...   (query: s=..&v=..&lang=..)
//   frames: node shot.cjs <out> --frames "<query>|w|h|dpr|name" from to step   → name-0000.png ... (window.__at(ms))
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const PORT = process.env.PORT || 8811;
(async () => {
  const [,, out, ...rest] = process.argv;
  const b = await chromium.launch();
  const open = async (j) => {
    const [q, w, h, dpr, name] = j.split('|');
    const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
    if (/(^|&)rm=1/.test(q)) await p.emulateMedia({ reducedMotion: 'reduce' });
    p.on('pageerror', (e) => console.log('pageerror:', name, e.message));
    p.on('console', (m) => { if (m.type() === 'error') console.log('console:', name, m.text()); });
    await p.goto(`http://127.0.0.1:${PORT}/index.html?${q}`);
    try { await p.waitForFunction(() => window.__ready === true, null, { timeout: 40000 }); } catch (e) { console.log('timeout', name); }
    return [p, name];
  };
  if (rest[0] === '--frames') {
    const [, j, from, to, step] = rest; const [p, name] = await open(j); let k = 0;
    for (let t = +from; t <= +to; t += +step) { await p.evaluate((ms) => window.__at(ms), t); await p.screenshot({ path: `${out}/${name}-${String(k++).padStart(4, '0')}.png` }); }
    console.log(name, k); await p.close();
  } else {
    for (const j of rest) { const [p, name] = await open(j); await p.screenshot({ path: `${out}/${name}.png` }); console.log(name); await p.close(); }
  }
  await b.close();
})();
