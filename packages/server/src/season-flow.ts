import { addDay, emptyHeat, type Heat, heatOf } from './heat';
import { awardKeys, dayTitleEarned, grant, seasonAwards } from './honours';
import type { Lookup, Standing } from './mail';
import { hallOpensAt, inSeason, seasonAt, seasonNumbered, seasonNumber, type SeasonNow } from './season-clock';

/*
 * What a player's object does about seasons, apart from storage and the other objects (player.ts hands in what it can reach as `SeasonDeps`):
 * keeps the player's Heat for the season it is, counts each finished daily board once (its place, and the titles a fast or deep run of
 * the day wins), puts the rating on the season's board, and, once a season is over and its hall of fame is written, gives what the
 * final place won. Lazy, like the mail: all of it happens when the player next asks for their profile.
 */

/** A season's end for a player: what they had and what it was worth. */
export interface SeasonResult {
  id: string;
  heat: number;
  /** The final place by Heat (0: not on the board at the end), and how many players were on it. */
  rank: number;
  played: number;
  /** What it gave (honour keys: the cup, the frame, the title). */
  awards: string[];
}

/** The parts of a profile that seasons touch. */
export interface SeasonProfile {
  heat?: Heat;
  /** The season that has just ended and waits for its hall of fame (its last days still count until then). */
  heatPrev?: Heat;
  seasons?: SeasonResult[];
  /** What the player has won (honours.ts keys). */
  honour?: string[];
}

export interface SeasonDeps {
  now: number;
  /** The first season's start (season-clock.ts seasonStart). */
  start: number;
  /** The player's place on a board (their own public id): rank and how many played. */
  standing: Lookup;
  /** Writes the player's Heat to the season's board; whether it was kept. */
  put(heat: Heat, season: string): Promise<boolean>;
  /** Makes sure the hall of fame of a season is written (idempotent); whether it is now. */
  freeze(season: string): Promise<boolean>;
}

const RESULTS_KEPT = 20;

/** Gives honours (keys) to the profile; true if any is new. */
export function giveHonour(profile: SeasonProfile, keys: readonly string[]): boolean {
  const { list, added } = grant(profile.honour, keys);
  if (added.length === 0) return false;
  profile.honour = list;
  return true;
}

/** The heat a day of a season counts in: this season's, or the one just over while it waits; a day of any other is no one's. */
function heatForDay(profile: SeasonProfile, day: string, deps: Pick<SeasonDeps, 'now' | 'start'>): { heat: Heat; season: SeasonNow } | null {
  const season = seasonAt(Date.parse(`${day}T00:00:00Z`), deps.start);
  if (!inSeason(day, season)) return null;
  const now = seasonAt(deps.now, deps.start);
  if (season.id === now.id) {
    profile.heat ??= emptyHeat(season.id);
    return profile.heat.season === season.id ? { heat: profile.heat, season } : null;
  }
  // The season before this one, until its hall of fame is written.
  if (season.number === now.number - 1 && deps.now < hallOpensAt(season)) {
    profile.heatPrev ??= emptyHeat(season.id);
    return profile.heatPrev.season === season.id ? { heat: profile.heatPrev, season } : null;
  }
  return null;
}

/**
 * One finished board of the player's: a daily board's place counts in the season's heat, and a place high enough on its speed or depth list
 * wins the title. Returns whether anything changed.
 */
export function settleBoard(profile: SeasonProfile, board: string, standing: NonNullable<Standing>, deps: Pick<SeasonDeps, 'now' | 'start'>): boolean {
  const [kind, day = ''] = board.split(':');
  if (kind !== 'daily') return false;
  const played = standing.played ?? standing.total ?? 0;
  let changed = false;
  if (dayTitleEarned(standing.speed, played) && giveHonour(profile, ['swift'])) changed = true;
  if (dayTitleEarned(standing.depth, played) && giveHonour(profile, ['deep'])) changed = true;
  const target = heatForDay(profile, day, deps);
  if (target && addDay(target.heat, target.season, day, standing.rank, played)) changed = true;
  return changed;
}

/**
 * The heat of the season that is now, begun when the season has (nothing counts before the first). When the season has changed, the old
 * heat waits as `heatPrev` for its hall of fame (an older one still waiting is closed first, as late as it is).
 */
export async function rollSeason(profile: SeasonProfile, deps: SeasonDeps): Promise<boolean> {
  const season = seasonAt(deps.now, deps.start);
  let changed = false;
  if (profile.heat && profile.heat.season !== season.id) {
    if (profile.heatPrev && profile.heatPrev.season !== profile.heat.season) await closeSeason(profile, profile.heatPrev, deps);
    profile.heatPrev = profile.heat;
    delete profile.heat;
    changed = true;
  }
  if (season.started && !profile.heat) {
    profile.heat = emptyHeat(season.id);
    changed = true;
  }
  const prev = profile.heatPrev;
  if (prev) {
    const number = seasonNumber(prev.season);
    if (number !== null && deps.now >= hallOpensAt(seasonNumbered(number, deps.start))) {
      if (await closeSeason(profile, prev, deps)) changed = true;
    }
  }
  return changed;
}

/**
 * A season that is over for good: its final place by Heat, the cup, frame and title that place wins, and the line in the player's record.
 * False when the board could not be asked (it is tried again next time).
 */
async function closeSeason(profile: SeasonProfile, heat: Heat, deps: SeasonDeps): Promise<boolean> {
  const total = heatOf(heat);
  await deps.freeze(heat.season);
  const standing = await deps.standing(`season:${heat.season}`);
  if (standing === 'error') return false;
  const rank = standing ? standing.rank : 0;
  const played = standing ? (standing.played ?? standing.total ?? 0) : 0;
  // Someone who put no heat on the board before the hall was written has no place and wins nothing (the hall of fame is written once).
  const awards = rank > 0 ? awardKeys(heat.season, seasonAwards(rank, total)) : [];
  giveHonour(profile, awards);
  if (!(profile.seasons ?? []).some((result) => result.id === heat.season)) {
    profile.seasons = [{ id: heat.season, heat: total, rank, played, awards }, ...(profile.seasons ?? [])].slice(0, RESULTS_KEPT);
  }
  if (profile.heatPrev?.season === heat.season) delete profile.heatPrev;
  return true;
}

/** Puts the heat that changed on the season's board, once each: the season's own, and the one just over while it waits. Returns whether any went. */
export async function putHeat(profile: SeasonProfile, deps: SeasonDeps): Promise<boolean> {
  let sent = false;
  for (const heat of [profile.heat, profile.heatPrev]) {
    if (!heat) continue;
    const total = heatOf(heat);
    if (total <= 0 || heat.sent === total) continue;
    const number = seasonNumber(heat.season);
    // The board of a season whose hall is written does not take more.
    if (number === null || (number < seasonAt(deps.now, deps.start).number && deps.now >= hallOpensAt(seasonNumbered(number, deps.start)))) continue;
    if (await deps.put(heat, heat.season)) {
      heat.sent = total;
      sent = true;
    }
  }
  return sent;
}
