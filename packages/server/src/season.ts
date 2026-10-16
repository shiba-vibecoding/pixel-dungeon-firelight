import { SEASON } from './boards';
import { emptyProfile, type Profile, type Run, type RunSlot } from './runs';
import { fromEntries } from './run-store';

/*
 * The world starts afresh with Pixel Dungeon: Firelight (SEASON in boards.ts): runs under way, every board,
 * records, run history, streaks and freezes, badges, trophies and cups all begin from nothing. The boards need no
 * clearing (a new season's boards are other Durable Objects, boards.ts boardObject); a player's own object is reset
 * lazily, on first contact after the update, when what it holds was written in an earlier season (Profile.season;
 * absent: season 1).
 *
 * What a reset keeps: who the player is and their settings (the name, the tutorial seen, the news seen, the bug
 * hunter's honour, the day's problem-report count). Everything bought in Pixel-Mart is not in the profile at all: it
 * lives in the player's wallet, a Durable Object of its own (WalletStore, index.ts: owned looks and effects, patronage,
 * the charges, i.e. the Stars history), which a season never touches. There is no pioneer cup.
 *
 * Pure logic; player.ts asks it when the player's object loads.
 */

/** Whether a stored profile was written in an earlier season and must be started afresh. */
export const needsWipe = (profile: Pick<Profile, 'season'>): boolean => (profile.season ?? 1) < SEASON;

/** The profile of the new season made from an old one: the player's name kept, all else begun again. */
export function startSeason(old: Profile): Profile {
  const fresh = emptyProfile(old.name);
  fresh.season = SEASON;
  fresh.coachDone = old.coachDone;
  if (old.newsSeen !== undefined) fresh.newsSeen = old.newsSeen;
  if (old.honors !== undefined) fresh.honors = old.honors;
  if (old.problems !== undefined) fresh.problems = old.problems;
  if (old.hidden !== undefined) fresh.hidden = old.hidden;
  if (old.alias !== undefined) fresh.alias = old.alias;
  return fresh;
}

/** What a player's object holds once loaded. */
export interface Loaded {
  profile: Profile;
  runs: Partial<Record<RunSlot, Run>>;
  /** An earlier season's profile was started afresh: it is written out at once. */
  wiped: boolean;
}

/** A player from their stored entries, started afresh if the entries are of an earlier season. */
export function loadPlayer(entries: ReadonlyMap<string, string>): Loaded {
  const { profile, runs } = fromEntries(entries);
  if (!entries.has('profile')) {
    profile.season = SEASON;
    return { profile, runs, wiped: false };
  }
  if (!needsWipe(profile)) return { profile, runs, wiped: false };
  return { profile: startSeason(profile), runs: {}, wiped: true };
}
