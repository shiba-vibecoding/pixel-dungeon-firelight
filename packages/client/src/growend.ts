import { armorStats, createItem, type Hero, type Item, levelKnown, type World, weaponStats } from '@pd/core';
import { h } from './growdom';
import { gi } from './growicons';
import { chronicleLine } from './growknow';
import { passport as passportOf } from './growth';
import type { GrowMem } from './growmem';
import { t } from './i18n';
import { G } from './i18n-grow';

/*
 * The end of a run (part 11, variant A, «the growth card»): how the hero grew «was → is» from the class's start, the best of what he
 * wore and the finds of the run, from what the client remembered of it (growmem.ts). The figures are the game's own and no more than the
 * player knows: a weapon or armour worn with a hidden level counts as a plain one, with a «?».
 */

/** Which moments of the chronicle are finds (the first upgrade, an ankh, a way chosen, enchantments, bosses...), at most this many. */
const FIND_KINDS = new Set(['firstUpgrade', 'ankh', 'mastery', 'classArmor', 'enchant', 'boss', 'uncurse', 'victory']);
export const MAX_FINDS = 6;

const shown = (item: Item): Item => (levelKnown(item) ? item : { ...item, level: 0, durability: undefined, glyph: undefined });

export interface GrowthCardOptions {
  world: World;
  hero: Hero;
  mem: GrowMem;
  start: { ht: number; str: number };
  slotOf(item: Item): HTMLElement;
  nameOf(item: Item): string;
}

/** The finds of the run, in the order they came: the lines of the chronicle that are worth a mention. */
export function findsOf(world: World, mem: GrowMem): Array<{ icon: HTMLElement; text: string; depth: number }> {
  const out: Array<{ icon: HTMLElement; text: string; depth: number }> = [];
  for (const e of mem.chronicle) {
    if (!FIND_KINDS.has(e.kind)) continue;
    const line = chronicleLine(world, e);
    if (line) out.push({ icon: line.icon, text: line.text, depth: line.depth });
    if (out.length >= MAX_FINDS) break;
  }
  return out;
}

export function growthCard(o: GrowthCardOptions): HTMLElement {
  const { hero } = o;
  const p = passportOf(hero, o.start);
  const startWeapon = weaponStats(createItem(hero.heroClass === 'warrior' ? 'weapon.shortSword' : hero.heroClass === 'mage' ? 'weapon.knuckles' : 'weapon.dagger'));
  const startArmor = armorStats(createItem('armor.cloth')).dr;
  const grid = h('div', 'fl-growrow');
  const row = (icon: string, name: string, was: number, is: number, mark = ''): void => {
    grid.append(gi(icon, 12, 2), h('span', '', name), h('span', 'was', was), h('span', 'arrow', '→'), h('span', 'is', `${is}${mark}`));
  };
  row('lvl', G.end.level, p.lvl[0], p.lvl[1]);
  row('hp', G.end.health, p.ht[0], p.ht[1]);
  row('str', G.end.strength, p.str[0], p.str[1]);
  if (hero.armor) row('dr', G.end.armor, startArmor, armorStats(shown(hero.armor)).dr, levelKnown(hero.armor) ? '' : '?');
  if (hero.weapon) row('dmg', G.end.bestHit, startWeapon.max, weaponStats(shown(hero.weapon)).max, levelKnown(hero.weapon) ? '' : '?');
  const best = h('div', 'fl-best',
    ...(hero.weapon ? [o.slotOf(hero.weapon), h('span', 'nm', o.nameOf(hero.weapon))] : []),
    ...(hero.armor ? [o.slotOf(hero.armor), h('span', 'nm', o.nameOf(hero.armor))] : []));
  const finds = findsOf(o.world, o.mem);
  const list = finds.length === 0
    ? h('p', 'pd-note', G.end.nothing)
    : h('div', 'fl-ribbon', ...finds.map((f) => h('div', 'fl-rib', f.icon, f.text, h('span', 'when', t.newDepth(f.depth)))));
  return h('div', 'fl-endcard',
    h('p', 'pd-info-head', G.end.growth), grid,
    h('p', 'pd-info-head', G.end.best), best,
    h('p', 'pd-info-head', G.end.finds), list);
}
