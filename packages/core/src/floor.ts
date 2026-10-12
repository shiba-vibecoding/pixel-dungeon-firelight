import { type Hero, isAlive, type Mob, type MobKind, type SubClass } from './actors';
import { castShadow, LIGHT_DISTANCE, terrainBlocksSight, viewDistance } from './fov';
import type { Enchantment, Glyph, Heap, HeapKind, Item, ItemKind } from './items';
import type { WellWater } from './level/builder';
import type { MeatOutcome } from './inventory';
import type { PlantInfo, PlantKind } from './plants';
import type { GhostLine } from './quest';
import type { Burst, TrapKind } from './traps';
import type { WandmakerLine } from './wandmaker';
import type { ImpLine } from './imp';
import type { SmithLine } from './smith';
import type { Bolt } from './wands';
import type { GasKind } from './gas';
import type { Level } from './level/generate';
import { LENGTH, NEIGHBOURS8, WIDTH } from './level/geometry';
import { F, hasFlag, T } from './level/terrain';
import type { Rng, RngState } from './rng';
import type { World } from './world';

/*
 * The live part of a depth: its monsters, its clock and its random stream.
 * A depth only advances while a living hero is on it; otherwise it is frozen,
 * as levels the hero has left are in the original.
 */

export interface Floor {
  mobs: Mob[];
  /** Random stream for everything that happens on this depth during play. */
  rng: RngState;
  /** The depth's clock: the time of the latest actor to act. */
  now: number;
  /** When the depth next tries to replenish its monsters; -1 on boss levels, which never do. */
  respawn: number;
  /** Items lying around, at most one heap per cell. */
  heaps: Heap[];
  /** Tengu's level: someone has set foot in the arena, and Tengu has appeared. */
  arenaEntered?: boolean;
  /** Plants growing here, set off by whoever steps on them. */
  plants?: PlantInfo[];
  /** Items that fell into a chasm here, on their way to the depth below. */
  falling?: Item[];
  /** Clouds of gas, as [cell, volume] pairs in cell order, and when they next spread (see gas.ts). */
  gas?: Partial<Record<GasKind, Array<[number, number]>>>;
  gasAt?: number;
}

/** Level.drop: an item that comes down on a chasm falls through it, to land on the depth below. */
export function landItem(ctx: Ctx, pos: number, item: Item): void {
  if (hasFlag(ctx.level.map[pos]!, F.PIT)) (ctx.floor.falling ??= []).push(item);
  else dropItem(ctx.floor, pos, item);
}

/** Puts an item on a cell, adding to whatever lies there already. */
export function dropItem(floor: Floor, pos: number, item: Item): void {
  const heap = floor.heaps.find((h) => h.pos === pos);
  if (!heap) {
    floor.heaps.push({ pos, kind: 'heap', items: [item] });
  } else if (heap.kind !== 'heap') {
    heap.items.push(item);
  } else {
    heap.items.unshift(item);
  }
}

export const isWater = (terrain: number): boolean => terrain >= T.WATER_TILES && terrain <= T.WATER;

/** What players should see happen; returned by every accepted action. */
export type Effect =
  | { type: 'attack'; depth: number; attacker: string; target: string; hit: boolean; damage: number }
  | { type: 'died'; depth: number; who: string; pos: number }
  | { type: 'noticed'; depth: number; mob: string }
  | { type: 'exp'; hero: string; amount: number }
  | { type: 'levelUp'; hero: string; lvl: number }
  | { type: 'revived'; hero: string }
  /** An ankh brought a hero back from death, at the stairs. */
  | { type: 'resurrected'; hero: string }
  /** An enchanted weapon showed its power on a blow; an inscribed armour on one taken. */
  | { type: 'enchanted'; depth: number; pos: number; enchant: Enchantment }
  | { type: 'glyph'; depth: number; hero: string; glyph: Glyph }
  /** A monster thrown back a step (armour of bounce). */
  | { type: 'pushed'; depth: number; mob: string; from: number; to: number }
  /** A scroll of enchantment gave an item its power; a scroll of upgrade drove one out. */
  | { type: 'imbued'; hero: string; item: Item }
  | { type: 'disenchanted'; hero: string; item: Item }
  /** The armour kit made a hero's armour into class armour; a class armour's special ability was used. */
  | { type: 'classArmor'; hero: string; item: Item }
  | { type: 'special'; hero: string; ability: 'leap' | 'moltenEarth' | 'smokeBomb' | 'blades'; from: number; to: number }
  /** A dwarf monk knocked the weapon out of a hero's hands; it lies at their feet. */
  | { type: 'disarmed'; depth: number; hero: string; mob: string; item: Item }
  /** A hero jumped into a chasm on `depth` and landed on the depth below. */
  | { type: 'fell'; hero: string; depth: number; pos: number }
  | { type: 'searched'; hero: string }
  | { type: 'discovered'; depth: number; cell: number }
  /** Damage that comes from no one, e.g. caustic ooze. */
  | { type: 'hurt'; depth: number; who: string; damage: number }
  | { type: 'oozed'; hero: string }
  | { type: 'pumped'; depth: number; mob: string }
  /** A boss speaks up; `hero` is whom it noticed. */
  | { type: 'yell'; depth: number; mob: string; kind: MobKind; line: 'notice' | 'death' | 'summon'; hero?: string }
  /** A warlock's shadow bolt left the hero weakened. */
  | { type: 'weakened'; hero: string }
  /** A seed took root; a plant was set off by someone stepping on it. */
  | { type: 'planted'; depth: number; pos: number; kind: PlantKind }
  | { type: 'plantTriggered'; depth: number; pos: number; kind: PlantKind; who: string }
  /** A gladiator's combo goes on; a hero masters a way. */
  | { type: 'combo'; hero: string; count: number }
  | { type: 'mastered'; hero: string; subclass: SubClass }
  /** Seeds in an alchemy pot brewed into a potion. */
  | { type: 'brewed'; depth: number; pos: number }
  /** A chest that was a mimic springs at the hero. */
  | { type: 'mimic'; depth: number; mob: string; hero: string }
  /** A torch lit; a succubus's charm; a scorpio's crippling sting. */
  | { type: 'lit'; hero: string }
  | { type: 'charmed'; hero: string }
  | { type: 'crippled'; hero: string }
  | { type: 'bossSlain'; depth: number; kind: MobKind }
  | { type: 'victory'; hero: string }
  | { type: 'opened'; depth: number; pos: number; heap: HeapKind }
  | { type: 'pickedUp'; hero: string; item: Item }
  | { type: 'packFull'; hero: string }
  | { type: 'dropped'; hero: string; item: Item }
  | { type: 'equipped'; hero: string; item: Item }
  /** A potion drunk or a scroll read; `identified` when this taught the party what it is. */
  | { type: 'used'; hero: string; kind: ItemKind; identified: boolean }
  | { type: 'identified'; hero: string; kind: ItemKind }
  | { type: 'healed'; hero: string; amount: number }
  | { type: 'strength'; hero: string }
  | { type: 'upgraded'; hero: string; item: Item }
  | { type: 'teleported'; hero: string }
  | { type: 'mapped'; hero: string }
  | { type: 'scroll'; hero: string; kind: 'challenge' | 'lullaby' | 'recharging' | 'terror' | 'psionic' | 'removeCurse'; count: number }
  /** A hero put on something cursed: it will not come off. */
  | { type: 'cursedEquip'; hero: string; item: Item }
  | { type: 'trap'; depth: number; pos: number; kind: TrapKind; hero: string }
  | { type: 'thrown'; depth: number; from: number; to: number; item: ItemKind }
  /** A magic bolt: the mage's wand, or a shaman's lightning. */
  | { type: 'zapped'; depth: number; from: number; to: number; bolt?: Bolt }
  /** Rocks falling on these cells (wand of avalanche). */
  | { type: 'avalanche'; depth: number; cells: number[] }
  /** Magic sheep appear on these cells (wand of flock); one fades away; one is spoken to. */
  | { type: 'flock'; depth: number; cells: number[] }
  /** Mirror images of a hero appear on these cells. */
  | { type: 'mirrored'; depth: number; hero: string; cells: number[] }
  | { type: 'faded'; depth: number; mob: string; pos: number }
  | { type: 'baa'; depth: number; mob: string }
  /** Something thrown by a monster (Tengu's shuriken), drawn with an item sprite. */
  | { type: 'missile'; depth: number; from: number; to: number; sprite: number }
  /** Tengu vanishes in a puff of smoke and lands elsewhere. */
  | { type: 'jumped'; depth: number; mob: string; from: number; to: number }
  /** A thief made off with something from a hero's pack. */
  | { type: 'stole'; depth: number; mob: string; hero: string; item: Item }
  /** A fleeing thief with nowhere left to run turns to fight. */
  | { type: 'cornered'; depth: number; mob: string; kind: MobKind }
  /** A badly hurt brute flies into a rage. */
  | { type: 'enraged'; depth: number; mob: string }
  /** A skeleton falls apart in an explosion of bones. */
  | { type: 'bones'; depth: number; pos: number }
  /** A word with the shopkeeper: the hero may sell from the pack. */
  | { type: 'shop'; hero: string }
  | { type: 'bought'; hero: string; item: Item; price: number }
  | { type: 'sold'; hero: string; item: Item; price: number }
  /** Attacked, the shopkeeper vanished with his wares. */
  | { type: 'shopkeeperFled'; depth: number; mob: string; pos: number }
  /** Tengu's arena: sealed when the fight starts, opened when it ends. */
  | { type: 'arena'; depth: number; sealed: boolean }
  | { type: 'unlocked'; depth: number; pos: number; hero: string }
  | { type: 'ghost'; hero: string; line: GhostLine }
  | { type: 'well'; hero: string; water: WellWater }
  /** Something dropped into a well of transmutation came out as something else. */
  | { type: 'transmuted'; hero: string; from: Item; to: Item }
  | { type: 'wandmaker'; hero: string; line: WandmakerLine }
  | { type: 'imp'; hero: string; line: ImpLine }
  | { type: 'smith'; hero: string; line: SmithLine }
  /** A piece of dark gold ore mined out of a vein. */
  | { type: 'mined'; depth: number; pos: number; hero: string }
  /** Something eaten; mystery meat may disagree with the eater. */
  | { type: 'ate'; hero: string; kind: ItemKind; outcome: MeatOutcome | null }
  | { type: 'hunger'; hero: string; state: 'hungry' | 'starving' }
  /** Gas or flames released at a cell, reaching `radius` cells around. */
  | { type: 'burst'; depth: number; pos: number; kind: Burst; radius: number; silent?: boolean }
  /** DM-300 mended itself on a spent trap. */
  | { type: 'repaired'; depth: number; mob: string }
  /** A dewdrop picked up, and the health it gave. */
  | { type: 'dew'; hero: string; amount: number }
  /** Scrolls burnt up and meat cooked on a heap; a hero's scroll or meat caught fire in the pack. */
  | { type: 'heapBurnt'; depth: number; pos: number }
  | { type: 'burntUp'; hero: string; kind: ItemKind }
  /** Lloyd's beacon set, or used to return. */
  | { type: 'beacon'; hero: string; mode: 'set' | 'return' }
  /** A bomb went off. */
  | { type: 'exploded'; depth: number; pos: number }
  /** A weapon balanced with a weightstone. */
  | { type: 'balanced'; hero: string; item: Item }
  /** Terrain burnt down to embers, opening what it blocked. */
  | { type: 'burnt'; depth: number; pos: number }
  /** A thrown potion breaking; `identified` when what came out taught the party what it was. */
  | { type: 'shattered'; hero: string; depth: number; pos: number; kind: ItemKind; identified: boolean }
  /** A queued action that became impossible before the hero's turn came. */
  | { type: 'interrupted'; hero: string; reason: string };

/** Everything the rules need while simulating one depth. */
export interface Ctx {
  world: World;
  depth: number;
  level: Level;
  floor: Floor;
  rng: Rng;
  effects: Effect[];
}

export type Char = Hero | Mob;

export const isHero = (char: Char): char is Hero => 'heroClass' in char;

export function heroesOn(world: World, depth: number): Hero[] {
  return world.heroes.filter((hero) => hero.depth === depth && isAlive(hero));
}

/** The living hero or monster standing on a cell. */
export function charAt(world: World, depth: number, cell: number): Char | undefined {
  return (
    world.heroes.find((hero) => hero.depth === depth && hero.pos === cell && isAlive(hero)) ??
    world.floors[depth]?.mobs.find((mob) => mob.pos === cell)
  );
}

/** Field of view of one hero. */
export function heroView(world: World, hero: Hero): boolean[] {
  // Blinded, a hero sees no further than arm's reach.
  const distance = (hero.blind ?? 0) > 0 ? 1
    : hero.light > 0 ? Math.max(viewDistance(hero.depth), LIGHT_DISTANCE) : viewDistance(hero.depth);
  return castShadow(hero.pos, terrainBlocksSight(world.levels[hero.depth]!.map), distance);
}

export function exploredCells(world: World, depth: number): boolean[] {
  return (world.explored[depth] ??= new Array<boolean>(LENGTH).fill(false));
}

/** Adds what a hero sees to the party's shared map. */
export function observe(world: World, hero: Hero): void {
  const explored = exploredCells(world, hero.depth);
  heroView(world, hero).forEach((seen, i) => {
    if (seen) explored[i] = true;
  });
}

/** Cells a hero may step on: open ground, doors and visible traps. */
export function canEnter(level: Level, pos: number): boolean {
  if (!Number.isInteger(pos) || pos < 0 || pos >= LENGTH) return false;
  const x = pos % WIDTH;
  if (pos < WIDTH || pos >= LENGTH - WIDTH || x === 0 || x === WIDTH - 1) return false;
  const terrain = level.map[pos]!;
  return hasFlag(terrain, F.PASSABLE) || (hasFlag(terrain, F.AVOID) && !hasFlag(terrain, F.PIT));
}

/** Ground monsters walk on: they step around traps. */
export function isPassable(level: Level, pos: number): boolean {
  return pos >= 0 && pos < LENGTH && hasFlag(level.map[pos]!, F.PASSABLE);
}

/* A door is open while someone stands in it, so it no longer blocks sight. */

export function enterCell(level: Level, pos: number): void {
  if (level.map[pos] === T.DOOR) {
    level.map[pos] = T.OPEN_DOOR;
  }
}

export function leaveCell(world: World, level: Level, depth: number, pos: number): void {
  if (level.map[pos] === T.OPEN_DOOR && !charAt(world, depth, pos)) {
    level.map[pos] = T.DOOR;
  }
}

/** The cell itself if free, otherwise the nearest free walkable cell. */
export function freeCellNear(world: World, level: Level, depth: number, pos: number): number {
  const seen = new Set([pos]);
  const queue = [pos];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head]!;
    if (canEnter(level, cell) && !charAt(world, depth, cell)) {
      return cell;
    }
    for (const n of NEIGHBOURS8) {
      const next = cell + n;
      if (next >= 0 && next < LENGTH && !seen.has(next) && canEnter(level, next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return pos;
}
