import { cursedKnown, type Hero, type Item, itemDef, type ItemKind, isBroken, kindKnown, type World } from '@pd/core';
import { seenEnemies } from './sight';

/*
 * Confirming risky use: putting on a weapon, armour or ring whose curse is not known, drinking an unknown potion with an
 * enemy in sight, and reading a scroll on the thing it will change for good. Pure rules here; the questions are asked by
 * the backpack (screens.ts) and share the settings switch with mis-tap protection's way of working: «don't ask again» is
 * kept on this device only.
 */

const KEY = 'pd-confirm-risky';

/** Whether the questions about equipping the unknown and drinking it among enemies are asked: on unless turned off. */
export const confirmRisky = {
  on: ((): boolean => {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch {
      return true;
    }
  })(),
  set(on: boolean): void {
    this.on = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // For this session only.
    }
  },
};

/** What can be worn and may be cursed: the curse binds the thing on the hero at once. */
const WORN = new Set(['weapon', 'armor', 'ring']);

/** A weapon, armour or ring whose curse is not known yet: putting it on is a gamble. */
export function equipRisk(item: Item): boolean {
  return WORN.has(itemDef(item.kind).category) && !cursedKnown(item);
}

/** An unknown potion while an enemy is in sight: drinking it is a gamble (toxic gas, paralysis, flames). */
export function drinkRisk(world: World, hero: Hero, item: Item): boolean {
  if (itemDef(item.kind).category !== 'potion' || kindKnown(world, item)) return false;
  return seenEnemies(world, hero).length > 0;
}

/** What a scroll does to the item it is read on, for the question asked first (none for the rest: identify spoils nothing). */
export type TargetEffect = 'upgrade' | 'enchant';

const EFFECTS: Partial<Record<ItemKind, TargetEffect>> = {
  'scroll.upgrade': 'upgrade',
  'scroll.enchantment': 'enchant',
};

/** What reading `kind` on an item does for good, if that is worth a question. */
export const targetEffect = (kind: ItemKind): TargetEffect | undefined => EFFECTS[kind];

/**
 * ScrollOfUpgrade (Weapon.upgrade, Armor.upgrade): an item with an enchantment or a glyph loses it when
 * Random.Int(level) > 0, that is, with a chance of (level - 1) / level in percent (none at +0 and +1); a broken item is
 * only mended. 0 when it cannot happen.
 */
export function enchantLossChance(item: Item): number {
  if (!item.enchant && !item.glyph) return 0;
  if (isBroken(item) || item.level < 2) return 0;
  return Math.round((100 * (item.level - 1)) / item.level);
}

/** Whether the item carries an enchantment or a glyph that an upgrade or a new enchantment may take away. */
export const hasMagic = (item: Item): boolean => !!item.enchant || !!item.glyph;
