import { type Hero, type Item, itemDef, type ItemKind, type World } from '@pd/core';

/*
 * What an alchemy pot makes of the seeds in it, by the core's own formula (inventory.ts brew, Heap.transmute): three seeds or
 * more, and nothing else, brew a potion; with N seeds the potion is a random one with the chance 1 in N, otherwise the potion of
 * one of the seeds, picked in proportion to their numbers. The core keeps the seeds' potions and the three to itself; this copy
 * of them is held to what the pot does by a test (test/brewodds.test.ts), and to the guide's own list.
 */

/** SEEDS_TO_POTION. */
export const SEEDS_TO_BREW = 3;

/** Plant.Seed.alchemyClass: the potion each seed brews into. */
export const POTION_OF_SEED: Readonly<Partial<Record<ItemKind, ItemKind>>> = {
  'seed.firebloom': 'potion.liquidFlame',
  'seed.icecap': 'potion.frost',
  'seed.sorrowmoss': 'potion.toxicGas',
  'seed.dreamweed': 'potion.invisibility',
  'seed.sungrass': 'potion.healing',
  'seed.earthroot': 'potion.paralyticGas',
  'seed.fadeleaf': 'potion.mindVision',
  'seed.rotberry': 'potion.strength',
};

export interface SeedCount {
  kind: ItemKind;
  qty: number;
}

export interface BrewOdds {
  /** Seeds in the pot. */
  count: number;
  /** Whether that is enough to brew. */
  enough: boolean;
  /** The chance of a random potion (any seed with no potion of its own counts toward it). */
  random: number;
  /** The potion of each seed and its chance, the likelier first. */
  own: Array<{ seed: ItemKind; potion: ItemKind; chance: number }>;
}

/** The odds of what comes of these seeds, if the pot had exactly them. */
export function brewOdds(seeds: readonly SeedCount[]): BrewOdds {
  const merged = new Map<ItemKind, number>();
  for (const { kind, qty } of seeds) if (qty > 0) merged.set(kind, (merged.get(kind) ?? 0) + qty);
  const count = [...merged.values()].reduce((sum, qty) => sum + qty, 0);
  const own: BrewOdds['own'] = [];
  let random = count > 0 ? 1 / count : 0;
  for (const [seed, qty] of merged) {
    const potion = POTION_OF_SEED[seed];
    const chance = (qty / count) * (1 - 1 / count);
    if (potion) own.push({ seed, potion, chance });
    else random += chance;
  }
  own.sort((a, b) => b.chance - a.chance);
  return { count, enough: count >= SEEDS_TO_BREW, random, own };
}

/** The seeds an item stack is, if it is seeds. */
export const isSeed = (item: Item): boolean => itemDef(item.kind).category === 'seed';

/** The seeds of the pack, one line to a kind (they may lie in several stacks). */
export function seedsIn(hero: Hero): SeedCount[] {
  const counts = new Map<ItemKind, number>();
  for (const item of hero.items) if (isSeed(item)) counts.set(item.kind, (counts.get(item.kind) ?? 0) + item.qty);
  return [...counts].map(([kind, qty]) => ({ kind, qty }));
}

/** The seeds lying in the pot at `cell` now, if the hero can see what lies there, and whether anything else spoils the brew. */
export function seedsInPot(world: World, hero: Hero, cell: number): { seeds: SeedCount[]; spoiled: boolean } {
  const heap = world.floors[hero.depth]?.heaps.find((h) => h.pos === cell);
  const items = heap?.items ?? [];
  const counts = new Map<ItemKind, number>();
  for (const item of items) if (isSeed(item)) counts.set(item.kind, (counts.get(item.kind) ?? 0) + item.qty);
  return { seeds: [...counts].map(([kind, qty]) => ({ kind, qty })), spoiled: items.some((item) => !isSeed(item)) };
}
