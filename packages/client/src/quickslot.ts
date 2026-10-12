import { type Hero, type ItemKind, itemDef } from '@pd/core';

/*
 * The quickslot (QuickSlot): the item the player keeps one tap away. The
 * player may put any usable item there; until then it holds the first thrown
 * weapon or wand in the pack. The choice is kept on this device.
 */

const KEY = 'pd-quickslot';

let chosen: ItemKind | null = null;
try {
  chosen = localStorage.getItem(KEY) as ItemKind | null;
} catch {
  // No storage: the default it is.
}

export function chooseQuickslot(kind: ItemKind): void {
  chosen = kind;
  try {
    localStorage.setItem(KEY, kind);
  } catch {
    // Kept for this session only.
  }
}

export const isQuickslotted = (kind: ItemKind): boolean => chosen === kind;

/** What a quickslot tap does with an item: aim a throw or a zap, or use it at once. */
export function quickUse(kind: ItemKind): 'throw' | 'zap' | 'use' | null {
  const category = itemDef(kind).category;
  if (category === 'wand') return 'zap';
  if (category === 'missile' || category === 'bomb' || category === 'honeypot' || category === 'seed') return 'throw';
  if (['potion', 'scroll', 'food', 'torch', 'vial', 'wipeout'].includes(category) || kind === 'quest.fish') return 'use';
  return null;
}

/** The backpack slot shown in the quickslot, or -1. */
export function quickIndex(hero: Hero): number {
  if (chosen) {
    const index = hero.items.findIndex((item) => item.kind === chosen);
    if (index >= 0) return index;
  }
  return hero.items.findIndex((item) => {
    const category = itemDef(item.kind).category;
    return category === 'missile' || category === 'wand';
  });
}