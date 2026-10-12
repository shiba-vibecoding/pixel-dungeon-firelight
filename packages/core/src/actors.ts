import { armorStats, createItem, type Item, type ItemKind, missileStats, weaponStats } from './items';
import type { Rng } from './rng';
import type { Action } from './world';

/*
 * Heroes and monsters as plain data, with the numbers of the original:
 * starting kits (HeroClass, MeleeWeapon, Armor), Hero and Mob stats and the
 * sewer part of the Bestiary.
 */

const f32 = Math.fround;

export type HeroClass = 'warrior' | 'mage' | 'rogue' | 'huntress';

interface ClassKit {
  ht: number;
  str: number;
  weapon: ItemKind;
  /** Extra starting items and how many. */
  items: ReadonlyArray<readonly [ItemKind, number]>;
  stealth: number;
}

export const HERO_CLASSES: Readonly<Record<HeroClass, ClassKit>> = {
  warrior: { ht: 20, str: 11, weapon: 'weapon.shortSword', items: [['missile.dart', 8]], stealth: 0 },
  mage: { ht: 20, str: 10, weapon: 'weapon.knuckles', items: [['wand.magicMissile', 1]], stealth: 0 },
  // The rogue's starting ring of shadows +1.
  rogue: { ht: 20, str: 10, weapon: 'weapon.dagger', items: [['missile.dart', 8]], stealth: 1 },
  huntress: { ht: 15, str: 10, weapon: 'weapon.dagger', items: [['missile.boomerang', 1]], stealth: 0 },
};

/** Backpack slots, equipment aside. */
export const BACKPACK_SIZE = 20;

export interface Hero {
  id: string;
  name: string;
  heroClass: HeroClass;
  depth: number;
  pos: number;
  hp: number;
  ht: number;
  str: number;
  lvl: number;
  exp: number;
  /** Base accuracy and evasion; each grows by one per level. */
  attackSkill: number;
  defenseSkill: number;
  /** When the hero acts next, on its depth's clock. */
  time: number;
  /** The player's chosen action, performed when the hero's turn comes. */
  intent: Action | null;
  /** Time spent since the last regenerated hit point. */
  regen: number;
  /** Caustic ooze from Goo: time since it last burned, or -1 when clean. Water washes it off. */
  ooze: number;
  weapon: Item;
  armor: Item;
  items: Item[];
  gold: number;
  /** Turns left of sensing every monster on the level / of being unseen. */
  mindVision: number;
  invisible: number;
  /** Turns left of poison (1 damage a turn), burning (washed off by water) and paralysis. */
  poison: number;
  burning: number;
  paralysed: number;
  /** Turns left of being rooted to the spot and of moving at half speed (mystery meat). */
  rooted: number;
  slowed: number;
  /** Hunger.level: 0 when fed, hungry from HUNGRY, starving at STARVING; and time towards its next step. */
  hunger: number;
  hungerTime: number;
  /** For the end of the run: monsters slain, and what dealt the killing blow. */
  kills: number;
  killedBy: string | null;
}

export interface PlayerInfo {
  id: string;
  name: string;
  heroClass: HeroClass;
}

export function createHero(player: PlayerInfo, depth: number, pos: number, time: number): Hero {
  const kit = HERO_CLASSES[player.heroClass];
  return {
    id: player.id,
    name: player.name,
    heroClass: player.heroClass,
    depth,
    pos,
    hp: kit.ht,
    ht: kit.ht,
    str: kit.str,
    lvl: 1,
    exp: 0,
    attackSkill: 10,
    defenseSkill: 5,
    time,
    intent: null,
    regen: 0,
    ooze: -1,
    weapon: createItem(kit.weapon),
    armor: createItem('armor.cloth'),
    // Everyone sets out with a ration of food (HeroClass.initCommon).
    items: [...kit.items.map(([kind, qty]) => createItem(kind, qty)), createItem('food.ration')],
    gold: 0,
    mindVision: 0,
    invisible: 0,
    poison: 0,
    burning: 0,
    paralysed: 0,
    rooted: 0,
    slowed: 0,
    hunger: 0,
    hungerTime: 0,
    kills: 0,
    killedBy: null,
  };
}

export const isAlive = (char: { hp: number }): boolean => char.hp > 0;

/* Hunger */

export const HUNGRY = 260;
export const STARVING = 360;
/** Hunger grows by this much every this many turns; rogues go longer without food. */
export const HUNGER_STEP = 10;
export const hungerStep = (hero: Hero): number => (hero.heroClass === 'rogue' ? HUNGER_STEP * 1.2 : HUNGER_STEP);
export const isStarving = (hero: Hero): boolean => hero.hunger >= STARVING;
export const isHungry = (hero: Hero): boolean => hero.hunger >= HUNGRY;

export function heroAttackSkill(hero: Hero): number {
  const weapon = weaponStats(hero.weapon);
  const encumbrance = weapon.str - hero.str;
  const factor = encumbrance > 0 ? f32(weapon.accuracy / 1.5 ** encumbrance) : f32(weapon.accuracy);
  return Math.trunc(f32(hero.attackSkill * factor));
}

export function heroDefenseSkill(hero: Hero): number {
  const encumbrance = armorStats(hero.armor).str - hero.str;
  if (encumbrance > 0) {
    return Math.trunc(hero.defenseSkill / 1.5 ** encumbrance);
  }
  // Rogues turn spare strength into evasion.
  return hero.heroClass === 'rogue' ? hero.defenseSkill - encumbrance : hero.defenseSkill;
}

/**
 * Accuracy with a thrown weapon (Hero.attackSkill with a ranged weapon):
 * warriors are clumsy with them, huntresses deft, and nobody throws well
 * point-blank.
 */
export function heroRangedSkill(hero: Hero, item: Item, pointBlank: boolean): number {
  let encumbrance = missileStats(item).str - hero.str;
  if (hero.heroClass === 'warrior') encumbrance += 3;
  if (hero.heroClass === 'huntress') encumbrance -= 2;
  let factor = encumbrance > 0 ? f32(1 / 1.5 ** encumbrance) : 1;
  if (pointBlank) factor = f32(factor * 0.5);
  return Math.trunc(f32(hero.attackSkill * factor));
}

/** Heavy armour slows its wearer down (Hero.speed). */
export function heroSpeed(hero: Hero): number {
  const encumbrance = armorStats(hero.armor).str - hero.str;
  return encumbrance > 0 ? 1.3 ** -encumbrance : 1;
}

export function heroDamageRoll(hero: Hero, rng: Rng): number {
  const weapon = weaponStats(hero.weapon);
  let damage = rng.normalIntRange(weapon.min, weapon.max);
  if (hero.heroClass !== 'huntress') {
    const excess = hero.str - weapon.str;
    if (excess > 0) {
      damage += rng.intRange(0, excess);
    }
  }
  return damage;
}

export function heroAttackDelay(hero: Hero): number {
  const weapon = weaponStats(hero.weapon);
  const encumbrance = weapon.str - hero.str;
  return encumbrance > 0 ? f32(weapon.delay * 1.2 ** encumbrance) : weapon.delay;
}

/** Chance to notice a hidden door or trap next to the hero, as Hero.updateAwareness. */
export function awareness(hero: Hero): number {
  return 1 - (hero.heroClass === 'rogue' ? 0.85 : 0.9) ** ((1 + Math.min(hero.lvl, 9)) * 0.5);
}

export const heroArmor = (hero: Hero): number => armorStats(hero.armor).dr;
export const heroStealth = (hero: Hero): number => HERO_CLASSES[hero.heroClass].stealth;
export const maxExp = (hero: Hero): number => 5 + hero.lvl * 5;

/* Monsters */

export type MobKind = 'rat' | 'gnoll' | 'crab' | 'goo' | 'ghost';
/** `passive`: the sad ghost, who neither fights nor can be hurt. */
export type MobState = 'sleeping' | 'wandering' | 'hunting' | 'passive';

export interface MobStats {
  name: string;
  ht: number;
  attack: number;
  defense: number;
  damage: readonly [number, number];
  dr: number;
  exp: number;
  /** Heroes above this level no longer learn anything from it. */
  maxLvl: number;
  speed: number;
}

export const MOBS: Readonly<Record<MobKind, MobStats>> = {
  rat: { name: 'marsupial rat', ht: 8, attack: 8, defense: 3, damage: [1, 5], dr: 1, exp: 1, maxLvl: 5, speed: 1 },
  gnoll: { name: 'gnoll scout', ht: 12, attack: 11, defense: 4, damage: [2, 5], dr: 2, exp: 2, maxLvl: 8, speed: 1 },
  crab: { name: 'sewer crab', ht: 15, attack: 12, defense: 5, damage: [3, 6], dr: 4, exp: 3, maxLvl: 9, speed: 2 },
  goo: { name: 'Goo', ht: 80, attack: 15, defense: 12, damage: [2, 12], dr: 2, exp: 10, maxLvl: 30, speed: 1 },
  ghost: { name: 'sad ghost', ht: 1, attack: 0, defense: 1000, damage: [0, 0], dr: 0, exp: 0, maxLvl: 0, speed: 0.5 },
};

/** Goo, pumped up: harder hits from up to two cells away. */
export const GOO_PUMPED = { attack: 30, jumpAttack: 15, damage: [5, 30] as const, delay: 2 };

export interface Mob {
  /** '#' followed by a number, so it never clashes with a player id. */
  id: string;
  kind: MobKind;
  pos: number;
  hp: number;
  ht: number;
  state: MobState;
  /** The cell it is heading for, or -1. */
  target: number;
  /** The hero it is after. */
  enemy: string | null;
  enemySeen: boolean;
  /** Hurt since its last turn: it notices whoever is in sight at once. */
  alerted: boolean;
  time: number;
  /** Goo only: pumped up for a big attack. */
  pumped?: boolean;
  /** Turns left of poison and paralysis from trap gas. */
  poison?: number;
  paralysed?: number;
}

export function createMob(id: string, kind: MobKind, pos: number, state: MobState, time: number): Mob {
  const ht = MOBS[kind].ht;
  return { id, kind, pos, hp: ht, ht, state, target: -1, enemy: null, enemySeen: false, alerted: false, time };
}

/*
 * Who lives where. The rare swarm of flies, skeleton and thief of depths 3-4
 * join once their abilities are ported.
 */
const BESTIARY: Readonly<Record<number, ReadonlyArray<readonly [MobKind, number]>>> = {
  1: [['rat', 1]],
  2: [['rat', 1], ['gnoll', 1]],
  3: [['rat', 1], ['gnoll', 2], ['crab', 1]],
  4: [['rat', 1], ['gnoll', 2], ['crab', 3]],
  5: [['goo', 1]],
};

export function rollMob(rng: Rng, depth: number): MobKind {
  const table = BESTIARY[depth] ?? BESTIARY[4]!;
  return table[rng.chances(table.map(([, chance]) => chance))]![0];
}
