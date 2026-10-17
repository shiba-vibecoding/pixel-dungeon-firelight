/*
 * The texts of the input stream: the guard against accidental touches, the damage feed («what happened») and the path preview.
 * i18n-input.ru.ts has the Russian; each language is a chunk of its own.
 */

export const INPUT_EN = {
  settings: {
    loupe: 'Touch loupe',
    loupeNote: 'Hold a finger on the map: a magnified bubble shows what lifting it there will do. With a mouse, a label by the cursor',
    pathConfirm: 'Confirm the route',
    pathConfirmNote: 'A tap on a far cell shows the way first; a second tap on it walks',
    pathModes: { always: 'Always', combat: 'In a fight and when far', never: 'Never' },
    touchGuard: 'Accidental-touch guard',
    touchGuardNote: 'Ignores a palm, a touch at the very edge of the screen, the first touch after coming back to the game, and a tap with a second finger down',
  },
  /** What lifting the finger would do (loupe.ts); `n` steps. */
  loupe: {
    walk: (n: number): string => `Walk · ${n} ${n === 1 ? 'step' : 'steps'}`,
    attack: (name: string): string => `Attack: ${name}`,
    approach: (name: string): string => `Go to: ${name}`,
    open: (n: number): string => (n > 0 ? `Open · ${n} ${n === 1 ? 'step' : 'steps'}` : 'Open'),
    pickup: (name: string | null, n: number): string => `Pick up${name ? `: ${name}` : ''}${n > 0 ? ` · ${n} ${n === 1 ? 'step' : 'steps'}` : ''}`,
    descend: (n: number): string => (n > 0 ? `Go down · ${n} ${n === 1 ? 'step' : 'steps'}` : 'Go down'),
    ascend: (n: number): string => (n > 0 ? `Go up · ${n} ${n === 1 ? 'step' : 'steps'}` : 'Go up'),
    search: 'Search here',
    sealed: 'The way up is sealed',
    dig: 'Dig',
    jump: 'Jump into the chasm',
    throw: 'Throw here',
    zap: 'Zap here',
    special: 'Use here',
    locked: 'Locked',
    barricade: 'Barricade',
    noway: 'No way there',
    examine: 'Examine',
    cancel: 'Cancel',
  },
  path: {
    /** The tag over the target while a route waits for its second tap. */
    tag: (steps: number): string => `${steps} ${steps === 1 ? 'step' : 'steps'} · tap again`,
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
