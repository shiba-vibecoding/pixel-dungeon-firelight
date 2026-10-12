import type { Rng } from './rng';
import type { Action } from './world';

/*
 * Heroes and monsters as plain data, with the numbers of the original:
 * starting kits (HeroClass, MeleeWeapon, Armor), Hero and Mob stats and the
 * sewer part of the Bestiary.
 */

const f32 = Math.fround;

export type HeroClass = 'warrior' | 'mage' | 'rogue' | 'huntress';

export interface Weapon {
  min: number;
  max: number;
  /** Strength needed to use it without penalties. */
  str: number;
  /** ACU and DLY of the original: accuracy and attack-delay factors. */
  accuracy: number;
  delay: number;
}

/** A tier-1 melee weapon, as MeleeWeapon derives its damage. */
function tier1(accuracy: number, delay: number, str = 10): Weapon {
  return { min: 1, max: Math.trunc(f32(f32(10 / f32(accuracy)) * f32(delay))), str, accuracy, delay };
}

export const WEAPONS = {
  shortSword: tier1(1, 1, 11),
  dagger: tier1(1.2, 1),
  knuckles: tier1(1, 0.5),
} as const;

/** Cloth armour, worn by every class: tier 1. */
const ARMOR = { dr: 2, str: 9 };

interface ClassKit {
  ht: number;
  str: number;
  weapon: Weapon;
  stealth: number;
}

export const HERO_CLASSES: Readonly<Record<HeroClass, ClassKit>> = {
  warrior: { ht: 20, str: 11, weapon: WEAPONS.shortSword, stealth: 0 },
  mage: { ht: 20, str: 10, weapon: WEAPONS.knuckles, stealth: 0 },
  // The rogue's starting ring of shadows +1.
  rogue: { ht: 20, str: 10, weapon: WEAPONS.dagger, stealth: 1 },
  huntress: { ht: 15, str: 10, weapon: WEAPONS.dagger, stealth: 0 },
};

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
  };
}

export const isAlive = (char: { hp: number }): boolean => char.hp > 0;

export function heroAttackSkill(hero: Hero): number {
  const weapon = HERO_CLASSES[hero.heroClass].weapon;
  const encumbrance = weapon.str - hero.str;
  const factor = encumbrance > 0 ? f32(weapon.accuracy / 1.5 ** encumbrance) : f32(weapon.accuracy);
  return Math.trunc(f32(hero.attackSkill * factor));
}

export function heroDefenseSkill(hero: Hero): number {
  const encumbrance = ARMOR.str - hero.str;
  if (encumbrance > 0) {
    return Math.trunc(hero.defenseSkill / 1.5 ** encumbrance);
  }
  // Rogues turn spare strength into evasion.
  return hero.heroClass === 'rogue' ? hero.defenseSkill - encumbrance : hero.defenseSkill;
}

export function heroDamageRoll(hero: Hero, rng: Rng): number {
  const weapon = HERO_CLASSES[hero.heroClass].weapon;
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
  const weapon = HERO_CLASSES[hero.heroClass].weapon;
  const encumbrance = weapon.str - hero.str;
  return encumbrance > 0 ? f32(weapon.delay * 1.2 ** encumbrance) : weapon.delay;
}

/** Chance to notice a hidden door or trap next to the hero, as Hero.updateAwareness. */
export function awareness(hero: Hero): number {
  return 1 - (hero.heroClass === 'rogue' ? 0.85 : 0.9) ** ((1 + Math.min(hero.lvl, 9)) * 0.5);
}

export const heroArmor = (_hero: Hero): number => ARMOR.dr;
export const heroStealth = (hero: Hero): number => HERO_CLASSES[hero.heroClass].stealth;
export const maxExp = (hero: Hero): number => 5 + hero.lvl * 5;

/* Monsters */

export type MobKind = 'rat' | 'gnoll' | 'crab';
export type MobState = 'sleeping' | 'wandering' | 'hunting';

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
};

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
};

export function rollMob(rng: Rng, depth: number): MobKind {
  const table = BESTIARY[depth] ?? BESTIARY[4]!;
  return table[rng.chances(table.map(([, chance]) => chance))]![0];
}
