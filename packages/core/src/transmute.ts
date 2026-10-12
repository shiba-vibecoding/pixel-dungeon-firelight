import { createItem, type Item, itemDef, ItemGenerator, type ItemKind, randomEnchantment, wandMaxCharges } from './items';
import type { Rng } from './rng';

/*
 * Water of transmutation (WaterOfTransmutation): an item dropped into the
 * well comes out as another of its kind. Melee weapons turn into their twin
 * of the same tier; rings, wands and seeds into some other ring, wand or
 * seed; a scroll of upgrade into one of enchantment and back; a potion of
 * strength into one of might and back; other scrolls and potions into
 * others. Levels, curses and stacks are kept; an enchantment comes out as a
 * new one.
 */

const WEAPON_TWINS: Partial<Record<ItemKind, ItemKind>> = {
  'weapon.knuckles': 'weapon.dagger', 'weapon.dagger': 'weapon.knuckles',
  'weapon.spear': 'weapon.quarterstaff', 'weapon.quarterstaff': 'weapon.spear',
  'weapon.sword': 'weapon.mace', 'weapon.mace': 'weapon.sword',
  'weapon.longsword': 'weapon.battleAxe', 'weapon.battleAxe': 'weapon.longsword',
  'weapon.glaive': 'weapon.warHammer', 'weapon.warHammer': 'weapon.glaive',
};

const SWAPS: Partial<Record<ItemKind, ItemKind>> = {
  'scroll.upgrade': 'scroll.enchantment', 'scroll.enchantment': 'scroll.upgrade',
  'potion.strength': 'potion.might', 'potion.might': 'potion.strength',
};

/** What the water makes of an item, or null if it leaves it be. */
export function transmute(item: Item, rng: Rng, depth: number): Item | null {
  const category = itemDef(item.kind).category;
  const generator = new ItemGenerator(rng, depth);
  /** Another kind of the category, drawn as the generator would. */
  const other = (pick: () => ItemKind, also: (kind: ItemKind) => boolean = () => true): ItemKind => {
    for (let i = 0; i < 100; i++) {
      const kind = pick();
      if (kind !== item.kind && also(kind)) return kind;
    }
    return item.kind;
  };
  const keep = (kind: ItemKind): Item => {
    const changed: Item = { ...createItem(kind, item.qty, item.level) };
    if (item.cursed) changed.cursed = true;
    return changed;
  };
  switch (category) {
    case 'weapon': {
      const twin = WEAPON_TWINS[item.kind];
      if (!twin) return null;
      const changed = keep(twin);
      if (item.enchant) changed.enchant = randomEnchantment(rng);
      return changed;
    }
    case 'ring':
    case 'seed':
      return keep(other(() => generator.of(category).kind));
    case 'wand': {
      const changed = keep(other(() => generator.of('wand').kind));
      changed.charges = wandMaxCharges(changed);
      return changed;
    }
    case 'scroll':
    case 'potion': {
      const swap = SWAPS[item.kind];
      if (swap) return keep(swap);
      return keep(other(() => generator.of(category).kind, (kind) => !SWAPS[kind]));
    }
    default:
      return null;
  }
}
