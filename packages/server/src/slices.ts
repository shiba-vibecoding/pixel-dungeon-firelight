import compete from '../../client/public/assets/compete/compete.json';
import { BOARD_SIZE, compareEntries, type DailyEntry } from './leaderboard';

/*
 * Slices of a board: the same runs sorted another way (design part 7, compete.json → boards). A board object keeps, besides its score list
 * (key `board`, as always), a short list for each of these, so that one call to the object serves any slice and a finished run goes to every
 * list it belongs to in the same call:
 *   metric  score, speed (fewest turns per depth; runs from depth 5), depth (deepest; a tie by fewer turns)
 *   class   all, or one of the four heroes
 * A player's best run by the slice's own order stands in it (the speed list may hold a run that is not their best score).
 */

export const METRICS = ['score', 'speed', 'depth'] as const;
export type Metric = (typeof METRICS)[number];
export const SLICE_CLASSES = ['warrior', 'mage', 'rogue', 'huntress'] as const;
export type SliceClass = (typeof SLICE_CLASSES)[number];

/** How many entries a slice other than the plain score list keeps. */
export const SLICE_SIZE = compete.boards.rows;
/** Speed counts runs from this depth only: a run that died on depth 2 is not a fast one. */
export const SPEED_MIN_DEPTH = compete.boards.speed.minDepth;

export interface Slice {
  metric: Metric;
  /** Only this hero's runs; null: every hero's. */
  cls: SliceClass | null;
}

/** The slice a request names, or null if it names something that is not one (an absent metric is the score, an absent class is all). */
export function parseSlice(metric: unknown, cls: unknown): Slice | null {
  const m = metric === undefined || metric === null || metric === '' ? 'score' : metric;
  const c = cls === undefined || cls === null || cls === '' || cls === 'all' ? null : cls;
  if (!(METRICS as readonly unknown[]).includes(m)) return null;
  if (c !== null && !(SLICE_CLASSES as readonly unknown[]).includes(c)) return null;
  return { metric: m as Metric, cls: c as SliceClass | null };
}

/** The plain score list: the board's own, where every run lands. */
export const isBase = (slice: Slice): boolean => slice.metric === 'score' && slice.cls === null;

/** Where a slice's list is kept in the board object's storage (the score list keeps the key it always had). */
export const sliceKey = (slice: Slice): string => (isBase(slice) ? 'board' : `l:${slice.metric}${slice.cls ? `:${slice.cls}` : ''}`);

export const sliceSize = (slice: Slice): number => (isBase(slice) ? BOARD_SIZE : SLICE_SIZE);

/** Turns for each depth reached: the speed board's value, smaller is better; Infinity for an entry that cannot say. */
export const turnsPerDepth = (entry: Pick<DailyEntry, 'turns' | 'depth'>): number =>
  entry.turns === undefined || entry.depth < 1 ? Infinity : entry.turns / entry.depth;

/** Whether a run may be on a slice's list at all. */
export function eligible(entry: DailyEntry, slice: Slice): boolean {
  if (slice.cls !== null && entry.heroClass !== slice.cls) return false;
  if (slice.metric === 'speed') return entry.turns !== undefined && entry.depth >= SPEED_MIN_DEPTH;
  return true;
}

const byTime = (a: DailyEntry, b: DailyEntry): number => a.at - b.at;

/** The order of a metric's list: the best first. */
export function orderOf(metric: Metric): (a: DailyEntry, b: DailyEntry) => number {
  switch (metric) {
    case 'score':
      return compareEntries;
    case 'speed':
      // Fewer turns for each depth; the same pace by the higher score, then who finished earlier.
      return (a, b) => turnsPerDepth(a) - turnsPerDepth(b) || b.score - a.score || byTime(a, b);
    case 'depth':
      // Deeper first; the same depth by fewer turns (an entry without the count goes after those with one).
      return (a, b) => b.depth - a.depth || (a.turns ?? Infinity) - (b.turns ?? Infinity) || b.score - a.score || byTime(a, b);
  }
}

/** Every slice there is: 3 metrics, each over all heroes and over each hero. */
export const ALL_SLICES: readonly Slice[] = METRICS.flatMap((metric) => [{ metric, cls: null } as Slice, ...SLICE_CLASSES.map((cls) => ({ metric, cls }) as Slice)]);

/** The slices a finished run belongs to: its metric lists over all heroes and over its own hero (speed ones only if it counts for speed). */
export function slicesOf(entry: DailyEntry): Slice[] {
  return ALL_SLICES.filter((slice) => eligible(entry, slice));
}

/** The value a slice's row shows: turns a depth for speed, the depth for depth, the score otherwise. */
export function valueOf(entry: DailyEntry, metric: Metric): number {
  return metric === 'speed' ? Math.round(turnsPerDepth(entry) * 10) / 10 : metric === 'depth' ? entry.depth : entry.score;
}

/**
 * A key that sorts the plain score list as a number (higher is better; equal scores by fewer turns): enough to say how many players
 * stand above a given one without keeping their entries (rank-index.ts).
 */
export function rankKey(entry: Pick<DailyEntry, 'score' | 'turns'>): number {
  return entry.score * 1_000_000 + (999_999 - Math.min(Math.max(entry.turns ?? 999_999, 0), 999_999));
}
