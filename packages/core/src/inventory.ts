import { BACKPACK_SIZE, type Hero, maxExp } from './actors';
import { randomRespawnCell } from './ai';
import { earnExp } from './combat';
import { charAt, type Ctx, dropItem, enterCell, exploredCells, heroView, leaveCell } from './floor';
import { type Heap, isStackable, type Item, itemDef, type ItemKind } from './items';
import { discoverable } from './level/flags';
import { discover, F, hasFlag } from './level/terrain';
import type { World } from './world';

/*
 * Picking things up, drinking, reading, equipping and dropping. Dropping is
 * also how heroes hand items to each other in a party.
 */

export type InventoryAction =
  | { type: 'pickup' }
  /** Drink a potion or read a scroll; a scroll of upgrade improves the weapon or the armour. */
  | { type: 'use'; item: number; target?: 'weapon' | 'armor' }
  | { type: 'equip'; item: number }
  | { type: 'drop'; item: number };

const INVENTORY_ACTIONS: ReadonlySet<string> = new Set(['pickup', 'use', 'equip', 'drop']);

export function isInventoryAction(action: { type: string }): action is InventoryAction {
  return INVENTORY_ACTIONS.has(action.type);
}

const TIME_TO_PICK_UP = 1;
const TIME_TO_USE = 1;
const TIME_TO_EQUIP = 1;
const TIME_TO_DROP = 1;

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
      if (category !== 'potion' && category !== 'scroll') return 'that cannot be used';
      if (action.target !== undefined && action.target !== 'weapon' && action.target !== 'armor') return 'bad target';
      return null;
    case 'equip':
      return category === 'weapon' || category === 'armor' ? null : 'that cannot be equipped';
    case 'drop':
      return null;
  }
}

/** Performs an inventory action and says how long it took. */
export function performInventory(ctx: Ctx, hero: Hero, action: InventoryAction): number {
  switch (action.type) {
    case 'pickup':
      pickUp(ctx, hero);
      return TIME_TO_PICK_UP;
    case 'use':
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
        if (mob.state !== 'hunting') mob.state = 'wandering';
        mob.target = hero.pos;
      }
      ctx.effects.push({ type: 'scroll', hero: hero.id, kind: 'challenge', count: ctx.floor.mobs.length });
      break;
    }
    case 'scroll.lullaby': {
      const fov = heroView(world, hero);
      const sleepers = ctx.floor.mobs.filter((mob) => fov[mob.pos]);
      for (const mob of sleepers) {
        mob.state = 'sleeping';
        if (mob.kind === 'goo') mob.pumped = false;
      }
      ctx.effects.push({ type: 'scroll', hero: hero.id, kind: 'lullaby', count: sleepers.length });
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
