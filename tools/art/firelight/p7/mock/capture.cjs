// Firelight part 7: frames of the animated cards for the GIF previews. usage: node capture.cjs out_prefix "page?query" w h dpr selector index from to step   -> out_prefix-0000.png ...
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
(async () => {
  const [,, out, q, w, h, dpr, sel, idx, from, to, step] = process.argv;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
  p.on('pageerror', (e) => console.log('pageerror:', e.message));
  await p.goto('http://127.0.0.1:8793/' + q + '&still=1');
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await p.waitForTimeout(900);   // the window's own entrance
  const box = await p.evaluate(([s, i]) => { const r = document.querySelectorAll(s)[+i].getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, [sel, idx]);
  let k = 0;
  for (let t = +from; t < +to; t += +step) { await p.evaluate((tt) => window.__setTime(tt), t); await p.screenshot({ path: `${out}-${String(k++).padStart(4, '0')}.png`, clip: box }); }
  console.log(out, k, 'frames'); await b.close();
})();
