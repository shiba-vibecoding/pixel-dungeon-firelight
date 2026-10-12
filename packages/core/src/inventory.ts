import {
  BACKPACK_SIZE, createMob, type Hero, heroRangedSkill, maxExp, mobStats, STARVING, type SubClass, SUBCLASSES,
} from './actors';
import { ballistica, randomRespawnCell } from './ai';
import { attack, earnExp, hurt } from './combat';
import { TERROR_TURNS } from './enchant';
import { canEnter, charAt, type Ctx, dropItem, enterCell, exploredCells, heroView, isHero, landItem, leaveCell } from './floor';
import {
  buyPrice, createItem, type Heap, isStackable, type Item, itemDef, ItemGenerator, type ItemKind, itemPrice,
  magicMissileDamage, missileStats, randomEnchantment, randomGlyph, wandMaxCharges,
} from './items';
import { discoverable } from './level/flags';
import { adjacent, LENGTH, NEIGHBOURS8 } from './level/geometry';
import { discover, F, hasFlag, T } from './level/terrain';
import { type Burst, burst } from './traps';
import { plant, SEED_PLANTS } from './plants';
import { zapWand } from './wands';
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
  | { type: 'zap'; item: number; target: number }
  /** Buy the shop's ware the hero stands on. */
  | { type: 'buy' }
  /** Sell an item from the pack to the shopkeeper next to the hero. */
  | { type: 'sell'; item: number }
  /** Take off a worn ring, back into the pack. */
  | { type: 'remove'; ring: number }
  /** Read the Tome of Mastery and master one of the two ways of the hero's class. */
  | { type: 'master'; item: number; subclass: SubClass };

const INVENTORY_ACTIONS: ReadonlySet<string> = new Set([
  'pickup', 'use', 'equip', 'drop', 'throw', 'zap', 'buy', 'sell', 'remove', 'master',
]);

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
/** TomeOfMastery.TIME_TO_READ. */
const TIME_TO_READ_TOME = 10;
/** Light.DURATION. */
const LIGHT_TURNS = 250;

const MIND_VISION_DURATION = 20;
const INVISIBILITY_DURATION = 15;
/** Levitation.DURATION; GasesImmunity lasts 5 turns in the original, but here gas has no lingering cloud to outlast. */
const LEVITATION_DURATION = 20;
const GAS_IMMUNITY_DURATION = 15;

/** The backpack slot of a golden key for the hero's current depth, or -1. */
const goldenKeyFor = (hero: Hero): number =>
  hero.items.findIndex((item) => item.kind === 'key.golden' && item.depth === hero.depth);

function heapAt(world: World, hero: Hero): Heap | undefined {
  return world.floors[hero.depth]?.heaps.find((heap) => heap.pos === hero.pos);
}

export function inventoryProblem(world: World, hero: Hero, action: InventoryAction): string | null {
  if (action.type === 'pickup') {
    const heap = heapAt(world, hero);
    if (!heap) return 'nothing here';
    if ((heap.kind === 'lockedChest' || heap.kind === 'crystalChest') && goldenKeyFor(hero) < 0) return 'the chest is locked';
    return heap.kind === 'forSale' ? 'that is for sale' : null;
  }
  if (action.type === 'remove') {
    if (!Number.isInteger(action.ring) || !hero.rings[action.ring]) return 'no such ring';
    return hero.items.length < BACKPACK_SIZE ? null : 'your pack is full';
  }
  if (action.type === 'buy') {
    const heap = heapAt(world, hero);
    const ware = heap?.kind === 'forSale' ? heap.items[0] : undefined;
    if (!ware) return 'nothing for sale here';
    if (hero.gold < buyPrice(ware, hero.depth, world.known.includes(ware.kind), haggles(hero))) return 'not enough gold';
    return isStackable(ware.kind) && hero.items.some((i) => i.kind === ware.kind) || hero.items.length < BACKPACK_SIZE
      ? null
      : 'your pack is full';
  }
  const item = Number.isInteger(action.item) ? hero.items[action.item] : undefined;
  if (!item) return 'no such item';
  const category = itemDef(item.kind).category;
  switch (action.type) {
    case 'use':
      if (category !== 'potion' && category !== 'scroll' && category !== 'food' && category !== 'torch') return 'that cannot be used';
      if (action.target !== undefined && action.target !== 'weapon' && action.target !== 'armor') return 'bad target';
      return null;
    case 'equip':
      return category === 'weapon' || category === 'armor' || category === 'ring' ? null : 'that cannot be equipped';
    case 'drop':
      return null;
    case 'master':
      if (item.kind !== 'tome.mastery') return 'that is no tome';
      if (hero.subclass) return 'you have already mastered a way';
      return SUBCLASSES[hero.heroClass].includes(action.subclass) ? null : 'not a way for you';
    case 'sell':
      if (!shopkeeperBeside(world, hero)) return 'nobody to sell to';
      return itemPrice(item, world.known.includes(item.kind)) > 0 ? null : 'nobody would buy that';
    case 'throw':
    case 'zap': {
      const fits = action.type === 'throw' ? category === 'missile' || category === 'potion' || category === 'seed' : category === 'wand';
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
      if (itemDef(hero.items[action.item]!.kind).category === 'torch') {
        // Torch.execute: lit, it lights the way for a good while.
        const torch = hero.items[action.item]!;
        if (--torch.qty <= 0) hero.items.splice(action.item, 1);
        hero.light = Math.max(hero.light, LIGHT_TURNS);
        ctx.effects.push({ type: 'lit', hero: hero.id });
        return TIME_TO_USE;
      }
      use(ctx, hero, action.item, action.target ?? 'weapon');
      return TIME_TO_USE;
    case 'master':
      // TomeOfMastery.choose: the tome is used up, and the hero takes a new way.
      hero.items.splice(action.item, 1);
      hero.subclass = action.subclass;
      ctx.effects.push({ type: 'mastered', hero: hero.id, subclass: action.subclass });
      return TIME_TO_READ_TOME;
    case 'remove': {
      const ring = hero.rings.splice(action.ring, 1)[0]!;
      hero.items.push(ring);
      ctx.effects.push({ type: 'dropped', hero: hero.id, item: ring });
      return TIME_TO_EQUIP;
    }
    case 'equip': {
      const item = hero.items[action.item]!;
      if (itemDef(item.kind).category === 'ring') {
        // Two rings at most: a third takes the place of the first.
        hero.items.splice(action.item, 1);
        if (hero.rings.length >= 2) hero.items.push(hero.rings.shift()!);
        hero.rings.push(item);
        ctx.effects.push({ type: 'equipped', hero: hero.id, item });
        return TIME_TO_EQUIP;
      }
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
      if (ctx.level.map[hero.pos] === T.ALCHEMY) brew(ctx, hero.pos);
      return TIME_TO_DROP;
    }
    case 'throw':
      throwItem(ctx, hero, action.item, action.target);
      return TIME_TO_THROW;
    case 'zap':
      zap(ctx, hero, action.item, action.target);
      return TIME_TO_ZAP;
    case 'buy': {
      // WndTradeItem.buy: the gold goes, the ware comes into the pack.
      const heap = heapAt(ctx.world, hero)!;
      const item = heap.items.shift()!;
      const price = buyPrice(item, hero.depth, ctx.world.known.includes(item.kind), haggles(hero));
      hero.gold -= price;
      collect(hero, item);
      if (heap.items.length === 0) ctx.floor.heaps.splice(ctx.floor.heaps.indexOf(heap), 1);
      ctx.effects.push({ type: 'bought', hero: hero.id, item, price });
      return TIME_TO_PICK_UP;
    }
    case 'sell': {
      // WndTradeItem.sellAll: the whole stack, at the item's own price.
      const item = hero.items.splice(action.item, 1)[0]!;
      const price = itemPrice(item, ctx.world.known.includes(item.kind));
      hero.gold += price;
      ctx.effects.push({ type: 'sold', hero: hero.id, item, price });
      return 0;
    }
  }
}

/** Wearing a ring of haggler, shops ask half. */
const haggles = (hero: Hero): boolean => hero.rings.some((ring) => ring.kind === 'ring.haggler');

/** A shopkeeper standing next to the hero, ready to trade. */
export function shopkeeperBeside(world: World, hero: Hero): boolean {
  return (world.floors[hero.depth]?.mobs ?? []).some((mob) => mob.kind === 'shopkeeper' && adjacent(mob.pos, hero.pos));
}

/** MissileWeapon.onThrow: a hit uses the dart up, a miss leaves it on the floor; the boomerang returns. */
function throwItem(ctx: Ctx, hero: Hero, index: number, target: number): void {
  const item = hero.items[index]!;
  if (itemDef(item.kind).category === 'potion') {
    throwPotion(ctx, hero, index, target);
    return;
  }
  if (itemDef(item.kind).category === 'seed') {
    // Plant.Seed.onThrow: it takes root where it lands.
    const kind = item.kind;
    if (--item.qty <= 0) hero.items.splice(index, 1);
    const end = ballistica(ctx, hero.pos, target).at(-1)!;
    ctx.effects.push({ type: 'thrown', depth: ctx.depth, from: hero.pos, to: end, item: kind });
    // Into an alchemy pot, it goes into the brew instead; into a chasm, it falls.
    if (ctx.level.map[end] === T.ALCHEMY) {
      dropItem(ctx.floor, end, createItem(kind));
      brew(ctx, end);
    } else if (hasFlag(ctx.level.map[end]!, F.PIT)) {
      landItem(ctx, end, createItem(kind));
    } else {
      plant(ctx, end, SEED_PLANTS[kind]!);
    }
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
  if (!boomerang && !hit) landItem(ctx, end, thrown);
}

/** Potion.shatter: a thrown potion breaks where it lands, letting out whatever is inside. */
function throwPotion(ctx: Ctx, hero: Hero, index: number, target: number): void {
  const item = hero.items[index]!;
  const kind = item.kind;
  if (--item.qty <= 0) hero.items.splice(index, 1);
  const end = ballistica(ctx, hero.pos, target).at(-1)!;
  ctx.effects.push({ type: 'thrown', depth: ctx.depth, from: hero.pos, to: end, item: kind });
  // Over a chasm, it falls whole (Potion.onThrow).
  if (hasFlag(ctx.level.map[end]!, F.PIT)) {
    landItem(ctx, end, createItem(kind));
    return;
  }
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
  'potion.frost': { kind: 'frost', radius: 2 },
  // Shattered, a potion of purity cleanses the air: no gas harms those around for a moment.
  'potion.purity': { kind: 'purity', radius: 2 },
};

/** Wand.zapper: a charge is spent, and using a wand tells the party what it is. */
function zap(ctx: Ctx, hero: Hero, index: number, target: number): void {
  const wand = hero.items[index]!;
  wand.charges = (wand.charges ?? 1) - 1;
  hero.invisible = 0;
  if (identify(ctx.world, wand.kind)) ctx.effects.push({ type: 'identified', hero: hero.id, kind: wand.kind });
  zapWand(ctx, hero, wand, target);
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
  if (heap.kind === 'mimic' && springMimic(ctx, hero, heap)) return;
  // A locked or crystal chest: the golden key turns in its lock and stays there.
  if (heap.kind === 'lockedChest' || heap.kind === 'crystalChest') hero.items.splice(goldenKeyFor(hero), 1);
  if (heap.kind !== 'heap') {
    ctx.effects.push({ type: 'opened', depth: ctx.depth, pos: heap.pos, heap: heap.kind });
    heap.kind = 'heap';
  }
  const left: Item[] = [];
  for (const item of heap.items) {
    if (item.kind === 'dew') {
      drinkDew(ctx, hero, item);
    } else if (collect(hero, item)) {
      ctx.effects.push({ type: 'pickedUp', hero: hero.id, item });
      if (item.kind === 'quest.amulet') {
        // The Amulet of Yendor: the end of the journey, and the run is won.
        ctx.world.victory = true;
        ctx.world.over = true;
        for (const other of ctx.world.heroes) other.intent = null;
        ctx.effects.push({ type: 'victory', hero: hero.id });
      }
    } else {
      left.push(item);
    }
  }
  if (left.length > 0) ctx.effects.push({ type: 'packFull', hero: hero.id });
  heap.items = left;
  if (left.length === 0) ctx.floor.heaps.splice(ctx.floor.heaps.indexOf(heap), 1);
}

/** The potion each seed brews into (Plant.Seed.alchemyClass). */
const ALCHEMY: Partial<Record<ItemKind, ItemKind>> = {
  'seed.firebloom': 'potion.liquidFlame',
  'seed.icecap': 'potion.frost',
  'seed.sorrowmoss': 'potion.toxicGas',
  'seed.dreamweed': 'potion.invisibility',
  'seed.sungrass': 'potion.healing',
  'seed.earthroot': 'potion.paralyticGas',
  'seed.fadeleaf': 'potion.mindVision',
};
const SEEDS_TO_POTION = 3;

/**
 * Heap.transmute: three seeds or more in an alchemy pot brew a potion, most
 * often the one the seeds are good for, now and then a random one. Anything
 * but seeds spoils the brew.
 */
function brew(ctx: Ctx, pos: number): void {
  const heap = ctx.floor.heaps.find((h) => h.pos === pos);
  if (!heap || !heap.items.every((item) => itemDef(item.kind).category === 'seed')) return;
  const count = heap.items.reduce((n, item) => n + item.qty, 0);
  if (count < SEEDS_TO_POTION) return;
  const { rng } = ctx;
  let potion: Item;
  if (rng.int(count) === 0) {
    potion = new ItemGenerator(rng, ctx.depth).of('potion');
  } else {
    const seed = heap.items[rng.chances(heap.items.map((item) => item.qty))]!;
    const kind = ALCHEMY[seed.kind];
    potion = kind ? createItem(kind) : new ItemGenerator(rng, ctx.depth).of('potion');
  }
  heap.items = [potion];
  ctx.effects.push({ type: 'brewed', depth: ctx.depth, pos });
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

/**
 * Mimic.spawnAt: the "chest" was a mimic. The hero is pushed aside and the
 * mimic, holding the treasure, attacks. False if there is no room to move.
 */
function springMimic(ctx: Ctx, hero: Hero, heap: Heap): boolean {
  const { world, depth, level, rng, floor } = ctx;
  const cells = NEIGHBOURS8.map((n) => hero.pos + n).filter((c) => canEnter(level, c) && !charAt(world, depth, c));
  if (cells.length === 0) {
    heap.kind = 'chest';
    return false;
  }
  const pos = heap.pos;
  const to = rng.element(cells)!;
  hero.pos = to;
  leaveCell(world, level, depth, pos);
  enterCell(level, to);
  floor.heaps.splice(floor.heaps.indexOf(heap), 1);
  const mimic = createMob(`#${++world.nextId}`, 'mimic', pos, 'hunting', floor.now + 1);
  mimic.level = depth;
  mimic.ht = mimic.hp = mobStats(mimic).ht;
  Object.assign(mimic, { enemy: hero.id, target: hero.pos, enemySeen: true, loot: heap.items });
  floor.mobs.push(mimic);
  enterCell(level, pos);
  ctx.effects.push({ type: 'mimic', depth, mob: mimic.id, hero: hero.id });
  return true;
}

/** Dewdrop.doPickUp: a little health, more for the huntress; wasted on the unhurt. */
function drinkDew(ctx: Ctx, hero: Hero, dew: Item): void {
  const value = 1 + Math.trunc((ctx.depth - 1) / 5) + (hero.heroClass === 'huntress' ? 1 : 0);
  const amount = Math.max(0, Math.min(hero.ht - hero.hp, value * dew.qty));
  hero.hp += amount;
  ctx.effects.push({ type: 'dew', hero: hero.id, amount });
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
      // PotionOfHealing.cure: poison and weakness go too.
      hero.ooze = -1;
      hero.poison = 0;
      hero.weakened = 0;
      hero.crippled = 0;
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
    case 'potion.levitation':
      // PotionOfLevitation: floating, over traps and chasms alike.
      hero.levitating = Math.max(hero.levitating ?? 0, LEVITATION_DURATION);
      break;
    case 'potion.purity':
      // PotionOfPurity: no gas can harm the drinker for a while.
      hero.gasImmune = Math.max(hero.gasImmune ?? 0, GAS_IMMUNITY_DURATION);
      break;
    case 'potion.toxicGas':
    case 'potion.paralyticGas':
    case 'potion.frost':
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
      // Weapon.upgrade(false): the clash of magics may drive an enchantment out of a well-upgraded item.
      if ((upgraded.enchant || upgraded.glyph) && upgraded.level > 0 && ctx.rng.int(upgraded.level) > 0) {
        delete upgraded.enchant;
        delete upgraded.glyph;
        ctx.effects.push({ type: 'disenchanted', hero: hero.id, item: upgraded });
      }
      upgraded.level++;
      ctx.effects.push({ type: 'upgraded', hero: hero.id, item: upgraded });
      break;
    }
    case 'scroll.enchantment': {
      // ScrollOfEnchantment: a new enchantment for the weapon, or a new glyph for the armour.
      const imbued = hero[target];
      if (target === 'weapon') imbued.enchant = randomEnchantment(ctx.rng, imbued.enchant);
      else imbued.glyph = randomGlyph(ctx.rng, imbued.glyph);
      ctx.effects.push({ type: 'imbued', hero: hero.id, item: imbued });
      break;
    }
    case 'scroll.terror': {
      // Every monster in sight flees from the reader.
      const fov = heroView(world, hero);
      const frightened = ctx.floor.mobs.filter((mob) => fov[mob.pos] && mob.state !== 'passive');
      for (const mob of frightened) {
        mob.terror = TERROR_TURNS;
        mob.terrorOf = hero.id;
        if (mob.state === 'sleeping') mob.state = 'hunting';
      }
      ctx.effects.push({ type: 'scroll', hero: hero.id, kind: 'terror', count: frightened.length });
      break;
    }
    case 'scroll.psionicBlast': {
      // Everyone in sight is struck and blinded for a while, the reader too.
      const fov = heroView(world, hero);
      const struck = ctx.floor.mobs.filter((mob) => fov[mob.pos] && mob.state !== 'passive');
      ctx.effects.push({ type: 'scroll', hero: hero.id, kind: 'psionic', count: struck.length });
      for (const mob of struck) {
        mob.dizzy = Math.max(mob.dizzy ?? 0, ctx.rng.intBetween(3, 6));
        const damage = ctx.rng.intRange(1, Math.max(1, Math.trunc((mob.ht * 2) / 3)));
        ctx.effects.push({ type: 'hurt', depth: ctx.depth, who: mob.id, damage });
        hurt(ctx, mob, damage, hero);
      }
      hero.blind = Math.max(hero.blind ?? 0, ctx.rng.intBetween(3, 6));
      break;
    }
    default:
      break;
  }
}
