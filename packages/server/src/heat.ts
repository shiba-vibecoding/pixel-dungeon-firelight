import compete from '../../client/public/assets/compete/compete.json';
import { inSeason, type SeasonNow } from './season-clock';

/*
 * Heat, the season rating (design part 7, compete.json → season.heat). Pure; the player's object keeps a `Heat` and the numbers come
 * from a checked run's place on a closed board, never from a device:
 *
 *   a day         10 for the daily dungeon played, and for the place that day (by the share of the day's players above you):
 *                 the best 50 %: +10, the best 10 %: +25, the best 1 %: +50 (the highest that fits, not all of them)
 *   a week        in a league: up +60, stayed +20, a week in the Beacon +100 (phase 3); a circle's week won: +30 (phase 4)
 *
 * The rating of a season is the sum of the best 30 DAYS of it (days not played cost nothing, a bad day is dropped when there are
 * better ones) and every league and circle week of it. A day counts once.
 */

export const HEAT = compete.season.heat;
/** How many days of a season count (the owner's decision: the best 30 of 56). */
export const BEST_DAYS = 30;

/** What the player's object keeps for a season. */
export interface Heat {
  /** The season's id. */
  season: string;
  /** Points of each day (YYYY-MM-DD) the daily dungeon was played and its board has closed. */
  days: Record<string, number>;
  /** Points of each league week (the week's name, 2026-W42) and circle week. */
  league: Record<string, number>;
  circle: Record<string, number>;
  /** The rating last put on the season's board (so that it is put again only when it has changed). */
  sent?: number;
}

export const emptyHeat = (season: string): Heat => ({ season, days: {}, league: {}, circle: {} });

/** Whether a place is in the best `percent` of `played`: at least the first place always, and nobody beyond it. */
export const inBest = (rank: number, played: number, percent: number): boolean => rank >= 1 && rank <= Math.max(1, Math.ceil((played * percent) / 100));

/** The points of a day: 10 for playing, and the highest bonus the place earns. */
export function dayPoints(rank: number, played: number): number {
  const bonus = inBest(rank, played, 1) ? HEAT.dayTop1 : inBest(rank, played, 10) ? HEAT.dayTop10 : inBest(rank, played, 50) ? HEAT.dayTop50 : 0;
  return HEAT.daily + bonus;
}

/** The sum of the `count` largest of the values. */
export const bestSum = (values: readonly number[], count: number): number => [...values].sort((a, b) => b - a).slice(0, count).reduce((sum, value) => sum + value, 0);

/** The rating: the best 30 days, and all the weeks of a league and a circle. */
export function heatOf(heat: Heat | undefined): number {
  if (!heat) return 0;
  const sum = (record: Record<string, number>): number => Object.values(record).reduce((total, value) => total + value, 0);
  return bestSum(Object.values(heat.days), BEST_DAYS) + sum(heat.league) + sum(heat.circle);
}

/**
 * Counts a closed day's place in a season's heat (the same day twice changes nothing; a day outside the season is not counted).
 * Returns whether the heat changed.
 */
export function addDay(heat: Heat, season: Pick<SeasonNow, 'start' | 'end'>, day: string, rank: number, played: number): boolean {
  if (!inSeason(day, season) || heat.days[day] !== undefined || rank < 1 || played < 1) return false;
  heat.days[day] = dayPoints(rank, played);
  return true;
}

/** A league week's points (up, stay, or a week in the Beacon): once a week. */
export function addLeagueWeek(heat: Heat, week: string, points: number): boolean {
  if (heat.league[week] !== undefined) return false;
  heat.league[week] = points;
  return true;
}

/** A circle's won week: once a week. */
export function addCircleWeek(heat: Heat, week: string): boolean {
  if (heat.circle[week] !== undefined) return false;
  heat.circle[week] = HEAT.circleChampion;
  return true;
}
