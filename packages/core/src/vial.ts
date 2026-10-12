import type { Hero } from './actors';
import type { Ctx } from './floor';
import type { Item } from './items';

/* The dew vial (DewVial): spare dew kept for later, which may save its bearer's life. */

/** DewVial.MAX_VOLUME. */
export const DEW_VIAL_VOLUME = 10;

/**
 * DewVial.execute: all the dew at once; the fuller the vial, the more it
 * heals, all of the hero's health when full.
 */
export function drinkFromVial(ctx: Ctx, hero: Hero, vial: Item): void {
  const value = Math.ceil(((vial.volume ?? 0) ** Math.log10(20) / 20) * hero.ht);
  const amount = Math.min(hero.ht - hero.hp, value);
  vial.volume = 0;
  hero.hp += amount;
  ctx.effects.push({ type: 'vial', hero: hero.id, amount });
}