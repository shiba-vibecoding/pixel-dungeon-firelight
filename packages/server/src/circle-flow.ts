import { weekOf } from '@pd/core';
import { addCircleWeek } from './heat';
import { CAPS, type CircleKind, joinVerdict, type JoinVerdict, MAX_CIRCLES } from './circle-rules';
import type { DailyEntry } from './leaderboard';
import { giveHonour, heatForWeek, type SeasonProfile } from './season-flow';
import { rankKey } from './slices';

/*
 * What a player's object does about circles (circle-rules.ts), apart from storage and the other objects: the circles the player is in (at
 * most 2: their code, name and kind are kept in the profile, so that the list needs no call), the best run of the week sent to each one's
 * board (only when it beats what the board has), and, once a week is over, whether the player won it (the honour, and +30 Heat).
 */

/** A circle the player is in. */
export interface CircleRef {
  code: string;
  name: string;
  kind: CircleKind;
  /** The week whose board this player's best run was sent to last, and the rank key of that run. */
  week?: string;
  put?: number;
  /** The last finished week looked at for a champion. */
  settled?: string;
}

export interface CircleProfile extends SeasonProfile {
  circles?: CircleRef[];
}

export interface CircleDeps {
  now: number;
  start: number;
  /** Who won a finished week of a circle: whether this player did (`settled` false: the board could not be told yet; 'error': the circle could not be asked). */
  champion(code: string, week: string): Promise<{ you: boolean; settled: boolean } | 'error'>;
  /** Puts the player's best run of the week on the circle's board of that week; whether it was kept. */
  put(code: string, week: string, entry: DailyEntry): Promise<boolean>;
}

export const codesOf = (profile: CircleProfile): string[] => (profile.circles ?? []).map((ref) => ref.code);

/** Whether the player may join a circle that has `meta` (null: there is none): the rules of circle-rules.ts, with their own circles. */
export const mayJoin = (profile: CircleProfile, code: unknown, meta: { kind: CircleKind; size: number } | null): JoinVerdict => joinVerdict(code, codesOf(profile), meta);

/** The player is now in this circle. */
export function joined(profile: CircleProfile, ref: Pick<CircleRef, 'code' | 'name' | 'kind'>): void {
  if ((profile.circles ?? []).some((have) => have.code === ref.code) || (profile.circles ?? []).length >= MAX_CIRCLES) return;
  profile.circles = [...(profile.circles ?? []), { code: ref.code, name: ref.name, kind: ref.kind }];
}

/** The player has left this circle; whether they were in it. */
export function left(profile: CircleProfile, code: string): boolean {
  const had = (profile.circles ?? []).some((ref) => ref.code === code);
  if (had) profile.circles = (profile.circles ?? []).filter((ref) => ref.code !== code);
  if (profile.circles?.length === 0) delete profile.circles;
  return had;
}

/** The capacity of a circle of a kind (for the screens). */
export const capOf = (kind: CircleKind): number => CAPS[kind];

/**
 * Looks at the week that has just ended in each circle (once each): the winner of it gets the honour and the week's Heat. Returns whether the
 * profile changed.
 */
export async function settleCircles(profile: CircleProfile, deps: CircleDeps): Promise<boolean> {
  const last = weekOf(deps.now - 7 * 86_400_000);
  let changed = false;
  for (const ref of profile.circles ?? []) {
    if (ref.settled === last) continue;
    const answer = await deps.champion(ref.code, last);
    if (answer === 'error' || !answer.settled) continue;
    ref.settled = last;
    changed = true;
    if (!answer.you) continue;
    giveHonour(profile, ['circle_champion']);
    const target = heatForWeek(profile, last, deps);
    if (target) addCircleWeek(target.heat, last);
  }
  return changed;
}

/** The best run of the week goes to each circle's board, once, and again only when it is bettered. Returns whether anything went. */
export async function putCircles(profile: CircleProfile, entry: DailyEntry | null, week: string, deps: Pick<CircleDeps, 'put'>): Promise<boolean> {
  if (!entry) return false;
  const key = rankKey(entry);
  let changed = false;
  for (const ref of profile.circles ?? []) {
    if (ref.week !== week) {
      ref.week = week;
      delete ref.put;
    }
    if (ref.put !== undefined && key <= ref.put) continue;
    if (await deps.put(ref.code, week, entry)) {
      ref.put = key;
      changed = true;
    }
  }
  return changed;
}
