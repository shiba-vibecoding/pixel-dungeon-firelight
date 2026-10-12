import { HeapType, type ItemSpec } from './level/builder';
import type { Level, RoomInfo } from './level/generate';
import { LENGTH, WIDTH } from './level/geometry';
import { RoomType } from './level/room';
import { F, hasFlag } from './level/terrain';
import { deriveSeed, Rng } from './rng';
import type { RunState } from './run';

/*
 * Items, as data. A port of the original's item families that matter in the
 * sewers: gold, potions and scrolls (unknown until used or identified, with
 * colours and runes shuffled for every run), melee weapons and armour with
 * upgrade levels. Wands, rings, seeds, food and thrown weapons come later.
 */

export type ItemCategory = 'gold' | 'potion' | 'scroll' | 'weapon' | 'armor' | 'missile' | 'wand' | 'key' | 'quest';

export interface ItemDef {
  category: ItemCategory;
  /** Fixed sprite in items.png; potions and scrolls take theirs from the run's labels. */
  sprite?: number;
  /** Melee weapons (MeleeWeapon): tier, accuracy and delay factors, strength if not the usual. */
  tier?: number;
  accuracy?: number;
  delay?: number;
  str?: number;
}

const weapon = (tier: number, sprite: number, accuracy = 1, delay = 1, str?: number): ItemDef => ({
  category: 'weapon', sprite, tier, accuracy, delay, ...(str ? { str } : {}),
});
const armor = (tier: number, sprite: number): ItemDef => ({ category: 'armor', sprite, tier });

export const ITEMS = {
  gold: { category: 'gold', sprite: 14 },

  'potion.healing': { category: 'potion' },
  'potion.experience': { category: 'potion' },
  'potion.mindVision': { category: 'potion' },
  'potion.invisibility': { category: 'potion' },
  'potion.strength': { category: 'potion' },

  'scroll.identify': { category: 'scroll' },
  'scroll.teleportation': { category: 'scroll' },
  'scroll.mapping': { category: 'scroll' },
  'scroll.challenge': { category: 'scroll' },
  'scroll.lullaby': { category: 'scroll' },
  'scroll.upgrade': { category: 'scroll' },

  'weapon.knuckles': weapon(1, 16, 1, 0.5),
  'weapon.dagger': weapon(1, 19, 1.2),
  'weapon.shortSword': weapon(1, 2, 1, 1, 11),
  'weapon.quarterstaff': weapon(2, 17),
  'weapon.spear': weapon(2, 29, 1, 1.5),
  'weapon.mace': weapon(3, 18, 1, 0.8),
  'weapon.sword': weapon(3, 20),
  'weapon.longsword': weapon(4, 21),
  'weapon.battleAxe': weapon(4, 22, 1.2),
  'weapon.warHammer': weapon(5, 23, 1.2),
  'weapon.glaive': weapon(5, 30),

  'armor.cloth': armor(1, 24),
  'armor.leather': armor(2, 25),
  'armor.mail': armor(3, 26),
  'armor.scale': armor(4, 27),
  'armor.plate': armor(5, 28),

  // Thrown: darts are lost when they hit and fall to the floor when they
  // miss; the boomerang always comes back.
  'missile.dart': { category: 'missile', sprite: 31 },
  'missile.boomerang': { category: 'missile', sprite: 106 },
  'wand.magicMissile': { category: 'wand', sprite: 3 },
  /** Opens the locked room of the level it was found on. */
  'key.iron': { category: 'key', sprite: 9 },
  /** The sad ghost's dried rose. */
  'quest.rose': { category: 'quest', sprite: 100 },
} as const satisfies Record<string, ItemDef>;

export type ItemKind = keyof typeof ITEMS;

export interface Item {
  kind: ItemKind;
  /** How many: gold coins, potions, scrolls, darts; always 1 for equipment. */
  qty: number;
  /** Upgrade level of weapons, armour and wands, possibly negative. */
  level: number;
  /** Wands: charges left, and time spent towards the next one. */
  charges?: number;
  recharge?: number;
  /** Keys: the depth whose door they open. */
  depth?: number;
}

export const itemDef = (kind: ItemKind): ItemDef => ITEMS[kind];
export const isStackable = (kind: ItemKind): boolean => {
  const category = itemDef(kind).category;
  return category === 'potion' || category === 'scroll' || category === 'gold' || kind === 'missile.dart';
};

export function createItem(kind: ItemKind, qty = 1, level = 0): Item {
  const item: Item = { kind, qty, level };
  if (itemDef(kind).category === 'wand') {
    item.charges = wandMaxCharges(item);
    item.recharge = 0;
  }
  return item;
}

/* Thrown weapons (MissileWeapon) and the wand of magic missile */

export function missileStats(item: Item): { min: number; max: number; str: number } {
  return item.kind === 'missile.boomerang'
    ? { min: 1 + item.level, max: 4 + 2 * item.level, str: 10 }
    : { min: 1, max: 4, str: 10 };
}

/** One more charge every this many turns (Wand.Charger). */
export const WAND_RECHARGE = 40;

export const wandMaxCharges = (item: Item): number => Math.min(3 + item.level, 9);

/** WandOfMagicMissile: Random.Int(1, 6 + level * 2), so 1-5 for a plain wand. */
export const magicMissileDamage = (item: Item): readonly [number, number] => [1, 5 + item.level * 2];

/* Weapon and armour numbers (MeleeWeapon, Armor) */

const f32 = Math.fround;

export interface WeaponStats {
  min: number;
  max: number;
  str: number;
  accuracy: number;
  delay: number;
}

export function weaponStats(item: Item): WeaponStats {
  const def = itemDef(item.kind);
  const tier = def.tier!;
  const accuracy = def.accuracy!;
  const delay = def.delay!;
  return {
    min: tier + item.level,
    max: Math.trunc(f32(f32((tier * tier - tier + 10) / f32(accuracy)) * f32(delay))) + item.level * tier,
    str: (def.str ?? 8 + tier * 2) - item.level,
    accuracy,
    delay,
  };
}

export function armorStats(item: Item): { dr: number; str: number } {
  const tier = itemDef(item.kind).tier!;
  return { dr: Math.max(tier * (2 + item.level), 0), str: 7 + tier * 2 - item.level };
}

/* Labels: the run's potion colours and scroll runes */

export const POTION_COLORS = [
  'turquoise', 'crimson', 'azure', 'jade', 'golden', 'magenta', 'charcoal', 'ivory', 'amber', 'bistre', 'indigo', 'silver',
] as const;
export const SCROLL_RUNES = [
  'KAUNAN', 'SOWILO', 'LAGUZ', 'YNGVI', 'GYFU', 'RAIDO', 'ISAZ', 'MANNAZ', 'NAUDIZ', 'BERKANAN', 'ODAL', 'TIWAZ',
] as const;
const POTION_SPRITE = 56;
const SCROLL_SPRITES = [40, 41, 42, 43, 44, 45, 46, 47, 76, 77, 78, 79];

/** Kind → index into POTION_COLORS or SCROLL_RUNES, fixed for a run. */
export type Labels = Partial<Record<ItemKind, number>>;

export function rollLabels(seed: number): Labels {
  const rng = Rng.seeded(deriveSeed(seed, LABEL_STREAM));
  const labels: Labels = {};
  for (const category of ['potion', 'scroll'] as const) {
    const kinds = (Object.keys(ITEMS) as ItemKind[]).filter((kind) => itemDef(kind).category === category);
    const indices = [...Array(12).keys()];
    rng.shuffle(indices);
    kinds.forEach((kind, i) => {
      labels[kind] = indices[i]!;
    });
  }
  return labels;
}

const LABEL_STREAM = 6;

export function itemSprite(item: Item, labels: Labels): number {
  const def = itemDef(item.kind);
  if (def.sprite !== undefined) return def.sprite;
  const label = labels[item.kind] ?? 0;
  return def.category === 'potion' ? POTION_SPRITE + label : SCROLL_SPRITES[label]!;
}

/* Generator */

/** Categories the generator picks from; thrown weapons come with the weapons, wands are not found yet. */
type GeneratedCategory = 'gold' | 'potion' | 'scroll' | 'weapon' | 'armor';

const CATEGORY_CHANCES: ReadonlyArray<readonly [GeneratedCategory, number]> = [
  ['weapon', 15], ['armor', 10], ['potion', 50], ['scroll', 40], ['gold', 50],
];

const KIND_CHANCES: Readonly<Record<Exclude<GeneratedCategory, 'gold'>, ReadonlyArray<readonly [ItemKind, number]>>> = {
  // The original also has toxic gas, paralytic gas, liquid flame, levitation,
  // purity and frost; strength and might only come as guaranteed finds.
  potion: [['potion.healing', 45], ['potion.experience', 4], ['potion.mindVision', 20], ['potion.invisibility', 10]],
  // Also remove curse, recharging, terror, psionic blast and mirror image;
  // upgrade only comes as guaranteed finds.
  scroll: [['scroll.identify', 30], ['scroll.teleportation', 10], ['scroll.mapping', 15], ['scroll.challenge', 12], ['scroll.lullaby', 8]],
  weapon: [
    ['weapon.dagger', 1], ['weapon.knuckles', 1], ['weapon.quarterstaff', 1], ['weapon.spear', 1], ['weapon.mace', 1],
    ['weapon.sword', 1], ['weapon.longsword', 1], ['weapon.battleAxe', 1], ['weapon.warHammer', 1], ['weapon.glaive', 1],
    ['missile.dart', 1],
  ],
  armor: [['armor.cloth', 1], ['armor.leather', 1], ['armor.mail', 1], ['armor.scale', 1], ['armor.plate', 1]],
};

/** Gold.random: a pile's worth for a depth. */
export function rollGold(rng: Rng, depth: number): Item {
  return createItem('gold', rng.intBetween(20 + depth * 10, 40 + depth * 20));
}

/** Weapon.random / Armor.random: sometimes better, sometimes worse than usual. */
function rollLevel(rng: Rng): number {
  if (rng.float() >= 0.4) return 0;
  let n = 1;
  if (rng.int(3) === 0) {
    n++;
    if (rng.int(3) === 0) n++;
  }
  return rng.int(2) === 0 ? n : -n;
}

/** Generator: each category gets rarer on a level every time it is picked. */
export class ItemGenerator {
  private readonly chances = new Map(CATEGORY_CHANCES);

  constructor(private readonly rng: Rng, private readonly depth: number) {}

  random(): Item {
    const category = this.rng.chancesOf(this.chances)!;
    this.chances.set(category, this.chances.get(category)! / 2);
    return this.of(category);
  }

  of(category: GeneratedCategory): Item {
    if (category === 'gold') return rollGold(this.rng, this.depth);
    const table = KIND_CHANCES[category];
    const kind = table[this.rng.chances(table.map(([, chance]) => chance))]![0];
    // Dart.random: a handful of them.
    if (kind === 'missile.dart') return createItem(kind, this.rng.intBetween(5, 15));
    const level = category === 'weapon' || category === 'armor' ? rollLevel(this.rng) : 0;
    return createItem(kind, 1, level);
  }
}

/* What lies around on a new level */

export type HeapKind = 'heap' | 'chest' | 'skeleton' | 'tomb';

export interface Heap {
  pos: number;
  kind: HeapKind;
  items: Item[];
}

/** Sprites of closed containers in items.png. */
export const HEAP_SPRITES: Readonly<Record<Exclude<HeapKind, 'heap'>, number>> = { chest: 11, skeleton: 0, tomb: 13 };

/** Dungeon.posNeeded / souNeeded: guaranteed strength and upgrades, spread over the floors. */
function quotaReached(rng: Rng, depth: number, quota: readonly number[], found: number): boolean {
  for (let i = 0; i < quota.length; i += 2) {
    const qDepth = quota[i]!;
    if (depth <= qDepth) {
      return rng.float() < f32((quota[i + 1]! - found) / (qDepth - depth + 1));
    }
  }
  return false;
}

function randomCellIn(rng: Rng, room: RoomInfo): number {
  return rng.intBetween(room.left + 1, room.right) + rng.intBetween(room.top + 1, room.bottom) * WIDTH;
}

/** RegularLevel.randomDropCell: somewhere in a standard room. */
function randomDropCell(rng: Rng, level: Level): number {
  for (let attempt = 0; attempt < 200; attempt++) {
    const room = rng.element(level.rooms);
    if (room?.type !== RoomType.STANDARD) continue;
    const pos = randomCellIn(rng, room);
    if (pos >= 0 && pos < LENGTH && hasFlag(level.map[pos]!, F.PASSABLE)) return pos;
  }
  return -1;
}

const HEAP_KINDS: Readonly<Partial<Record<HeapType, HeapKind>>> = {
  [HeapType.CHEST]: 'chest',
  [HeapType.MIMIC]: 'chest',
  [HeapType.TOMB]: 'tomb',
  [HeapType.SKELETON]: 'skeleton',
};

/** Rolls what a painter asked for. */
function rollSpec(spec: ItemSpec, generator: ItemGenerator, rng: Rng, depth: number): Item {
  switch (spec.roll) {
    case 'random':
      return generator.random();
    case 'gold':
      return rollGold(rng, depth);
    case 'coins':
      return createItem('gold', rng.intRange(1, 3));
    case 'key':
      return { ...createItem('key.iron'), depth };
    case 'category': {
      let best: Item | null = null;
      for (let i = 0; i < spec.tries; i++) {
        const item = generator.of(rng.oneOf(spec.categories));
        if (!best || item.level > best.level) best = item;
      }
      return best!;
    }
  }
}

/** RegularLevel.createItems, plus the drops the layout asked for (special rooms, graves). */
export function createItems(run: RunState, level: Level, rng: Rng, boss: boolean): Heap[] {
  const heaps: Heap[] = [];
  const drop = (pos: number, kind: HeapKind, item: Item): void => {
    if (pos < 0) return;
    const heap = heaps.find((h) => h.pos === pos);
    if (heap) heap.items.push(item);
    else heaps.push({ pos, kind, items: [item] });
  };
  if (boss) return heaps;

  const generator = new ItemGenerator(rng, level.depth);
  let count = 3;
  while (rng.float() < 0.4) count++;
  for (let i = 0; i < count; i++) {
    const roll = rng.int(20);
    const kind: HeapKind = roll === 0 ? 'skeleton' : roll <= 5 ? 'chest' : 'heap';
    drop(randomDropCell(rng, level), kind, generator.random());
  }

  if (quotaReached(rng, level.depth, [4, 2, 9, 4, 14, 6, 19, 8, 24, 9], run.strengthFound)) {
    run.strengthFound++;
    drop(randomDropCell(rng, level), 'heap', createItem('potion.strength'));
  }
  if (quotaReached(rng, level.depth, [5, 3, 10, 6, 15, 9, 20, 12, 25, 13], run.upgradesFound)) {
    run.upgradesFound++;
    drop(randomDropCell(rng, level), 'heap', createItem('scroll.upgrade'));
  }

  for (const spec of level.toSpawn) {
    drop(randomDropCell(rng, level), 'heap', rollSpec(spec, generator, rng, level.depth));
  }
  for (const spawn of level.items) {
    drop(spawn.pos, HEAP_KINDS[spawn.heap] ?? 'heap', rollSpec(spawn.item, generator, rng, level.depth));
  }
  return heaps;
}
