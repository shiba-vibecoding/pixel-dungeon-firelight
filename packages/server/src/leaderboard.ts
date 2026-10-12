/*
 * The daily dungeon's leaderboard: everyone plays the same seed, and each
 * player's best run of the day counts. Pure logic; the Durable Object stores
 * `entries()` and serves it over HTTP.
 */

export interface DailyResult {
  heroClass: string;
  depth: number;
  level: number;
  gold: number;
  won: boolean;
}

export interface DailyEntry extends DailyResult {
  id: string;
  name: string;
  score: number;
  at: number;
}

const HERO_CLASSES = new Set(['warrior', 'mage', 'rogue', 'huntress']);
export const BOARD_SIZE = 100;

/** The original's Rankings score: gold plus experience times depth, doubled for a win. */
export function score(result: DailyResult): number {
  return (result.gold + result.level * result.depth * 100) * (result.won ? 2 : 1);
}

/** The Amulet's depth: the deepest anyone can get, and the only place a run is won. */
const LAST_DEPTH = 26;

/** Checks a submitted result and clamps it to what the dungeon allows. */
export function parseResult(input: unknown): DailyResult | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  const int = (value: unknown, min: number, max: number): number | null =>
    Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? (value as number) : null;
  const depth = int(r.depth, 1, LAST_DEPTH);
  const level = int(r.level, 1, 30);
  const gold = int(r.gold, 0, 100_000);
  if (depth === null || level === null || gold === null || typeof r.won !== 'boolean') return null;
  if (typeof r.heroClass !== 'string' || !HERO_CLASSES.has(r.heroClass)) return null;
  return { heroClass: r.heroClass, depth, level, gold, won: r.won && depth === LAST_DEPTH };
}

export class Leaderboard {
  constructor(private readonly board: DailyEntry[] = []) {}

  entries(): DailyEntry[] {
    return this.board;
  }

  /** Records a run if it beats the player's best; returns the player's place (1-based) or null. */
  submit(id: string, name: string, result: DailyResult, now: number): number | null {
    const entry: DailyEntry = { ...result, id, name: name.slice(0, 32), score: score(result), at: now };
    const previous = this.board.findIndex((e) => e.id === id);
    if (previous >= 0) {
      if (this.board[previous]!.score >= entry.score) return this.rank(id);
      this.board.splice(previous, 1);
    }
    this.board.push(entry);
    // Higher scores first; an earlier run wins a tie.
    this.board.sort((a, b) => b.score - a.score || a.at - b.at);
    this.board.length = Math.min(this.board.length, BOARD_SIZE);
    return this.rank(id);
  }

  rank(id: string): number | null {
    const index = this.board.findIndex((e) => e.id === id);
    return index >= 0 ? index + 1 : null;
  }

  top(count: number): DailyEntry[] {
    return this.board.slice(0, count);
  }
}
