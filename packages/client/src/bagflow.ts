import { type Action, adjacent, type Hero, isAlive, type ItemKind, itemDef, type World } from '@pd/core';

/*
 * What the backpack does once something was done in it: stays open (the player goes on with the pack) or closes (the dungeon
 * answers). Pure rules here, no DOM; the backpack (screens.ts) and the tests use them.
 *
 * Stays: putting on and taking off, balancing, and a use whose whole effect is on the hero or the pack and needs no map and
 * no aiming: food, the potions of healing, strength and might, experience, and the scrolls of upgrade, identify, enchantment
 * and remove curse once they are known. Closes: throwing, zapping, aiming, dropping, and every use that has a say in the
 * world or the view (teleportation, mapping, gases, flames, levitation, vision, an unknown potion or scroll, which may be any).
 * Whatever the action, the backpack also closes when the hero is gone or a hostile monster has come next to them.
 */

/** Potions that only change the hero (healing, the two kinds of strength, experience). */
const HERO_POTIONS: ReadonlySet<ItemKind> = new Set<ItemKind>(['potion.healing', 'potion.strength', 'potion.might', 'potion.experience']);

/** Scrolls that only change the pack: read on a thing picked, or on the whole pack. */
const PACK_SCROLLS: ReadonlySet<ItemKind> = new Set<ItemKind>(['scroll.upgrade', 'scroll.identify', 'scroll.enchantment', 'scroll.removeCurse']);

/** Whether using an item of this kind leaves the backpack open. `known`: the kind is known (potions and scrolls hide theirs). */
export function useKeepsOpen(kind: ItemKind, known: boolean): boolean {
  const category = itemDef(kind).category;
  if (category === 'food' || kind === 'quest.fish') return true;
  if (!known) return false;
  if (category === 'potion') return HERO_POTIONS.has(kind);
  if (category === 'scroll') return PACK_SCROLLS.has(kind);
  return false;
}

/** Whether an action done in the backpack leaves it open; `item` is what it was done with (its kind, and whether that is known). */
export function keepsOpen(action: Action, item?: { kind: ItemKind; known: boolean }): boolean {
  switch (action.type) {
    case 'equip':
    case 'unequip':
    case 'remove':
    case 'balance':
      return true;
    case 'use':
      return item ? useKeepsOpen(item.kind, item.known) : false;
    default:
      // Drop, mine, beacon, mastery, special and whatever else: the dungeon answers.
      return false;
  }
}

/** The hostile monsters next to a hero that are awake (a sleeper is no threat yet), by id. */
export function adjacentFoes(world: World, hero: Hero): string[] {
  return (world.floors[hero.depth]?.mobs ?? [])
    .filter((m) => m.hp > 0 && m.state !== 'passive' && m.state !== 'sleeping' && !m.image && adjacent(hero.pos, m.pos))
    .map((m) => m.id);
}

/** Whether a foe is next to the hero now that was not before. */
export const newlyAdjacent = (before: ReadonlySet<string>, now: readonly string[]): boolean => now.some((id) => !before.has(id));

/** Whether an open backpack must close by itself: the hero died, the game is over, or a foe has come next to them. */
export function mustClose(state: { alive: boolean; over: boolean; before: ReadonlySet<string>; now: readonly string[] }): boolean {
  return !state.alive || state.over || newlyAdjacent(state.before, state.now);
}

/** The same, asked of the world. */
export const backpackMustClose = (world: World, hero: Hero, before: ReadonlySet<string>): boolean =>
  mustClose({ alive: isAlive(hero), over: world.over, before, now: adjacentFoes(world, hero) });

/** What letting go of a dragged item does: its action on a place that takes it, else the item flies back. */
export type DropResult<T> = { type: 'do'; value: T; place: string } | { type: 'snap' };

/** Where a drag was let go: `places` is what each place would do (the ones that take the item), `place` the one under the finger. */
export function resolveDrop<T>(places: ReadonlyMap<string, T>, place: string | undefined): DropResult<T> {
  if (place === undefined || !places.has(place)) return { type: 'snap' };
  return { type: 'do', value: places.get(place)!, place };
}

/** How long (ms) an item flies back to its slot after a drop that was not taken. */
export const SNAP_BACK_MS = 180;
