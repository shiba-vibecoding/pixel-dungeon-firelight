import {
  armorStats, type Hero, type Item, itemDef, itemSprite, magicMissileDamage, missileStats, SCROLL_RUNES, wandMaxCharges,
  weaponStats, type World,
} from '@pd/core';
import { t } from './i18n';

/* How items are called and described, given what the party knows. */

export function isKnown(world: World, item: Item): boolean {
  const category = itemDef(item.kind).category;
  return (category !== 'potion' && category !== 'scroll' && category !== 'wand') || world.known.includes(item.kind);
}

export function itemName(world: World, item: Item): string {
  const category = itemDef(item.kind).category;
  if (category === 'gold') return `${item.qty} ${t.goldShort}`;
  if (!isKnown(world, item)) {
    const label = world.run.labels[item.kind] ?? 0;
    if (category === 'wand') return t.unknownWand(t.woods[label]!);
    return category === 'potion' ? t.unknownPotion(t.colors[label]!) : t.unknownScroll(SCROLL_RUNES[label]!);
  }
  const name = t.items[item.kind];
  if (category === 'weapon' || category === 'armor' || category === 'wand') {
    return item.level === 0 ? name : `${name} ${item.level > 0 ? '+' : ''}${item.level}`;
  }
  return name;
}

export function itemInfo(world: World, hero: Hero, item: Item): string[] {
  const category = itemDef(item.kind).category;
  if (category === 'weapon') {
    const stats = weaponStats(item);
    return [t.weaponInfo(stats.min, stats.max, stats.str), ...(stats.str > hero.str ? [t.tooHeavy] : [])];
  }
  if (category === 'armor') {
    const stats = armorStats(item);
    return [t.armorInfo(stats.dr, stats.str), ...(stats.str > hero.str ? [t.tooHeavy] : [])];
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
  if (category === 'key') return [t.keyInfo(item.depth ?? 0)];
  if (category === 'gold') return [];
  return [isKnown(world, item) ? (t.itemInfo[item.kind] ?? '') : t.unknownInfo];
}

/** Top-left corner of an item's sprite in items.png. */
export function spriteOffset(world: World, item: Item): [number, number] {
  const index = itemSprite(item, world.run.labels);
  return [(index % 8) * 16, Math.floor(index / 8) * 16];
}
