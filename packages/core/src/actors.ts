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
  /** A ring worn from the start, and its level. */
  ring?: readonly [ItemKind, number];
  stealth: number;
}

export const HERO_CLASSES: Readonly<Record<HeroClass, ClassKit>> = {
  warrior: { ht: 20, str: 11, weapon: 'weapon.shortSword', items: [['missile.dart', 8]], stealth: 0 },
  mage: { ht: 20, str: 10, weapon: 'weapon.knuckles', items: [['wand.magicMissile', 1]], stealth: 0 },
  // The rogue sets out wearing a ring of shadows +1.
  rogue: { ht: 20, str: 10, weapon: 'weapon.dagger', items: [['missile.dart', 8]], ring: ['ring.shadows', 1], stealth: 0 },
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
  /** Rings worn, two at most. */
  rings: Item[];
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
  /** Turns left of weakness (a warlock's shadow bolt): two points of strength less. */
  weakened: number;
  /** Turns left of being crippled (moving at half speed), of a torch's light, and of a succubus's charm. */
  crippled: number;
  light: number;
  charmed: number;
  /** Whom the hero is charmed by, and cannot bring themselves to attack. */
  charmedBy: string | null;
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
    rings: kit.ring ? [createItem(kit.ring[0], 1, kit.ring[1])] : [],
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
    weakened: 0,
    crippled: 0,
    light: 0,
    charmed: 0,
    charmedBy: null,
    hunger: 0,
    hungerTime: 0,
    kills: 0,
    killedBy: null,
  };
}

export const isAlive = (char: { hp: number }): boolean => char.hp > 0;

/** The levels of every worn ring of a kind, added up (several buffs of a kind stack in the original). */
export const ringBonus = (hero: Hero, kind: ItemKind): number =>
  (hero.rings ?? []).reduce((sum, ring) => (ring.kind === kind ? sum + ring.level : sum), 0);

/** Hero.STR: weakness takes two points of strength away while it lasts. */
export const heroStr = (hero: Hero): number => hero.str - (hero.weakened > 0 ? 2 : 0);

/* Hunger */

export const HUNGRY = 260;
export const STARVING = 360;
/** Hunger grows by this much every this many turns; rogues go longer without food. */
export const HUNGER_STEP = 10;
export const hungerStep = (hero: Hero): number => (hero.heroClass === 'rogue' ? HUNGER_STEP * 1.2 : HUNGER_STEP);
/** Hunger.act: how much hunger a step adds; a ring of satiety takes some away (or adds, if negative). */
export const hungerGrowth = (hero: Hero): number => HUNGER_STEP - ringBonus(hero, 'ring.satiety');
export const isStarving = (hero: Hero): boolean => hero.hunger >= STARVING;
export const isHungry = (hero: Hero): boolean => hero.hunger >= HUNGRY;

export function heroAttackSkill(hero: Hero): number {
  const weapon = weaponStats(hero.weapon);
  const encumbrance = weapon.str - heroStr(hero);
  const factor = encumbrance > 0 ? f32(weapon.accuracy / 1.5 ** encumbrance) : f32(weapon.accuracy);
  // RingOfAccuracy: 1.4 times as accurate a level.
  const bonus = ringBonus(hero, 'ring.accuracy');
  const accuracy = bonus === 0 ? 1 : f32(1.4 ** bonus);
  return Math.trunc(f32(f32(hero.attackSkill * accuracy) * factor));
}

export function heroDefenseSkill(hero: Hero): number {
  // RingOfEvasion: 1.2 times as evasive a level.
  const bonus = ringBonus(hero, 'ring.evasion');
  const defense = Math.trunc(f32(hero.defenseSkill * (bonus === 0 ? 1 : f32(1.2 ** bonus))));
  const encumbrance = armorStats(hero.armor).str - heroStr(hero);
  if (encumbrance > 0) {
    return Math.trunc(defense / 1.5 ** encumbrance);
  }
  // Rogues turn spare strength into evasion.
  return hero.heroClass === 'rogue' ? defense - encumbrance : defense;
}

/**
 * Accuracy with a thrown weapon (Hero.attackSkill with a ranged weapon):
 * warriors are clumsy with them, huntresses deft, and nobody throws well
 * point-blank.
 */
export function heroRangedSkill(hero: Hero, item: Item, pointBlank: boolean): number {
  let encumbrance = missileStats(item).str - heroStr(hero);
  if (hero.heroClass === 'warrior') encumbrance += 3;
  if (hero.heroClass === 'huntress') encumbrance -= 2;
  let factor = encumbrance > 0 ? f32(1 / 1.5 ** encumbrance) : 1;
  if (pointBlank) factor = f32(factor * 0.5);
  return Math.trunc(f32(hero.attackSkill * factor));
}

/** Heavy armour slows its wearer down (Hero.speed). */
export function heroSpeed(hero: Hero): number {
  const encumbrance = armorStats(hero.armor).str - heroStr(hero);
  // Char.speed: crippled, half as fast.
  const crippled = hero.crippled > 0 ? 0.5 : 1;
  return (encumbrance > 0 ? 1.3 ** -encumbrance : 1) * crippled;
}

export function heroDamageRoll(hero: Hero, rng: Rng): number {
  const weapon = weaponStats(hero.weapon);
  let damage = rng.normalIntRange(weapon.min, weapon.max);
  if (hero.heroClass !== 'huntress') {
    const excess = heroStr(hero) - weapon.str;
    if (excess > 0) {
      damage += rng.intRange(0, excess);
    }
  }
  return damage;
}

export function heroAttackDelay(hero: Hero): number {
  const weapon = weaponStats(hero.weapon);
  const encumbrance = weapon.str - heroStr(hero);
  return encumbrance > 0 ? f32(weapon.delay * 1.2 ** encumbrance) : weapon.delay;
}

/** Chance to notice a hidden door or trap next to the hero, as Hero.updateAwareness. */
export function awareness(hero: Hero): number {
  return 1 - (hero.heroClass === 'rogue' ? 0.85 : 0.9) ** ((1 + Math.min(hero.lvl, 9)) * 0.5);
}

export const heroArmor = (hero: Hero): number => armorStats(hero.armor).dr;
export const heroStealth = (hero: Hero): number => HERO_CLASSES[hero.heroClass].stealth + ringBonus(hero, 'ring.shadows');
export const maxExp = (hero: Hero): number => 5 + hero.lvl * 5;

/* Monsters */

export type MobKind =
  | 'rat' | 'gnoll' | 'crab' | 'goo' | 'ghost' | 'shopkeeper' | 'wandmaker'
  | 'skeleton' | 'thief' | 'swarm' | 'shaman' | 'bat' | 'brute' | 'tengu'
  | 'spinner' | 'dm300'
  | 'elemental' | 'monk' | 'warlock' | 'golem' | 'king' | 'undead'
  | 'succubus' | 'eye' | 'scorpio' | 'yog' | 'rottingFist' | 'burningFist' | 'larva' | 'mimic';
/** `passive`: the sad ghost and the shopkeeper, who neither fight nor can be hurt; `fleeing`: a thief making off with its loot. */
export type MobState = 'sleeping' | 'wandering' | 'hunting' | 'fleeing' | 'passive';

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
  /** Time a blow takes, if not one turn (the thief strikes twice as fast). */
  attackDelay?: number;
  /** Flies over traps and grass without disturbing them. */
  flying?: boolean;
}

export const MOBS: Readonly<Record<MobKind, MobStats>> = {
  rat: { name: 'marsupial rat', ht: 8, attack: 8, defense: 3, damage: [1, 5], dr: 1, exp: 1, maxLvl: 5, speed: 1 },
  gnoll: { name: 'gnoll scout', ht: 12, attack: 11, defense: 4, damage: [2, 5], dr: 2, exp: 2, maxLvl: 8, speed: 1 },
  crab: { name: 'sewer crab', ht: 15, attack: 12, defense: 5, damage: [3, 6], dr: 4, exp: 3, maxLvl: 9, speed: 2 },
  goo: { name: 'Goo', ht: 80, attack: 15, defense: 12, damage: [2, 12], dr: 2, exp: 10, maxLvl: 30, speed: 1 },
  ghost: { name: 'sad ghost', ht: 1, attack: 0, defense: 1000, damage: [0, 0], dr: 0, exp: 0, maxLvl: 0, speed: 0.5, flying: true },
  shopkeeper: { name: 'shopkeeper', ht: 1, attack: 0, defense: 1000, damage: [0, 0], dr: 0, exp: 0, maxLvl: 0, speed: 1 },
  wandmaker: { name: 'old wandmaker', ht: 1, attack: 0, defense: 1000, damage: [0, 0], dr: 0, exp: 0, maxLvl: 0, speed: 1 },
  // The prison (depths 6-10).
  skeleton: { name: 'skeleton', ht: 25, attack: 12, defense: 9, damage: [3, 8], dr: 5, exp: 5, maxLvl: 10, speed: 1 },
  thief: { name: 'crazy thief', ht: 20, attack: 12, defense: 12, damage: [1, 7], dr: 3, exp: 5, maxLvl: 10, speed: 1, attackDelay: 0.5 },
  swarm: { name: 'swarm of flies', ht: 80, attack: 12, defense: 5, damage: [1, 4], dr: 0, exp: 1, maxLvl: 10, speed: 1, flying: true },
  shaman: { name: 'gnoll shaman', ht: 18, attack: 11, defense: 8, damage: [2, 6], dr: 4, exp: 6, maxLvl: 14, speed: 1 },
  bat: { name: 'vampire bat', ht: 30, attack: 16, defense: 15, damage: [6, 12], dr: 4, exp: 7, maxLvl: 15, speed: 2, flying: true },
  brute: { name: 'gnoll brute', ht: 40, attack: 20, defense: 15, damage: [8, 18], dr: 8, exp: 8, maxLvl: 15, speed: 1 },
  tengu: { name: 'Tengu', ht: 120, attack: 20, defense: 20, damage: [8, 15], dr: 5, exp: 20, maxLvl: 30, speed: 1 },
  // The caves (depths 11-15).
  spinner: { name: 'cave spinner', ht: 50, attack: 20, defense: 14, damage: [12, 16], dr: 6, exp: 9, maxLvl: 16, speed: 1 },
  dm300: { name: 'DM-300', ht: 200, attack: 28, defense: 18, damage: [18, 24], dr: 10, exp: 30, maxLvl: 30, speed: 1 },
  // The dwarven city (depths 16-20).
  elemental: { name: 'fire elemental', ht: 65, attack: 25, defense: 20, damage: [16, 20], dr: 5, exp: 10, maxLvl: 20, speed: 1, flying: true },
  monk: { name: 'dwarf monk', ht: 70, attack: 30, defense: 30, damage: [12, 16], dr: 2, exp: 11, maxLvl: 21, speed: 1, attackDelay: 0.5 },
  warlock: { name: 'dwarf warlock', ht: 70, attack: 25, defense: 18, damage: [12, 20], dr: 8, exp: 11, maxLvl: 21, speed: 1 },
  golem: { name: 'golem', ht: 85, attack: 28, defense: 18, damage: [20, 40], dr: 12, exp: 12, maxLvl: 22, speed: 1, attackDelay: 1.5 },
  king: { name: 'King of Dwarves', ht: 300, attack: 32, defense: 25, damage: [20, 38], dr: 14, exp: 40, maxLvl: 30, speed: 1 },
  undead: { name: 'undead dwarf', ht: 28, attack: 16, defense: 15, damage: [12, 16], dr: 5, exp: 0, maxLvl: 30, speed: 1 },
  // The demon halls (depths 21-25).
  succubus: { name: 'succubus', ht: 80, attack: 40, defense: 25, damage: [15, 25], dr: 10, exp: 12, maxLvl: 25, speed: 1 },
  eye: { name: 'evil eye', ht: 100, attack: 30, defense: 20, damage: [14, 20], dr: 10, exp: 13, maxLvl: 25, speed: 1, attackDelay: 1.6, flying: true },
  scorpio: { name: 'scorpio', ht: 95, attack: 36, defense: 24, damage: [20, 32], dr: 16, exp: 14, maxLvl: 25, speed: 1 },
  yog: { name: 'Yog-Dzewa', ht: 300, attack: 0, defense: 0, damage: [0, 0], dr: 0, exp: 50, maxLvl: 30, speed: 1 },
  rottingFist: { name: 'rotting fist', ht: 300, attack: 36, defense: 25, damage: [24, 36], dr: 15, exp: 0, maxLvl: 30, speed: 1 },
  burningFist: { name: 'burning fist', ht: 200, attack: 36, defense: 25, damage: [20, 32], dr: 15, exp: 0, maxLvl: 30, speed: 1 },
  larva: { name: "god's larva", ht: 25, attack: 30, defense: 20, damage: [15, 20], dr: 8, exp: 0, maxLvl: 30, speed: 1 },
  // A chest that bites; its numbers grow with the depth (see mobStats).
  mimic: { name: 'mimic', ht: 16, attack: 10, defense: 5, damage: [1, 4], dr: 0, exp: 2, maxLvl: 30, speed: 1 },
};

/** A monster's numbers: the table's, but a mimic is as strong as the depth it lurks on (Mimic.adjustStats). */
export function mobStats(mob: Mob): MobStats {
  if (mob.kind !== 'mimic') return MOBS[mob.kind];
  const level = mob.level ?? 1;
  const ht = (3 + level) * 4;
  const attack = 9 + level;
  return {
    ...MOBS.mimic, ht, attack, defense: Math.trunc(attack / 2),
    damage: [Math.trunc(ht / 10), Math.trunc(ht / 4)], exp: 2 + Math.trunc((2 * (level - 1)) / 5),
  };
}

/** The brute, enraged when badly hurt: much harder hits. */
export const BRUTE_ENRAGED_DAMAGE = [10, 40] as const;

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
  /** Turns left of poison, paralysis and burning from traps and potions. */
  poison?: number;
  paralysed?: number;
  burning?: number;
  /** Turns left of moving at half speed (wand of slowness). */
  slowed?: number;
  /** A thief's stolen goods, dropped when it dies. */
  item?: Item;
  /** Swarms: how many splits away from the original swarm. */
  generation?: number;
  /** Brutes: enraged below a quarter of their health. */
  enraged?: boolean;
  /** Tengu: attacks left before it jumps away. */
  jumpIn?: number;
  /** The King of Dwarves: which pedestal he summons his undead from next. */
  rightPedestal?: boolean;
  /** A mimic: the depth it lurks on, and the treasure it held. */
  level?: number;
  loot?: Item[];
}

export function createMob(id: string, kind: MobKind, pos: number, state: MobState, time: number): Mob {
  const ht = MOBS[kind].ht;
  return { id, kind, pos, hp: ht, ht, state, target: -1, enemy: null, enemySeen: false, alerted: false, time };
}

/*
 * Who lives where (Bestiary). The original's rare swarm of flies, skeleton
 * and thief of depths 3-4 are left out of the sewers.
 */
const BESTIARY: Readonly<Record<number, ReadonlyArray<readonly [MobKind, number]>>> = {
  1: [['rat', 1]],
  2: [['rat', 1], ['gnoll', 1]],
  3: [['rat', 1], ['gnoll', 2], ['crab', 1]],
  4: [['rat', 1], ['gnoll', 2], ['crab', 3]],
  5: [['goo', 1]],
  6: [['skeleton', 4], ['thief', 2], ['swarm', 1], ['shaman', 0.2]],
  7: [['skeleton', 3], ['shaman', 1], ['thief', 1], ['swarm', 1]],
  8: [['skeleton', 3], ['shaman', 2], ['gnoll', 1], ['thief', 1], ['swarm', 1], ['bat', 0.02]],
  9: [['skeleton', 3], ['shaman', 3], ['thief', 1], ['swarm', 1], ['bat', 0.02], ['brute', 0.01]],
  10: [['tengu', 1]],
  // The original's rare fire elementals and dwarf monks of depths 13-14 belong to the city below.
  11: [['bat', 1], ['brute', 0.2]],
  12: [['bat', 1], ['brute', 1], ['spinner', 0.2]],
  13: [['bat', 1], ['brute', 3], ['shaman', 1], ['spinner', 1]],
  14: [['bat', 1], ['brute', 3], ['shaman', 1], ['spinner', 4]],
  15: [['dm300', 1]],
  // The original's rare succubus of depth 19 belongs to the halls below.
  16: [['elemental', 1], ['warlock', 1], ['monk', 0.2]],
  17: [['elemental', 1], ['monk', 1], ['warlock', 1]],
  18: [['elemental', 1], ['monk', 2], ['golem', 1], ['warlock', 1]],
  19: [['elemental', 1], ['monk', 2], ['golem', 3], ['warlock', 1]],
  20: [['king', 1]],
  21: [['succubus', 1], ['eye', 1]],
  22: [['succubus', 1], ['eye', 1]],
  23: [['succubus', 1], ['eye', 2], ['scorpio', 1]],
  24: [['succubus', 1], ['eye', 2], ['scorpio', 3]],
  25: [['yog', 1]],
};

export function rollMob(rng: Rng, depth: number): MobKind {
  const table = BESTIARY[depth] ?? BESTIARY[4]!;
  return table[rng.chances(table.map(([, chance]) => chance))]![0];
}
