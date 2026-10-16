import type { HeroClass } from '@pd/core';
import { type Item, itemById, type Slot, slotOf } from './catalog';
import { cosmetics } from './cosmetics';
import { type DigitsArt, digitsArt, flVersion, type FxArt, fxArt, type HatArt, hatArt, type LookArt, lookArt, type PetArt, petArt } from './flart';

/*
 * What the hero wears, as pictures (the designer's art, flart.ts): the look that stands in for the class's sheet, the hat laid over
 * it, the pet that follows, the trail left by the steps, the effects of a kill and of a fall, and the digits of the damage. Looks only:
 * nothing here changes a run. A part whose art has not come yet is left out, and arrives on a later frame (onFlChange).
 */

export interface Worn {
  look?: LookArt;
  hat?: HatArt;
  pet?: PetArt;
  trail?: FxArt;
  kill?: FxArt;
  death?: FxArt;
  digits?: DigitsArt;
  /** Whether anything at all is worn (so a renderer can skip the lot). */
  any: boolean;
}

/** Nothing worn. */
export const NOTHING: Worn = { any: false };

/** The art of a set of worn items (by slot) for a hero class. */
export function wornOf(slots: ReadonlyMap<Slot, Item>, heroClass: HeroClass): Worn {
  const look = slots.get(`look.${heroClass}`);
  const hat = slots.get('hat');
  const pet = slots.get('pet');
  const trail = slots.get('trail');
  const kill = slots.get('killfx');
  const death = slots.get('deathfx');
  const digits = slots.get('numbers');
  const worn: Worn = { any: false };
  const lookOf = look && lookArt(look.id);
  const hatOf = hat && hatArt(hat.id, heroClass);
  const petOf = pet && petArt(pet.id);
  const trailOf = trail && fxArt(trail.id);
  const killOf = kill && fxArt(kill.id);
  const deathOf = death && fxArt(death.id);
  const digitsOf = digits && digitsArt(digits.id);
  if (lookOf) worn.look = lookOf;
  if (hatOf) worn.hat = hatOf;
  if (petOf) worn.pet = petOf;
  if (trailOf) worn.trail = trailOf;
  if (killOf) worn.kill = killOf;
  if (deathOf) worn.death = deathOf;
  if (digitsOf) worn.digits = digitsOf;
  worn.any = Boolean(worn.look || worn.hat || worn.pet || worn.trail || worn.kill || worn.death || worn.digits);
  return worn;
}

let memo: { heroClass: string; cosmetics: number; art: number; worn: Worn } | null = null;

/** What this player's hero of a class wears now (what they own and have put on), as pictures; kept until something changes. */
export function wornFor(heroClass: HeroClass): Worn {
  const art = flVersion();
  const rev = cosmetics.revision;
  if (memo && memo.heroClass === heroClass && memo.cosmetics === rev && memo.art === art) return memo.worn;
  const slots = new Map<Slot, Item>();
  for (const id of Object.values(cosmetics.equipped.slots)) {
    const item = id ? itemById(id) : undefined;
    const slot = item ? slotOf(item) : null;
    if (item && slot && cosmetics.ownsId(item.id)) slots.set(slot, item);
  }
  const worn = wornOf(slots, heroClass);
  memo = { heroClass, cosmetics: rev, art, worn };
  return worn;
}
