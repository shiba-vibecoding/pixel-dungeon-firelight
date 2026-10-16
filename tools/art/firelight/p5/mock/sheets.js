/* Firelight · Pixel-Mart art sheets (design part 5): every item's in-game look, frame by frame. ?p=looks|legendary|fires|hats|pets|effects|small &lang= */
const Q = new URLSearchParams(location.search);
const L = Q.get('lang') || 'en', P = Q.get('p') || 'looks', WIDE = innerWidth >= 900;
const A = '/assets/';
const cat = await fetch(A + 'mart/fl/catalog.json').then((r) => r.json());
const by = Object.fromEntries(cat.items.map((i) => [i.sku, i]));
const nm = (i) => i.name[L];
const imgs = {};
const load = (src) => imgs[src] || (imgs[src] = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = A + src; }));
const el = (tag, cls, ...kids) => { const e = document.createElement(tag); if (cls) e.className = cls; for (const k of kids) if (k != null) e.append(k); return e; };
const txt = (tag, cls, t) => { const e = el(tag, cls); e.textContent = t; return e; };
function cv(w, h, s) { const c = document.createElement('canvas'); c.width = w * s; c.height = h * s; c.style.width = `${w * s}px`; c.style.height = `${h * s}px`; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; }
async function crop(src, x, y, w, h, s, bg) { const im = await load(src); const [c, g] = cv(w, h, s); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); } if (im) g.drawImage(im, x, y, w, h, 0, 0, w * s, h * s); return c; }
const CLS = ['warrior', 'mage', 'rogue', 'ranger'];
const T = {
  en: { looks: 'Hero looks', legendary: 'Legendary looks', fires: 'Campfire styles', hats: 'Hats and accessories', pets: 'Pets', effects: 'Effects', small: 'Quips, camp, profile, photo',
    base: 'original', tiers: 'one look, every armour tier (rows) and every frame: idle, run, tomb, attack, operate', glow: 'glow mask', aura: 'aura, 8 frames',
    flame: 'flame 6 · logs · sparks 4', hatsOn: 'on the four heroes', hatFrames: 'one hat through every tier and frame (it rests on the tomb)', idle: 'idle 0-3', walk: 'walk 4-7',
    trails: 'Footstep trails · 4 frames', kills: 'Kill effects · 6 frames', deaths: 'Death effects · 8 frames', digits: 'Damage numbers', quips: 'Quip packs', decor: 'Camp decorations',
    frames: 'Profile frames', titles: 'Titles', names: 'Name colours', photo: 'Photo frames', stickers: 'Stickers', cls: { warrior: 'Warrior', mage: 'Mage', rogue: 'Rogue', ranger: 'Huntress' } },
  ru: { looks: 'Облики героев', legendary: 'Легендарные облики', fires: 'Стили костра', hats: 'Шапки и аксессуары', pets: 'Питомцы', effects: 'Эффекты', small: 'Реплики, Привал, профиль, фото',
    base: 'оригинал', tiers: 'один облик на всех уровнях брони (ряды) и во всех кадрах: стоит, бежит, могила, удар, действие', glow: 'маска свечения', aura: 'аура, 8 кадров',
    flame: 'пламя 6 · поленья · искры 4', hatsOn: 'на четырёх героях', hatFrames: 'одна шапка на всех уровнях и кадрах (на могиле лежит сверху)', idle: 'стоит 0-3', walk: 'идёт 4-7',
    trails: 'Следы · 4 кадра', kills: 'Эффекты победы · 6 кадров', deaths: 'Эффекты гибели · 8 кадров', digits: 'Цифры урона', quips: 'Наборы реплик', decor: 'Украшения Привала',
    frames: 'Рамки профиля', titles: 'Титулы', names: 'Цвета имени', photo: 'Рамки фото', stickers: 'Наклейки', cls: { warrior: 'Воин', mage: 'Маг', rogue: 'Разбойник', ranger: 'Охотница' } } }[L];
const page = el('div', 'sh-page');
const cell = (c, label, sub) => { const d = el('div', 'sh-cell', c); if (label) d.append(txt('b', '', label)); if (sub) d.append(txt('span', '', sub)); return d; };
const sec = (h, sub, ...kids) => { const s = el('section', 'sh-sec', el('h3', '', h, sub ? txt('span', '', sub) : null)); s.append(...kids); return s; };
const row = (...kids) => el('div', 'sh-row', ...kids);
const S = WIDE ? 1 : 0;

if (P === 'looks') {
  const keys = ['moss', 'frost', 'ember', 'dusk', 'brass'];
  for (const c of CLS) {
    const r = row(cell(await crop(`${c}.png`, 0, 15, 12, 15, 4), T.base));
    for (const k of keys) { const i = by[`skin.${c}.${k}`]; r.append(cell(await crop(i.sheet, 0, 15, 12, 15, 4), nm(i), `${i.stars}★`)); }
    page.append(sec(T.cls[c], null, r));
  }
  page.append(sec(nm(by['skin.warrior.ember']), T.tiers, el('div', 'sh-wide', await crop(by['skin.warrior.ember'].sheet, 0, 0, 216, 105, WIDE ? 4 : 1))));
} else if (P === 'legendary') {
  for (const c of CLS) {
    const i = cat.items.find((x) => x.legendary && x.heroClass === c);
    const r = row(cell(await crop(i.sheet, 0, 15, 12, 15, 4), nm(i), `${i.stars}★`), cell(await crop(i.glow, 0, 15, 12, 15, 4, '#000'), T.glow));
    const au = await crop(i.aura.sheet, 0, 0, 192, 28, WIDE ? 3 : 1, '#0e0f0c'); r.append(cell(au, T.aura));
    r.append(cell(await crop(i.sheet, 0, 0, 216, 105, WIDE ? 2 : 1), T.tiers.split(':')[0]));
    page.append(sec(`${T.cls[c]} · ${nm(i)}`, null, r));
  }
} else if (P === 'fires') {
  const r = el('div', 'sh-grid');
  for (const i of cat.items.filter((x) => x.kind === 'fire')) {
    const [c, g] = cv(40, 34, WIDE ? 4 : 3); const bg = await load('camp/camp-outdoor-summer.png'); g.drawImage(bg, 4, 92, 40, 34, 0, 0, c.width, c.height);
    const s = WIDE ? 4 : 3; g.fillStyle = 'rgba(8,10,24,.35)'; g.fillRect(0, 0, c.width, c.height);
    const grd = g.createRadialGradient(20 * s, 22 * s, 0, 20 * s, 22 * s, 24 * s); grd.addColorStop(0, i.light + 'aa'); grd.addColorStop(1, i.light + '00'); g.globalCompositeOperation = 'lighter'; g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over';
    g.drawImage(await load(i.logs), 0, 0, 16, 6, 12 * s, 22 * s, 16 * s, 6 * s); g.drawImage(await load(i.flame.sheet), 26, 0, 13, 17, 14 * s, 8 * s, 13 * s, 17 * s);
    const sp = await load(i.sparks.sheet); for (const [dx, dy, k] of [[17, 4, 1], [22, 1, 0], [24, 6, 2]]) g.drawImage(sp, k * 3, 0, 3, 3, dx * s, dy * s, 3 * s, 3 * s);
    const strip_ = el('div', 'sh-strip', await crop(i.flame.sheet, 0, 0, 78, 17, 2), await crop(i.logs, 0, 0, 16, 6, 2), await crop(i.sparks.sheet, 0, 0, 12, 3, 3));
    r.append(el('div', 'sh-card', c, txt('b', '', nm(i)), txt('span', '', i.stars ? `${i.stars}★ · ${i.light}` : i.light), strip_));
  }
  page.append(sec(T.fires, T.flame, r));
} else if (P === 'hats') {
  const hats = cat.items.filter((x) => x.kind === 'hat');
  for (const c of CLS) { const r = row(); for (const h of hats) { const [cc, g] = cv(16, 22, 3); g.drawImage(await load(`${c}.png`), 0, 15, 12, 15, 2 * 3, 7 * 3, 36, 45); g.drawImage(await load(h.sheets[c]), 0, 22, 16, 22, 0, 0, 48, 66); r.append(cell(cc, c === 'warrior' ? nm(h) : null)); } page.append(sec(T.cls[c], c === 'warrior' ? T.hatsOn : null, r)); }
  const h = by['hat.tricorn']; const [cc, g] = cv(16 * 18, 22 * 7, WIDE ? 2 : 1); const s = WIDE ? 2 : 1; const sh = await load('warrior.png'), ov = await load(h.sheets.warrior);
  for (let t = 0; t < 7; t++) for (let f = 0; f < 18; f++) { g.drawImage(sh, f * 12, t * 15, 12, 15, (f * 16 + 2) * s, (t * 22 + 7) * s, 12 * s, 15 * s); g.drawImage(ov, f * 16, t * 22, 16, 22, f * 16 * s, t * 22 * s, 16 * s, 22 * s); }
  page.append(sec(nm(h), T.hatFrames, el('div', 'sh-wide', cc)));
} else if (P === 'pets') {
  const r = el('div', 'sh-grid');
  for (const p of cat.items.filter((x) => x.kind === 'pet')) r.append(el('div', 'sh-card', await crop(p.sheet.file, 0, 0, 96, 12, WIDE ? 3 : 2, '#14150f'), txt('b', '', nm(p)), txt('span', '', `${p.stars}★ · ${T.idle} · ${T.walk}${p.fly ? ' · fly' : ''}`)));
  page.append(sec(T.pets, null, r));
} else if (P === 'effects') {
  const g1 = el('div', 'sh-grid'); for (const i of cat.items.filter((x) => x.kind === 'trail')) g1.append(el('div', 'sh-card', await crop(i.sheet.file, 0, 0, 32, 8, 4, '#14150f'), txt('b', '', nm(i)), txt('span', '', `${i.stars}★`)));
  const g2 = el('div', 'sh-grid'); for (const i of cat.items.filter((x) => x.kind === 'kill')) g2.append(el('div', 'sh-card', await crop(i.sheet.file, 0, 0, 144, 24, WIDE ? 2 : 1, '#14150f'), txt('b', '', nm(i)), txt('span', '', `${i.stars}★`)));
  const g3 = el('div', 'sh-grid'); for (const i of cat.items.filter((x) => x.kind === 'death')) g3.append(el('div', 'sh-card', await crop(i.sheet.file, 0, 0, 256, 32, 1, '#14150f'), txt('b', '', nm(i)), txt('span', '', `${i.stars}★`)));
  const g4 = el('div', 'sh-grid'); for (const i of cat.items.filter((x) => x.kind === 'digits')) g4.append(el('div', 'sh-card', await crop(i.sheet.file, 0, 0, 91, 9, WIDE ? 3 : 2, '#14150f'), txt('b', '', nm(i)), txt('span', '', `${i.stars}★`)));
  page.append(sec(T.trails, null, g1), sec(T.kills, null, g2), sec(T.deaths, null, g3), sec(T.digits, null, g4));
} else if (P === 'small') {
  const r1 = row(); for (const i of cat.items.filter((x) => x.kind === 'quips')) r1.append(cell(await crop(i.icon, 0, 0, 16, 16, 4), nm(i)));
  const r2 = row(); for (const i of cat.items.filter((x) => x.kind === 'decor')) { const im = await load(i.sprite); r2.append(cell(await crop(i.sprite, 0, 0, im.width, im.height, im.height > 18 ? 2 : 3), nm(i))); }
  const r3 = row(); for (const i of cat.items.filter((x) => x.kind === 'frame')) r3.append(cell(await crop(i.sprite, 0, 0, 14, 14, 4), nm(i)));
  const r4 = row(); for (const i of cat.items.filter((x) => x.kind === 'title')) { const d = el('div', 'sh-title'); d.style.borderImageSource = `url(${A + i.plate})`; d.append(await crop(i.icon, 0, 0, 9, 9, 2), txt('span', '', nm(i))); r4.append(d); }
  const r5 = row(); for (const i of cat.items.filter((x) => x.kind === 'name')) { const s = txt('span', 'sh-name', nm(i)); if (i.color.startsWith('linear')) { s.style.backgroundImage = i.color; s.style.webkitBackgroundClip = 'text'; s.style.backgroundClip = 'text'; s.style.color = 'transparent'; s.style.textShadow = 'none'; } else s.style.color = i.color; r5.append(s); }
  const r6 = row(); for (const i of cat.items.filter((x) => x.kind === 'photoframe')) r6.append(cell(await crop(i.sprite, 0, 0, 24, 24, 3), nm(i)));
  const r7 = row(); for (const i of cat.items.filter((x) => x.kind === 'sticker')) r7.append(cell(await crop(i.sprite, 0, 0, 16, 16, 3)));
  page.append(sec(T.quips, null, r1), sec(T.decor, null, r2), sec(T.frames, null, r3), sec(T.titles, null, r4), sec(T.names, null, r5), sec(T.photo, null, r6), sec(T.stickers, null, r7));
}
const head = el('div', 'sh-head', txt('h1', '', T[P]), txt('span', '', 'Pixel-Mart · Firelight · ' + (L === 'ru' ? 'часть 5' : 'part 5')));
document.getElementById('app').append(head, page);
await document.fonts.ready; await Promise.all(Object.values(imgs)); window.__ready = true;
