import type { Hero } from './actors';
import type { Ctx } from './floor';
import { dpow } from './fmath';
import type { Item } from './items';

/* The dew vial (DewVial): spare dew kept for later, which may save its bearer's life. */

/** log10(20), written out so that no engine's logarithm is asked (dpow is built from + - * / alone). */
const LIQUID_POWER = 1.3010299956639813;

/** DewVial.MAX_VOLUME. */
export const DEW_VIAL_VOLUME = 10;

/**
 * DewVial.execute: all the dew at once; the fuller the vial, the more it
 * heals, all of the hero's health when full.
 */
export function drinkFromVial(ctx: Ctx, hero: Hero, vial: Item): void {
  const volume = vial.volume ?? 0;
  const value = volume > 0 ? Math.ceil((dpow(volume, LIQUID_POWER) / 20) * hero.ht) : 0;
  const amount = Math.min(hero.ht - hero.hp, value);
  vial.volume = 0;
  hero.hp += amount;
  ctx.effects.push({ type: 'vial', hero: hero.id, amount });
}