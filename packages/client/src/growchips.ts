import { type Hero, type Item, itemDef, type ItemKind, kindKnown, levelKnown, type World } from '@pd/core';
import { h, hb, spriteNode } from './growdom';
import { gi } from './growicons';
import { G } from './i18n-grow';

/*
 * The backpack's filters (part 11, variant A «chips»): one row that scrolls sideways, a chip for each group with its count; «New» and
 * «Unidentified» come first. A chip dims the rest of the pack, it never hides it (bagflow's way). The sort is the order of the grid:
 * by type (the game's own, PD's) or the new things first — a matter of showing only; the pack of the core is not touched. Pure
 * rules in `chipOf`; every answer comes from what the party knows (kindKnown, levelKnown), so a chip never gives a hidden thing away.
 */

export type ChipId = 'all' | 'fresh' | 'unknown' | 'weapon' | 'armor' | 'potion' | 'scroll' | 'ring' | 'wand' | 'seed' | 'food' | 'quest';
export type SortId = 'type' | 'fresh';

/** The order of the chips, and the sprite each shows (the real item sprites of items.png). */
export const CHIPS: readonly ChipId[] = ['all', 'fresh', 'unknown', 'weapon', 'armor', 'potion', 'scroll', 'ring', 'wand', 'seed', 'food', 'quest'];
const CHIP_KIND: Partial<Record<ChipId, ItemKind>> = {
  weapon: 'weapon.sword', armor: 'armor.mail', potion: 'potion.healing', scroll: 'scroll.identify', ring: 'ring.accuracy', wand: 'wand.lightning',
  seed: 'seed.sungrass', food: 'food.ration', quest: 'key.iron',
};
/** Potions, scrolls, rings and wands show a plain bottle, scroll, band and stick (never the look of this run). */
const CHIP_SPRITE: Partial<Record<ChipId, number>> = { potion: 56, scroll: 40, ring: 72, wand: 68 };

const GROUP: Readonly<Record<string, ChipId>> = {
  weapon: 'weapon', missile: 'weapon', armor: 'armor', potion: 'potion', scroll: 'scroll', ring: 'ring', wand: 'wand', seed: 'seed', food: 'food',
  quest: 'quest', ankh: 'quest', key: 'quest', tome: 'quest', kit: 'quest',
};

/** The group an item belongs to (null: only «All» holds it). */
export const groupOf = (item: Item): ChipId | null => GROUP[itemDef(item.kind).category] ?? null;

/** Not known through and through: its kind (potions, scrolls, rings, wands) or its level (gear) is still hidden. */
export const isUnknown = (world: World, item: Item): boolean => !kindKnown(world, item) || !levelKnown(item);

/** Whether an item passes a chip. `fresh`: the client's memory of what is new. */
export function chipOf(chip: ChipId, world: World, item: Item, fresh: (item: Item) => boolean): boolean {
  switch (chip) {
    case 'all': return true;
    case 'fresh': return fresh(item);
    case 'unknown': return isUnknown(world, item);
    default: return groupOf(item) === chip;
  }
}

export function chipCounts(world: World, hero: Hero, fresh: (item: Item) => boolean): Record<ChipId, number> {
  const counts = Object.fromEntries(CHIPS.map((c) => [c, 0])) as Record<ChipId, number>;
  const all = [...hero.items, ...(hero.weapon ? [hero.weapon] : []), ...(hero.armor ? [hero.armor] : []), ...hero.rings];
  for (const item of all) for (const chip of CHIPS) if (chipOf(chip, world, item, fresh)) counts[chip]++;
  return counts;
}

/** The chips that have something to show (a group with nothing in the pack is not offered; «All» always is). */
export const visibleChips = (counts: Record<ChipId, number>, current: ChipId): ChipId[] => CHIPS.filter((c) => c === 'all' || c === current || counts[c] > 0);

/** The pack's order for «new first»: the new things in front, each side keeping the order it had. */
export function sortFresh<T>(entries: readonly T[], isNew: (entry: T) => boolean): T[] {
  return [...entries.filter(isNew), ...entries.filter((e) => !isNew(e))];
}

function chipIcon(chip: ChipId): Node | null {
  if (chip === 'fresh') return gi('new', 8, 2);
  if (chip === 'unknown') return gi('unknown', 8, 2);
  const sprite = CHIP_SPRITE[chip];
  if (sprite !== undefined) return spriteNode(sprite);
  const kind = CHIP_KIND[chip];
  const def = kind ? itemDef(kind).sprite : undefined;
  return def === undefined ? null : spriteNode(def);
}

export interface ChipsOptions {
  current: ChipId;
  sort: SortId;
  counts: Record<ChipId, number>;
  onFilter(chip: ChipId): void;
  onSort(sort: SortId): void;
}

/** The row of chips with the sort at its end. */
export function chipsRow(options: ChipsOptions): HTMLElement {
  const row = h('div', 'fl-chips pd-bag-filter');
  row.setAttribute('role', 'toolbar');
  row.ariaLabel = G.bag.filterLabel;
  for (const chip of visibleChips(options.counts, options.current)) {
    const pressed = chip === options.current;
    const node = hb(`fl-chip${chip === 'fresh' || chip === 'unknown' ? ' hot' : ''}`, `${G.bag.chips[chip]} ${options.counts[chip]}`, () => options.onFilter(chip), chipIcon(chip), G.bag.chips[chip], ' ', h('b', '', options.counts[chip]));
    node.setAttribute('aria-pressed', String(pressed));
    row.append(node);
  }
  const sort = hb('fl-chip fl-sort', G.bag.sortLabel, () => options.onSort(options.sort === 'type' ? 'fresh' : 'type'), gi('sort', 16, 1), options.sort === 'type' ? G.bag.sortType : G.bag.sortFresh);
  row.append(sort);
  return row;
}
