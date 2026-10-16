/* Firelight · Pixel-Mart mock (design part 5): builds the shop's screens from assets/mart/fl/catalog.json with the game's CSS and
   fl-mart.css, so they can be shot at 375 x 812 and 1280 x 800 in EN and RU. ?s=home|cat|tryon|bundle|gift|season|profile|photo
   &cat=<category> &lang=en|ru. A reference for martui.ts, not the game. */
const Q = new URLSearchParams(location.search);
const L = Q.get('lang') || 'en', S = Q.get('s') || 'home', CAT = Q.get('cat') || 'looks', WIDE = innerWidth >= 900;
const A = '/assets/';
const [cat, STRS] = await Promise.all([fetch(A + 'mart/fl/catalog.json').then((r) => r.json()), fetch(A + 'mart/fl/strings.json').then((r) => r.json())]);
const T = STRS[L];
const tr = (k, n) => (T[k] || k).replace('{n}', n);
const by = Object.fromEntries(cat.items.map((i) => [i.sku, i]));
const nm = (i) => i.name[L];
const imgs = {};
const load = (src) => imgs[src] || (imgs[src] = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = A + src; }));
const el = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const k of kids) if (k != null) e.append(k); return e; };
const txt = (tag, cls, t) => { const e = el(tag, cls); e.textContent = t; return e; };

// ---- pixel drawing: whole multiples, nearest
function cv(w, h, s) { const c = document.createElement('canvas'); c.width = w * s; c.height = h * s; c.style.width = `${w * s}px`; c.style.height = `${h * s}px`;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
async function spr(src, sx, sy, sw, sh, s = 2) { const im = await load(src); const [c, g] = cv(sw, sh, s); if (im) g.drawImage(im, sx, sy, sw, sh, 0, 0, sw * s, sh * s); return c; }
async function whole(src, s = 2) { const im = await load(src); if (!im) return el('i'); return spr(src, 0, 0, im.width, im.height, s); }
/** An icon at the biggest whole scale that fits a box. */
async function fit(src, box = 32, max = 4) { const im = await load(src); if (!im) return el('i'); const s = Math.max(1, Math.min(max, Math.floor(box / Math.max(im.width, im.height)))); return spr(src, 0, 0, im.width, im.height, s); }
const HERO_SHEET = { warrior: 'warrior.png', mage: 'mage.png', rogue: 'rogue.png', ranger: 'ranger.png' };
const CLS = ['warrior', 'mage', 'rogue', 'ranger'];
const CLSN = { en: { warrior: 'Warrior', mage: 'Mage', rogue: 'Rogue', ranger: 'Huntress' }, ru: { warrior: 'Воин', mage: 'Маг', rogue: 'Разбойник', ranger: 'Охотница' } }[L];

/** A figure: a hero of a class in a look, with a hat, drawn at (x, y) = feet in a context at scale s. */
async function drawHero(g, s, x, y, o = {}) {
  const cls = o.cls || 'warrior'; const skin = o.skin ? by[`skin.${cls}.${o.skin}`] : null;
  const sheet = await load(skin ? skin.sheet : HERO_SHEET[cls]); const f = o.frame || 0, t = o.tier ?? 1;
  if (skin && skin.legendary) {     // the glow under and over, then the aura
    const gl = await load(skin.glow); g.save(); g.globalAlpha = 0.5; g.filter = `blur(${s * 1.5}px)`;
    g.drawImage(gl, f * 12, t * 15, 12, 15, (x - 6) * s, (y - 15) * s, 12 * s, 15 * s); g.restore();
  }
  g.drawImage(sheet, f * 12, t * 15, 12, 15, (x - 6) * s, (y - 15) * s, 12 * s, 15 * s);
  if (o.hat) { const h = by[`hat.${o.hat}`]; const hs = await load(h.sheets[cls]); g.drawImage(hs, f * 16, t * 22, 16, 22, (x - 8) * s, (y - 22) * s, 16 * s, 22 * s); }
  if (skin && skin.legendary) { const au = await load(skin.aura.sheet); g.drawImage(au, (o.k || 3) * 24, 0, 24, 28, (x - 12) * s, (y - 26) * s, 24 * s, 28 * s); }
}
async function drawPet(g, s, x, y, key, f = 0) {
  const p = by[`pet.${key}`]; const im = await load(p.sheet.file); const lift = p.fly ? 5 : 0;
  if (!p.fly) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect((x - 3) * s, (y) * s, 6 * s, s); }
  else { g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect((x - 2) * s, (y) * s, 4 * s, s); }
  g.drawImage(im, f * 12, 0, 12, 12, (x - 6) * s, (y - 11 - lift) * s, 12 * s, 12 * s);
}
/** The camp around the fire, the hero by it in what he wears: the try-on stage. crop in scene pixels. */
async function campScene(o, s, crop = [0, 80, 94, 84]) {
  const [c, g] = cv(crop[2], crop[3], s); const bg = await load('camp/camp-outdoor-summer.png');
  g.drawImage(bg, crop[0], crop[1], crop[2], crop[3], 0, 0, crop[2] * s, crop[3] * s);
  g.fillStyle = 'rgba(8,10,24,.38)'; g.fillRect(0, 0, c.width, c.height);   // night
  const P = (x, y) => [x - crop[0], y - crop[1]];
  const fire = by[`fire.${o.fire || 'classic'}`]; const [fx, fy] = P(24, 118);
  const grd = g.createRadialGradient(fx * s, (fy - 4) * s, 0, fx * s, (fy - 4) * s, 46 * s); grd.addColorStop(0, fire.light + 'aa'); grd.addColorStop(0.5, fire.light + '33'); grd.addColorStop(1, fire.light + '00');
  g.globalCompositeOperation = 'lighter'; g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over';
  const items = (o.decor || []).map((k) => by[`decor.${k}`]).sort((a, b) => a.place.feet[1] - b.place.feet[1]);
  const figs = [...items.map((d) => ({ y: d.place.feet[1], draw: async () => { const im = await load(d.sprite); const [x, y] = P(...d.place.feet); g.drawImage(im, 0, 0, im.width, im.height, Math.round(x - im.width / 2) * s, (y - im.height + 1) * s, im.width * s, im.height * s); } })),
    { y: 118, draw: async () => { const lg = await load(fire.logs); g.drawImage(lg, 0, 0, 16, 6, (fx - 8) * s, (fy - 4) * s, 16 * s, 6 * s);
      const fl = await load(fire.flame.sheet); g.drawImage(fl, (o.ff || 2) * 13, 0, 13, 17, (fx - 6) * s, (fy - 18) * s, 13 * s, 17 * s);
      const sp = await load(fire.sparks.sheet); for (const [dx, dy, k] of [[-3, -22, 1], [2, -26, 0], [4, -20, 2], [-1, -30, 3]]) g.drawImage(sp, k * 3, 0, 3, 3, (fx + dx) * s, (fy + dy) * s, 3 * s, 3 * s); } },
    { y: 119, draw: async () => {
      const [hx, hy] = P(50, 119);
      if (o.trail) { const tr_ = by[`trail.${o.trail}`]; const im = await load(tr_.sheet.file); for (const [dx, k] of [[10, 3], [6, 2], [2, 1]]) g.drawImage(im, k * 8, 0, 8, 8, (hx + dx - 4) * s, (hy - 6) * s, 8 * s, 8 * s); }
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect((hx - 4) * s, hy * s, 8 * s, s);
      await drawHero(g, s, hx, hy, o);
      if (o.pet) await drawPet(g, s, hx + 11, hy + 2, o.pet, o.pf || 0);
    } }];
  for (const f of figs.sort((a, b) => a.y - b.y)) await f.draw();
  return c;
}

// ---- card art per kind
async function art(i, s = 3) {
  const [c, g] = cv(48, 34, s === 3 ? 2 : s);
  switch (i.kind) {
    case 'skin': { const [c2, g2] = cv(24, 26, 4); await drawHero(g2, 4, 12, 25, { cls: i.heroClass, skin: i.skin, k: 4 }); return c2; }
    case 'fire': { const [c2, g2] = cv(16, 26, 3); const lg = await load(i.logs), fl = await load(i.flame.sheet);
      const grd = g2.createRadialGradient(24, 50, 0, 24, 50, 46); grd.addColorStop(0, i.light + '88'); grd.addColorStop(1, i.light + '00'); g2.fillStyle = grd; g2.fillRect(0, 0, 48, 78);
      g2.drawImage(lg, 0, 0, 16, 6, 0, 60, 48, 18); g2.drawImage(fl, 26, 0, 13, 17, 6, 12, 39, 51); return c2; }
    case 'hat': { const [c2, g2] = cv(16, 22, 4); await drawHero(g2, 4, 8, 22, { cls: Q.get('class') || 'warrior', hat: i.hat }); return c2; }
    case 'pet': { const [c2, g2] = cv(14, 14, 5); await drawPet(g2, 5, 7, 13, i.pet, 0); return c2; }
    case 'trail': { const [c2, g2] = cv(34, 9, 4); const im = await load(i.sheet.file); for (let k = 0; k < 4; k++) g2.drawImage(im, (3 - k) * 8, 0, 8, 8, (k * 8 + 1) * 4, 0, 32, 32); return c2; }
    case 'kill': return spr(i.sheet.file, 2 * 24, 0, 24, 24, 4);
    case 'death': return spr(i.sheet.file, 3 * 32, 0, 32, 32, 3);
    case 'digits': { const [c2, g2] = cv(40, 20, 3); const im = await load(i.sheet.file); const put = (str, x, y) => { for (const ch of str) { const k = i.sheet.glyphs.indexOf(ch); g2.drawImage(im, k * 7, 0, 7, 9, x * 3, y * 3, 21, 27); x += 6; } };
      put('-12', 1, 1); put('+8', 20, 10); return c2; }
    case 'quips': return whole(i.icon, 5);
    case 'decor': return fit(i.sprite, 92, 6);
    case 'frame': return face(i, 3);
    case 'title': return titlePlate(i);
    case 'name': { const d = txt('span', `fl-name ${i.css}`, L === 'ru' ? 'Кирилл' : 'Kirill'); return d; }
    case 'photoframe': return whole(i.sprite, 4);
    case 'stickers': { const d = el('div'); d.style.cssText = 'display:flex;gap:2px'; for (const k of i.items.slice(0, 3)) d.append(await whole(by[k].sprite, 3)); return d; }
    case 'sticker': return whole(i.sprite, 3);
    case 'bundle': return bundleArt(i, 2);
  }
  return c;
}
async function face(i, s = 3, who = 0) {
  const f = el('div', 'fl-face'); f.style.borderImageSource = `url(${A + i.sprite})`; f.style.borderWidth = f.style.borderImageWidth = `${4 * s}px`;
  const av = await spr('avatars.png', who * 24, 0, 24, 32, s >= 4 ? 2 : 1); f.append(av); return f;
}
function titlePlate(i) {
  const p = el('div', `fl-title-plate ${i.rarity}`); p.style.borderImageSource = `url(${A + i.plate})`;
  const ic = el('span'); whole(i.icon, 2).then((c) => ic.append(c)); p.append(ic, txt('span', '', nm(i))); return p;
}
async function bundleArt(b, s = 3) {
  const look = b.items.find((k) => k.startsWith('skin.')), hat = b.items.find((k) => k.startsWith('hat.')), pet = b.items.find((k) => k.startsWith('pet.')),
    fire = b.items.find((k) => k.startsWith('fire.')), trail = b.items.find((k) => k.startsWith('trail.')), decor = b.items.filter((k) => k.startsWith('decor.')).map((k) => by[k].decor);
  const L_ = look ? by[look] : null;
  return campScene({ cls: L_ ? L_.heroClass : 'warrior', skin: L_ ? L_.skin : null, hat: hat && by[hat].hat, pet: pet && by[pet].pet, fire: fire ? by[fire].fire : 'classic',
    trail: trail && trail.split('.')[1], decor }, s, [4, 92, 66, 40]);
}
function price(i, opt = {}) {
  if (opt.owned) return txt('span', 'fl-own', tr('owned'));
  if (!i.stars) return txt('span', 'fl-price', i.how ? (i.how.startsWith('season') ? tr('season1') : i.how === 'patron' ? '★' : tr('locked')) : tr('free'));
  const p = el('span', `fl-price${i.legendary || i.stars >= 500 ? ' legend' : ''}${opt.big ? ' big' : ''}`, el('i', 'fl-star'), String(i.stars));
  return p;
}
async function card(i, o = {}) {
  const c = el('div', `fl-card${i.legendary ? ' legendary' : ''}${o.selected ? ' selected' : ''}${o.owned ? ' owned' : ''}`);
  const a = el('div', 'fl-card-art'); a.append(await art(i));
  if (i.legendary) a.append(txt('span', 'pd-chip fl-legend-chip', tr('legendary')));
  else if (o.isNew) a.append(txt('span', 'pd-chip', tr('new')));
  c.append(a, txt('div', 'fl-card-name', nm(i)));
  const meta = el('div', 'fl-card-meta');
  if (i.kind === 'skin') meta.append(txt('span', '', CLSN[i.heroClass]));
  if (i.season && !o.owned) meta.append(txt('span', '', L === 'ru' ? 'Зима' : 'Winter'));
  meta.append(price(i, o)); c.append(meta); return c;
}

// ---- frame of the window
const app = document.getElementById('overlay');
const win = el('div', 'pd-window fl-mart');
function head(title, sub, back) {
  const h = el('div', 'fl-mart-head');
  if (back) h.append(el('button', 'pd-button quiet small fl-back', '<', txt('span', 'lbl', ' ' + tr('back'))));
  const t = el('div', 'pd-titles', txt('h2', 'pd-heading', title)); if (sub) t.append(txt('div', 'fl-motto', sub)); h.append(t);
  h.append(el('span', 'fl-balance', el('i', 'fl-star'), '340'), txt('button', 'fl-close', '×')); return h;
}
async function cats(current) {
  const n = el('nav', 'fl-cats');
  for (const c of cat.categories) { const b = el('button', `fl-cat${c.signature ? ' signature' : ''}`); if (c.id === current) b.setAttribute('aria-current', 'true');
    b.append(await fit(c.icon, 32, 2), c[L]); n.append(b); }
  return n;
}
async function seasonCard(compact = false) {
  const s = cat.season; const b = el('div', `fl-banner${compact ? ' compact' : ''}`); const [c, g] = cv(160, 60, WIDE ? 4 : 3); g.drawImage(await load(s.banner), 0, 0, 160 * (WIDE ? 4 : 3), 60 * (WIDE ? 4 : 3)); b.append(c);
  const t = el('div', 'fl-banner-text'); const gr = el('div', 'grow', txt('span', '', `${tr('season')} ${s.number} · ${tr('daysLeft', 41)}`), txt('b', '', s.name[L]));
  const xp = el('div', 'fl-xp', el('i')); xp.firstChild.style.width = '46%'; gr.append(xp, txt('span', '', `${tr('level')} 7 · ${tr('xp').replace('{a}', '460').replace('{b}', '1000')}`));
  t.append(gr); if (!compact) t.append(el('button', 'pd-button primary small', tr('pass'))); b.append(t); return b;
}
async function bundleCard(b, big = true) {
  const d = el('div', 'fl-bundle'); const a = el('div', 'fl-bundle-art'); a.append(await bundleArt(b, WIDE ? 3 : 2)); d.append(a);
  const info = el('div', 'fl-bundle-info', txt('span', 'fl-motto', tr('featured')), txt('b', '', b.name[L]));
  const its = el('div', 'fl-bundle-items');
  for (const k of b.items) { const i = by[k]; const m = el('div', 'fl-mini'); m.append(await fit(i.icon || i.sprite, 34, 3)); m.title = nm(i); its.append(m); }
  info.append(its);
  const buy = el('div', 'fl-bundle-buy', el('span', 'fl-price old', String(b.full)), el('span', 'fl-price big', el('i', 'fl-star'), String(b.stars)), txt('span', 'fl-save', tr('save', b.save)));
  buy.append(el('button', 'pd-button primary small', tr('buy'))); if (big) buy.append(el('button', 'pd-button small', tr('gift')));
  info.append(buy); d.append(info); if (!WIDE) { d.style.gridTemplateColumns = '1fr'; } return d;
}
const WORN = { cls: Q.get('class') || 'warrior', skin: Q.get('skin') || 'ember', hat: Q.get('hat') || 'tricorn', pet: Q.get('pet') || 'ember', fire: Q.get('fire') || 'blue', trail: Q.get('trail') || 'embers', decor: ['tent', 'lantern', 'woodpile', 'chest'] };
async function tryon(o = WORN, changed = 'skin') {
  const t = el('div', 'fl-tryon');
  const st = el('div', 'fl-tryon-stage'); const sc = WIDE ? 3 : 4;
  st.append(await campScene(o, sc, WIDE ? [8, 94, 100 - 8, 64] : [4, 90, 86, 70]));
  const sk = by[`skin.${o.cls}.${o.skin}`]; st.append(txt('div', 'fl-tryon-name', sk ? nm(sk) : CLSN[o.cls])); t.append(st);
  t.append(txt('div', 'fl-sec-head', null)); t.lastChild.append(txt('h3', '', tr('slots')));
  const slots = el('div', 'fl-slots');
  const SL = [['look', sk], ['hat', by[`hat.${o.hat}`]], ['pet', by[`pet.${o.pet}`]], ['fire', by[`fire.${o.fire}`]], ['trail', by[`trail.${o.trail}`]]];
  for (const [k, i] of SL) { const s = el('div', `fl-slot${(changed === k || (changed === 'skin' && k === 'look')) ? ' changed' : ''}`); const a = el('div', 'fl-slot-art');
    if (i) a.append(await fit(i.icon, 36, 4));
    s.append(a, txt('span', '', tr(k))); slots.append(s); }
  t.append(slots);
  const pick = Object.fromEntries(SL)[changed === 'skin' ? 'look' : changed] || sk;
  if (pick) t.append(el('div', 'fl-tryon-buy', el('button', 'pd-button primary', `${tr('buy')} `, el('span', 'fl-price', el('i', 'fl-star'), String(pick.stars))), el('button', 'pd-button', tr('gift'))));
  t.append(txt('p', 'fl-hint', tr('tryHint'))); return t;
}
const owned = new Set(['skin.warrior.moss', 'fire.classic', 'hat.straw', 'trail.embers', 'quips.pirate', 'frame.ember', 'title.kindler', 'name.ember', 'photo.polaroid', 'decor.lantern']);

async function grid(items, o = {}) { const g = el('div', 'fl-grid'); for (const i of items) g.append(await card(i, { owned: owned.has(i.sku), selected: o.sel === i.sku, isNew: o.isNew?.includes(i.sku) })); return g; }
function sec(title, more, ...kids) { const s = el('section', 'fl-sec'); const h = el('div', 'fl-sec-head', txt('h3', '', title)); if (more) h.append(txt('span', 'fl-more', more)); s.append(h, ...kids); return s; }

async function screen() {
  const body = el('div', 'fl-mart-body'); const main = el('div', 'fl-mart-main');
  if (S === 'home') {
    win.append(head(tr('title'), tr('motto')));
    body.append(await cats('home')); main.append(await seasonCard(), await bundleCard(cat.bundles[0]));
    const neu = ['skin.mage.starflame', 'fire.rainbow', 'pet.skull', 'hat.horns', 'kill.pillar', 'decor.musicbox', 'quips.robot', 'title.keeper'];
    main.append(sec(tr('new'), tr('seeAll'), await grid(neu.map((k) => by[k]).slice(0, WIDE ? 8 : 6), { isNew: neu })));
    const bl = el('div', 'fl-grid'); for (const b of cat.bundles.slice(1)) { const c = el('div', 'fl-card'); const a = el('div', 'fl-card-art'); a.append(await bundleArt(b, 2)); c.append(a, txt('div', 'fl-card-name', b.name[L]));
      c.append(el('div', 'fl-card-meta', txt('span', 'fl-save', tr('save', b.save)), el('span', 'fl-price', el('i', 'fl-star'), String(b.stars)))); bl.append(c); }
    main.append(sec(tr('bundles'), null, bl), txt('div', 'fl-cosmetic', tr('cosmetic')));
  } else if (S === 'cat') {
    const C = cat.categories.find((c) => c.id === CAT); win.append(head(tr('title'), C[L]));
    body.append(await cats(CAT));
    const items = cat.items.filter((i) => C.kinds.includes(i.kind) && i.kind !== 'sticker');
    if (CAT === 'looks') {
      const f = el('div', 'fl-filters'); for (const c of ['all', ...CLS]) { const b = txt('button', 'fl-filter', c === 'all' ? tr('allClasses') : CLSN[c]); if (c === (Q.get('class') || 'all')) b.setAttribute('aria-pressed', 'true'); f.append(b); }
      const cls = Q.get('class'); const list = items.filter((i) => !cls || i.heroClass === cls);
      main.append(f, sec(tr('legendary'), tr('animated'), await grid(list.filter((i) => i.legendary), { sel: `skin.${WORN.cls}.forgeborn` })));
      main.append(sec(C[L], tr('lookTiers'), await grid(list.filter((i) => !i.legendary), { sel: `skin.${WORN.cls}.${WORN.skin}` })));
    } else if (CAT === 'effects') {
      for (const [k, t] of [['trail', 'trails'], ['kill', 'kills'], ['death', 'deaths'], ['digits', 'digits']]) main.append(sec(tr(t), null, await grid(items.filter((i) => i.kind === k))));
    } else if (CAT === 'profile') {
      for (const [k, t] of [['frame', 'frame'], ['title', 'titleL'], ['name', 'nameColour']]) main.append(sec(tr(t), null, await grid(items.filter((i) => i.kind === k))));
    } else if (CAT === 'photo') {
      main.append(sec(tr('photoFrames'), null, await grid(items.filter((i) => i.kind === 'photoframe'))));
      const st = el('div', 'fl-grid'); st.append(await card(by['stickers.pack1'])); const all = el('div', 'fl-card'); const a = el('div', 'fl-card-art'); const w = el('div'); w.style.cssText = 'display:grid;grid-template-columns:repeat(6,auto);gap:2px';
      for (const i of cat.items.filter((i) => i.kind === 'sticker')) w.append(await whole(i.sprite, 2)); a.append(w); all.append(a, txt('div', 'fl-card-name', tr('stickers') + ' · 12')); st.append(all);
      main.append(sec(tr('stickers'), null, st));
    } else {
      const hint = { fires: 'fireHint', camp: 'decorHint', quips: 'quipHint' }[CAT]; if (hint) main.append(txt('p', 'fl-hint', tr(hint)));
      main.append(await grid(items, { sel: CAT === 'fires' ? `fire.${WORN.fire}` : CAT === 'hats' ? `hat.${WORN.hat}` : CAT === 'pets' ? `pet.${WORN.pet}` : '' }));
    }
    main.append(txt('div', 'fl-cosmetic', tr('cosmetic')));
  } else if (S === 'tryon') {
    win.append(head(tr('byFire'), tr('tryOn'), true)); main.append(await tryon());
    if (!WIDE) { main.append(sec(tr('look'), CLSN[WORN.cls], await grid(cat.items.filter((i) => i.kind === 'skin' && i.heroClass === WORN.cls).slice(0, 4), { sel: `skin.${WORN.cls}.${WORN.skin}` }))); body.append(main); win.append(body); return; }
    body.append(await cats('looks')); main.append(sec(tr('look'), null, await grid(cat.items.filter((i) => i.kind === 'skin' && i.heroClass === WORN.cls), { sel: `skin.${WORN.cls}.${WORN.skin}` })));
  } else if (S === 'bundle') {
    const b = cat.bundles[+(Q.get('b') || 0)]; win.append(head(b.name[L], tr('bundles'), true));
    const big = el('div', 'fl-tryon-stage'); big.append(await bundleArt(b, WIDE ? 5 : 5)); main.append(big);
    main.append(sec(tr('inBundle'), null, await grid(b.items.map((k) => by[k]))));
    main.append(el('div', 'fl-bundle-buy', txt('span', 'fl-motto', tr('total')), el('span', 'fl-price old', String(b.full)), el('span', 'fl-price big', el('i', 'fl-star'), String(b.stars)), txt('span', 'fl-save', tr('save', b.save))));
    main.append(el('div', 'fl-tryon-buy', el('button', 'pd-button primary', tr('buy')), el('button', 'pd-button', tr('gift'))), txt('p', 'fl-hint', tr('confirm')));
    if (!WIDE) { body.append(main); win.append(body); return; }
    body.append(await cats('home'));
  } else if (S === 'gift') {
    const i = by['skin.mage.starflame']; win.append(head(tr('giftTitle'), nm(i), true));
    const top = el('div', 'fl-bundle fl-gift-top'); const a = el('div', 'fl-card-art'); a.style.width = '120px'; a.append(await art(i)); top.append(a, el('div', 'fl-bundle-info', txt('b', '', nm(i)), txt('span', 'fl-motto', `${CLSN.mage} · ${tr('legendary')}`), price(i, { big: true })));
    main.append(top, el('div', 'fl-search', tr('search')));
    const fr = el('div', 'fl-friends'); const names = L === 'ru' ? [['Мира', 'глубина 18 · Маг'], ['Толя', 'глубина 9 · Воин'], ['Саша', 'глубина 24 · Охотница'], ['Глеб', 'глубина 4 · Разбойник']] : [['Mira', 'depth 18 · Mage'], ['Tolya', 'depth 9 · Warrior'], ['Sasha', 'depth 24 · Huntress'], ['Gleb', 'depth 4 · Rogue']];
    for (const [k, [n, d]] of names.entries()) { const r = el('div', 'fl-friend'); if (k === 0) r.setAttribute('aria-checked', 'true'); r.append(await spr('avatars.png', 24 * [1, 0, 3, 2][k], 0, 24, 32, 1), el('div', 'who', txt('b', '', n), txt('span', '', d)), el('i', 'fl-check')); fr.append(r); }
    main.append(sec(tr('friendsPlayed'), null, fr), sec(tr('giftNote'), null, txt('div', 'fl-note', tr('giftNotePh'))));
    main.append(el('div', 'fl-tryon-buy', el('button', 'pd-button primary', `${tr('giftSend')} `, el('span', 'fl-price', el('i', 'fl-star'), String(i.stars)))), txt('p', 'fl-hint', tr('giftMail')));
    if (!WIDE) { body.append(main); win.append(body); return; }
    body.append(await cats('looks'));
  } else if (S === 'season') {
    const s = cat.season; win.append(head(`${tr('pass')} · ${s.name[L]}`, `${tr('season')} ${s.number} · ${tr('daysLeft', 41)}`, true));
    main.append(await seasonCard(true));
    const tk = el('div', 'fl-track'); tk.append(txt('div', 'fl-track-label', L === 'ru' ? 'Ур.' : 'Lv'), txt('div', 'fl-track-label', tr('freeLine')), txt('div', 'fl-track-label paid', tr('paidLine')));
    const free = Object.fromEntries(s.free), paid = Object.fromEntries(s.paid);
    for (let lv = 1; lv <= 14; lv++) {
      tk.append(txt('div', `fl-lvl${lv < 7 ? ' done' : lv === 7 ? ' now' : ''}`, String(lv)));
      for (const [line, map] of [['free', free], ['paid', paid]]) {
        const sku = map[lv]; const r = el('div', `fl-reward ${line}${!sku ? ' empty' : ''}${sku && lv < 7 && line === 'free' ? ' claimed' : ''}${sku && lv <= 7 && line === 'free' && lv >= 6 ? ' ready' : ''}${sku && line === 'paid' ? ' locked' : ''}`);
        if (sku) { const i = by[sku]; const w = el('span', 'fl-rw', txt('small', '', nm(i)));
          if (line === 'free' && lv < 6) w.append(txt('small', 'st', tr('claimed'))); if (line === 'free' && lv === 6) w.append(txt('small', 'st', tr('claim')));
          r.append(i.kind === 'name' ? txt('span', `fl-name ${i.css}`, 'Aa') : await fit(i.icon || i.sprite, 40, 3), w); }
        tk.append(r);
      }
    }
    main.append(el('div', 'fl-bundle-buy', el('button', 'pd-button primary', `${tr('getPass')} `, el('span', 'fl-price', el('i', 'fl-star'), String(s.pass_stars))), txt('span', 'fl-hint', s.how[L])), sec(`${tr('freeLine')} · ${tr('paidLine')}`, null, tk));
    if (!WIDE) { body.append(main); win.append(body); return; }
    body.append(await cats('home'));
  } else if (S === 'profile') {
    win.append(head(tr('profileTitle'), tr('preview'), true));
    const fr = by['frame.stars'], ti = by['title.keeper'], nc = by['name.flame'];
    const pc = el('div', 'fl-profile-card', await face(fr, 4), el('div', 'who', txt('span', `fl-name ${nc.css}`, L === 'ru' ? 'Кирилл' : 'Kirill'), titlePlate(ti), txt('span', 'fl-motto', L === 'ru' ? 'Воин · рекорд: глубина 21' : 'Warrior · best: depth 21')));
    main.append(pc);
    const rows = el('div', 'fl-friends'); for (const [p, n, c, sc] of [[1, 'Sasha', 'gold', '48 210'], [2, L === 'ru' ? 'Кирилл' : 'Kirill', 'flame', '41 880'], [3, 'Mira', 'frost', '39 004']]) {
      const r = el('div', 'fl-board-row', txt('span', 'place', `#${p}`), await face(by[p === 2 ? 'frame.stars' : p === 1 ? 'frame.sunforge' : 'frame.frost'], 2, [3, 0, 1][p - 1]), txt('span', `fl-name-${c}`, n), txt('span', 'score', sc)); rows.append(r); }
    main.append(sec(L === 'ru' ? 'В рекордах дня' : 'On the daily board', null, rows));
    const fs = el('div', 'fl-swatches'); for (const i of cat.items.filter((i) => i.kind === 'frame')) { const b = el('button', 'fl-swatch'); if (i === fr) b.setAttribute('aria-pressed', 'true'); b.append(await face(i, 2)); fs.append(b); }
    const ts = el('div', 'fl-swatches'); for (const i of cat.items.filter((i) => i.kind === 'title').slice(0, WIDE ? 12 : 6)) ts.append(titlePlate(i));
    const ns = el('div', 'fl-swatches'); for (const i of cat.items.filter((i) => i.kind === 'name')) { const b = el('button', 'fl-swatch', txt('span', `fl-name ${i.css}`, nm(i))); if (i === nc) b.setAttribute('aria-pressed', 'true'); ns.append(b); }
    main.append(sec(tr('frame'), null, fs), sec(tr('titleL'), null, ts), sec(tr('nameColour'), null, ns));
    if (!WIDE) { body.append(main); win.append(body); return; }
    body.append(await cats('profile'));
  } else if (S === 'photo') {
    win.append(head(tr('photoTitle'), `${tr('photoFrames')} · ${tr('stickers')}`, true));
    const pf = by['photo.gilded']; const ed = el('div', 'fl-photo-edit'); const shot = el('div', 'fl-photo-shot'); shot.style.borderImageSource = `url(${A + pf.sprite})`;
    const sc = WIDE ? 6 : 3; shot.append(await campScene({ ...WORN, skin: 'starflame', cls: 'mage', hat: 'wizard', pet: 'firefly', fire: 'rainbow' }, sc, [6, 92, 72, 46]));
    for (const [k, x, y, s2] of [['crown', 60, 20, 3], ['fire', 150 * sc / 3, 70 * sc / 3, 3], ['gg', 20 * sc / 3 + 160, 96 * sc / 3, 3], ['heart', 10, 100 * sc / 3, 2]]) { const st = await whole(by[`sticker.${k}`].sprite, s2); st.className = 'fl-sticker'; st.style.left = `${x}px`; st.style.top = `${y}px`; shot.append(st); }
    ed.append(shot); main.append(ed, el('div', 'fl-tryon-buy', el('button', 'pd-button', L === 'ru' ? 'Сохранить' : 'Save'), el('button', 'pd-button primary', L === 'ru' ? 'В сторис' : 'To story')));
    const fs = el('div', 'fl-swatches'); for (const i of cat.items.filter((i) => i.kind === 'photoframe')) { const b = el('button', 'fl-swatch'); if (i === pf) b.setAttribute('aria-pressed', 'true'); b.append(await whole(i.sprite, 2)); fs.append(b); }
    const ss = el('div', 'fl-swatches'); for (const i of cat.items.filter((i) => i.kind === 'sticker')) { const b = el('button', 'fl-swatch'); b.append(await whole(i.sprite, 2)); ss.append(b); }
    main.append(sec(tr('photoFrames'), null, fs), sec(tr('stickers'), tr('stickerHint'), ss));
    if (!WIDE) { body.append(main); win.append(body); return; }
    body.append(await cats('photo'));
  }
  body.append(main);
  if (WIDE && ['home', 'cat'].includes(S)) { const side = el('aside', 'fl-aside'); side.append(await tryon(WORN, S === 'cat' ? { looks: 'skin', fires: 'fire', hats: 'hat', pets: 'pet', effects: 'trail' }[CAT] : 'skin')); body.append(side); }
  if (WIDE && S === 'gift') { const side = el('aside', 'fl-aside'); side.append(await tryon({ ...WORN, cls: 'mage', skin: 'starflame', hat: 'wizard', pet: 'firefly' })); body.append(side); }
  win.append(body);
}
await screen();
app.append(win);
for (const n of document.querySelectorAll('.fl-cats')) { const cur = n.querySelector('[aria-current]'); if (cur && !WIDE) n.scrollLeft = cur.offsetLeft - 24; }
await document.fonts.ready;
await Promise.all(Object.values(imgs));
window.__ready = true;
