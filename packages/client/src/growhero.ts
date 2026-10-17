import {
  armorStats, createItem, type Hero, heroAttackSkill, heroDefenseSkill, type Item, itemDef, kindKnown, levelKnown, maxExp, type World, weaponStats,
} from '@pd/core';
import { audio } from './audio';
import { type GChild, h, vars } from './growdom';
import { gi } from './growicons';
import { knownHero, levelGain, nowLight, passport as passportOf } from './growth';
import { grow } from './growmem';
import { t } from './i18n';
import { G } from './i18n-grow';
import { quality } from './quality';

/*
 * The hero's growth as the player sees it (part 11, variants A): the card of a new level, the feathers of a point of strength, the
 * hero's passport, the banner of the way chosen. Every number is growth.ts's (the core's own); nothing here changes a rule, and
 * nothing shows what the player does not know (an unidentified ring is left out of «with what you wear», a hidden level shows the
 * figures of a plain thing). The moments are short (≤ 400 ms), move in steps, never hold the turn and keep still under reduced motion.
 */

const ui = (): HTMLElement | null => document.getElementById('ui');
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const SHOWN_MS = 3400;

interface Shown {
  node: HTMLElement;
  timer: number;
}
let levelToast: Shown | null = null;
let strengthToast: Shown | null = null;

function drop(shown: Shown | null): null {
  if (shown) {
    clearTimeout(shown.timer);
    shown.node.remove();
  }
  return null;
}

const gain = (icon: string, plus: string, to: string): HTMLElement =>
  h('span', 'fl-gain', gi(icon, 12, 2), h('b', '', plus), h('span', 'to', `→ ${to}`));

/** The card of what a level gave: «11 · +5 ♥ → 70 · +1 acc → 20 · +1 eva → 15 · +9% awareness». */
export function levelCard(hero: Hero): HTMLElement {
  const g = levelGain(hero);
  return h('div', 'fl-lvlcard',
    h('span', 'fl-lvl-num', g.lvl),
    h('span', 'fl-lvl-title', G.hero.newLevel),
    h('span', 'fl-gains',
      gain('hp', `+${g.ht}`, String(hero.ht)),
      gain('acc', `+${g.attack}`, String(hero.attackSkill)),
      gain('eva', `+${g.defense}`, String(hero.defenseSkill)),
      g.awareness ? gain('aware', `+${pct(g.awareness[1] - g.awareness[0])}`, pct(g.awareness[1])) : null));
}

/** A new level: the HUD's coal pops, the bar flashes, a card drops under the HUD (a tap opens the passport). */
export function showLevelUp(hero: Hero, onPassport: () => void, pop: () => void): void {
  pop();
  levelToast = drop(levelToast);
  const root = ui();
  if (!root) return;
  const node = h('div', 'pd-toast fl-lvl-toast', levelCard(hero), h('span', 'fl-hint', G.hero.tapPassport));
  node.setAttribute('role', 'status');
  node.onclick = () => {
    audio.play('click');
    levelToast = drop(levelToast);
    onPassport();
  };
  root.append(node);
  levelToast = { node, timer: window.setTimeout(() => (levelToast = drop(levelToast)), SHOWN_MS) };
}

/**
 * A point of strength: what it made light enough is marked with a feather in the pack until the first look, and a toast says
 * which things (the three first). Sounds: a thump, then a sparkle.
 */
export function showStrength(hero: Hero, slotOf: (item: Item) => HTMLElement, nameOf: (item: Item) => string): Item[] {
  const light = nowLight(hero);
  grow.setLight(light);
  audio.play('thump');
  window.setTimeout(() => audio.play('sparkle'), 200);
  strengthToast = drop(strengthToast);
  const root = ui();
  if (!root) return light;
  const head = h('div', 'fl-str-head', gi('str', 12, 2), G.hero.strength, h('b', '', `${hero.str - 1} → ${hero.str}`));
  const node = h('div', 'pd-toast fl-str-toast', head);
  if (light.length > 0) {
    node.append(h('p', 'pd-info-head', G.hero.lightNow(light.length)));
    const rows = h('div', 'fl-str-items');
    for (const item of light.slice(0, 3)) rows.append(h('span', 'fl-gain', slotOf(item), h('span', '', nameOf(item))));
    if (light.length > 3) rows.append(h('span', 'pd-note', G.hero.more(light.length - 3)));
    node.append(rows);
  }
  root.append(node);
  strengthToast = { node, timer: window.setTimeout(() => (strengthToast = drop(strengthToast)), SHOWN_MS) };
  return light;
}

/** The banner of the way chosen (mastery) or of the class armour: a band across the screen, as a boss's name comes. */
export function showBanner(title: string, small: string): void {
  const root = ui();
  if (!root) return;
  const node = h('div', 'fl-banner', h('span', 'big', title), h('span', 'small', small));
  node.setAttribute('role', 'status');
  root.append(node);
  window.setTimeout(() => node.remove(), quality.reducedMotion ? 2600 : 2200);
}

/* ---------- the passport ---------- */

export interface PassportOptions {
  world: World;
  hero: Hero;
  /** The class's start (HERO_CLASSES): health and strength. */
  start: { ht: number; str: number };
  turn: number;
  portrait: HTMLElement;
  /** A slot in the backpack's look, for the worn things. */
  slotOf(item: Item): HTMLElement;
  itemName(item: Item): string;
}

/** The cloth armour a hero sets out in. */
const START_ARMOR = armorStats(createItem('armor.cloth')).dr;

/** The figures a worn thing is known by: those of a plain one while its level is hidden. */
const shown = (item: Item): Item => (levelKnown(item) ? item : { ...item, level: 0, durability: undefined, glyph: undefined });

function equipRow(o: PassportOptions, item: Item): HTMLElement {
  const category = itemDef(item.kind).category;
  const known = levelKnown(item);
  let figure = '';
  if (category === 'weapon') {
    const w = weaponStats(shown(item));
    figure = `${w.min}–${w.max}${known ? '' : '?'}`;
  } else if (category === 'armor') {
    figure = `${G.passport.armor} ${armorStats(shown(item)).dr}${known ? '' : '?'} (${G.passport.was} ${START_ARMOR})`;
  } else if (!known || !kindKnown(o.world, item)) {
    figure = G.passport.learning;
  }
  return h('div', 'fl-equip-row', o.slotOf(item), h('span', 'fl-equip-name', o.itemName(item)), h('span', 'fl-equip-num', figure));
}

/** What each bar is drawn against (a share of what a hero can come to). */
const BAR_MAX = { lvl: 30, hp: 150, str: 20, acc: 40, eva: 40 } as const;

/** The hero's passport (A): head, «was → is» since the start of the run with a bar, what is worn. */
export function passportNode(o: PassportOptions): HTMLElement {
  const { hero } = o;
  const p = passportOf(hero, o.start);
  const rows = [
    ['lvl', G.passport.stats.lvl, p.lvl, BAR_MAX.lvl],
    ['hp', G.passport.stats.hp, p.ht, BAR_MAX.hp],
    ['str', G.passport.stats.str, p.str, BAR_MAX.str],
    ['acc', G.passport.stats.acc, p.attack, BAR_MAX.acc],
    ['eva', G.passport.stats.eva, p.defense, BAR_MAX.eva],
  ] as const;
  const stats = h('div', 'fl-stats');
  for (const [icon, name, [was, is], max] of rows) {
    stats.append(
      gi(icon, 12, 2),
      h('span', 'fl-stat-name', name),
      h('span', 'fl-stat-val', is),
      h('span', `fl-stat-delta${is === was ? ' zero' : ''}`, is === was ? '=' : `+${is - was}`),
      h('span'),
      vars(h('span', 'fl-grew'), { '--was': Math.min(1, was / max).toFixed(3), '--is': Math.min(1, is / max).toFixed(3) }),
    );
  }
  const seen = knownHero(o.world, hero);
  const hidden = hero.rings.length > seen.rings.length;
  const way = hero.subclass ? t.subclasses[hero.subclass] : null;
  const sub: GChild[] = [t.classes[hero.heroClass]];
  if (way) sub.push(' · ', gi('sigil', 16, 1.5), h('span', 'fl-sigil-tag', way));
  const head = h('div', 'fl-pass-head',
    o.portrait,
    h('span', 'fl-pass-name', hero.name),
    h('span', 'fl-pass-sub', ...sub),
    h('span', 'fl-pass-sub', G.passport.where(hero.depth, o.turn)));
  const net = h('p', 'fl-tip', gi('ring', 12, 1.5), G.passport.withWorn(heroAttackSkill(seen), heroDefenseSkill(seen)) + (hidden ? G.passport.hiddenRing : ''));
  const worn = [hero.weapon, hero.armor, ...hero.rings].filter((i): i is Item => !!i);
  const extra = h('p', 'fl-tip', gi('xp', 12, 1.5), `${G.passport.extra.exp} ${hero.exp}/${maxExp(hero)} · ${G.passport.extra.gold} ${hero.gold} · ${G.passport.extra.kills} ${hero.kills}`);
  return h('div', 'fl-pass',
    head,
    h('p', 'pd-info-head', G.passport.since),
    stats,
    net,
    extra,
    h('p', 'pd-info-head', G.passport.worn),
    h('div', 'fl-equip-rows', ...worn.map((item) => equipRow(o, item))));
}
