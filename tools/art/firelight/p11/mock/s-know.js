// Part 11 · 3. What the player knows: the collection of kinds, the bestiary, the chronicle of the run.
import { BAG, C, cap, css, el, figure, gi, hero, itemIcon, mk, name, NOTES, PHONE, Q, RU, scene, slot, T, windowOn, world } from './kit.js';

const short = (kind) => C.t.items[kind].replace(/^(Potion|Scroll|Wand|Ring) of (the )?/, '').replace(/^(Зелье|Свиток|Палочка|Кольцо) /, '');
const BOOKS = [
  ['potion', T('Potions', 'Зелья'), (l) => `${C.t.colors[l]}`],
  ['scroll', T('Scrolls', 'Свитки'), (l) => C.SCROLL_RUNES[l]],
  ['ring', T('Rings', 'Кольца'), (l) => C.t.gems[l]],
  ['wand', T('Wands', 'Палочки'), (l) => C.t.woods[l]],
];
/** Kinds whose look the player has met this run (the client keeps it: what was picked up, seen on the floor, in a shop). */
const SEEN = new Set(['potion.healing', 'potion.strength', 'potion.mindVision', 'potion.frost', 'potion.experience', 'potion.liquidFlame', 'potion.toxicGas',
  'scroll.upgrade', 'scroll.identify', 'scroll.mapping', 'scroll.removeCurse', 'scroll.teleportation', 'scroll.enchantment', 'scroll.lullaby',
  'ring.accuracy', 'ring.evasion', 'ring.detection', 'wand.lightning', 'wand.firebolt', 'wand.magicMissile']);
const USED = { 'potion.healing': T('drunk ×3', 'выпито ×3'), 'potion.strength': T('drunk ×4', 'выпито ×4'), 'potion.liquidFlame': T('thrown ×1', 'брошено ×1'), 'potion.toxicGas': T('on the floor, 6', 'на полу, гл. 6') };
const tabs = (on) => el('div', 'pd-tabs fl-book-tabs', ...BOOKS.map(([c, nm]) => {
  const b = C.catalog(world, c, C.ITEMS ? Object.keys(C.ITEMS) : []);
  const n = el('button', 'pd-tab', PHONE ? itemIcon(world, mk({ potion: 'potion.healing', scroll: 'scroll.identify', ring: 'ring.accuracy', wand: 'wand.lightning' }[c])) : nm, el('small', '', `${b.known}/${b.entries.length}`));
  n.setAttribute('aria-selected', String(c === on)); return n;
}));

export async function catalog(v) {
  const ui = scene({ xp: 'A', dim: true });
  const c = Q.get('c') || 'potion';
  const [, nm, look] = BOOKS.find((b) => b[0] === c);
  const book = C.catalog(world, c, Object.keys(C.ITEMS));
  const guess = (kind) => NOTES.get(kind);
  const entries = book.entries;
  const seen = entries.filter((e) => SEEN.has(e.kind)).length;
  const count = el('p', 'fl-count-line', gi('catalog', 16, 2), el('span', '', T('known', 'опознано'), ' ', el('b', '', `${book.known} / ${entries.length}`)), '·', el('span', '', T('met', 'встречено'), ' ', el('b', '', seen)));
  let body;
  if (v === 'A') {
    body = el('div', 'fl-shelf');
    for (const e of entries) {
      const s = SEEN.has(e.kind), g = guess(e.kind);
      const cls = e.known ? 'known' : g ? 'guess' : s ? '' : 'unseen';
      const it = mk(e.kind);
      const cell = el('div', `fl-shelf-cell ${cls}`, el('div', 'pd-slot', itemIcon(world, it)), el('span', 'nm', e.known ? short(e.kind) : g ? g : s ? (e.label !== null ? look(e.label) : short(e.kind)) : '???'));
      if (g) cell.querySelector('.pd-slot').append(gi('note', 8, 2));
      body.append(cell);
    }
  } else if (v === 'B') {
    body = el('div', 'fl-booklist');
    for (const e of entries.filter((x) => SEEN.has(x.kind)).concat(entries.filter((x) => !SEEN.has(x.kind)))) {
      const s = SEEN.has(e.kind), g = guess(e.kind);
      const it = mk(e.kind);
      const lookName = e.label !== null ? `${cap(look(e.label))}` : '—';
      body.append(el('div', 'fl-bookrow', el('div', 'pd-slot', s ? itemIcon(world, it) : ''),
        el('div', '', el('div', `what${e.known ? '' : g ? ' guess' : ' none'}`, e.known ? short(e.kind) : g ? `${g}` : s ? T('not known yet', 'пока неизвестно') : '???'), el('div', 'look', s ? lookName : T('not met', 'не встречено'))),
        el('div', 'meta', USED[e.kind] ?? (hero.items.some((x) => x.kind === e.kind) ? T('in the pack', 'в рюкзаке') : ''))));
    }
  } else {
    const looks = entries.filter((e) => SEEN.has(e.kind) && !e.known);
    const kinds = C.stillPossible(world, c, Object.keys(C.ITEMS));
    body = css(el('div', 'fl-elim'), { '--cols': kinds.length });
    body.append(el('span', ''), ...kinds.map((k) => el('span', 'colhead', short(k))));
    // the player's own marks: ✓ a guess, × ruled out; the rest «?» — nothing here is the game telling
    const marks = { 'potion.experience': { 'potion.healing': 'x', 'potion.experience': 'q' }, 'potion.liquidFlame': { 'potion.liquidFlame': 'tick' }, 'potion.toxicGas': { 'potion.toxicGas': 'tick' }, 'potion.frost': { 'potion.liquidFlame': 'x', 'potion.toxicGas': 'x', 'potion.invisibility': 'x' } };
    for (const e of looks) {
      body.append(el('div', 'pd-slot mk-mini', itemIcon(world, mk(e.kind))));
      for (const k of kinds) {
        const m = marks[e.kind]?.[k] ?? (Object.values(marks).some((r) => r[k] === 'tick') && marks[e.kind]?.[k] !== 'tick' ? 'x' : '');
        body.append(el('span', `cell ${m}`, m === 'x' ? '×' : m === 'tick' ? '✓' : m === 'q' ? '?' : ''));
      }
    }
    body = el('div', '', body, el('p', 'fl-tip', gi('note', 8, 2), T('Tap a cell: ✓ my guess, × not this. The kinds already known are gone from the columns.', 'Тап по клетке: ✓ — догадка, × — точно не это. Опознанные виды из колонок уже ушли.')));
  }
  windowOn(ui, [tabs(c), count, body], { title: T('Collection', 'Коллекция'), icon: gi('catalog', 16, 2), wide: !PHONE });
}

/* ---------- the bestiary ---------- */
const MET = [
  // kind, sheet, frame w, h, row, first depth, kills, boss
  ['rat', 'rat', 16, 15, 0, 1, 23], ['albino', 'rat', 16, 15, 1, 2, 2], ['gnoll', 'gnoll', 12, 15, 0, 2, 17], ['crab', 'crab', 16, 16, 0, 3, 11],
  ['goo', 'goo', 20, 14, 0, 5, 1, true], ['swarm', 'swarm', 16, 16, 0, 3, 31], ['skeleton', 'skeleton', 12, 15, 0, 6, 14], ['thief', 'thief', 12, 13, 0, 6, 6],
  ['shaman', 'shaman', 12, 15, 0, 7, 9], ['tengu', 'tengu', 14, 16, 0, 10, 1, true], ['bat', 'bat', 15, 15, 0, 11, 8], ['brute', 'brute', 12, 16, 0, 11, 5],
  ['spinner', 'spinner', 16, 16, 0, 12, 3],
];
const UNMET = [['dm300', 'dm300', 22, 20, 0, 15, 0, true]];
const REGIONS = [[T('Sewers', 'Канализация'), 1, 5], [T('Prison', 'Тюрьма'), 6, 10], [T('Caves', 'Пещеры'), 11, 15]];
async function sprite(m, scale) { return figure(`assets/${m[1]}.png`, m[2], m[3], 0, m[4], scale); }
function facts(m) {
  const s = C.MOBS[m[0]];
  return el('dl', 'fl-facts',
    el('dt', '', T('first met', 'впервые')), el('dd', '', T(`depth ${m[5]}`, `глубина ${m[5]}`)),
    el('dt', '', T('slain', 'убито')), el('dd', '', m[6]),
    el('dt', '', T('experience', 'опыт')), el('dd', '', T(`${s.exp} a kill, while you are below level ${s.maxLvl}`, `${s.exp} за победу, пока ваш уровень ниже ${s.maxLvl}`)),
    el('dt', '', T('hit you for', 'бил вас на')), el('dd', '', T(`up to ${Math.round(s.damage[1] * 0.8)} (seen)`, `до ${Math.round(s.damage[1] * 0.8)} (видели)`)));
}
export async function bestiary(v) {
  const ui = scene({ xp: 'A', dim: true });
  const pick = MET.find((m) => m[0] === (Q.get('m') || 'shaman'));
  let body;
  if (v === 'A') {
    const g = el('div', 'fl-beast-grid');
    for (const m of [...MET, ...UNMET]) {
      const unmet = UNMET.includes(m);
      const card = el('div', `fl-beast${m[7] ? ' boss' : ''}${unmet ? ' unmet' : ''}`, await sprite(m, 2), el('span', 'nm', unmet ? '???' : cap(C.t.mobs[m[0]])), el('span', 'kills', unmet ? T(`depth ${m[5]}?`, `глубина ${m[5]}?`) : `× ${m[6]}`));
      if (m === pick) card.classList.add('mk-picked');
      g.append(card);
    }
    const detail = el('div', 'pd-info-block', el('div', 'pd-examine-head', el('div', 'pd-portrait', await sprite(pick, 3)), el('div', 'pd-titles', el('h2', 'pd-heading', cap(C.t.mobs[pick[0]])))),
      el('p', 'pd-speech', C.mobDescription({ kind: pick[0] })), facts(pick));
    body = PHONE ? [g, detail] : [el('div', 'mk-cols', el('div', 'mk-main', g), el('div', 'mk-side', ...detail.childNodes))];
  } else if (v === 'B') {
    body = [];
    for (const [rn, a, b] of REGIONS) {
      const ms = [...MET, ...UNMET].filter((m) => m[5] >= a && m[5] <= b);
      body.push(el('div', 'pd-bagrow-title', `${rn} · ${a}–${b}`));
      for (const m of ms) {
        const unmet = UNMET.includes(m);
        body.push(el('div', `fl-bookrow${unmet ? ' mk-unmet' : ''}`, el('div', 'pd-portrait mk-p', await sprite(m, 2)),
          el('div', '', el('div', 'what', unmet ? '???' : cap(C.t.mobs[m[0]])), el('div', 'look', unmet ? T('not met yet', 'ещё не встречен') : firstLine(C.mobDescription({ kind: m[0] })))),
          el('div', 'meta', unmet ? '' : `× ${m[6]}`)));
      }
    }
  } else {
    const max = Math.max(...MET.map((m) => m[6]));
    body = [];
    for (const m of [...MET].sort((x, y) => y[6] - x[6])) {
      body.push(el('div', 'fl-bookrow', el('div', 'pd-portrait mk-p', await sprite(m, 2)),
        el('div', '', el('div', `what${m[7] ? ' mk-boss' : ''}`, cap(C.t.mobs[m[0]])), css(el('div', 'fl-grew mk-kbar'), { '--was': 0, '--is': (m[6] / max).toFixed(3) })),
        el('div', 'meta', `× ${m[6]}`, el('br'), T(`from d${m[5]}`, `с гл. ${m[5]}`))));
    }
    body.unshift(el('p', 'fl-count-line', gi('kills', 12, 2), T('slain', 'убито'), ' ', el('b', '', MET.reduce((s, m) => s + m[6], 0)), '·', T('kinds', 'видов'), ' ', el('b', '', MET.length)));
  }
  windowOn(ui, body, { title: T('Bestiary', 'Бестиарий'), icon: gi('bestiary', 16, 2), wide: !PHONE });
}
const firstLine = (s) => { const f = (s.match(/^.*?[.!?](\s|$)/) || [s])[0].trim(); return f.length > 60 ? `${f.slice(0, 58)}…` : f; };

/* ---------- the chronicle ---------- */
export const RUN = [
  // depth, turn, kind, value, text
  [1, 0, 'depth', 1, T('Ember goes down into the dungeon', 'Уголёк спускается в подземелье')],
  [1, 110, 'level', 2, null],
  [2, 480, 'firstUpgrade', 'weapon.shortSword', null],
  [3, 900, 'learned', 'potion.healing', null],
  [4, 1310, 'strength', 12, null],
  [5, 1820, 'boss', 'goo', null],
  [6, 2290, 'bought', 'ankh', null],
  [7, 2950, 'level', 7, null],
  [8, 3610, 'found', 'weapon.longsword', null],
  [9, 4400, 'strength', 14, null],
  [10, 5910, 'boss', 'tengu', null],
  [10, 5940, 'mastery', 'gladiator', null],
  [11, 6720, 'enchant', 'fire', null],
  [12, 8410, 'level', 11, null],
  [12, 8412, 'strength', 15, null],
];
export function runText(e) {
  const [d, , k, val, text] = e;
  if (text) return text;
  switch (k) {
    case 'level': return T(`Level ${val}`, `Уровень ${val}`);
    case 'firstUpgrade': return T(`First upgrade: ${C.t.items[val]} +1`, `Первое улучшение: ${C.t.items[val]} +1`);
    case 'learned': return T(`Learned: ${C.t.items[val]}`, `Опознано: ${C.t.items[val]}`);
    case 'strength': return T(`Strength ${val}`, `Сила ${val}`);
    case 'boss': return T(`${cap(C.t.mobs[val])} is slain`, `${cap(C.t.mobs[val])} повержен${val === 'goo' ? 'а' : ''}`);
    case 'bought': return T(`Bought an ankh (shop of depth ${d})`, `Куплен анкх (лавка на ${d}-й)`);
    case 'found': return T(`Found: ${C.t.items[val]}`, `Найден: ${C.t.items[val]}`);
    case 'mastery': return T(`Tome of Mastery: ${C.t.subclasses[val]}`, `Книга мастерства: ${C.t.subclasses[val]}`);
    case 'enchant': return T('Scroll of enchantment: the longsword blazes', 'Свиток зачарования: длинный меч пылает');
    default: return '';
  }
}
export function runIcon(e) {
  const k = e[2];
  if (k === 'firstUpgrade' || k === 'found') return itemIcon(world, mk(e[3]));
  if (k === 'learned') return itemIcon(world, mk(e[3]));
  if (k === 'bought') return itemIcon(world, mk('ankh'));
  if (k === 'enchant') return gi('enchant', 8, 2, '255, 68, 0');
  return gi({ level: 'lvl', strength: 'str', boss: 'boss', mastery: 'sigil', depth: 'depth' }[k] ?? 'xp', { boss: 16, mastery: 16 }[k] ?? 12, k === 'boss' || k === 'mastery' ? 1.5 : 2);
}
const REG = ['#4a5a3a', '#5a4a3a', '#5a4d3c', '#4a3a4a', '#5a2a2a'];
export async function chronicle(v) {
  const ui = scene({ xp: 'C', dim: true });
  let body;
  if (v === 'A') {
    body = el('div', 'fl-ribbon');
    let last = 0;
    for (const e of RUN) {
      if (e[0] !== last && e[2] !== 'depth') { body.append(el('div', 'fl-rib depth', gi('depth', 12, 2), T(`Depth ${e[0]}`, `Глубина ${e[0]}`), el('span', 'when', ''))); }
      last = e[0];
      const big = ['boss', 'mastery', 'firstUpgrade', 'enchant'].includes(e[2]);
      body.append(el('div', `fl-rib${big ? ' big' : ''}${e[2] === 'boss' ? ' boss' : ''}`, runIcon(e), runText(e), el('span', 'when', T(`turn ${e[1]}`, `ход ${e[1]}`))));
    }
  } else if (v === 'B') {
    body = el('div', 'fl-descent');
    for (let d = 1; d <= (PHONE ? 16 : 26); d++) {
      const evs = RUN.filter((e) => e[0] === d && e[2] !== 'depth');
      const cell = css(el('span', `d${d % 5 === 0 ? ' boss' : ''}${d > hero.depth ? ' unreached' : ''}`, d), { '--reg': REG[Math.min(4, Math.floor((d - 1) / 5))] });
      const row = el('div', 'ev', ...evs.flatMap((e) => [runIcon(e), evs.length <= 1 ? el('span', '', runText(e)) : '']));
      if (evs.length > 1) row.append(el('span', '', runText(evs[evs.length - 1])));
      if (d === hero.depth) row.append(el('span', 'mk-here', T('◂ you are here', '◂ вы здесь')));
      body.append(cell, row);
    }
  } else {
    const chap = (n, title, a, b, text, finds, on) => el('div', `fl-page${on ? '' : ' mk-closed'}`, el('div', 'fl-chapter', T(`Chapter ${n}`, `Глава ${n}`)), el('h3', '', `${title} · ${a}–${b}`), el('p', '', text), el('div', 'fl-finds', ...finds.map((k) => el('div', 'pd-slot', itemIcon(world, mk(k))))));
    body = el('div', 'mk-pages',
      chap('III', T('Caves', 'Пещеры'), 11, 12, T('The longsword took fire from a scroll on the 11th; level 11 on the 12th, and strength 15 — the plate fits now.', 'На 11-й длинный меч загорелся от свитка; на 12-й — уровень 11 и сила 15: латы теперь по силам.'), ['scroll.enchantment', 'potion.strength', 'armor.plate'], true),
      chap('II', T('Prison', 'Тюрьма'), 6, 10, T('An ankh from the shop of the 6th. Tengu fell on turn 5 910, and the Tome made Ember a gladiator.', 'Анкх из лавки на 6-й. Тенгу пал на ходу 5 910, и Книга сделала Уголька гладиатором.'), ['ankh', 'weapon.longsword', 'tome.mastery'], false),
      chap('I', T('Sewers', 'Канализация'), 1, 5, T('A short sword +1 — the first upgrade; healing learned on the 3rd; Goo dissolved on the 5th.', 'Короткий меч +1 — первое улучшение; на 3-й узнал исцеление; на 5-й растворилась Жижа.'), ['weapon.shortSword', 'potion.healing', 'potion.strength'], false));
  }
  const head = el('p', 'fl-count-line', gi('chronicle', 16, 2), T('A warrior · depth 12 · turn 8 412', 'Воин · глубина 12 · ход 8 412'));
  windowOn(ui, [head, body], { title: T('Chronicle', 'Летопись'), icon: gi('chronicle', 16, 2), wide: !PHONE });
}
void BAG; void RU; void slot; void name;
