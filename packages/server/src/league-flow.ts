import { weekEnd } from '@pd/core';
import { addLeagueWeek } from './heat';
import type { DailyEntry } from './leaderboard';
import { afterIdle, outcomeOf, type Outcome, START_TIER, tierNumber, weekMonday, weeksBetween } from './league-rules';
import { heatForWeek, type SeasonProfile } from './season-flow';
import { rankKey } from './slices';

/*
 * What a player's object does about the weekly leagues, apart from storage and the other objects (league.ts holds rooms; player.ts hands in
 * what it can reach as `LeagueDeps`). All of it happens when the player next acts (a run's end, opening the game, opening the league),
 * never by a timer:
 *
 *   join     the first run of a week, once the leagues are open: the player is put in a room of their step by the order they came, and
 *            their best run of the week is kept there (again each time it is bettered)
 *   settle   the next visit after the week: the room's last standing says up, stay or down; the step changes, the Heat is counted,
 *            and the result waits to be shown to the player once
 */

/** Where a player stands in the leagues (kept in their profile). */
export interface LeagueState {
  /** The step the player plays their next room in (the highest reached is `best`). */
  tier: string;
  best: number;
  /** The room of the week now: its week, number and step; absent when the player has no room this week. */
  week?: string;
  room?: number;
  roomTier?: string;
  /** The rank key of the best run put in the room (a run that does not beat it is not sent again). */
  put?: number;
  /** The last week the player had a room in (the weeks since count as weeks away). */
  last?: string;
}

/** What a week in a room came to, kept until the player has seen it. */
export interface LeagueResult {
  week: string;
  /** The step of the room and the one after it. */
  tier: string;
  to: string;
  result: Outcome['result'];
  place: number;
  size: number;
  points: number;
  mark: boolean;
}

export interface LeagueProfile extends SeasonProfile {
  league?: LeagueState;
  leagueResult?: LeagueResult;
}

export interface LeagueDeps {
  now: number;
  start: number;
  /** The player's place in a room of an earlier week and how many were in it; null: not in it, 'error': it could not be asked. */
  standing(tier: string, week: string, room: number): Promise<{ place: number; size: number } | null | 'error'>;
  /** The room of this week for a step: the desk puts the player in one (null if it cannot). */
  join(tier: string, week: string): Promise<number | null>;
  /** Keeps the player's best run of the week in the room; whether it was kept. */
  put(tier: string, week: string, room: number, entry: DailyEntry): Promise<boolean>;
}

/** The step a player is in for the week asked: their step, less the steps lost to two weeks away in a row. */
export function currentTier(state: LeagueState | undefined, week: string): string {
  if (!state) return START_TIER;
  if (!state.last || state.week === week) return state.tier;
  return afterIdle(state.tier, weeksBetween(state.last, week) - 1);
}

/**
 * The room of an earlier week is settled: where the player ended, the Heat of the week, the result to show. Returns whether anything changed.
 * (A week asked about the player had no room in is not settled: nothing was at stake.)
 */
export async function settleLeague(profile: LeagueProfile, deps: LeagueDeps, week: string): Promise<boolean> {
  const state = profile.league;
  if (!state?.week || !state.room || !state.roomTier || state.week === week) return false;
  const standing = await deps.standing(state.roomTier, state.week, state.room);
  if (standing === 'error') return false;
  const outcome = standing ? outcomeOf(state.roomTier, standing.place, standing.size) : { result: 'stay' as const, to: state.roomTier, points: 0, mark: false };
  profile.leagueResult = {
    week: state.week, tier: state.roomTier, to: outcome.to, result: outcome.result, place: standing?.place ?? 0, size: standing?.size ?? 0, points: outcome.points, mark: outcome.mark,
  };
  // The Heat of the week, in the season it belongs to; the last week of a season also says what step the season ended in.
  const target = heatForWeek(profile, state.week, deps);
  if (target) {
    if (outcome.points > 0) addLeagueWeek(target.heat, state.week, outcome.points);
    if (weekEnd(weekMonday(state.week)) >= target.season.end) target.heat.endTier = state.roomTier;
  }
  state.tier = outcome.to;
  state.best = Math.max(state.best, tierNumber(outcome.to));
  state.last = state.week;
  delete state.week;
  delete state.room;
  delete state.roomTier;
  delete state.put;
  return true;
}

/**
 * The player's best run of the week goes to their room: the first one of the week puts them in a room of their step (the leagues must be
 * open: `open`), later ones are sent only when they beat what the room has. Returns whether anything changed.
 */
export async function syncLeague(profile: LeagueProfile, entry: DailyEntry | null, open: boolean, deps: LeagueDeps, week: string): Promise<boolean> {
  if (!open || !entry) return false;
  let changed = false;
  const state = (profile.league ??= { tier: START_TIER, best: 0 });
  if (state.week !== week) {
    // A new room: the step after any weeks away, a place by the order of coming.
    const tier = currentTier(state, week);
    const room = await deps.join(tier, week);
    if (room === null) return false;
    Object.assign(state, { tier, week, room, roomTier: tier, best: Math.max(state.best, tierNumber(tier)) });
    delete state.put;
    changed = true;
  }
  const key = rankKey(entry);
  if (state.put === undefined || key > state.put) {
    if (await deps.put(state.roomTier!, week, state.room!, entry)) {
      state.put = key;
      changed = true;
    }
  }
  return changed;
}

/** Whether the player is in a room this week. */
export const inRoom = (profile: LeagueProfile, week: string): boolean => profile.league?.week === week && Boolean(profile.league.room);

/** When this week ends (the Monday after it): the league screen's timer. */
export const weekEndsAt = (now: number): number => weekEnd(now);
