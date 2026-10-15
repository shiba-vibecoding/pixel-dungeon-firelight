import type { Hero, HeroClass, MobKind } from '@pd/core';
import { t } from './i18n';

/*
 * The words of the death window: what killed the hero, what that means when it was not a monster (hunger, bleeding,
 * deferred damage, a trap, gas, a bomb...), and what the pack held. PD 1.9's causes are the hazards of the core's
 * combat.ts (poison, burning, ooze, lightning, gripping, hunger, bones, gas, fall, deferred, bleeding, multiplicity,
 * bomb), a monster's kind or a hero class.
 */

/** The name of what killed the hero, in the player's words: a hazard, a monster, a class, or the raw word if it is none. */
export function causeName(killedBy: string | null | undefined): string {
  if (!killedBy) return '';
  const named = t.causes[killedBy] ?? t.mobs[killedBy as MobKind] ?? t.classes[killedBy as HeroClass];
  return named ?? killedBy;
}

/** A line on what a cause means, for those that are not a monster's blow (empty for the rest). */
export function causeNote(killedBy: string | null | undefined): string {
  return (killedBy && t.safe.death.notes[killedBy]) || '';
}

/**
 * What the window says of the pack at the end: what it held, and that no ankh stood in the way (an ankh in the pack
 * would have raised the hero, at the price of everything else in it: core combat.ts resurrect).
 */
export function packLine(hero: Hero): string {
  const parts = [
    hero.items.length > 0 || hero.gold > 0 ? t.safe.death.carried(hero.items.length, hero.gold) : '',
    t.safe.death.noAnkh,
  ];
  return parts.filter(Boolean).join(' ');
}
