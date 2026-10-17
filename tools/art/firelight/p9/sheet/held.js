/* Firelight · part 9 «the weapon in the hand»: the rules sheet. How the weapon is drawn (layers, the hand in every frame, the styles of
   blow), every weapon of PD 1.9.2a at its eight angles and in the hand, each class with five weapons, and the Pixel-Mart looks and hats.
   ?p=rule|weapons|classes|looks &lang=en|ru */
const Q = new URLSearchParams(location.search); const L = Q.get('lang') || 'en', P = Q.get('p') || 'rule', WIDE = innerWidth >= 900;
const H = await (await fetch('assets/weapons/held/held.json')).json();
const T = {
  en: { title: 'The weapon in the hand', sub: 'PD 1.9.2a weapons held by the hero · side, front, back · camera 70°', side: 'side', front: 'front', back: 'back',
    how: 'How it is drawn', howText: ['The weapon is a second small picture at the hand, frame by frame. Its cell is 17 × 17 with the grip at the middle pixel; the hero\'s hand pixel is under it, and the grip is left clear, so the hand (in any look) closes round the handle.', 'Four layers: the weapon <b>behind</b> (a raised blade behind the head), the body, the hat, the weapon <b>in front</b>. The hand is always on top of the costume.', 'Eight angles, 0° up the screen, clockwise. Two are drawn (straight and diagonal) in the item\'s own palette; the six others are exact quarter turns, never resampled. The side view mirrors the whole with the hero.', 'Put away in the tomb (8–12), operate (16–17) and read (19–20). Every other frame holds it in that frame\'s hand.'],
    layers: ['behind', 'body', 'hat', 'in front', 'together'], cell: 'cell 17 × 17, grip (8, 8)',
    hands: 'The hand in every frame', handsText: 'The same for every class and armour tier (PD\'s shared body); where a tier leaves the pixel clear the nearest pixel of the body is used. From the side it is the forward hand; from the front and the back the arm that strikes. ✕ — no weapon.',
    styles: 'The blow by style', stylesText: 'Frames 0 (holding), 13 (wind-up), 14 (the blow, with its trail), 15 (back). Forward from the front is down the screen, from the back up it: a thrust goes at the camera or away from it.',
    style: { slash: 'slash', blunt: 'blunt', stab: 'stab', staff: 'staff', throw: 'throw', fist: 'fist' },
    styleText: { slash: 'swords, the axe, the glaive: raised, cut down across, a trail along the arc', blunt: 'mace, war hammer, pickaxe: raised high, brought straight down', stab: 'dagger, spear: drawn back, thrust along itself', staff: 'quarterstaff: held upright, swung and jabbed', throw: 'stones, shuriken, tomahawk, javelin, boomerang: raised at 13, gone from the hand at 14', fist: 'knuckleduster: on the fist; the punch is PD\'s own' },
    angles: 'Eight angles', reach: 'px from the hand', item: 'item', held: 'in the hand', trails: 'trails', weapons: 'All weapons of PD 1.9.2a', weaponsText: 'In the palette of each item picture (items.png); 4–12 px long in the hand of a 12 × 15 hero.',
    classes: 'Each class with five weapons', looks: 'Looks and hats', looksText: 'The weapon over a Pixel-Mart look and under nothing: the hand stays the body\'s own colour, a raised weapon passes over the hat. The legendary aura stays behind.',
    cls: { warrior: 'Warrior', mage: 'Mage', rogue: 'Rogue', ranger: 'Huntress' } },
  ru: { title: 'Оружие в руке', sub: 'оружие PD 1.9.2a в руке героя · бок, спереди, со спины · камера 70°', side: 'бок', front: 'спереди', back: 'со спины',
    how: 'Как оно рисуется', howText: ['Оружие — вторая маленькая картинка у кисти, кадр за кадром. Клетка 17 × 17, рукоять в среднем пикселе; под ним пиксель руки героя, а сама рукоять прозрачна — рука (в любом облике) обхватывает её.', 'Четыре слоя: оружие <b>за телом</b> (поднятый клинок за головой), тело, шапка, оружие <b>перед телом</b>. Рука всегда поверх костюма.', 'Восемь углов, 0° — вверх по экрану, по часовой. Нарисованы два (прямо и по диагонали) в палитре своего предмета; остальные шесть — точные повороты на четверть, без пересчёта пикселей. Сбоку всё отражается вместе с героем.', 'Убрано в кадрах гибели (8–12), действия (16–17) и чтения (19–20). В остальных кадрах — в руке этого кадра.'],
    layers: ['за телом', 'тело', 'шапка', 'перед телом', 'вместе'], cell: 'клетка 17 × 17, рукоять (8, 8)',
    hands: 'Кисть в каждом кадре', handsText: 'Одна для всех классов и рядов брони (общее тело PD); если в каком-то ряду этот пиксель пуст, берётся ближайший пиксель тела. Сбоку — передняя рука, спереди и со спины — та, что бьёт. ✕ — без оружия.',
    styles: 'Удар по типу оружия', stylesText: 'Кадры 0 (держит), 13 (замах), 14 (удар со следом), 15 (возврат). Вперёд для вида спереди — вниз по экрану, для вида со спины — вверх: выпад идёт в камеру или от неё.',
    style: { slash: 'рубящее', blunt: 'дробящее', stab: 'колющее', staff: 'посох', throw: 'метательное', fist: 'кастет' },
    styleText: { slash: 'мечи, топор, глефа: замах, удар наискось, след по дуге', blunt: 'булава, молот, кирка: высоко вверх и прямо вниз', stab: 'кинжал, копьё: отвести назад и выпад вдоль оружия', staff: 'боевой посох: держит стоймя, взмах и тычок', throw: 'камни, сюрикен, томагавк, метательное копьё, бумеранг: поднят в кадре 13, из руки уходит в 14', fist: 'кастет: на кулаке, удар — собственный кадр PD' },
    angles: 'Восемь углов', reach: 'px от кисти', item: 'предмет', held: 'в руке', trails: 'след', weapons: 'Всё оружие PD 1.9.2a', weaponsText: 'В палитре картинки каждого предмета (items.png); в руке героя 12 × 15 — от 4 до 12 px.',
    classes: 'Каждый класс с пятью видами оружия', looks: 'Облики и шапки', looksText: 'Оружие поверх облика Пиксель-Марта: рука остаётся цвета тела, поднятое оружие проходит поверх шапки. Аура легендарного облика остаётся позади.',
    cls: { warrior: 'Воин', mage: 'Маг', rogue: 'Разбойник', ranger: 'Охотница' } },
}[L];
const NAME = {
  en: { knuckles: 'knuckleduster', dagger: 'dagger', shortSword: 'short sword', sword: 'sword', longsword: 'longsword', quarterstaff: 'quarterstaff', spear: 'spear', mace: 'mace', battleAxe: 'battle axe', warHammer: 'war hammer', glaive: 'glaive', pickaxe: 'pickaxe', dart: 'throwing stone', curare: 'stunning rock', incendiary: 'fire flint', javelin: 'javelin', shuriken: 'shuriken', tomahawk: 'tomahawk', boomerang: 'boomerang' },
  ru: { knuckles: 'кастет', dagger: 'кинжал', shortSword: 'короткий меч', sword: 'меч', longsword: 'длинный меч', quarterstaff: 'боевой посох', spear: 'копьё', mace: 'булава', battleAxe: 'боевой топор', warHammer: 'боевой молот', glaive: 'глефа', pickaxe: 'кирка', dart: 'метательный камень', curare: 'оглушающий булыжник', incendiary: 'огненный кремень', javelin: 'метательное копьё', shuriken: 'сюрикен', tomahawk: 'томагавк', boomerang: 'бумеранг' },
}[L];
const SET = { warrior: ['sword', 'longsword', 'battleAxe', 'warHammer', 'pickaxe'], mage: ['quarterstaff', 'mace', 'glaive', 'dagger', 'knuckles'],
  rogue: ['shortSword', 'shuriken', 'tomahawk', 'curare', 'incendiary'], ranger: ['boomerang', 'spear', 'javelin', 'dart', 'shortSword'] };
const FAC = ['side', 'front', 'back'], M = 9, CW = 12 + 2 * M, CH = 15 + 2 * M;
const imgs = {}; const img = (src) => imgs[src] || (imgs[src] = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = 'assets/' + src; }));
const el = (t, c, ...k) => { const e = document.createElement(t); if (c) e.className = c; for (const x of k) if (x != null) e.append(x); return e; };
const html = (t, c, s) => { const e = el(t, c); e.innerHTML = s; return e; };
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.style.width = w + 'px'; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#121310'; g.fillRect(0, 0, w, h); return [c, g]; }
function label(g, s, x, y, col = '#7a8173', px = 11, align = 'left') { g.font = `${px}px G9`; g.fillStyle = col; g.textAlign = align; g.fillText(s, x, y); }
const card = (title, sm, ...kids) => el('div', 'card', el('h2', '', title, sm ? el('small', '', sm) : null), ...kids);
const PARTS = (n, k) => WIDE ? [[0, n]] : Array.from({ length: Math.ceil(n / k) }, (_, i) => [i * k, Math.min(n, (i + 1) * k)]);
const LEG = ['forgeborn', 'starflame', 'smoulder', 'wildfire'];
const bodyPath = (cls, fc, look) => look ? `mart/fl/${LEG.includes(look) ? 'legendary' : 'looks'}/${cls}-${look}${fc === 'side' ? '' : '-' + fc}.png` : (fc === 'side' ? `${cls}.png` : `dirs/${cls}-${fc}.png`);

/** A hero frame with its weapon, in a cell with M pixels of margin: [layers] picks what is drawn (for the layer strip). */
async function figure(cls, fc, tier, frame, kind, { look, hat, flip, layers = 'bhtf', attack = true } = {}) {
  const c = document.createElement('canvas'); c.width = CW; c.height = CH; const g = c.getContext('2d');
  const W = kind && H.weapons[kind]; const pose = W ? H.poses[W.style][fc][attack ? 'attack' : 'hold'][frame] : null; const hand = W ? H.hands[cls][fc][tier][frame] : null;
  const ws = W ? await img(W.sheet) : null;
  const weapon = (layer) => {
    if (!pose || !hand || pose.l !== layer) return; const col = H.angles.indexOf(pose.a), x = M + hand[0] + pose.dx - 8, y = M + hand[1] + pose.dy - 8;
    g.drawImage(ws, col * 17, 0, 17, 17, x, y, 17, 17); if (pose.trail) g.drawImage(ws, FAC.indexOf(fc) * 17, 17, 17, 17, x, y, 17, 17);
  };
  if (layers.includes('b')) weapon('back');
  if (layers.includes('h')) { const b = await img(bodyPath(cls, fc, look)); if (b) g.drawImage(b, frame * 12, tier * 15, 12, 15, M, M, 12, 15); }
  if (hat && layers.includes('t')) { const hs = await img(`mart/fl/hats/${cls}-${hat}${fc === 'side' ? '' : '-' + fc}.png`); if (hs) g.drawImage(hs, frame * 16, tier * 22, 16, 22, M - 2, M - 7, 16, 22); }
  if (layers.includes('f')) weapon('front');
  if (!flip) return c;
  const m = document.createElement('canvas'); m.width = CW; m.height = CH; const mg = m.getContext('2d'); mg.translate(CW, 0); mg.scale(-1, 1); mg.drawImage(c, 0, 0); return m;
}
const put = (g, src, x, y, s) => g.drawImage(src, 0, 0, src.width, src.height, x, y, src.width * s, src.height * s);

async function rule() {
  // the layers of one frame, and the cell
  const s = WIDE ? 4 : 2; const panels = [['back', 14, 'b', 0], ['back', 14, 'ht', 1], ['back', 14, 'bhtf', 4], ['side', 13, 'ht', 1], ['side', 13, 'f', 3], ['side', 13, 'bhtf', 4]];
  const strips0 = [];
  for (const [a, b] of PARTS(6, 3)) {
    const [c, g] = cv((b - a) * (CW * s + 6) + 10 + (WIDE ? 14 : 0), CH * s + 22);
    for (let i = a; i < b; i++) { const [fc, f, p, li] = panels[i]; const x = 6 + (i - a) * (CW * s + 6) + (i >= 3 && WIDE ? 14 : 0);
      put(g, await figure('warrior', fc, 1, f, 'longsword', { hat: 'crown', layers: p }), x, 4, s); label(g, `${T.layers[li]}`, x + CW * s / 2, c.height - 6, li === 4 ? '#ffcc66' : '#b0b5a3', 12, 'center'); }
    strips0.push(el('div', 'strip', c));
  }
  const [c2, g2] = cv(17 * (WIDE ? 8 : 6) + 20, 17 * (WIDE ? 8 : 6) + 26); const s2 = WIDE ? 8 : 6;
  const ws = await img('weapons/held/sword.png'); g2.drawImage(ws, 17, 0, 17, 17, 10, 6, 17 * s2, 17 * s2);
  g2.strokeStyle = '#3b3e36'; for (let i = 0; i <= 17; i++) { g2.beginPath(); g2.moveTo(10 + i * s2, 6); g2.lineTo(10 + i * s2, 6 + 17 * s2); g2.stroke(); g2.beginPath(); g2.moveTo(10, 6 + i * s2); g2.lineTo(10 + 17 * s2, 6 + i * s2); g2.stroke(); }
  g2.strokeStyle = '#ff9a3a'; g2.lineWidth = 2; g2.strokeRect(10 + 8 * s2, 6 + 8 * s2, s2, s2); label(g2, T.cell, 10, c2.height - 6, '#b0b5a3', 11);
  const ul = el('ul'); for (const t of T.howText) ul.append(html('li', '', t));
  const row = el('div', 'row', ...strips0, el('div', 'strip', c2)); app.append(card(T.how, 'weapons/held/held.json', ul, row));
  // the hand in every frame
  const strips = []; const s3 = WIDE ? 3 : 2;
  for (const [a, b] of PARTS(21, 9)) {
    const [c3, g3] = cv((b - a) * 14 * s3 + 60, (15 * s3 + 8) * 3 + 20);
    for (const [r, fc] of FAC.entries()) {
      label(g3, T[fc], 4, 10 + r * (15 * s3 + 8) + 15 * s3 / 2 + 4, fc === 'side' ? '#b0b5a3' : '#ffcc66', 12);
      const sh = await img(bodyPath('warrior', fc));
      for (let f = a; f < b; f++) {
        const x = 60 + (f - a) * 14 * s3, y = 6 + r * (15 * s3 + 8); g3.drawImage(sh, f * 12, 15, 12, 15, x, y, 12 * s3, 15 * s3);
        const h = H.hands.warrior[fc][1][f];
        if (h) { g3.strokeStyle = '#ff5a3a'; g3.lineWidth = 2; g3.strokeRect(x + h[0] * s3 - 1, y + h[1] * s3 - 1, s3 + 2, s3 + 2); }
        else label(g3, '✕', x + 6 * s3, y + 15 * s3 + 2, '#7a8173', 11, 'center');
      }
    }
    for (let f = a; f < b; f++) label(g3, String(f), 60 + (f - a) * 14 * s3 + 6 * s3, c3.height - 4, '#7a8173', 10, 'center');
    strips.push(el('div', 'strip', c3));
  }
  app.append(card(T.hands, 'held.json → hands', html('p', '', T.handsText), ...strips));
  // the styles
  const REP = { slash: ['warrior', 'sword'], blunt: ['warrior', 'warHammer'], stab: ['ranger', 'spear'], staff: ['mage', 'quarterstaff'], throw: ['ranger', 'boomerang'], fist: ['rogue', 'knuckles'] };
  const grid = el('div', 'grid2'); const s4 = WIDE ? 3 : 2;
  for (const [st, [cls, k]] of Object.entries(REP)) {
    const fr = [0, 13, 14, 15]; const [c4, g4] = cv(fr.length * (CW * s4 + 4) + 50, 3 * (CH * s4 - 10 * s4) + 26);
    for (const [r, fc] of FAC.entries()) for (const [i, f] of fr.entries()) put(g4, await figure(cls, fc, 1, f, k), 46 + i * (CW * s4 + 4), r * (CH * s4 - 10 * s4) - 4 * s4 + 4, s4);
    for (const [r, fc] of FAC.entries()) label(g4, T[fc], 2, 14 + r * (CH * s4 - 10 * s4) + CH * s4 / 2 - 10, fc === 'side' ? '#b0b5a3' : '#ffcc66', 11);
    for (const [i, f] of fr.entries()) label(g4, String(f), 46 + i * (CW * s4 + 4) + CW * s4 / 2, c4.height - 4, '#7a8173', 10, 'center');
    grid.append(el('div', 'card', el('h2', '', T.style[st], el('small', '', NAME[k])), html('p', '', T.styleText[st]), el('div', 'strip', c4)));
  }
  app.append(html('h2', '', T.styles), html('p', '', T.stylesText), grid);
}

async function weapons() {
  app.append(html('p', '', T.weaponsText)); const grid = el('div', 'grid2'); const s = WIDE ? 3 : 2;
  const items = await img('items.png');
  for (const [k, W] of Object.entries(H.weapons)) {
    const ws = await img(W.sheet); const ang = [];
    for (const [a, b] of PARTS(8, 4)) {
      const [c, g] = cv(16 * s + (b - a) * 17 * s + 38, 17 * s + 20); ang.push(el('div', 'strip', c));
      if (a === 0) { g.drawImage(items, (W.item % 8) * 16, Math.floor(W.item / 8) * 16, 16, 16, 12, 4 + s, 16 * s, 16 * s); label(g, T.item, 12 + 8 * s, c.height - 2, '#7a8173', 11, 'center'); }
      for (let i = a; i < b; i++) { g.drawImage(ws, i * 17, 0, 17, 17, 32 + 16 * s + (i - a) * 17 * s, 4, 17 * s, 17 * s); label(g, H.angles[i] + '°', 32 + 16 * s + (i - a) * 17 * s + 17 * s / 2, c.height - 2, '#7a8173', 11, 'center'); }
    }
    const [c2, g2] = cv(6 * (CW * s - 6 * s) + 10, CH * s - 2 * s);
    const views = [['side', 0], ['front', 0], ['back', 0], ['side', 14], ['front', 14], ['back', 14]];
    for (const [i, [fc, f]] of views.entries()) put(g2, await figure(k === 'boomerang' || W.style === 'throw' ? 'ranger' : 'warrior', fc, 1, f === 14 && W.style === 'throw' ? 13 : f, k), 4 + i * (CW * s - 6 * s) - 3 * s, -2 * s, s);
    grid.append(el('div', 'card', el('h2', '', NAME[k], el('small', '', `${W.kind} · ${T.style[W.style]} · ${W.reach} ${T.reach}`)), ...ang, el('div', 'strip', c2)));
  }
  app.append(grid);
}

async function classes() {
  for (const cls of (Q.get('cls') ? [Q.get('cls')] : ['warrior', 'mage', 'rogue', 'ranger'])) {
    const s = WIDE ? 3 : 2; const strips = []; const step = CW * s - (WIDE ? 3 : 6) * s, gap = WIDE ? 10 : 4;
    for (const k of SET[cls]) {
      for (const fr of (WIDE ? [[0, 13, 14, 15]] : [[0, 13], [14, 15]])) {
        const [c, g] = cv(fr.length * (3 * step + gap) + 6, CH * s - 4 * s + 18);
        for (const [fi, f] of fr.entries()) for (const [j, fc] of FAC.entries()) put(g, await figure(cls, fc, 1, f, k), 4 + fi * (3 * step + gap) + j * step - 2 * s, -4 * s, s);
        label(g, `${NAME[k]} · ${fr.join(' · ')}`, 6, c.height - 4, '#ffcc66', 12);
        strips.push(el('div', 'strip', c));
      }
    }
    app.append(card(T.cls[cls], `${T.side} · ${T.front} · ${T.back}`, ...strips));
  }
}

async function looks() {
  app.append(html('p', '', T.looksText)); const s = WIDE ? 3 : 2; const grid = el('div', 'grid2');
  const rows = [['warrior', 'forgeborn', 'crown', 'longsword'], ['mage', 'starflame', 'wizard', 'quarterstaff'], ['rogue', 'smoulder', 'tricorn', 'dagger'], ['ranger', 'wildfire', 'wreath', 'boomerang'],
    ['warrior', 'ember', 'horns', 'battleAxe'], ['mage', 'frost', 'halo', 'glaive'], ['rogue', 'moss', 'bandana', 'shortSword'], ['ranger', 'dusk', 'straw', 'spear']];
  for (const [cls, look, hat, k] of rows) {
    const fr = WIDE ? [0, 13, 14] : [0, 14]; const [c, g] = cv(fr.length * 3 * (CW * s - 8 * s) + 12, CH * s - 4 * s);
    for (const [fi, f] of fr.entries()) for (const [j, fc] of FAC.entries()) put(g, await figure(cls, fc, 1, f, k, { look, hat }), 6 + (fi * 3 + j) * (CW * s - 8 * s) - 4 * s, -4 * s, s);
    grid.append(el('div', 'card', el('h2', '', `${T.cls[cls]} · ${look}`, el('small', '', `${hat} · ${NAME[k]}`)), el('div', 'strip', c)));
  }
  app.append(grid);
}

const app = document.getElementById('app');
app.append(el('div', 'top', el('h1', '', { rule: T.title, weapons: T.weapons, classes: T.classes, looks: T.looks }[P]), el('span', '', T.sub)));
await document.fonts.load('12px G9'); await document.fonts.load('20px G11');
await ({ rule, weapons, classes, looks })[P]();
await document.fonts.ready; await Promise.all(Object.values(imgs)); window.__ready = true;
