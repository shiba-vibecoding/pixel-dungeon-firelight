import { type Hero, isIdentified, itemDef, type Item, levelKnown, type World } from '@pd/core';
// The core's counters are not in its index (and the core is not to be touched); the file itself is the source of the numbers.
import { ARMOR_HITS_TO_KNOW, WAND_USAGES_TO_KNOW, WEAPON_HITS_TO_KNOW } from '../../core/src/ident';

/*
 * How far a carried or worn weapon, armour, wand or ring is from being known through and through (core ident.ts): the counter
 * the rules keep on the item. It is a count and nothing more, and tells nothing of the item itself: a weapon's level, a
 * ring's kind and a wand's charges stay hidden until the count is full. The thresholds are the core's own; the ring's is not
 * exported there (RING_TICKS_TO_KNOW in world.ts), and a test holds this copy to what the rules do.
 */

/** RING_TICKS_TO_KNOW: turns a ring is worn before it is known. */
export const RING_TURNS_TO_KNOW = 200;

export type Familiarity = {
  /** What is counted: blows struck, blows taken, zaps, turns worn. */
  unit: 'hits' | 'taken' | 'zaps' | 'turns';
  done: number;
  of: number;
  /** The count only runs while the thing is in use: the weapon in hand, the armour and the ring on. */
  inUse: boolean;
};

const carries = (hero: Hero, item: Item): boolean =>
  hero.weapon === item || hero.armor === item || hero.rings.includes(item) || hero.items.includes(item);

/** The progress of an item toward being known, or null if there is nothing to count (known already, or not one of these, or not the hero's). */
export function familiarity(world: World, hero: Hero, item: Item): Familiarity | null {
  if (!carries(hero, item)) return null;
  const category = itemDef(item.kind).category;
  const count = (unit: Familiarity['unit'], done: number, of: number, inUse: boolean): Familiarity => ({ unit, done: Math.min(done, of), of, inUse });
  switch (category) {
    case 'weapon':
      return levelKnown(item) ? null : count('hits', item.familiarity ?? 0, WEAPON_HITS_TO_KNOW, hero.weapon === item);
    case 'armor':
      return levelKnown(item) ? null : count('taken', item.familiarity ?? 0, ARMOR_HITS_TO_KNOW, hero.armor === item);
    case 'wand':
      return isIdentified(world, item) ? null : count('zaps', item.familiarity ?? 0, WAND_USAGES_TO_KNOW, true);
    case 'ring':
      return isIdentified(world, item) ? null : count('turns', Math.floor(item.worn ?? 0), RING_TURNS_TO_KNOW, hero.rings.includes(item));
    default:
      return null;
  }
}
