import {
  armorStats, CLASS_ARMOR, CLASS_ARMOR_OF, type Hero, type HeroClass, type Item, itemDef, type ItemKind, itemSprite, magicMissileDamage, missileStats, SCROLL_RUNES, wandMaxCharges,
  weaponStats, type World,
} from '@pd/core';
import { t } from './i18n';

/* How items are called and described, given what the party knows. */

const CLASS_OF = Object.fromEntries(Object.entries(CLASS_ARMOR_OF).map(([cls, kind]) => [kind, cls])) as Partial<Record<ItemKind, HeroClass>>;

export function isKnown(world: World, item: Item): boolean {
  const category = itemDef(item.kind).category;
  return (category !== 'potion' && category !== 'scroll' && category !== 'wand' && category !== 'ring') ||
    world.known.includes(item.kind);
}

export function itemName(world: World, item: Item): string {
  const category = itemDef(item.kind).category;
  if (category === 'gold') return `${item.qty} ${t.goldShort}`;
  if (!isKnown(world, item)) {
    const label = world.run.labels[item.kind] ?? 0;
    if (category === 'wand') return t.unknownWand(t.woods[label]!);
    if (category === 'ring') return t.unknownRing(t.gems[label]!);
    return category === 'potion' ? t.unknownPotion(t.colors[label]!) : t.unknownScroll(SCROLL_RUNES[label]!);
  }
  let name = t.items[item.kind];
  // Weapon.name and Armor.name: the enchantment or glyph is part of the name.
  if (item.enchant) name = t.enchantName(name, item.enchant, item.kind);
  if (item.glyph) name = t.glyphName(name, item.glyph);
  if (category === 'weapon' || category === 'armor' || category === 'wand' || category === 'ring') {
    return item.level === 0 ? name : `${name} ${item.level > 0 ? '+' : ''}${item.level}`;
  }
  return name;
}

export function itemInfo(world: World, hero: Hero, item: Item): string[] {
  const category = itemDef(item.kind).category;
  if (category === 'weapon') {
    const stats = weaponStats(item);
    return [
      t.weaponInfo(stats.min, stats.max, stats.str), ...(item.enchant ? [t.enchantInfo[item.enchant]] : []),
      ...(item.kind === 'weapon.pickaxe' ? [t.pickaxeInfo(!!item.bloody)] : []),
      ...(item.cursed ? [t.cursedInfo] : []),
      ...(stats.str > hero.str ? [t.tooHeavy] : []),
    ];
  }
  if (category === 'armor') {
    const stats = armorStats(item);
    return [
      t.armorInfo(stats.dr, stats.str), ...(item.glyph ? [t.glyphInfo[item.glyph]] : []), ...(item.cursed ? [t.cursedInfo] : []),
      ...(CLASS_ARMOR.includes(item.kind) ? [t.classArmorInfo[CLASS_OF[item.kind]!], t.specialCost] : []),
      ...(stats.str > hero.str ? [t.tooHeavy] : []),
    ];
  }
  if (category === 'missile') {
    const stats = missileStats(item);
    return [t.itemInfo[item.kind] ?? '', t.missileInfo(stats.min, stats.max)];
  }
  if (category === 'wand') {
    const charges = t.charges(item.charges ?? 0, wandMaxCharges(item));
    if (!isKnown(world, item)) return [t.unknownWandInfo, charges];
    if (item.kind !== 'wand.magicMissile') return [t.itemInfo[item.kind] ?? '', charges];
    const [min, max] = magicMissileDamage(item);
    return [t.itemInfo[item.kind] ?? '', t.wandDamage(min, max), charges];
  }
  if (category === 'ring') {
    if (!isKnown(world, item)) return [t.unknownRingInfo];
    return [t.itemInfo[item.kind] ?? '', ...(item.level < 0 ? [t.ringNegative] : []), ...(item.cursed ? [t.cursedInfo] : [])];
  }
  if (category === 'key') return [item.kind === 'key.golden' ? t.goldenKeyInfo(item.depth ?? 0) : t.keyInfo(item.depth ?? 0)];
  if (category === 'gold') return [];
  return [isKnown(world, item) ? (t.itemInfo[item.kind] ?? '') : t.unknownInfo];
}

/** Top-left corner of an item's sprite in items.png. */
export function spriteOffset(world: World, item: Item): [number, number] {
  const index = itemSprite(item, world.run.labels);
  return [(index % 8) * 16, Math.floor(index / 8) * 16];
}
