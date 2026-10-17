// Part 11 · 2. The pack: the marks of a slot, filters and order, the item card, the moments of truth.
import { BAG, C, cap, css, el, FRESH, G, gi, hero, itemIcon, mk, name, NOTES, PHONE, Q, scene, slot, T, windowOn, world } from './kit.js';

const GROUPS = [
  ['weapon', T('Weapons', 'Оружие'), (c) => c === 'weapon' || c === 'missile', 'weapon.shortSword'],
  ['armor', T('Armour', 'Броня'), (c) => c === 'armor', 'armor.mail'],
  ['potion', T('Potions', 'Зелья'), (c) => c === 'potion', BAG.heal],
  ['scroll', T('Scrolls', 'Свитки'), (c) => c === 'scroll', BAG.ident],
  ['ring', T('Rings', 'Кольца'), (c) => c === 'ring', 'ring.accuracy'],
  ['wand', T('Wands', 'Палочки'), (c) => c === 'wand', BAG.lightning],
  ['seed', T('Seeds', 'Семена'), (c) => c === 'seed', BAG.sungrass],
  ['food', T('Food', 'Еда'), (c) => c === 'food', BAG.ration],
  ['quest', T('Quest', 'Квест'), (c) => ['quest', 'ankh', 'key', 'tome', 'kit'].includes(c), BAG.ankh],
];
const cat = (it) => C.itemDef(it.kind).category;
const icon = (rep) => itemIcon(world, typeof rep === 'string' ? mk(rep) : rep);
const unknownOf = (it) => !C.kindKnown(world, it) || !C.levelKnown(it);

function equipRow(v) {
  return el('div', 'pd-bagrow pd-equip', slot(hero.weapon, { equipped: true, v }), slot(hero.armor, { equipped: true, v }), ...hero.rings.map((r) => slot(r, { equipped: true, v })));
}
function grid(items, v, lit) {
  const g = el('div', `pd-bagrow`);
  for (const it of items) { const s = slot(it, { v }); if (lit && lit(it)) s.classList.add('fl-lit'); g.append(s); }
  for (let k = items.length; k < 20; k++) g.append(el('div', 'pd-slot empty'));
  return g;
}
function bagHead() {
  const stat = (ic, txt, cls = '') => el('span', `pd-stat ${cls}`, gi(ic, 12, 2), txt);
  return el('div', 'pd-bag-head', el('h2', 'pd-heading', T('Backpack', 'Рюкзак')), stat('gold', 1384, 'gold'), stat('str', hero.str), el('button', 'pd-close'));
}

export async function bag(v) {
  const ui = scene({ xp: 'A', dim: true });
  const items = hero.items.filter((it) => it !== BAG.darts);
  let filters, body;
  if (v === 'A') {
    const chip = (label, count, on = false, hot = false, ic) => { const n = el('button', `fl-chip${hot ? ' hot' : ''}`, ic || '', label, el('b', '', count)); n.setAttribute('aria-pressed', String(on)); return n; };
    filters = el('div', 'fl-chips',
      chip(T('All', 'Все'), items.length, true),
      chip(T('New', 'Новое'), items.filter((i) => FRESH.has(i)).length, false, true, gi('new', 8, 2)),
      chip(T('Unknown', 'Неопознанное'), items.filter(unknownOf).length, false, false, gi('unknown', 8, 2)),
      ...GROUPS.map(([, nm, f, rep]) => chip(PHONE ? '' : nm, items.filter((i) => f(cat(i))).length, false, false, icon(rep))),
      el('button', 'fl-chip fl-sort', gi('sort', 16, 1.5), T('by kind', 'по типу')));
    body = el('div', 'fl-slots-a', equipRow('A'), el('div', 'pd-bagrow-title', T('In the pack', 'В рюкзаке')), grid(items, 'A'));
  } else if (v === 'B') {
    const tab = (ic, count, on = false) => { const n = el('button', 'fl-rail-tab', ic, el('span', 'fl-count', count)); n.setAttribute('aria-selected', String(on)); return n; };
    filters = el('div', `fl-rail${PHONE ? ' row' : ''}`,
      tab(gi('filter', 16, 2), items.length, true), tab(gi('new', 8, 2), items.filter((i) => FRESH.has(i)).length), tab(gi('unknown', 8, 2), items.filter(unknownOf).length),
      ...GROUPS.map(([, , f, rep]) => tab(icon(rep), items.filter((i) => f(cat(i))).length)));
    body = el('div', 'fl-slots-b', equipRow('B'), el('div', 'pd-bagrow-title', T('In the pack', 'В рюкзаке')), grid(items, 'B'));
  } else {
    const lens = (ic, label, on = false) => { const n = el('button', 'fl-lens', ic, label); n.setAttribute('aria-pressed', String(on)); return n; };
    filters = el('div', 'fl-lenses', lens(gi('new', 8, 2), T('New', 'Новое')), lens(gi('unknown', 8, 2), T('Unknown', 'Неопознанное'), true), lens(gi('heavy', 8, 2), T('Too heavy', 'Тяжело')), lens(gi('fits', 8, 2), T('Fits now', 'По силам')));
    // the groups kept in the order of the game; the lens dims all but the unknown
    const rows = [];
    for (const [, nm, f] of GROUPS) {
      const its = items.filter((i) => f(cat(i))); if (!its.length) continue;
      rows.push(el('div', 'pd-bagrow-title', nm), grid(its, 'C', unknownOf));
      rows[rows.length - 1].querySelectorAll('.pd-slot.empty').forEach((n) => n.remove());
    }
    const eq = equipRow('C'); eq.querySelectorAll('.pd-slot').forEach((n, k) => { if (unknownOf([hero.weapon, hero.armor, ...hero.rings][k])) n.classList.add('fl-lit'); });
    body = el('div', 'fl-slots-c fl-lensed', eq, ...rows);
  }
  const w = windowOn(ui, [], { cls: 'pd-bag' });
  const scroll = w.querySelector('.pd-scroll');
  const left = v === 'B' && !PHONE ? el('div', 'mk-main', bagHead(), el('div', 'mk-rail-wrap', filters, body)) : el('div', 'mk-main', bagHead(), filters, body);
  if (!PHONE) {
    w.style.maxWidth = 'var(--window-split)';
    scroll.append(el('div', 'mk-cols', left, el('div', 'mk-side', ...cardBody(BAG.sword, v, true))));
  } else scroll.append(...left.childNodes);
  scroll.querySelector('.pd-slot.fl-new')?.classList.add('selected');
}

/* ---------- the item card ---------- */
function cmpBars(it) {
  const c = C.compare(hero, it);
  if (!c) return null;
  const max = Math.max(c.this.hi, c.worn?.hi ?? 0) * 1.1;
  const row = (who, f, cls) => el('div', `fl-cmp-row ${cls}${f.known ? '' : ' unknown'}`, el('span', 'who', who),
    el('span', 'fl-range', css(el('i'), { '--lo': (f.lo / max).toFixed(3), '--hi': (f.hi / max).toFixed(3) })),
    el('span', 'num', c.kind === 'weapon' ? `${f.lo}–${f.hi}${f.known ? '' : '?'}` : `${f.lo}${f.known ? '' : '?'}`));
  return el('div', 'fl-cmp',
    el('p', 'pd-info-head', c.kind === 'weapon' ? T('Damage: in hand / this', 'Урон: в руке / этот') : T('Armour: worn / this', 'Броня: надето / эта')),
    c.worn ? row(T('in hand', 'в руке'), c.worn, 'worn') : null, row(T('this', 'этот'), c.this, 'this'),
    c.heavier ? el('p', 'fl-tip', gi('heavy', 8, 2), T(`Heavier by ${c.heavier} strength than you have: ÷${(1.5 ** c.heavier).toFixed(2)} accuracy, ×${(1.2 ** c.heavier).toFixed(2)} slower.`, `Тяжелее вашей силы на ${c.heavier}: точность ÷${(1.5 ** c.heavier).toFixed(2).replace('.', ',')}, удар ×${(1.2 ** c.heavier).toFixed(2).replace('.', ',')} медленнее.`))
      : el('p', 'fl-tip', gi('fits', 8, 2), T('Light enough for you.', 'Вам по силам.')));
}
function knowBlock(it) {
  const f = C.familiarity(world, hero, it);
  if (!f) return null;
  const s = C.segments(f.done, f.of);
  const bar = css(el('div', 'fl-segs'), { '--n': s.n });
  for (let k = 0; k < s.n; k++) bar.append(el('i', k < s.full ? 'full' : k === s.full && f.done % s.per ? 'next' : ''));
  const unit = { hits: T('blows struck', 'ударов нанесено'), taken: T('blows taken', 'ударов принято'), zaps: T('zaps', 'выстрелов'), turns: T('turns worn', 'ходов надето') }[f.unit];
  return el('div', 'fl-know', el('div', 'fl-know-head', gi('ident', 12, 2), T('Identifying', 'Опознание'), el('span', 'of', `${f.done} / ${f.of}`)), bar,
    el('p', 'fl-tip', '', `${unit}${f.inUse ? '' : f.unit === 'hits' ? T(' — only while in hand', ' — идёт, только пока в руке') : f.unit === 'zaps' ? '' : T(' — only while worn', ' — идёт, только пока надето')}`));
}
function noteBlock(it) {
  const n = NOTES.get(it) ?? NOTES.get(it.kind);
  return el('div', `fl-note${n ? '' : ' empty'}`, gi('note', 8, 2), n ?? T('Add a note…', 'Заметка…'));
}
function verdict(it) {
  const c = C.compare(hero, it);
  if (!c) return null;
  const d = (a, b) => (a > b ? 'up' : a < b ? 'down' : 'same');
  const chips = [];
  if (c.worn) {
    const lo = c.this.lo - c.worn.lo, hi = c.this.hi - c.worn.hi;
    chips.push(el('span', `pd-chip ${d(hi, 0)}`, gi(hi >= 0 ? 'up' : 'down', 8, 2), `${T('max', 'макс')} ${hi >= 0 ? '+' : ''}${hi}${c.this.known ? '' : '?'}`));
    chips.push(el('span', `pd-chip ${d(lo, 0)}`, gi(lo >= 0 ? 'up' : 'down', 8, 2), `${T('min', 'мин')} ${lo >= 0 ? '+' : ''}${lo}${c.this.known ? '' : '?'}`));
  }
  chips.push(c.heavier ? el('span', 'pd-chip down', gi('heavy', 8, 2), T(`heavy by ${c.heavier}`, `тяжелее на ${c.heavier}`)) : el('span', 'pd-chip up', gi('fits', 8, 2), T('fits', 'по силам')));
  if (!C.levelKnown(it)) chips.push(el('span', 'pd-chip same', gi('unknown', 8, 2), T('level unknown', 'уровень скрыт')));
  if (it.enchant) chips.push(el('span', 'pd-chip', gi('enchant', 8, 2, G.enchant[it.enchant]), C.t.enchantName ? '' : '', T('enchanted', 'зачарован')));
  return el('div', 'fl-verdict', ...chips);
}
function pairCols(it) {
  const c = C.compare(hero, it);
  if (!c || !c.worn) return null;
  const col = (item, f, label) => el('div', 'fl-pair-col', el('span', 'pd-stat-label', label), slot(item, { equipped: item === hero.weapon }), el('span', '', name(item)),
    el('span', 'num', `${f.lo}–${f.hi}${f.known ? '' : '?'}`), el('span', 'pd-stat-label', `${T('str', 'сила')} ${f.str}${f.known ? '' : '?'}`));
  const diff = (label, a, b, q) => { const x = a - b; return el('span', x > 0 ? 'up' : x < 0 ? 'down' : 'same', `${label} ${x > 0 ? '▲+' : x < 0 ? '▼' : '='}${x === 0 ? '' : x}${q}`); };
  const q = c.this.known ? '' : '?';
  const mid = el('div', 'fl-pair-mid fl-verdict', diff(T('min', 'мин'), c.this.lo, c.worn.lo, q), diff(T('max', 'макс'), c.this.hi, c.worn.hi, q),
    el('span', c.this.str > c.worn.str ? 'down' : 'up', `${T('str', 'сила')} ${c.this.str > c.worn.str ? '+' : ''}${c.this.str - c.worn.str}${q}`));
  return el('div', 'fl-pair', col(hero.weapon, c.worn, T('in hand', 'в руке')), mid, col(it, c.this, T('this', 'этот')));
}
function cardBody(it, v, compact = false) {
  const info = C.itemInfo(world, hero, it);
  const head = el('div', 'pd-examine-head', slot(it), el('div', 'pd-titles', el('h2', 'pd-heading', name(it)), compact ? null : el('span', 'pd-stat-label', T('picked up on depth 12', 'поднят на глубине 12'))));
  const desc = el('p', 'pd-speech', info[0]);
  const parts = v === 'A' ? [head, desc, cmpBars(it), knowBlock(it), noteBlock(it)]
    : v === 'B' ? [head, pairCols(it), desc, knowBlock(it), noteBlock(it)]
      : [head, verdict(it), desc, C.compare(hero, it) ? el('details', 'mk-more', el('summary', 'pd-info-head', T('Numbers', 'Цифры')), cmpBars(it)) : null, knowBlock(it), noteBlock(it)];
  const buttons = el('div', 'pd-buttons mk-buttons', el('button', 'pd-button primary', T('Equip', 'Надеть')), el('button', 'pd-button', T('Drop', 'Выбросить')));
  return [...parts.filter(Boolean), compact ? null : buttons].filter(Boolean);
}
export async function item(v) {
  const ui = scene({ xp: 'A', dim: true });
  const it = Q.get('i') ? BAG[Q.get('i')] : BAG.axe;
  windowOn(ui, cardBody(it, v), { wide: !PHONE });
}

/* ---------- the moments of truth (stills at ?t; the GIFs run them) ---------- */
export async function truth(v) {
  const kind = Q.get('k') || 'upgrade';
  const ui = scene({ xp: 'A', dim: v !== 'C' });
  const target = { upgrade: BAG.mace, identify: BAG.sword, enchant: hero.weapon, uncurse: BAG.detection, newitem: BAG.frost }[kind];
  const before = structuredClone(target);
  if (kind === 'upgrade') target.level += 1;
  if (kind === 'identify') { delete target.levelUnknown; delete target.curseUnknown; target.level = 2; }
  if (kind === 'enchant') target.enchant = 'shock';
  if (kind === 'uncurse') { delete target.cursed; }
  const s = slot(target, { v: 'A' });
  s.classList.add('fl-moment');
  const sparks = (n) => { const box = el('span', 'fl-sparks mk-fx'); for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; box.append(css(el('i'), { left: '50%', top: '50%', '--dx': `${Math.round(Math.cos(a) * 26)}px`, '--dy': `${Math.round(Math.sin(a) * 26)}px` })); } return box; };
  const fx = () => {
    if (kind === 'upgrade') { s.classList.add('fl-flashcell'); s.querySelector('.pd-lvl')?.classList.add('fl-tickup'); s.append(sparks(6)); }
    if (kind === 'identify') { s.classList.add('fl-reveal'); s.append(sparks(4)); }
    if (kind === 'enchant') { const m = s.querySelector('.fl-mark'); m?.classList.add('fl-runedraw'); s.classList.add('fl-flashcell'); }
    if (kind === 'uncurse') { const box = el('span', 'fl-shatter mk-fx'); for (let k = 0; k < 8; k++) box.append(css(el('i'), { left: `${6 + (k % 4) * 12}px`, top: `${k < 4 ? 2 : 44}px`, '--dx': `${(k % 4 - 1.5) * 6}px` })); s.append(box); }
    if (kind === 'newitem') { s.querySelector('.fl-mark')?.classList.add('mk-new'); s.append(sparks(4)); }
  };
  const line = {
    upgrade: T(`Your ${C.plainName(world, before).toLowerCase()} looks much better now: +${target.level}.`, `${cap(C.plainName(world, before))} выглядит гораздо лучше: +${target.level}.`),
    identify: T(`It is ${name(target).toLowerCase()}.`, `Это ${name(target).toLowerCase()}.`),
    enchant: T(`Your ${C.t.items[target.kind].toLowerCase()} glows with a new power.`, `Ваш ${C.t.items[target.kind].toLowerCase()} засиял новой силой.`),
    uncurse: T('Your pack glows with a cleansing light, and a malevolent aura leaves.', 'Рюкзак озаряется очищающим светом, и злая аура уходит.'),
    newitem: T(`You now have ${name(target).toLowerCase()}.`, `Вы подобрали: ${name(target).toLowerCase()}.`),
  }[kind];
  if (v === 'A') {
    // in the pack: the slot itself flashes, the number climbs, sparks
    const items = hero.items.map((it) => (it === target ? null : it));
    const g = el('div', 'pd-bagrow fl-slots-a'); for (const it of items) g.append(it ? slot(it) : s);
    const eq = equipRow('A');
    if (target === hero.weapon) { s.classList.add('equipped'); s.querySelector('.pd-tag')?.remove(); eq.firstChild.replaceWith(s); }
    windowOn(ui, [bagHead(), eq, el('div', 'pd-bagrow-title', T('In the pack', 'В рюкзаке')), g]);
    fx();
  } else if (v === 'B') {
    // the card: the item's window turns over and shows what it is
    const card = cardBody(target, 'A', true);
    card[0].firstChild.replaceWith(s);
    if (kind === 'identify') {
      const was = cardBody(before, 'A', true);
      const face = (cls, parts) => el('div', cls, ...parts.slice(0, 3));
      const faces = el('div', 'fl-faces', face('fl-face-was mk-face', was), face('fl-face-is mk-face', card));
      const w = windowOn(ui, [el('p', 'pd-info-head mk-truth-head', T('Identified', 'Опознано')), faces], { wide: !PHONE });
      w.classList.add('fl-reveal'); fx(); return;
    }
    const w = windowOn(ui, [el('p', 'pd-info-head mk-truth-head', { upgrade: T('Upgraded', 'Улучшено'), identify: T('Identified', 'Опознано'), enchant: T('Enchanted', 'Зачаровано'), uncurse: T('Curse lifted', 'Проклятие снято'), newitem: T('New', 'Новое') }[kind]), ...card.slice(0, 3)], { wide: !PHONE });
    w.classList.add(kind === 'identify' ? 'fl-reveal' : 'mk-card-pop');
    fx();
  } else {
    // quiet: the log says it, the slot in the quickslot glows still, nothing moves over the map
    const logLine = el('div', 'pd-log-line hl', line);
    ui.querySelector('.pd-toolbar').before(el('div', 'pd-log', el('div', 'pd-log-line', T('You read the scroll.', 'Вы читаете свиток.')), logLine));
    const tb = ui.querySelector('.pd-tool.bag'); tb.classList.add('mk-glow'); tb.append(css(el('span', 'mk-badge'), {}), gi(kind === 'uncurse' ? 'cursed' : kind === 'enchant' ? 'enchant' : 'up', 8, 2, kind === 'enchant' ? G.enchant.shock : undefined));
  }
}
void C; void mk;
