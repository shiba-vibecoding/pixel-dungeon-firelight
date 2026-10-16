// usage: node shots.js <url> <outDir> <lang> <w> <h> [scenes]
const { chromium } = require('playwright');
const fs = require('fs');
const [,, url, out, lang = 'ru', W = '375', H = '812', only = ''] = process.argv;
fs.mkdirSync(out, { recursive: true });
const PRESET = { 'pd-hints': 'off', 'pd-coach-done': '1', 'pd-moved': '1', 'pd-seen-help': '1', 'pd-seen-version': '99.0', 'pd-launches': '5', 'pd-home-asked': '1', 'pd-notify-asked': '1', 'pd-sound': 'off', 'pd-fx': 'full', 'pd-name': 'Hero', 'pd-class': 'warrior' };
const wait = (p, ms) => p.waitForTimeout(ms);
async function play(p) { await p.click('.pd-actions .pd-button.primary'); await p.waitForFunction(() => window.__pd?.session?.world, null, { timeout: 15000 }); await wait(p, 1500); await p.evaluate(() => { const v = window.__pd.view; v.depthCard = null; }); await wait(p, 800); }
async function give(p) {
  await p.evaluate(() => { const { session, core } = window.__pd; const h = session.world.heroes[0];
    for (const [k, q, l] of [['potion.healing', 2, 0], ['scroll.upgrade', 1, 0], ['wand.magicMissile', 1, 1], ['weapon.mace', 1, 1], ['armor.mail', 1, 0], ['food.ration', 2, 0], ['missile.dart', 6, 0], ['ring.accuracy', 1, 2], ['seed.firebloom', 2, 0]]) { try { h.items.push(core.createItem(k, q, l)); } catch (e) { console.log('item', k, e.message); } }
    h.gold = 320; session.generation++; });
}
async function quip(p, loud) {
  await p.evaluate(({ loud, ru }) => {
    const { camera } = window.__pd; const h = window.__pd.session.world.heroes[0]; const c = document.getElementById('game'); const r = c.width / c.clientWidth;
    const x = ((h.pos % 48) * 16 + 8 - camera.x) * camera.zoom / r, y = (Math.floor(h.pos / 48) * 16 - camera.y) * camera.zoom / r;
    const n = document.createElement('div'); n.className = 'pd-quip pop' + (loud ? ' loud' : ''); const b = document.createElement('div'); b.className = 'pd-quip-body';
    b.textContent = loud ? (ru ? '«Ловушка?! Да чтоб тебя, тупая плитка!»' : '«A trap?! Damn you, stupid tile!»') : (ru ? '«Одной крысой меньше. Остальные в очередь.»' : '«One rat less. The rest, form a queue.»');
    n.append(b); document.getElementById('ui').append(n);
    const w = n.offsetWidth, hh = n.offsetHeight; n.style.transform = `translate(${Math.round(x - w / 2)}px, ${Math.round(y - hh - 6)}px)`;
  }, { loud, ru: lang === 'ru' }); await wait(p, 900);
}
const S = {
  quip: async (p) => { await play(p); await p.evaluate(() => window.__pd.play(400)); await quip(p, false); },
  loud: async (p) => { await play(p); await p.evaluate(() => window.__pd.play(400)); await quip(p, true); },
  photo: async (p) => { await play(p); await p.evaluate(() => window.__pd.play(400)); await p.evaluate((ru) => {
      const ui = document.getElementById('ui'); const c = document.getElementById('game'); c.classList.add('fl-filter-warm');
      const root = document.createElement('div'); root.className = 'fl-photo';
      root.innerHTML = `<div class="fl-photo-frame"><span class="fl-photo-caption">${ru ? 'Глубина 1 · Канализация' : 'Depth 1 · Sewers'}</span><span class="fl-photo-mark"></span></div>
        <div class="fl-photo-bar"><div class="fl-filters">${[['none', ru ? 'Без' : 'None'], ['warm', ru ? 'Тепло' : 'Warm'], ['noir', ru ? 'Нуар' : 'Noir'], ['dream', ru ? 'Сон' : 'Dream']].map(([k, n]) => `<button class="fl-filter ${k}" aria-pressed="${k === 'warm'}">${n}</button>`).join('')}</div>
        <div class="fl-photo-actions"><button class="pd-button save">${ru ? 'Сохранить' : 'Save'}</button><button class="pd-button primary story">${ru ? 'В сторис' : 'To story'}</button></div></div>`;
      [...document.getElementById('ui').children].forEach((n) => n.style.visibility = 'hidden');
      document.querySelector('.pd-log') && (document.querySelector('.pd-log').style.visibility = 'hidden');
      document.querySelectorAll('.pd-mapctl').forEach((n) => n.style.visibility = 'hidden');
      ui.append(root);
      const btn = document.createElement('button'); btn.className = 'fl-photo-btn'; btn.style.cssText = 'position:absolute;right:12px;top:calc(50% - 22px);z-index:60'; ui.append(btn);
    }, lang === 'ru'); await wait(p, 500); },
  bagfx: async (p) => { await play(p); await give(p); await wait(p, 300); await p.click('.pd-tool.bag'); await wait(p, 800);
    await p.evaluate((ru) => {
      const w = document.querySelector('.pd-window.bag'); const slots = [...w.querySelectorAll('.pd-slot')];
      const freeze = (n, cls, t, sel) => { n.classList.add(cls); n.style.setProperty('--age', '0'); };
      const st = document.createElement('style');
      st.textContent = `.pd-window.bag .pd-slot.charging::after{animation-delay:-.22s!important;animation-play-state:paused!important}
        .pd-window.bag .pd-slot.fx-equip::before{animation-delay:-.15s!important;animation-play-state:paused!important}
        .pd-window.bag .drop-ok{animation-play-state:paused!important;animation-delay:-.32s!important}
        .pd-window.bag .pd-float{animation-play-state:paused!important;animation-delay:-.2s!important}
        .pd-window.bag .pd-float::before{animation-play-state:paused!important;animation-delay:-.15s!important}`;
      document.head.append(st);
      slots[6].classList.add('charging'); slots[1].classList.add('fx-equip');
      w.classList.add('dragging'); [slots[2], slots[3], slots[17]].forEach((n) => n && n.classList.add('drop-ok'));
      const body = w.querySelector('.pd-bag-body') || w;
      const r0 = body.getBoundingClientRect();
      for (const [i, txt] of [[9, '+1'], [12, ru ? 'опознано' : 'identified']]) {
        const r = slots[i].getBoundingClientRect(); const f = document.createElement('span'); f.className = 'pd-float'; f.textContent = txt;
        f.style.left = (r.left - r0.left + r.width / 2) + 'px'; f.style.top = (r.top - r0.top - 10) + 'px'; body.append(f);
      }
    }, lang === 'ru'); await wait(p, 400); },

  camp: async (p) => { await wait(p, 600); },
  game: async (p) => { await play(p); await give(p); await p.evaluate(() => window.__pd.play(600)); await wait(p, 600); },
  bag: async (p) => { await play(p); await give(p); await wait(p, 300); await p.click('.pd-tool.bag'); await wait(p, 900); },
  item: async (p) => { await play(p); await give(p); await wait(p, 300); await p.click('.pd-tool.bag'); await wait(p, 700); const s = await p.$$('.pd-bag .pd-item, .pd-window .pd-slot, .pd-window .pd-item'); if (s[3]) await s[3].click(); await wait(p, 800); },
  hero: async (p) => { await play(p); await wait(p, 300); await p.click('.pd-avatar-wrap'); await wait(p, 800); },
  menu: async (p) => { await play(p); await wait(p, 300); const m = await p.$('.pd-menu:not([hidden])'); if (m && await m.isVisible()) await m.click(); else await p.click('.pd-mapbtn.menu'); await wait(p, 800); },
  prefs: async (p) => { await wait(p, 300); await p.click('.pd-camp-icon.prefs'); await wait(p, 900); },
  ranks: async (p) => { await wait(p, 300); await p.click('.pd-camp-icon.ranks'); await wait(p, 900); },
  guide: async (p) => { await wait(p, 300); const b = await p.$$('.pd-actions .pd-button'); await b[b.length - 1].click(); await wait(p, 900); },
  news: async (p) => { await p.evaluate(() => window.__release.news()); await wait(p, 900); },
  death: async (p) => { await play(p); await p.evaluate(() => { const { session } = window.__pd; const h = session.world.heroes[0]; h.hp = 1; h.poison = 30; session.generation++; });
    for (let i = 0; i < 6; i++) { await p.evaluate(() => window.__pd.session.send({ type: 'search' })); await wait(p, 500); }
    await wait(p, 3500); },
};
(async () => {
  const b = await chromium.launch();
  for (const name of (only ? only.split(',') : Object.keys(S))) {
    const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 2, hasTouch: +W < 800 });
    await ctx.addInitScript(() => { let a = 20261016; Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
    await ctx.addInitScript((pr) => { if (!sessionStorage.getItem('p')) { for (const [k, v] of Object.entries(pr)) localStorage.setItem(k, v); sessionStorage.setItem('p', '1'); } }, PRESET);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${url}?lang=${lang}`); await p.waitForSelector('.pd-camp', { timeout: 20000 }); await wait(p, 1500);
    try { await S[name](p); await p.screenshot({ path: `${out}/${name}.png` }); console.log('ok', name, errs.slice(0, 1).join('')); }
    catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); await p.screenshot({ path: `${out}/${name}-fail.png` }); }
    await ctx.close();
  }
  await b.close();
})();
