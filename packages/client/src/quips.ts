/*
 * Hero quips (Firelight's signature): a word from the hero after a kill and at a few other moments, in a bubble over his head.
 * This file is the data's shape and the picker: which line, if any, for a moment. What the moments are (read out of the turn's
 * effects) is quipwatch.ts; the bubble on the screen and the settings are quipsys.ts; the lines are quips-ru.ts and quips-en.ts.
 *
 * Two registers: «foul» (the default; the fork's joke) and «clean» (cheeky, no swearing). Four voices, the original classes':
 * the warrior is blunt and brutal, the mage snarky and nerdy, the rogue cocky and thieving, the huntress cold and wild.
 * The client alone: the picker rolls with Math.random, never the core's generator, so no line can change a run.
 */

export type QuipClass = 'warrior' | 'mage' | 'rogue' | 'huntress';
export const QUIP_CLASSES: readonly QuipClass[] = ['warrior', 'mage', 'rogue', 'huntress'];

/** The setting: with swearing, without, or silent. */
export type QuipMode = 'foul' | 'clean' | 'off';
export const QUIP_MODES: readonly QuipMode[] = ['foul', 'clean', 'off'];
export type Register = 'foul' | 'clean';
export type QuipLang = 'ru' | 'en';

/** Everything but the plain kill, which has its own lines for each class. */
export const OCCASIONS = [
  'trivial', 'goo', 'tengu', 'dm300', 'king', 'yog', 'nearDeath', 'firstBlood', 'streak', 'oneHit', 'ranged', 'wand', 'thief',
  'descend', 'cursed', 'hungry', 'amulet', 'death',
] as const;
export type Occasion = (typeof OCCASIONS)[number];
export type Moment = 'kill' | Occasion;

export interface QuipSet {
  /** What is said after an ordinary kill: at least 20 for each class. */
  kill: Record<QuipClass, readonly string[]>;
  /** For every other moment: lines for any hero ... */
  shared: Record<Occasion, readonly string[]>;
  /** ... and those only one class would say (they join the shared ones). */
  own: Partial<Record<Occasion, Record<QuipClass, readonly string[]>>>;
}
export type QuipData = Record<Register, QuipSet>;

/** How often the moment is spoken of when it comes. The sure ones also break the cooldown. */
export const CHANCE: Record<Moment, number> = {
  kill: 0.25,
  trivial: 0.5, oneHit: 0.5, ranged: 0.5, wand: 0.5, thief: 0.5, cursed: 0.5, hungry: 0.5,
  descend: 0.2,
  goo: 1, tengu: 1, dm300: 1, king: 1, yog: 1, nearDeath: 1, firstBlood: 1, streak: 1, amulet: 1, death: 1,
};

/** At least this long between two bubbles, unless the moment is a sure one. */
export const COOLDOWN_MS = 6000;
/** None of this many of the latest lines is said again. */
export const RECENT = 8;

/** The bubble: pops in, holds (longer for a longer line), fades. */
export const POP_MS = 120;
export const FADE_MS = 200;
export const HOLD_MIN_MS = 1600;
export const HOLD_MAX_MS = 2400;
/** The last words are quick: the death window waits only for them. */
export const LAST_WORDS_HOLD_MS = 1300;
export const LONGEST_LINE = 80;

export const holdFor = (text: string): number => Math.min(HOLD_MAX_MS, Math.max(HOLD_MIN_MS, HOLD_MIN_MS + (text.length - 24) * 16));

/** Every line that can be said for the moment by the class. */
export function poolOf(set: QuipSet, moment: Moment, heroClass: QuipClass): readonly string[] {
  if (moment === 'kill') return set.kill[heroClass];
  return [...set.shared[moment], ...(set.own[moment]?.[heroClass] ?? [])];
}

/** The setting, kept on the device. */
export const quipMode = {
  value: ((): QuipMode => {
    try {
      const stored = localStorage.getItem('pd-quips');
      return stored === 'clean' || stored === 'off' || stored === 'foul' ? stored : 'foul';
    } catch {
      return 'foul';
    }
  })(),
  set(mode: QuipMode): void {
    this.value = mode;
    try {
      localStorage.setItem('pd-quips', mode);
    } catch {
      // This session only.
    }
  },
};

export class QuipPicker {
  private recent: string[] = [];
  private last = -Infinity;

  /**
   * @param data the lines of the language shown
   * @param mode the setting, asked each time
   * @param random Math.random: the client's own dice
   */
  constructor(
    private readonly data: QuipData,
    private readonly mode: () => QuipMode = () => quipMode.value,
    private readonly random: () => number = Math.random,
  ) {}

  /** A line for the moment, or null: switched off, too soon after the last, not this time, or nothing to say. */
  offer(moment: Moment, heroClass: QuipClass, now: number): string | null {
    const mode = this.mode();
    if (mode === 'off') return null;
    const chance = CHANCE[moment];
    const sure = chance >= 1;
    if (!sure && now - this.last < COOLDOWN_MS) return null;
    if (!sure && this.random() >= chance) return null;
    const line = this.choose(poolOf(this.data[mode], moment, heroClass));
    if (line === null) return null;
    this.last = now;
    this.recent.push(line);
    if (this.recent.length > RECENT) this.recent.shift();
    return line;
  }

  /** Forgets the cooldown and the lines said (a new run). */
  reset(): void {
    this.recent = [];
    this.last = -Infinity;
  }

  private choose(pool: readonly string[]): string | null {
    if (pool.length === 0) return null;
    const fresh = pool.filter((line) => !this.recent.includes(line));
    // A short pool can be used up: then the one said longest ago.
    const from = fresh.length > 0 ? fresh : [...pool].sort((a, b) => this.recent.lastIndexOf(a) - this.recent.lastIndexOf(b)).slice(0, 1);
    return from[Math.min(from.length - 1, Math.floor(this.random() * from.length))]!;
  }
}
