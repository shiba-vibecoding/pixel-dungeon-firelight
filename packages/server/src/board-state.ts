import { compareEntries, type DailyEntry, Leaderboard, type Passed, servedEntry } from './leaderboard';
import { RankIndex } from './rank-index';
import { ALL_SLICES, isBase, orderOf, rankKey, type Slice, sliceKey, sliceSize, slicesOf } from './slices';

/*
 * What a board object does with a finished run and with a question about a slice, apart from storage (the Durable Object, daily-board.ts,
 * reads what is asked for, calls these and writes what they say). Keys the object keeps:
 *   board        the score list, the top 100 (what it always was)
 *   l:<metric>[:<class>]   the other slices' lists, the top 50 each (slices.ts)
 *   ranks        every player's rank key, best first: how many players the board has had, and where a key would stand (rank-index.ts)
 *   e:<id>       a player's own best entry by their id on this board, so that anyone can be shown at their true place, however far down
 */

export const RANKS = 'ranks';
export const entryKey = (id: string): string => `e:${id}`;

/** What a put says back: the player's place on the score board (the true one, beyond the top 100 too), how many are on it, whom it passed. */
export interface PutAnswer {
  rank: number | null;
  total: number;
  played: number;
  passed?: Passed;
}

const descending = (a: number, b: number): number => b - a;

/** What a put needs to have read: the lists of the slices the entry counts for, the index, and the player's standing entry. */
export interface PutInput {
  lists: ReadonlyMap<string, DailyEntry[]>;
  ranks: readonly number[] | undefined;
  previous: DailyEntry | undefined;
}

/** Boards that are no list of runs (the season's Heat, a hall of fame) have the score list only: no slices of speed, depth or hero. */
export const sliced = (name: string): boolean => !name.startsWith('season:') && !name.startsWith('hall:');

/** The slices a put reads: those the entry counts for (the score list alone on a board that is not of runs). */
export const putSlices = (entry: DailyEntry, name = ''): Slice[] => (sliced(name) ? slicesOf(entry) : ALL_SLICES.filter((slice) => isBase(slice)));

/** A finished run onto the score list, every slice it counts for and the rank index; the answer and what to write. */
export function applyPut(input: PutInput, entry: DailyEntry, name = ''): { answer: PutAnswer; writes: Record<string, unknown> } {
  const base = input.lists.get('board') ?? [];
  const writes: Record<string, unknown> = {};
  // Before the lists change: the index (made from the score list for a board from before there was one) and the player's standing entry.
  let keys = input.ranks ? [...input.ranks] : undefined;
  if (!keys) {
    keys = base.map(rankKey).sort(descending);
    for (const old of base) writes[entryKey(old.id)] = old;
  }
  const previous = input.previous ?? base.find((e) => e.id === entry.id);
  const standing = previous ? { ...previous } : undefined;
  const index = new RankIndex(keys);
  const better = !standing || compareEntries(entry, standing) < 0;
  if (better) {
    index.add(rankKey(entry), standing ? rankKey(standing) : undefined);
    writes[entryKey(entry.id)] = entry;
  }
  let rank: number | null = null;
  let passed: Passed | undefined;
  let total = 0;
  for (const slice of putSlices(entry, name)) {
    const key = sliceKey(slice);
    const list = new Leaderboard([...(input.lists.get(key) ?? [])], orderOf(slice.metric), sliceSize(slice));
    const placed = list.place(entry);
    if (placed.changed) writes[key] = list.entries();
    if (isBase(slice)) {
      rank = placed.rank;
      passed = placed.passed;
      total = list.entries().length;
    }
  }
  writes[RANKS] = index.keys;
  return {
    answer: { rank: rank ?? index.rankOf(rankKey(better ? entry : standing!)), total, played: index.size, ...(passed ? { passed } : {}) },
    writes,
  };
}

/** What a question about a slice needs to have read. */
export interface ReadInput {
  list: DailyEntry[];
  ranks: readonly number[] | undefined;
  /** The asking player's own standing entry (by their id), read only if they are not on the list. */
  own?: DailyEntry | undefined;
}

/** A slice as asked: its top, the asker's place and entry, how many players there are. */
export function readSlice(slice: Slice, input: ReadInput, ask: { me: string | null; owner: string | null; top: number }): Record<string, unknown> {
  const board = new Leaderboard(input.list, orderOf(slice.metric), sliceSize(slice));
  const mine = ask.owner ? board.ofOwner(ask.owner) : null;
  let rank = ask.me ? board.rank(ask.me) : (mine?.rank ?? null);
  let you = ask.me && rank !== null ? board.entries()[rank - 1] : undefined;
  let played = input.ranks ? input.ranks.length : board.entries().length;
  if (ask.me && !you && input.own) {
    // Not on this list: the player's own entry (their best by score) still stands on the board, at its true place on the score list.
    you = input.own;
    if (isBase(slice) && input.ranks) rank = new RankIndex([...input.ranks]).rankOf(rankKey(input.own));
  }
  if (isBase(slice) && !input.ranks) played = Math.max(played, board.entries().length);
  return {
    rank, top: board.top(ask.top), total: board.entries().length, played,
    ...(you ? { you: servedEntry(you) } : {}), ...(mine ? { owner: { rank: mine.rank } } : {}),
  };
}

/** Where a player stood on a day's speed and depth lists (null: not on one): the titles' proof. */
export function listRanks(lists: { speed: readonly DailyEntry[]; depth: readonly DailyEntry[] }, me: string): { speed: number | null; depth: number | null } {
  const at = (list: readonly DailyEntry[]): number | null => {
    const index = list.findIndex((entry) => entry.id === me);
    return index >= 0 ? index + 1 : null;
  };
  return { speed: at(lists.speed), depth: at(lists.depth) };
}
