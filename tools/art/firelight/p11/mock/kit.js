// Firelight · part 11 mock screens: the shared pieces. Every figure is the game's own (core.js: the core and the client's texts,
// bundled from the repository); the markup is the game's classes (ui.css, game.css, info.css) plus the new fl-grow.css.
import * as C from './core.js';

export { C };
export const Q = new URLSearchParams(location.search);
export const LANG = C.t === undefined ? 'en' : (Q.get('lang') === 'ru' ? 'ru' : 'en');
export const RU = LANG === 'ru';
export const T = (en, ru) => (RU ? ru : en);
export const PHONE = innerWidth < 700;
export const G = await (await fetch('assets/ui/growth/growth.json')).json();

/* ---------- DOM ---------- */
export function el(tag, cls, ...kids) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
}
export const css = (n, vars) => { for (const [k, v] of Object.entries(vars)) n.style.setProperty(k, String(v)); return n; };
export const html = (tag, cls, s) => { const n = el(tag, cls); n.innerHTML = s; return n; };

/** An icon of growth-icons.png: name, size 8 | 12 | 16, pixel scale (default the --u of 2 px). */
export function gi(name, size = 8, scale = 2, tint) {
  const r = G.icons[String(size)][name];
  if (!r) throw new Error(`no icon ${size}/${name}`);
  const n = el('i', `fl-gi${G.masks.includes(name) ? ' mask' : ''}`);
  css(n, { '--gx': r[0], '--gy': r[1], '--s': size, '--gs': `${scale}px` });
  if (tint) n.style.setProperty('--tint', tint);
  return n;
}

/** An item sprite (items.png), as .pd-item: from the game's spriteOffset. */
export function itemIcon(world, item) {
  const [x, y] = C.spriteOffset(world, item);
  return css(el('i', 'pd-item'), { '--ix': x / 16, '--iy': y / 16 });
}

/* ---------- The demo run: a warrior on depth 12 (the caves), level 11, a gladiator since Tengu ---------- */
export const NAME = T('Ember', 'Уголёк');
export const world = C.createWorld(4242);
C.levelAt(world, 1);
C.addHero(world, { id: 'p', name: NAME, heroClass: 'warrior' });
export const hero = C.heroById(world, 'p');
export const mk = (kind, level = 0, o = {}) => {
  const it = C.createItem(kind, o.qty ?? 1, level);
  if (o.hidden) { it.levelUnknown = true; it.curseUnknown = true; if (it.charges !== undefined) it.chargesUnknown = true; }
  if (o.curseKnown) delete it.curseUnknown;
  if (o.familiarity !== undefined) it.familiarity = o.familiarity;
  for (const k of ['enchant', 'glyph', 'cursed', 'worn']) if (o[k] !== undefined) it[k] = o[k];
  return it;
};
Object.assign(hero, { lvl: 11, exp: 22, ht: 70, hp: 56, str: 15, attackSkill: 20, defenseSkill: 15, depth: 12, subclass: 'gladiator', hunger: 120, kills: 214 });
hero.weapon = mk('weapon.longsword', 3, { enchant: 'fire' });
hero.armor = mk('armor.mail', 2);
hero.rings = [mk('ring.accuracy', 1), mk('ring.evasion', 2, { hidden: true, curseKnown: true, worn: 140 })];
export const BAG = {
  axe: mk('weapon.battleAxe', 1, { hidden: true, familiarity: 7 }),
  plate: mk('armor.plate', 2),
  sword: mk('weapon.sword', 0, { hidden: true }),
  lightning: mk('wand.lightning', 2),
  firebolt: mk('wand.firebolt', 1, { hidden: true, familiarity: 17 }),
  heal: mk('potion.healing', 0, { qty: 2 }),
  frost: mk('potion.frost'),
  exp: mk('potion.experience', 0, { qty: 2 }),
  upgrade: mk('scroll.upgrade'),
  tele: mk('scroll.teleportation', 0, { qty: 2 }),
  ident: mk('scroll.identify'),
  ration: mk('food.ration', 0, { qty: 2 }),
  pasty: mk('food.pasty'),
  sungrass: mk('seed.sungrass', 0, { qty: 3 }),
  darts: mk('missile.dart', 0, { qty: 12 }),
  ankh: mk('ankh'),
  detection: mk('ring.detection', -1, { hidden: true, curseKnown: true, cursed: true }),
  mace: mk('weapon.mace', 1, { enchant: 'shock' }),
  scale: mk('armor.scale', 0, { hidden: true, glyph: 'bounce' }),
};
hero.items = Object.values(BAG);
world.known.push('potion.healing', 'scroll.upgrade', 'scroll.identify', 'scroll.mapping', 'scroll.removeCurse', 'wand.lightning', 'ring.accuracy', 'potion.mindVision', 'scroll.enchantment');
/** What the client keeps of its own: newness and the player's notes (newness.ts, notes.ts). */
export const FRESH = new Set([BAG.sword, BAG.frost]);
export const NOTES = new Map([
  [BAG.exp, T('Two found on 9. Smells sweet — healing?', 'Две нашёл на 9-й. Пахнет сладко — лечение?')],
  ['potion.experience', T('healing?', 'лечение?')],
  ['scroll.teleportation', T('teleport? read on 7, I vanished', 'телепорт? прочёл на 7-й, меня унесло')],
]);
export const START = { ht: 20, str: 11 };

export const ITEM_KINDS = Object.keys(C.ITEMS);
export const kindsOf = (cat) => ITEM_KINDS.filter((k) => C.itemDef(k).category === cat);
export const name = (item) => cap(C.itemName(world, item));
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- A slot as the game builds it (screens.ts slot), with the new marks of the variant ---------- */
export function slot(item, o = {}) {
  if (!item) return el('div', 'pd-slot empty');
  const v = o.v || 'A';
  const m = C.slotMarks(world, hero, item, { fresh: FRESH.has(item), noted: NOTES.has(item) || NOTES.has(item.kind), light: !!o.light });
  const cursed = C.visiblyCursed(item);
  const n = el('button', `pd-slot${o.equipped ? ' equipped' : ''}${cursed ? ' cursed fl-known' : ''}`);
  n.append(itemIcon(world, item));
  const charges = C.chargesOf(item);
  if (charges !== null) n.append(el('span', 'pd-qty', charges));
  else if (item.qty > 1) n.append(el('span', 'pd-qty', item.qty));
  if (m.level) n.append(el('span', `pd-lvl ${m.level.tone}`, m.level.text));
  if (m.strength && !o.equipped) n.append(el('span', `pd-tag${m.strength.heft === 'heavy' ? ' bad' : ''}${m.strength.light ? ' light' : ''}`, m.strength.text));
  if (m.mark) {
    const ench = m.mark === 'enchant' ? G.enchant[item.enchant] : m.mark === 'glyph' ? G.glyph : undefined;
    const mark = gi(m.mark === 'cursed' ? 'cursed' : m.mark === 'new' ? 'new' : m.mark === 'note' ? 'note' : m.mark, 8, 2, ench);
    mark.classList.add('fl-mark');
    n.append(mark);
  }
  if (FRESH.has(item)) n.classList.add('fl-new');
  if (item.enchant) { n.classList.add('fl-ench'); n.style.setProperty('--ench', G.enchant[item.enchant]); }
  if (item.glyph) n.classList.add('fl-glyph');
  if (m.strength?.heft === 'heavy') n.classList.add('fl-heavy');
  if (m.level?.tone === 'unknown') n.classList.add('fl-unknown');
  if (v === 'C') {
    const row = el('span', 'fl-tagrow');
    if (m.level) row.append(el('span', m.level.tone === 'unknown' ? '' : m.level.tone, m.level.text));
    if (m.strength && !o.equipped) row.append(el('span', m.strength.heft === 'heavy' ? 'bad' : 'str', m.strength.text));
    for (const k of m.marks) row.append(gi(k === 'enchant' ? 'enchant' : k, 8, 1.5, k === 'enchant' ? G.enchant[item.enchant] : k === 'glyph' ? G.glyph : undefined));
    n.append(row);
  }
  return n;
}

/* ---------- The scene: the 3D frame of the game, the HUD, the toolbar ---------- */
export function scene({ xp = 'A', dim = false, lvlPop = false, log = [], hud = true } = {}) {
  const ui = el('div', 'mk-ui');
  ui.id = 'ui';
  const bg = el('img', 'mk-bg'); bg.src = PHONE ? 'bg/bg-phone.png' : 'bg/bg-desk.png'; ui.append(bg);
  if (hud) ui.append(hudBand({ xp, lvlPop }));
  if (log.length) ui.append(el('div', 'pd-log', ...log));
  if (hud) ui.append(toolbar());
  if (dim) ui.append(el('div', 'mk-dim'));
  document.body.append(ui);
  return ui;
}

export function hudBand({ xp = 'A', lvlPop = false } = {}) {
  const av = el('button', 'pd-avatar', css(el('i'), { '--av': 0 }));
  const lvl = el('span', `pd-hero-lvl${lvlPop ? ' fl-pop' : ''}${xp === 'B' ? ' fl-coal' : ''}`, hero.lvl);
  const pips = C.expPips(hero);
  if (xp === 'B') lvl.style.setProperty('--v', pips.share.toFixed(3));
  const wrap = el('div', 'pd-avatar-wrap', av, lvl);
  if (hero.subclass) { const s = gi('sigil', 16, 1.5); s.classList.add('fl-sigil-badge'); wrap.append(s); }
  const hp = css(el('div', 'pd-bar', el('span', 'pd-bar-text', `${hero.hp}/${hero.ht}`)), { '--v': hero.hp / hero.ht });
  const xpBar = css(el('div', `pd-bar thin xp${xp === 'A' ? ' fl-pips' : ''}`), { '--v': pips.share, '--pips': pips.pips });
  const food = css(el('div', 'pd-bar thin food'), { '--v': 1 - hero.hunger / C.STARVING });
  const icon = (s, w, h) => { const n = el('i', 'pd-icon'); n.style.backgroundImage = `var(--spr-${s})`; if (w) n.style.width = `${w}px`; if (h) n.style.height = `${h}px`; return n; };
  const small = el('div', 'pd-bars-small', el('div', 'pd-bar-pair', icon('star'), xpBar), el('div', 'pd-bar-pair', icon('food'), food));
  const bars = el('div', 'pd-hud-bars', hp, small);
  if (xp === 'C') {
    const p = css(el('div', 'fl-xp-pips'), { '--pips': pips.pips });
    for (let k = 0; k < pips.pips; k++) { const i = el('i', k < pips.full ? 'full' : k === pips.full ? 'part' : ''); if (k === pips.full) i.style.setProperty('--p', pips.part); css(i, { '--k': k }); p.append(i); }
    small.firstChild.replaceWith(el('div', 'pd-bar-pair', icon('star'), p));
  }
  const side = el('div', 'pd-hud-side', el('span', 'pd-stat', icon('depth'), hero.depth), el('span', 'pd-stat', icon('key', 14, 18), 1));
  const main = el('div', 'pd-hud-main', wrap, bars, side, el('button', 'pd-menu'));
  const band = el('header', `pd-hud${xp === 'B' ? ' fl-xp-hearth' : ''}`, main);
  return band;
}

export function toolbar() {
  const tool = (cls, sprite, w, h, ...kids) => {
    const n = el('button', `pd-tool${cls ? ` ${cls}` : ''}`);
    if (sprite) { const i = el('i', 'pd-icon'); i.style.backgroundImage = `var(--spr-${sprite})`; css(i, { '--w': w, '--h': h }); n.append(i); }
    n.append(...kids);
    return n;
  };
  const quick = tool('quick', null, 0, 0, itemIcon(world, BAG.heal), el('span', 'pd-qty', 2));
  const quick2 = tool('quick', null, 0, 0, itemIcon(world, BAG.darts), el('span', 'pd-qty', 12));
  return el('nav', `pd-toolbar${PHONE ? '' : ' mk-desk-bar'}`, tool('', 'tool-wait', 12, 12), tool('', 'tool-search', 12, 12), quick, quick2, tool('bag', 'tool-backpack', 14, 15));
}

/** A window on the dimmed scene, as the game opens one (.pd-overlay.static). */
export function windowOn(ui, content, { wide = false, split = false, title, icon, cls = '' } = {}) {
  const head = title ? el('div', 'pd-window-head', icon || '', el('div', 'pd-titles', el('h2', 'pd-heading', title)), el('button', 'pd-close')) : null;
  const w = el('div', `pd-window ${cls}`, head, el('div', 'pd-scroll', ...[content].flat()));
  if (wide) w.style.maxWidth = 'var(--window-wide)';
  if (split) w.style.maxWidth = 'var(--window-split)';
  const o = el('div', 'pd-overlay static open', w);
  ui.append(o);
  return w;
}

/** The variant's label in the corner of every preview: area · variant · name. */
export function stamp(area, v, nm) {
  document.body.append(el('div', 'mk-stamp', el('b', '', v), ` ${area} · ${nm}`));
}

/** A figure of a sprite sheet (the hero's, a monster's) on a canvas, scaled whole. */
export async function figure(src, fw, fh, col, row, scale) {
  const img = await loadImg(src);
  const c = document.createElement('canvas');
  c.width = fw * scale; c.height = fh * scale;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  g.drawImage(img, col * fw, row * fh, fw, fh, 0, 0, fw * scale, fh * scale);
  return c;
}
const imgs = {};
export const loadImg = (src) => imgs[src] || (imgs[src] = new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(src)); i.src = src; }));

/** Time: ?t=<ms> freezes every CSS animation at that moment (the GIFs); without it, at its end (the stills). */
export function freeze(ms) {
  for (const a of document.getAnimations()) {
    a.pause();
    const timing = a.effect.getComputedTiming();
    const end = Number.isFinite(timing.endTime) ? timing.endTime : timing.activeDuration;
    a.currentTime = ms === null ? Math.max(0, end - 1) : Math.min(ms, Math.max(0, end - 1));
  }
}

export const pct = (x) => `${Math.round(x * 100)}%`;
export const fmt = (x, d = 2) => (RU ? x.toFixed(d).replace('.', ',') : x.toFixed(d));
