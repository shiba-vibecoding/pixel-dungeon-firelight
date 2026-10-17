/*
 * The texts of the input stream: the guard against accidental touches, the damage feed («what happened») and the path preview.
 * i18n-input.ru.ts has the Russian; each language is a chunk of its own.
 */

export const INPUT_EN = {
  settings: {
    touchGuard: 'Accidental-touch guard',
    touchGuardNote: 'Ignores a palm, a touch at the very edge of the screen, the first touch after coming back to the game, and a tap with a second finger down',
  },
  /** «What was»: the last wounds, with what dealt each. */
  feed: {
    title: 'Recent hits',
    /** The hero window's row and the death window's button. */
    open: 'Recent hits',
    deathLink: 'What happened',
    empty: 'Nothing yet: you have not been hurt.',
    turn: (turn: number): string => `turn ${turn}`,
    hint: 'The last wounds, the newest first.',
    /** The cause of death on top, when the hero has fallen. */
    died: 'Fallen',
    causes: {
      burning: 'Fire', poison: 'Poison', bleeding: 'Bleeding', hunger: 'Starvation', ooze: 'Caustic ooze', deferred: 'Delayed blows',
      gas: 'Toxic gas', trap: 'A trap', fall: 'A fall', lightning: 'Lightning', bones: 'Bones', bomb: 'A bomb',
      multiplicity: 'Armour of multiplicity', wand: 'A wand', missile: 'A thrown weapon', unknown: 'Unknown',
    } as Record<string, string>,
  },
};
