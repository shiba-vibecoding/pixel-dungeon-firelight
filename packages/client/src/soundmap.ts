import type { SfxName } from './sfx-synth';

/* Which sound goes with which event, where the event has kinds (the tables view.ts looks them up in). */

/** What each trap sounds like once its plate has clicked. */
export const TRAP_SOUND: Readonly<Record<string, SfxName>> = {
  toxic: 'trapGas', poison: 'trapGas', paralytic: 'trapGas', fire: 'burning', lightning: 'lightning', alarm: 'alarm', gripping: 'trapGrip', summoning: 'trapSummon',
};

/** What each wand's bolt sounds like. */
export const BOLT_SOUND: Readonly<Record<string, SfxName>> = {
  magic: 'zap', lightning: 'lightning', fire: 'zapFire', poison: 'zapPoison', slow: 'zapSlow', teleport: 'teleport', blink: 'zapBlink',
  beam: 'zapBeam', rocks: 'rocks', shadow: 'zapShadow', amok: 'zapAmok', reach: 'whoosh', flock: 'zapFlock', regrowth: 'zapGrow',
};

/** Weapons and monsters that hit with something blunt: a club, a hammer, a fist. */
export const BLUNT_WEAPONS: ReadonlySet<string> = new Set(['weapon.mace', 'weapon.warHammer', 'weapon.quarterstaff', 'weapon.knuckles']);
export const BLUNT_MOBS: ReadonlySet<string> = new Set(['golem', 'brute', 'crab', 'dm300', 'king', 'rottingFist', 'burningFist', 'statue', 'yog', 'monk', 'skeleton']);
