import { dayOf, weekOf } from '@pd/core';
import type { RunSummary } from './runs';

/*
 * The boards checked runs go to. Each is one Durable Object (DailyBoard, index.ts) named
 * after what it ranks and when:
 *   daily:YYYY-MM-DD   the daily dungeon, the day's first run of each player
 *   week:YYYY-Www      the week's best dungeon run of each player (any checked run)
 *   all                the best ever
 * A player's best run stands on each; a finished day or week gives its best trophies.
 *
 * Seasons: Firelight started the world afresh. Every board lives in a Durable Object named
 * `s<SEASON>:` + the board's name (boardObject), so the boards of an earlier season are simply never
 * read again and nothing is deleted by hand. The names above stay as they are everywhere else (trophies,
 * claims): only the address of the object carries the season.
 */

/** The world's season: 1 before Firelight, 2 from it. Raised for the next fresh start. */
export const SEASON = 3;

/** A board of the arena of waves, which the game no longer has: what it holds is kept, never shown. */
export const isArenaBoard = (board: string): boolean => board.startsWith('arena');

/** The Durable Object name of a board, in this season. */
export const boardObject = (name: string, season: number = SEASON): string => `s${season}:${name}`;

/*
 * The arena of waves had boards of its own (arena:YYYY-Www, arena-all). They are no longer offered, asked for, written to or read; what
 * they hold in their Durable Objects stays as it is, unserved.
 */
export type BoardKind = 'daily' | 'week' | 'all';
export const BOARD_KINDS: readonly BoardKind[] = ['daily', 'week', 'all'];

export function boardName(kind: BoardKind, now: number): string {
  switch (kind) {
    case 'daily':
      return `daily:${dayOf(now)}`;
    case 'week':
      return `week:${weekOf(now)}`;
    case 'all':
      return 'all';
  }
}

/** The boards a finished run goes on. A daily dungeon played again the same day is practice: none. */
export function boardsFor(summary: RunSummary): BoardKind[] {
  if (!summary.ranked) return [];
  return summary.slot === 'daily' ? ['daily', 'week', 'all'] : ['week', 'all'];
}

/** The board a run's day or week names: a daily run counts for the day it began. */
export function boardOfRun(kind: BoardKind, summary: RunSummary, now: number): string {
  return kind === 'daily' && summary.date ? `daily:${summary.date}` : boardName(kind, now);
}

/** How long after its day or week a board is kept (ms); null: for ever. */
export function boardTtl(name: string): number | null {
  if (name.startsWith('daily:')) return 60 * 86_400_000;
  // (The arena of waves' old weekly boards expire as they always did.)
  if (name.startsWith('week:') || name.startsWith('arena:')) return 180 * 86_400_000;
  return null;
}

/** The places that win a trophy once a board's day or week is over. */
export function trophyPlaces(name: string): number {
  return name.startsWith('daily:') ? 3 : 10;
}

/** The finished boards whose trophies a player may have won: yesterday's daily dungeon, last week's two. */
export function finishedBoards(now: number): string[] {
  const yesterday = now - 86_400_000;
  const lastWeek = now - 7 * 86_400_000;
  return [`daily:${dayOf(yesterday)}`, `week:${weekOf(lastWeek)}`];
}
