import {
  awareness, buyPrice, type Hero, heroArmor, type Item, type ItemKind, isStarving, type Level, LAST_SHOP_DEPTH, levelKnown, ringBonus, type TrapKind, T, type World,
} from '@pd/core';
import { AWARENESS_CAP, knownHero } from './growth';

/*
 * The numbers on the «How it works» cards of design part 11 (docs/design/system/firelight-growth.md, 4): rest, search, traps, wells,
 * shops, keys. Hunger has hungerinfo.ts, the alchemy pot brewodds.ts, strength growth.ts strengthEffects. Each figure repeats what the
 * core does, with the place named beside it, and a test (test/mechinfo.test.ts) runs the core and compares, so a rule changed there
 * fails the test. Nothing here changes the rules, and nothing here touches the DOM.
 *
 * LEAK RULE: a worn ring whose kind or level is still hidden must not move a figure, or the card would give away what it is (and how
 * good): such rings are left out of the sums (growth.ts knownHero), the same as the hunger card does, and the report says one is worn.
 * The armour's level is held to the same rule: while it is unknown the armour counts as a plain one of its kind (as itemtext.ts does).
 */

export interface Span {
  min: number;
  max: number;
}

/** The hero as far as the player may know him; `hiddenRing` says a ring worn is left out. */
function seen(world: World, hero: Hero): { hero: Hero; hiddenRing: boolean } {
  const known = knownHero(world, hero);
  return { hero: known, hiddenRing: hero.rings.length > known.rings.length };
}

/* ---------- Rest ---------- */

/** World.REGENERATION_DELAY: turns for a hit point. */
export const REGENERATION_DELAY = 10;
/** World.spend: a ring of mending (the core's name for the ring of regeneration) divides the delay by this to the power of its level. */
export const MENDING_BASE = 1.2;

export interface RestReport {
  /** Turns for one hit point (REGENERATION_DELAY / 1.2^mending). */
  delay: number;
  /** The levels of the ring of mending worn and fully known (0: none). */
  mending: number;
  /** Hit points missing. */
  missing: number;
  /** A starving body does not heal (Regeneration: world.ts spend). */
  starving: boolean;
  /** Turns until the last missing point is back, counting the time already run toward the next one (null: never, starving). */
  turnsToFull: number | null;
  /** A ring is worn whose kind or level is hidden: it is not in the figures. */
  hiddenRing: boolean;
}

/** World.spend: `regen` runs up by the time spent; each time it reaches the delay (10 / 1.2^mending) a hit point returns, unless starving. */
export function restInfo(world: World, hero: Hero): RestReport {
  const { hero: known, hiddenRing } = seen(world, hero);
  const mending = ringBonus(known, 'ring.mending');
  const delay = REGENERATION_DELAY / MENDING_BASE ** mending;
  const missing = Math.max(0, hero.ht - hero.hp);
  const starving = isStarving(hero);
  return {
    delay,
    mending,
    missing,
    starving,
    turnsToFull: missing === 0 ? 0 : starving ? null : Math.ceil(missing * delay - hero.regen - 1e-6),
    hiddenRing,
  };
}

/* ---------- Search ---------- */

/** World.TIME_TO_SEARCH. */
export const SEARCH_TURNS = 2;
/** World.SEARCH_RADIUS: a deliberate search reaches this far (a step, 1). */
export const SEARCH_RADIUS = 2;

export interface SearchReport {
  /** Turns a search takes, and what it takes when it turns something up (world.ts: a find may cost the turns again, with the chance `slowIfFound`). */
  turns: number;
  turnsIfSlow: number;
  slowIfFound: number;
  /** Cells around the hero a deliberate search covers (every hidden thing in view within it is found), and a plain step (ring of detection widens both). */
  radius: number;
  stepRadius: number;
  /** The chance a step notices each hidden thing in its radius (actors.ts awareness), and what it grows to. */
  chance: number;
  chanceAtCap: number;
  /** The hero's level that sharpens the eye no more (it stays as it is from here on). */
  capLevel: number;
  lvl: number;
  /** The levels of the ring of detection worn and fully known (0: none). */
  detection: number;
  rogue: boolean;
  hiddenRing: boolean;
}

/** Hero.search (world.ts search) and awareness (actors.ts): the radius, the time and the chance of a step. */
export function searchInfo(world: World, hero: Hero): SearchReport {
  const { hero: known, hiddenRing } = seen(world, hero);
  const detection = ringBonus(known, 'ring.detection');
  const chance = awareness(hero);
  return {
    turns: SEARCH_TURNS,
    turnsIfSlow: SEARCH_TURNS * 2,
    // world.ts perform 'search': the time doubles when something was found and the roll is not under 1 - (1 - chance)^2.
    slowIfFound: (1 - chance) ** 2,
    radius: Math.max(0, SEARCH_RADIUS + detection),
    stepRadius: Math.max(0, 1 + detection),
    chance,
    chanceAtCap: awareness({ ...hero, lvl: AWARENESS_CAP }),
    capLevel: AWARENESS_CAP,
    lvl: hero.lvl,
    detection,
    rogue: hero.heroClass === 'rogue',
    hiddenRing,
  };
}

/* ---------- Traps ---------- */

/** The colours the traps are drawn in (the guide's legend, i18n-guide trapColours); the black one is a trap gone off. */
export type TrapColour = 'green' | 'orange' | 'yellow' | 'violet' | 'red' | 'teal' | 'grey' | 'white';

export interface TrapInfo {
  kind: TrapKind;
  /** The visible tile (the core's T.*_TRAP; the hidden one is the SECRET_ twin). */
  tile: number;
  colour: TrapColour;
  /** toxic, paralytic: the gas let out (traps.ts triggerTrap: 300 + 20 depth, 80 + 5 depth). */
  volume?: number;
  /** toxic: the damage of a breath, each turn in the cloud (gas.ts breathe). */
  breath?: Span;
  /** paralytic: turns held after the last breath (gas.ts PARALYSIS_TURNS). */
  paralysis?: number;
  /** fire: turns on fire and the damage of a turn (traps.ts BURNING_TURNS; world.ts spend); the scrolls in the pack may burn. */
  burning?: { turns: number; perTurn: Span };
  /** poison: turns, a point each (traps.ts triggerTrap: 4 + depth / 2). */
  poison?: { turns: number };
  /** lightning: the damage now, from the hero's present health (traps.ts triggerTrap). */
  bolt?: Span;
  /** gripping: the damage, and the armour that lessens it (traps.ts triggerTrap; the armour as the player knows it). */
  grip?: { damage: Span; armour: number };
  /** summoning: the chance of one, two and three monsters (traps.ts triggerTrap). */
  summon?: readonly [number, number, number];
}

/** gas.ts breathe: the damage of a breath of toxic gas, from the hero's health and the depth. */
function breathOf(ht: number, depth: number): Span {
  const strength = 5 + depth * 5;
  const base = Math.trunc((ht + strength) / 40);
  return { min: base, max: base + ((ht + strength) % 40 > 0 ? 1 : 0) };
}

/** traps.ts lightning: Random.Int(hp / 3, 2 hp / 3) with the top excluded, and at least 1. */
function boltOf(hp: number): Span {
  const lo = Math.trunc(hp / 3);
  const top = Math.trunc((2 * hp) / 3);
  return { min: Math.max(1, lo), max: Math.max(1, top > lo ? top - 1 : lo) };
}

/** The armour as the player may know it: while its level is hidden it counts as a plain one (itemtext.ts typical). */
function shownArmour(hero: Hero): Item | null {
  const armor = hero.armor;
  return armor && !levelKnown(armor) ? { ...armor, level: 0, durability: undefined, glyph: undefined } : armor;
}

/** The eight traps of PD 1.9.2a with the numbers for this hero at his depth. */
export function trapInfo(_world: World, hero: Hero): TrapInfo[] {
  const depth = hero.depth;
  const armour = heroArmor({ ...hero, armor: shownArmour(hero) });
  // traps.ts gripping: the damage is depth + 3 less a roll of 0 to half the armour.
  const grip = depth + 3;
  return [
    { kind: 'toxic', tile: T.TOXIC_TRAP, colour: 'green', volume: 300 + 20 * depth, breath: breathOf(hero.ht, depth) },
    { kind: 'fire', tile: T.FIRE_TRAP, colour: 'orange', burning: { turns: 8, perTurn: { min: 1, max: 3 + Math.trunc(depth / 4) } } },
    { kind: 'paralytic', tile: T.PARALYTIC_TRAP, colour: 'yellow', volume: 80 + 5 * depth, paralysis: 5 },
    { kind: 'poison', tile: T.POISON_TRAP, colour: 'violet', poison: { turns: 4 + Math.trunc(depth / 2) } },
    { kind: 'alarm', tile: T.ALARM_TRAP, colour: 'red' },
    { kind: 'lightning', tile: T.LIGHTNING_TRAP, colour: 'teal', bolt: boltOf(hero.hp) },
    { kind: 'gripping', tile: T.GRIPPING_TRAP, colour: 'grey', grip: { damage: { min: Math.max(0, grip - Math.trunc(armour / 2)), max: grip }, armour } },
    { kind: 'summoning', tile: T.SUMMONING_TRAP, colour: 'white', summon: [0.5, 0.25, 0.25] },
  ];
}

/* ---------- Wells ---------- */

export type WellWater = Level['wells'][number]['water'];

export interface WellFact {
  water: WellWater;
  /** Stepping into it (world.ts drinkFromWell), or dropping a thing into it (inventory.ts dropFromPack). */
  how: 'step' | 'drop';
  /** What it does, in the core's terms. */
  does: readonly ('heal' | 'cure' | 'feed' | 'identify' | 'map' | 'transmute')[];
}

/** The kinds of well and what each does; a well runs dry once used. */
export const WELLS: readonly WellFact[] = [
  { water: 'health', how: 'step', does: ['heal', 'cure', 'feed'] },
  { water: 'awareness', how: 'step', does: ['identify', 'map'] },
  { water: 'transmutation', how: 'drop', does: ['transmute'] },
];

/* ---------- Shops ---------- */

/** Where the shopkeepers stand (level/builder.ts isShopDepth: 6, 11, 16, and the last shop). */
export const SHOP_DEPTHS: readonly number[] = [6, 11, 16, LAST_SHOP_DEPTH];

export interface ShopReport {
  /** Buying: a price is the item's value × 5 × (depth / 5 + 1) (items.ts buyPrice), whole-number division. */
  multiplier: number;
  /** A ring of haggler, known through and through, halves it. */
  haggle: boolean;
  /** Selling asks the item's own value (inventory.ts sell). */
  sellMultiplier: 1;
  hiddenRing: boolean;
}

export function shopInfo(world: World, hero: Hero): ShopReport {
  const { hero: known, hiddenRing } = seen(world, hero);
  return {
    multiplier: 5 * (Math.trunc(hero.depth / 5) + 1),
    haggle: known.rings.some((ring) => ring.kind === 'ring.haggler'),
    sellMultiplier: 1,
    hiddenRing,
  };
}

/** What a shopkeeper at the hero's depth would ask for an item (the core's buyPrice, with the haggling the player knows of). */
export function priceHere(world: World, hero: Hero, item: Item): number {
  return buyPrice(item, hero.depth, world.known.includes(item.kind), shopInfo(world, hero).haggle);
}

/* ---------- Keys ---------- */

export interface KeyFact {
  kind: 'key.iron' | 'key.golden' | 'key.skeleton';
  /** What it opens: a locked door, a locked chest (vault), the way down on a boss's level. */
  opens: 'door' | 'chest' | 'exit';
  /** The tile it opens, where it is a tile. */
  tile?: number;
  /** Each key is of one depth (Item.depth) and is used up by the lock. */
  perDepth: true;
}

/** world.ts perform 'move' (iron, skeleton) and inventory.ts goldenKeyFor (golden). */
export const KEYS: readonly KeyFact[] = [
  { kind: 'key.iron', opens: 'door', tile: T.LOCKED_DOOR, perDepth: true },
  { kind: 'key.golden', opens: 'chest', perDepth: true },
  { kind: 'key.skeleton', opens: 'exit', tile: T.LOCKED_EXIT, perDepth: true },
];

/** The keys in the pack, and whether each fits a lock of the depth the hero is on. */
export function keysHeld(hero: Hero): Array<{ kind: KeyFact['kind']; depth: number; here: boolean }> {
  return hero.items.flatMap((item) => {
    const fact = KEYS.find((key) => key.kind === item.kind);
    return fact && item.depth !== undefined ? [{ kind: fact.kind, depth: item.depth, here: item.depth === hero.depth }] : [];
  });
}
