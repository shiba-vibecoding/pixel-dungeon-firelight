import compete from '../../client/public/assets/compete/compete.json';
import { HEAT } from './heat';

/*
 * The weekly leagues (design part 7, compete.json → leagues). Pure rules; the objects that keep rooms are in league.ts and the player's
 * part is in league-flow.ts.
 *
 *   five steps       Spark, Coal, Flame, Bonfire, Beacon; a new player starts in the Spark
 *   a room           30 players of one step who played that week, in the order they came; ranked by the week's best run (its score)
 *   the week         Monday 00:00 UTC to the next Monday; settled when the player next opens the game (never by a timer)
 *   the zones        the first 5 go up, the last 5 go down (a room of fewer players has smaller zones: a third of it, at most 5);
 *                    no one goes up from the Beacon or down from the Spark
 *   a week away      the step stays; two weeks in a row away: a step down
 *   the Beacon       the first 5 of a Beacon room get the week's mark on their profile
 *   Heat             up +60, stayed +20, a week in the Beacon +100 (heat.ts)
 *   closed           the leagues open when at least 60 players have played the week (a flag computed from the week's board)
 */

export const TIERS: readonly string[] = compete.leagues.tiers.map((tier) => tier.key);
export const ROOM_SIZE = compete.leagues.room;
export const PROMOTE = compete.leagues.promote;
export const DEMOTE = compete.leagues.demote;
export const START_TIER = compete.leagues.start;
/** How many players must have played the week for the leagues to be open. */
export const OPEN_AT = 60;
export const BEACON = TIERS[TIERS.length - 1]!;

/** A step's number, 1 to 5; 0 for a step nothing knows. */
export const tierNumber = (key: string | undefined): number => TIERS.indexOf(key ?? '') + 1;

/** Whether the leagues are open: enough players have played the week. */
export const leaguesOpen = (playedThisWeek: number): boolean => playedThisWeek >= OPEN_AT;

/** The room the n-th player (0-based) of a step's week joins: 1 for the first 30, 2 for the next 30, and so on. */
export const roomOf = (count: number): number => Math.floor(count / ROOM_SIZE) + 1;

/** The zones of a room of `size` players: how many go up and how many go down (5 and 5 in a full room; a third of a smaller one). */
export function zones(size: number): { up: number; down: number } {
  const part = Math.min(PROMOTE, Math.floor(size / 3));
  return { up: part, down: Math.min(DEMOTE, part) };
}

export type Result = 'up' | 'stay' | 'down';

/** What a week in a room was worth to a player: where they end, and what it gives in Heat. `place` is 1-based among `size`. */
export interface Outcome {
  result: Result;
  to: string;
  points: number;
  /** The first 5 of a Beacon room wear the week's mark. */
  mark: boolean;
}

export function outcomeOf(tier: string, place: number, size: number): Outcome {
  const at = Math.max(0, TIERS.indexOf(tier));
  const { up, down } = zones(size);
  let result: Result = place <= up ? 'up' : place > size - down ? 'down' : 'stay';
  // No one goes up from the top or down from the bottom.
  if (result === 'up' && at >= TIERS.length - 1) result = 'stay';
  if (result === 'down' && at <= 0) result = 'stay';
  const to = TIERS[result === 'up' ? at + 1 : result === 'down' ? at - 1 : at]!;
  const points = tier === BEACON ? HEAT.leagueBeacon : result === 'up' ? HEAT.leagueUp : result === 'stay' ? HEAT.leagueStay : 0;
  return { result, to, points, mark: tier === BEACON && place <= PROMOTE };
}

/** The step after weeks away: two weeks in a row without a room take a step down (one for each two), never below the Spark. */
export function afterIdle(tier: string, idleWeeks: number): string {
  const down = Math.floor(Math.max(0, idleWeeks) / 2);
  return TIERS[Math.max(0, TIERS.indexOf(tier) - down)] ?? START_TIER;
}

/** The Monday (00:00 UTC) that starts a week, from its name (2026-W43); NaN for a name that is none. */
export function weekMonday(week: string): number {
  const match = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!match) return NaN;
  const jan4 = Date.UTC(Number(match[1]), 0, 4);
  const monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 86_400_000;
  return monday + (Number(match[2]) - 1) * 7 * 86_400_000;
}

/** How many whole weeks lie between two weeks' names (b after a). */
export const weeksBetween = (a: string, b: string): number => Math.round((weekMonday(b) - weekMonday(a)) / (7 * 86_400_000));
