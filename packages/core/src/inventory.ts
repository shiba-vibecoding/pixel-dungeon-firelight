import { BACKPACK_SIZE, type Hero, heroRangedSkill, maxExp, STARVING } from './actors';
import { ballistica, randomRespawnCell } from './ai';
import { attack, earnExp, hurt } from './combat';
import { charAt, type Ctx, dropItem, enterCell, exploredCells, heroView, isHero, leaveCell } from './floor';
import {
  type Heap, isStackable, type Item, itemDef, type ItemKind, magicMissileDamage, missileStats, wandMaxCharges,
} from './items';
import { discoverable } from './level/flags';
import { adjacent, LENGTH } from './level/geometry';
import { discover, F, hasFlag } from './level/terrain';
import { type Burst, burst } from './traps';
import type { World } from './world';

/*
 * Picking things up, drinking, reading, equipping and dropping. Dropping is
 * also how heroes hand items to each other in a party.
 */

export type InventoryAction =
  | { type: 'pickup' }
  /** Drink a potion, read a scroll or eat; a scroll of upgrade improves the weapon or the armour. */
  | { type: 'use'; item: number; target?: 'weapon' | 'armor' }
  | { type: 'equip'; item: number }
  | { type: 'drop'; item: number }
  /** Throw a dart, the boomerang or a potion at a cell; it flies until it hits someone or something. */
  | { type: 'throw'; item: number; target: number }
  /** Zap a wand at a cell. */
  | { type: 'zap'; item: number; target: number };

const INVENTORY_ACTIONS: ReadonlySet<string> = new Set(['pickup', 'use', 'equip', 'drop', 'throw', 'zap']);

export function isInventoryAction(action: { type: string }): action is InventoryAction {
  return INVENTORY_ACTIONS.has(action.type);
}

const TIME_TO_PICK_UP = 1;
const TIME_TO_USE = 1;
const TIME_TO_EQUIP = 1;
const TIME_TO_DROP = 1;
const TIME_TO_THROW = 1;
const TIME_TO_ZAP = 1;
const TIME_TO_EAT = 3;

const MIND_VISION_DURATION = 20;
const INVISIBILITY_DURATION = 15;

function heapAt(world: World, hero: Hero): Heap | undefined {
  return world.floors[hero.depth]?.heaps.find((heap) => heap.pos === hero.pos);
}

export function inventoryProblem(world: World, hero: Hero, action: InventoryAction): string | null {
  if (action.type === 'pickup') {
    return heapAt(world, hero) ? null : 'nothing here';
  }
  const item = Number.isInteger(action.item) ? hero.items[action.item] : undefined;
  if (!item) return 'no such item';
  const category = itemDef(item.kind).category;
  switch (action.type) {
    case 'use':
      if (category !== 'potion' && category !== 'scroll' && category !== 'food') return 'that cannot be used';
      if (action.target !== undefined && action.target !== 'weapon' && action.target !== 'armor') return 'bad target';
      return null;
    case 'equip':
      return category === 'weapon' || category === 'armor' ? null : 'that cannot be equipped';
    case 'drop':
      return null;
    case 'throw':
    case 'zap': {
      const fits = action.type === 'throw' ? category === 'missile' || category === 'potion' : category === 'wand';
      if (!fits) return `that cannot be ${action.type === 'throw' ? 'thrown' : 'zapped'}`;
      if (!Number.isInteger(action.target) || action.target < 0 || action.target >= LENGTH || action.target === hero.pos) {
        return 'bad target';
      }
      return action.type === 'zap' && (item.charges ?? 0) <= 0 ? 'the wand is out of charges' : null;
    }
  }
}

/** Performs an inventory action and says how long it took. */
export function performInventory(ctx: Ctx, hero: Hero, action: InventoryAction): number {
  switch (action.type) {
    case 'pickup':
      pickUp(ctx, hero);
      return TIME_TO_PICK_UP;
    case 'use':
      if (itemDef(hero.items[action.item]!.kind).category === 'food') {
        eat(ctx, hero, action.item);
        return TIME_TO_EAT;
      }
      use(ctx, hero, action.item, action.target ?? 'weapon');
      return TIME_TO_USE;
    case 'equip': {
      const item = hero.items[action.item]!;
      const slot = itemDef(item.kind).category as 'weapon' | 'armor';
      hero.items[action.item] = hero[slot];
      hero[slot] = item;
      ctx.effects.push({ type: 'equipped', hero: hero.id, item });
      return TIME_TO_EQUIP;
    }
    case 'drop': {
      const item = hero.items.splice(action.item, 1)[0]!;
      dropItem(ctx.floor, hero.pos, item);
      ctx.effects.push({ type: 'dropped', hero: hero.id, item });
      return TIME_TO_DROP;
    }
    case 'throw':
      throwItem(ctx, hero, action.item, action.target);
      return TIME_TO_THROW;
    case 'zap':
      zap(ctx, hero, action.item, action.target);
      return TIME_TO_ZAP;
  }
}

/** MissileWeapon.onThrow: a hit uses the dart up, a miss leaves it on the floor; the boomerang returns. */
function throwItem(ctx: Ctx, hero: Hero, index: number, target: number): void {
  const item = hero.items[index]!;
  if (itemDef(item.kind).category === 'potion') {
    throwPotion(ctx, hero, index, target);
    return;
  }
  const boomerang = item.kind === 'missile.boomerang';
  let thrown = item;
  if (!boomerang) {
    if (item.qty > 1) {
      item.qty--;
      thrown = { kind: item.kind, qty: 1, level: item.level };
    } else {
      hero.items.splice(index, 1);
    }
  }
  const trace = ballistica(ctx, hero.pos, target);
  const end = trace.at(-1)!;
  ctx.effects.push({ type: 'thrown', depth: ctx.depth, from: hero.pos, to: end, item: item.kind });
  const victim = charAt(ctx.world, ctx.depth, end);
  let hit = false;
  if (victim && !isHero(victim)) {
    const stats = missileStats(thrown);
    hit = attack(ctx, hero, victim, {
      attack: heroRangedSkill(hero, thrown, adjacent(hero.pos, end)),
      damage: [stats.min, stats.max],
    });
  }
  if (!boomerang && !hit) dropItem(ctx.floor, end, thrown);
}

/** Potion.shatter: a thrown potion breaks where it lands, letting out whatever is inside. */
function throwPotion(ctx: Ctx, hero: Hero, index: number, target: number): void {
  const item = hero.items[index]!;
  const kind = item.kind;
  if (--item.qty <= 0) hero.items.splice(index, 1);
  const end = ballistica(ctx, hero.pos, target).at(-1)!;
  ctx.effects.push({ type: 'thrown', depth: ctx.depth, from: hero.pos, to: end, item: kind });
  const harmful = BURSTS[kind];
  ctx.effects.push({
    type: 'shattered', hero: hero.id, depth: ctx.depth, pos: end, kind, identified: harmful ? identify(ctx.world, kind) : false,
  });
  if (harmful) burst(ctx, end, harmful.kind, harmful.radius);
}

/** What breaks out of a harmful potion, and how far it reaches. */
const BURSTS: Partial<Record<ItemKind, { kind: Burst; radius: number }>> = {
  'potion.toxicGas': { kind: 'toxic', radius: 2 },
  'potion.paralyticGas': { kind: 'paralytic', radius: 2 },
  'potion.liquidFlame': { kind: 'fire', radius: 1 },
};

/** WandOfMagicMissile: a bolt that never misses the first creature in its way. */
function zap(ctx: Ctx, hero: Hero, index: number, target: number): void {
  const wand = hero.items[index]!;
  wand.charges = (wand.charges ?? 1) - 1;
  hero.invisible = 0;
  const trace = ballistica(ctx, hero.pos, target);
  const end = trace.at(-1)!;
  ctx.effects.push({ type: 'zapped', depth: ctx.depth, from: hero.pos, to: end });
  const victim = charAt(ctx.world, ctx.depth, end);
  if (victim && !isHero(victim)) {
    const [min, max] = magicMissileDamage(wand);
    const damage = ctx.rng.intRange(min, max);
    ctx.effects.push({ type: 'attack', depth: ctx.depth, attacker: hero.id, target: victim.id, hit: true, damage });
    hurt(ctx, victim, damage, hero);
  }
}

/** Adds an item to the backpack, stacking where possible; false if there is no room. */
export function collect(hero: Hero, item: Item): boolean {
  if (item.kind === 'gold') {
    hero.gold += item.qty;
    return true;
  }
  if (isStackable(item.kind)) {
    const stack = hero.items.find((other) => other.kind === item.kind);
    if (stack) {
      stack.qty += item.qty;
      return true;
    }
  }
  if (hero.items.length >= BACKPACK_SIZE) return false;
  hero.items.push(item);
  return true;
}

/** Opens a chest or remains if need be, and takes everything there is room for. */
function pickUp(ctx: Ctx, hero: Hero): void {
  const heap = ctx.floor.heaps.find((h) => h.pos === hero.pos)!;
  if (heap.kind !== 'heap') {
    ctx.effects.push({ type: 'opened', depth: ctx.depth, pos: heap.pos, heap: heap.kind });
    heap.kind = 'heap';
  }
  const left: Item[] = [];
  for (const item of heap.items) {
    if (collect(hero, item)) {
      ctx.effects.push({ type: 'pickedUp', hero: hero.id, item });
    } else {
      left.push(item);
    }
  }
  if (left.length > 0) ctx.effects.push({ type: 'packFull', hero: hero.id });
  heap.items = left;
  if (left.length === 0) ctx.floor.heaps.splice(ctx.floor.heaps.indexOf(heap), 1);
}

/** What mystery meat can do to whoever eats it. */
export type MeatOutcome = 'hot' | 'legs' | 'unwell' | 'stuffed';

/**
 * Food.execute: hunger goes away; warriors also get some health back and
 * mages a charge in every wand. Mystery meat (MysteryMeat) has a four in
 * five chance of disagreeing with the eater.
 */
function eat(ctx: Ctx, hero: Hero, index: number): void {
  const item = hero.items[index]!;
  const kind = item.kind;
  if (--item.qty <= 0) hero.items.splice(index, 1);
  hero.hunger = Math.min(Math.max(0, hero.hunger - itemDef(kind).energy!), STARVING);
  if (hero.heroClass === 'warrior' && hero.hp < hero.ht) {
    const amount = Math.min(5, hero.ht - hero.hp);
    hero.hp += amount;
    ctx.effects.push({ type: 'healed', hero: hero.id, amount });
  }
  if (hero.heroClass === 'mage') {
    // Belongings.charge: a charge more in every wand that is not full.
    for (const wand of hero.items) {
      if (wand.charges !== undefined && wand.charges < wandMaxCharges(wand)) wand.charges++;
    }
  }
  let outcome: MeatOutcome | null = null;
  if (kind === 'food.meat') {
    outcome = (['hot', 'legs', 'unwell', 'stuffed', null] as const)[ctx.rng.int(5)]!;
    if (outcome === 'hot') hero.burning = Math.max(hero.burning, MEAT_BURNING_TURNS);
    if (outcome === 'legs') hero.rooted = Math.max(hero.rooted, ROOTED_TURNS);
    if (outcome === 'unwell') hero.poison = Math.max(hero.poison, Math.trunc(hero.ht / 5));
    if (outcome === 'stuffed') hero.slowed = Math.max(hero.slowed, SLOWED_TURNS);
  }
  ctx.effects.push({ type: 'ate', hero: hero.id, kind, outcome });
}

/** Burning.DURATION, Paralysis.DURATION (roots last as long) and Slow.DURATION. */
const MEAT_BURNING_TURNS = 8;
const ROOTED_TURNS = 10;
const SLOWED_TURNS = 10;

function identify(world: World, kind: ItemKind): boolean {
  if (world.known.includes(kind)) return false;
  world.known.push(kind);
  return true;
}

function use(ctx: Ctx, hero: Hero, index: number, target: 'weapon' | 'armor'): void {
  const { world } = ctx;
  const item = hero.items[index]!;
  const kind = item.kind;
  if (--item.qty <= 0) hero.items.splice(index, 1);
  ctx.effects.push({ type: 'used', hero: hero.id, kind, identified: identify(world, kind) });

  switch (kind) {
    case 'potion.healing': {
      const amount = hero.ht - hero.hp;
      hero.hp = hero.ht;
      hero.ooze = -1;
      hero.poison = 0;
      ctx.effects.push({ type: 'healed', hero: hero.id, amount });
      break;
    }
    case 'potion.experience':
      earnExp(ctx, hero, maxExp(hero) - hero.exp);
      break;
    case 'potion.strength':
      hero.str++;
      ctx.effects.push({ type: 'strength', hero: hero.id });
      break;
    case 'potion.mindVision':
      hero.mindVision = MIND_VISION_DURATION;
      break;
    case 'potion.invisibility':
      hero.invisible = INVISIBILITY_DURATION;
      break;
    case 'potion.toxicGas':
    case 'potion.paralyticGas':
    case 'potion.liquidFlame': {
      // Drunk, it bursts right where the hero stands.
      const harmful = BURSTS[kind]!;
      burst(ctx, hero.pos, harmful.kind, harmful.radius);
      break;
    }

    case 'scroll.identify': {
      // The original lets you pick the item; here it is the first unknown one you carry.
      const unknown = hero.items.find((i) => !world.known.includes(i.kind) && isStackable(i.kind) && i.kind !== 'gold');
      if (unknown && identify(world, unknown.kind)) {
        ctx.effects.push({ type: 'identified', hero: hero.id, kind: unknown.kind });
      }
      break;
    }
    case 'scroll.teleportation': {
      const fov = heroView(world, hero);
      const pos = randomRespawnCell(ctx.rng, world, ctx.level, (cell) => !fov[cell]);
      if (pos !== -1 && !charAt(world, hero.depth, pos)) {
        const from = hero.pos;
        hero.pos = pos;
        leaveCell(world, ctx.level, hero.depth, from);
        enterCell(ctx.level, pos);
        ctx.effects.push({ type: 'teleported', hero: hero.id });
      }
      break;
    }
    case 'scroll.mapping': {
      const map = ctx.level.map;
      const explored = exploredCells(world, hero.depth);
      discoverable(map).forEach((open, i) => {
        if (!open) return;
        explored[i] = true;
        if (hasFlag(map[i]!, F.SECRET)) map[i] = discover(map[i]!);
      });
      ctx.effects.push({ type: 'mapped', hero: hero.id });
      break;
    }
    case 'scroll.challenge': {
      // Every monster on the level comes for the reader.
      for (const mob of ctx.floor.mobs) {
        if (mob.state === 'passive') continue;
        if (mob.state !== 'hunting') mob.state = 'wandering';
        mob.target = hero.pos;
      }
      ctx.effects.push({ type: 'scroll', hero: hero.id, kind: 'challenge', count: ctx.floor.mobs.length });
      break;
    }
    case 'scroll.lullaby': {
      const fov = heroView(world, hero);
      const sleepers = ctx.floor.mobs.filter((mob) => fov[mob.pos] && mob.state !== 'passive');
      for (const mob of sleepers) {
        mob.state = 'sleeping';
        if (mob.kind === 'goo') mob.pumped = false;
      }
      ctx.effects.push({ type: 'scroll', hero: hero.id, kind: 'lullaby', count: sleepers.length });
      break;
    }
    case 'scroll.recharging': {
      // ScrollOfRecharging: every wand in the pack is full again.
      let count = 0;
      for (const wand of hero.items) {
        if (wand.charges === undefined || wand.charges >= wandMaxCharges(wand)) continue;
        wand.charges = wandMaxCharges(wand);
        count++;
      }
      ctx.effects.push({ type: 'scroll', hero: hero.id, kind: 'recharging', count });
      break;
    }
    case 'scroll.upgrade': {
      const upgraded = hero[target];
      upgraded.level++;
      ctx.effects.push({ type: 'upgraded', hero: hero.id, item: upgraded });
      break;
    }
    default:
      break;
  }
}
