import compete from '../../client/public/assets/compete/compete.json';

/*
 * The seasons of the competitions (design part 7): 8 weeks, 56 days each, one after another from a Monday (UTC), the same length as the
 * season pass. A season has a number, an id (`s1`), a palette for its cup and its frame (the designer drew four; after them they come
 * round again), and ends on a Monday at 00:00 UTC. The Heat rating (heat.ts) and the hall of fame (hall:<id>) belong to one season.
 *
 * The first season begins on SEASON_START: a Monday, set to the day Firelight opens (the `COMPETE_SEASON_START` variable of the server
 * overrides it, as YYYY-MM-DD). Before it, season 1 is "coming": nothing counts yet.
 *
 * (This is not the world's season, boards.ts SEASON: that one is raised only for a fresh start of everything.)
 */

export const SEASON_DAYS = compete.season.weeks * 7;
const DAY_MS = 86_400_000;

/** The first season's first day: a Monday. The server's COMPETE_SEASON_START (YYYY-MM-DD) overrides it. */
export const DEFAULT_SEASON_START = '2026-10-19';

/** The start as a time: the variable if it is a day, else the default; moved back to the Monday on or before it. */
export function seasonStart(value?: string): number {
  const parsed = Date.parse(`${/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : DEFAULT_SEASON_START}T00:00:00Z`);
  const start = Number.isFinite(parsed) ? parsed : Date.parse(`${DEFAULT_SEASON_START}T00:00:00Z`);
  return start - ((new Date(start).getUTCDay() + 6) % 7) * DAY_MS;
}

export interface SeasonNow {
  /** 1, 2, 3 ... */
  number: number;
  id: string;
  start: number;
  end: number;
  /** The season has begun (before the first one's start, nothing counts). */
  started: boolean;
  /** Whole days left, counting today; 0 once it is over. */
  daysLeft: number;
}

const idOf = (number: number): string => `s${number}`;

/** The season a time falls in; before the first, the first (not yet begun). */
export function seasonAt(now: number, start: number = seasonStart()): SeasonNow {
  const index = Math.max(0, Math.floor((now - start) / (SEASON_DAYS * DAY_MS)));
  const from = start + index * SEASON_DAYS * DAY_MS;
  const end = from + SEASON_DAYS * DAY_MS;
  return { number: index + 1, id: idOf(index + 1), start: from, end, started: now >= from, daysLeft: Math.max(0, Math.ceil((end - now) / DAY_MS)) };
}

/** A season by its number (its start and end, whatever the time now). */
export function seasonNumbered(number: number, start: number = seasonStart()): SeasonNow {
  const from = start + (number - 1) * SEASON_DAYS * DAY_MS;
  return { number, id: idOf(number), start: from, end: from + SEASON_DAYS * DAY_MS, started: true, daysLeft: 0 };
}

/** The number in a season's id, or null for something that is not one. */
export function seasonNumber(id: unknown): number | null {
  const match = typeof id === 'string' ? /^s([1-9]\d{0,2})$/.exec(id) : null;
  return match ? Number(match[1]) : null;
}

/** Whether a day (YYYY-MM-DD) is one of a season's days. */
export function inSeason(day: string, season: Pick<SeasonNow, 'start' | 'end'>): boolean {
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(time) && time >= season.start && time < season.end;
}

/** The art of a season: the designer's four palettes (and cups and frames) serve in turn. */
export function artSeason(number: number): string {
  const count = compete.season.seasons.length;
  return compete.season.seasons[(Math.max(1, number) - 1) % count]!.id;
}

/** How long after a season's end the hall of fame is written: players have this long to open the game and have their last days counted. */
export const HALL_GRACE_MS = 2 * DAY_MS;

/** When the hall of fame of a season may be frozen. */
export const hallOpensAt = (season: Pick<SeasonNow, 'end'>): number => season.end + HALL_GRACE_MS;
