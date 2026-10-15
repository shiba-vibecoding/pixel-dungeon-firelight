import type { TrapKind } from '@pd/core';

/*
 * The texts of the safety stream: the questions asked before a step into gas, before putting on the unknown,
 * drinking an unknown potion among enemies, or reading a scroll that changes an item for good; the verbs of the
 * confirmations; the labels of a run («counts», «repeat», «not counted»); and the death window's notes. Every rule stated
 * here is checked against this build's core (traps.ts, gas.ts, scrolls.ts, combat.ts), which is Pixel Dungeon 1.9's.
 */

/** The first letter small, for a name that stands in the middle of a sentence. */
const small = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);

export const SAFETY_EN = {
  ask: {
    cancel: 'Cancel',
    never: 'Don’t ask again',
    putOn: 'Put on',
    putOnNever: 'Put on, and don’t ask again',
    putOnTitle: (name: string) => `Put on ${name}?`,
    putOnText: (identify: string, remove: string) =>
      `Nobody knows yet whether this is cursed, and a cursed thing cannot be taken off. A ${small(identify)} shows it first; a ${small(remove)} lifts a curse.`,
    drink: 'Drink',
    drinkNever: 'Drink, and don’t ask again',
    drinkTitle: (name: string) => `Drink ${name}?`,
    drinkText: 'An enemy is in sight, and this potion is unknown. Some potions harm: toxic or paralytic gas, flames. Thrown, a harmful one hits where it lands instead of you.',
    throwInstead: 'Throw it instead',
  },
  target: {
    upgrade: 'Upgrade',
    enchant: 'Enchant',
    upgradeTitle: (name: string) => `Upgrade ${name}?`,
    upgradeText: 'The scroll is spent only if you agree. An upgrade cannot be undone.',
    upgradeLoss: (chance: number) => ` The enchantment may be driven out: ${chance}%.`,
    upgradeMaybe: ' The enchantment may be driven out.',
    enchantTitle: (name: string) => `Enchant ${name}?`,
    enchantPlain: 'It takes a new enchantment. The scroll is spent only if you agree.',
    enchantReplace: 'It takes a new enchantment, and the one it has now is replaced. The scroll is spent only if you agree.',
  },
  danger: {
    walkIn: 'Walk in',
    gasAsk: ' Walk into it anyway?',
    gas: {
      toxic: ['Toxic gas', 'A cloud of toxic gas lies ahead: it hurts everyone who breathes it.'],
      paralytic: ['Paralytic gas', 'A cloud of paralytic gas lies ahead: whoever breathes it cannot move for a few turns.'],
    } as Record<'toxic' | 'paralytic', readonly [string, string]>,
    gasAhead: 'A cloud of gas bars the way. Tap again to walk in.',
  },
  /** PD 1.9's traps (levels/traps): the name, and what it does when stepped on (core traps.ts); the guide's colour table is checked against the names. */
  trap: {
    toxic: ['Toxic gas trap', 'A cloud of toxic gas bursts from it and spreads: it hurts everyone who breathes it.'],
    fire: ['Fire trap', 'It bursts into flame: whoever stands there catches fire, and the grass around burns.'],
    paralytic: ['Paralytic gas trap', 'A cloud of paralytic gas bursts from it: whoever breathes it cannot move for a few turns.'],
    poison: ['Poison trap', 'It poisons whoever steps on it: health ticks away for several turns.'],
    alarm: ['Alarm trap', 'It emits a piercing sound that calls every monster on the level to the spot.'],
    lightning: ['Lightning trap', 'It strikes whoever steps on it with lightning, for a third to two thirds of their health.'],
    gripping: ['Gripping trap', 'It snaps shut on the leg: a wound that grows with the depth, softened by armour.'],
    summoning: ['Summoning trap', 'It summons one to three monsters around whoever steps on it.'],
  } as Record<TrapKind, readonly [string, string]>,
  /** The notice while aiming from a quick slot with a target marked. */
  aimAgain: 'Tap the slot again to fire at the marked target',
  settings: {
    danger: 'Ask before gas',
    dangerNote: 'A step into a cloud of gas in sight asks first',
    risky: 'Ask before risky use',
    riskyNote: 'Putting on an unidentified thing, drinking an unknown potion with an enemy in sight, or reading upgrade and enchantment scrolls asks first',
  },
  verbs: {
    holdHint: 'Hold to confirm',
    /** The hold button while held, and when full. */
    holding: 'Hold on…',
    replaced: 'Replaced',
  },
  /** The hint under a hold button's row: «hold for 1.2 s». */
  holdFor: (seconds: string) => `hold for ${seconds} s`,
  /** How a run counts, as a chip. */
  label: {
    counted: 'counts',
    repeat: 'repeat',
    custom: 'own seed',
    local: 'not counted',
    countedNote: 'This run counts for the boards.',
    repeatNote: 'Today’s dungeon was played already: this repeat is practice and does not count for the boards.',
    customNote: 'A run on your own seed does not count for records or boards.',
    localNote: 'This run is played without the server: it counts for no board.',
  },
  /** The death window's notes: what a cause means when it was no monster's blow, and what the pack held. */
  death: {
    notes: {
      hunger: 'Starvation takes health every turn and stops it coming back. Any food ends it.',
      bleeding: 'Bleeding takes health every turn and fades slowly on its own.',
      poison: 'Poison takes health every turn until it wears off. A potion of healing cures it.',
      burning: 'Fire burns every turn until it burns out; water puts it out.',
      ooze: 'Caustic ooze burns every turn until it is washed off in water.',
      deferred: 'A glyph of viscosity put the blows off for later, and then they came due a point a turn.',
      fall: 'A jump or a fall into a chasm costs health.',
      gripping: 'A gripping trap. Traps are found by searching; tap one to read what it does.',
      gas: 'Gas from a trap or a potion. A potion of purity gives a few turns of immunity to gases.',
      lightning: 'Lightning from a trap, a wand or a monster.',
      bones: 'A skeleton falls apart in an explosion of bones that hurts whoever stands near.',
      bomb: 'A bomb’s blast hurts everyone near it, the one who threw it too.',
      multiplicity: 'The armour of multiplicity pays for each mirror image in health.',
    } as Record<string, string>,
    carried: (items: number, gold: number) => `In the pack: ${items} item${items === 1 ? '' : 's'}${gold > 0 ? `, ${gold} gold` : ''}.`,
    noAnkh: 'There was no ankh in the pack to bring you back: the run ends here.',
  },
};
