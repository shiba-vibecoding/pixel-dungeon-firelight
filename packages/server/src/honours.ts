import compete from '../../client/public/assets/compete/compete.json';

/*
 * The honours of the competitions: titles (and the season's frames, cups and the Beacon fire) that are only won, never sold. A player's
 * object keeps the keys of what they have won (Profile.honour); the wallet turns them into items (shopapi.ts earnedBy, the catalogue's
 * `earn: { by: 'honour' }`). Every rule is judged here, from the boards' own answers about a finished day, week or season:
 *
 *   swift             top 10 of a finished day on the speed list (runs from depth 5: fewest turns for each depth)
 *   deep              top 10 of a finished day on the depth list (deepest, a tie by fewer turns)
 *   circle_champion   first in one of your circles at the end of a week (phase 4)
 *   season_beacon     the Beacon league at the season's end, or the season's top 10 by Heat
 *   cup.<season>      top 3 by Heat    frame.season.<season>  top 100 by Heat    fire.beacon  the Beacon league at the season's end
 *   duelist           ten duels won (the duels are not open yet: nothing grants it)
 */

export const HONOUR_KEYS = compete.titles.map((title) => title.title);

/** The top of a finished day's speed or depth list that earns the title... */
export const DAY_TITLE_TOP = 10;
/** ...but only on a day with at least this many players, and only in the better half of them (a day of three has no top ten). */
export const DAY_TITLE_MIN_PLAYERS = 5;

/** Whether a place on a finished day's list earns Swift or Deep Delver: top 10, in the better half, on a day that had players enough. */
export function dayTitleEarned(rank: number | null | undefined, played: number | undefined): boolean {
  if (!rank || !played || played < DAY_TITLE_MIN_PLAYERS) return false;
  return rank <= DAY_TITLE_TOP && rank <= Math.ceil(played / 2);
}

/** What the season's end gives for a place by Heat: the cup (top 3), the frame (top 100), the title (top 10). */
export const SEASON_CUP_TOP = 3;
export const SEASON_FRAME_TOP = 100;
export const SEASON_TITLE_TOP = 10;

export interface SeasonAwards {
  cup: boolean;
  frame: boolean;
  title: boolean;
}

/** The awards of a final place by Heat: nobody with no Heat at all is awarded anything. */
export function seasonAwards(rank: number, heat: number): SeasonAwards {
  if (rank < 1 || heat <= 0) return { cup: false, frame: false, title: false };
  return { cup: rank <= SEASON_CUP_TOP, frame: rank <= SEASON_FRAME_TOP, title: rank <= SEASON_TITLE_TOP };
}

/** The honour keys of a season's awards (season id as `s1`). */
export function awardKeys(season: string, awards: SeasonAwards): string[] {
  return [...(awards.cup ? [`cup.${season}`] : []), ...(awards.frame ? [`frame.season.${season}`] : []), ...(awards.title ? ['season_beacon'] : [])];
}

/** Puts honours in a list once each; returns the new list and what is new. */
export function grant(have: readonly string[] | undefined, keys: readonly string[]): { list: string[]; added: string[] } {
  const list = [...(have ?? [])];
  const added = keys.filter((key, i) => !list.includes(key) && keys.indexOf(key) === i);
  return { list: [...list, ...added], added };
}
