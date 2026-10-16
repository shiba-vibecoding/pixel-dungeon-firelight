import { describe, expect, it } from 'vitest';
import compete from '../../client/public/assets/compete/compete.json';
import { CATALOG, itemById } from '../../client/src/catalog';
import { addCircleWeek, addDay, addLeagueWeek, BEST_DAYS, bestSum, dayPoints, emptyHeat, HEAT, heatOf, inBest } from '../src/heat';
import { awardKeys, DAY_TITLE_MIN_PLAYERS, dayTitleEarned, grant, HONOUR_KEYS, seasonAwards } from '../src/honours';
import type { Standing } from '../src/mail';
import { artSeason, hallOpensAt, inSeason, SEASON_DAYS, seasonAt, seasonNumbered, seasonNumber, seasonStart } from '../src/season-clock';
import { earnedBy } from '../src/shopapi';
import { closeDueSeasons, putHeat, rollSeason, type SeasonDeps, type SeasonProfile, settleBoard } from '../src/season-flow';

const DAY = 86_400_000;
const at = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

describe('the seasons of the competitions (season-clock.ts)', () => {
  const start = seasonStart('2026-10-19');

  it('last 8 weeks, 56 days, from a Monday', () => {
    expect(SEASON_DAYS).toBe(56);
    expect(new Date(start).getUTCDay()).toBe(1);
    // A start given on a Wednesday is moved back to its Monday; nonsense falls back to the default.
    expect(new Date(seasonStart('2026-10-21')).toISOString().slice(0, 10)).toBe('2026-10-19');
    expect(seasonStart('soon')).toBe(start);
  });

  it('numbers the seasons from the start, and calls the time before it the first season, not begun', () => {
    expect(seasonAt(start - DAY, start)).toMatchObject({ number: 1, id: 's1', started: false });
    expect(seasonAt(start, start)).toMatchObject({ number: 1, started: true, daysLeft: 56 });
    expect(seasonAt(start + 55 * DAY + 3_600_000, start)).toMatchObject({ number: 1, daysLeft: 1 });
    expect(seasonAt(start + 56 * DAY, start)).toMatchObject({ number: 2, id: 's2', start: start + 56 * DAY });
    expect(seasonAt(start + 200 * DAY, start).number).toBe(4);
  });

  it('counts a day in a season by its date, the last day in and the next out', () => {
    const first = seasonNumbered(1, start);
    expect(inSeason('2026-10-19', first)).toBe(true);
    expect(inSeason('2026-10-18', first)).toBe(false);
    expect(inSeason('2026-12-13', first)).toBe(true);
    expect(inSeason('2026-12-14', first)).toBe(false);
    expect(inSeason('nonsense', first)).toBe(false);
  });

  it('knows a season id, and gives a fifth season the first palette again', () => {
    expect(seasonNumber('s12')).toBe(12);
    expect(seasonNumber('s0')).toBeNull();
    expect(seasonNumber('x1')).toBeNull();
    expect([1, 2, 3, 4, 5, 6].map(artSeason)).toEqual(['s1', 's2', 's3', 's4', 's1', 's2']);
    expect(hallOpensAt(seasonNumbered(1, start))).toBe(start + 56 * DAY + 2 * DAY);
  });
});

describe('Heat, the season rating (heat.ts)', () => {
  it('gives 10 for a day and the highest bonus the place earns: top 50 % +10, top 10 % +25, top 1 % +50', () => {
    expect(HEAT).toMatchObject({ daily: 10, dayTop50: 10, dayTop10: 25, dayTop1: 50 });
    // 1000 played: the first 10 are the top 1 %, the first 100 the top 10 %, the first 500 the top half.
    expect([1, 10].map((rank) => dayPoints(rank, 1000))).toEqual([60, 60]);
    expect([11, 100].map((rank) => dayPoints(rank, 1000))).toEqual([35, 35]);
    expect([101, 500].map((rank) => dayPoints(rank, 1000))).toEqual([20, 20]);
    expect([501, 1000].map((rank) => dayPoints(rank, 1000))).toEqual([10, 10]);
  });

  it('keeps small days fair: a day of one is the first place, the first is always in the top 1 %', () => {
    expect(inBest(1, 1, 1)).toBe(true);
    expect(dayPoints(1, 1)).toBe(60);
    expect(dayPoints(2, 3)).toBe(20);
    expect(dayPoints(2, 2)).toBe(10);
    expect(inBest(0, 10, 50)).toBe(false);
  });

  it('counts the best 30 days of a season, not the first 30', () => {
    expect(BEST_DAYS).toBe(30);
    const heat = emptyHeat('s1');
    const season = seasonNumbered(1, seasonStart('2026-10-19'));
    // 56 days played: 30 of them a top place (60), the rest a poor one (10).
    for (let i = 0; i < 56; i++) {
      const day = new Date(season.start + i * DAY).toISOString().slice(0, 10);
      expect(addDay(heat, season, day, i < 26 ? 1000 : 1, 1000)).toBe(true);
    }
    expect(heatOf(heat)).toBe(30 * 60);
    expect(bestSum([5, 9, 1, 7], 2)).toBe(16);
    expect(bestSum([5, 9], 5)).toBe(14);
  });

  it('counts a day once, and no day of another season', () => {
    const season = seasonNumbered(1, seasonStart('2026-10-19'));
    const heat = emptyHeat('s1');
    expect(addDay(heat, season, '2026-10-20', 3, 100)).toBe(true);
    expect(addDay(heat, season, '2026-10-20', 1, 100)).toBe(false);
    expect(addDay(heat, season, '2026-10-18', 1, 100)).toBe(false);
    expect(addDay(heat, season, '2026-12-14', 1, 100)).toBe(false);
    expect(addDay(heat, season, '2026-10-21', 0, 100)).toBe(false);
    expect(heatOf(heat)).toBe(dayPoints(3, 100));
  });

  it('adds every league and circle week on top, once each: up 60, stayed 20, Beacon 100, circle 30', () => {
    expect(HEAT).toMatchObject({ leagueUp: 60, leagueStay: 20, leagueBeacon: 100, circleChampion: 30 });
    const heat = emptyHeat('s1');
    expect(addLeagueWeek(heat, '2026-W43', HEAT.leagueUp)).toBe(true);
    expect(addLeagueWeek(heat, '2026-W43', HEAT.leagueStay)).toBe(false);
    expect(addLeagueWeek(heat, '2026-W44', HEAT.leagueBeacon)).toBe(true);
    expect(addCircleWeek(heat, '2026-W44')).toBe(true);
    expect(addCircleWeek(heat, '2026-W44')).toBe(false);
    expect(heatOf(heat)).toBe(60 + 100 + 30);
    expect(heatOf(undefined)).toBe(0);
  });
});

describe('the honours of the boards and of a season (honours.ts)', () => {
  it('give Swift or Deep Delver for the top 10 of a finished day, in the better half, on a day with players', () => {
    expect(dayTitleEarned(1, 30)).toBe(true);
    expect(dayTitleEarned(10, 30)).toBe(true);
    expect(dayTitleEarned(11, 30)).toBe(false);
    // Twenty players: the top 10 is half of them; five: the first three.
    expect(dayTitleEarned(10, 20)).toBe(true);
    expect(dayTitleEarned(11, 20)).toBe(false);
    expect(dayTitleEarned(3, DAY_TITLE_MIN_PLAYERS)).toBe(true);
    expect(dayTitleEarned(4, DAY_TITLE_MIN_PLAYERS)).toBe(false);
    // A quiet day has no top.
    expect(dayTitleEarned(1, DAY_TITLE_MIN_PLAYERS - 1)).toBe(false);
    expect(dayTitleEarned(null, 100)).toBe(false);
    expect(dayTitleEarned(undefined, 100)).toBe(false);
  });

  it('award the cup to the top 3, the frame to the top 100 and the title to the top 10 of a season by Heat, and nothing for no Heat', () => {
    expect(seasonAwards(1, 900)).toEqual({ cup: true, frame: true, title: true });
    expect(seasonAwards(3, 900)).toEqual({ cup: true, frame: true, title: true });
    expect(seasonAwards(4, 900)).toEqual({ cup: false, frame: true, title: true });
    expect(seasonAwards(10, 900)).toEqual({ cup: false, frame: true, title: true });
    expect(seasonAwards(11, 900)).toEqual({ cup: false, frame: true, title: false });
    expect(seasonAwards(100, 900)).toEqual({ cup: false, frame: true, title: false });
    expect(seasonAwards(101, 900)).toEqual({ cup: false, frame: false, title: false });
    expect(seasonAwards(1, 0)).toEqual({ cup: false, frame: false, title: false });
    expect(awardKeys('s2', seasonAwards(2, 500))).toEqual(['cup.s2', 'frame.season.s2', 'season_beacon']);
  });

  it('give an honour once', () => {
    expect(grant(['swift'], ['swift', 'deep', 'deep'])).toEqual({ list: ['swift', 'deep'], added: ['deep'] });
    expect(grant(undefined, [])).toEqual({ list: [], added: [] });
  });

  it('are every one an item the catalogue earns by that key, free, named as the designer named it', () => {
    for (const title of compete.titles) {
      const item = itemById(title.sku);
      expect(item, title.sku).toBeDefined();
      expect(item!.stars).toBe(0);
      expect(item!.earn).toEqual({ by: 'honour', id: title.title });
      expect(item!.name.en).toBe(title.name.en);
      expect(item!.name.ru).toBe(title.name.ru);
    }
    expect(itemById('fire.beacon')?.earn).toEqual({ by: 'honour', id: 'fire.beacon' });
    for (const season of compete.season.seasons) {
      expect(itemById(`frame.season.${season.id}`)?.earn).toEqual({ by: 'honour', id: `frame.season.${season.id}` });
    }
    expect(HONOUR_KEYS.sort()).toEqual(['circle_champion', 'deep', 'duelist', 'season_beacon', 'swift']);
  });

  it('reach the wallet through the player\'s record, and nothing else gives them', () => {
    const won = earnedBy({ pass: null, streakBest: 0, trophies: [], honour: ['swift', 'frame.season.s1'] });
    expect(won).toContain('title.swift');
    expect(won).toContain('frame.season.s1');
    expect(won).not.toContain('title.deep');
    expect(earnedBy({ pass: null, streakBest: 99, trophies: [], badges: [] }).filter((id) => itemById(id)?.earn?.by === 'honour')).toEqual([]);
    // Nothing earned by honour has a price anywhere.
    expect(CATALOG.filter((item) => item.earn?.by === 'honour').every((item) => item.stars === 0)).toBe(true);
  });
});

/** The season flow with the objects it reaches replaced by plain records. */
function deps(now: number, over: Partial<SeasonDeps> & { boards?: Record<string, Standing | 'error'> } = {}): SeasonDeps & { puts: Array<[number, string]>; frozen: string[] } {
  const puts: Array<[number, string]> = [];
  const frozen: string[] = [];
  const boards = over.boards ?? {};
  return {
    now, start: seasonStart('2026-10-19'),
    standing: async (board) => boards[board] ?? null,
    put: async (heat, season) => {
      puts.push([heatOf(heat), season]);
      return true;
    },
    freeze: async (season) => {
      frozen.push(season);
      return true;
    },
    ...over, puts, frozen,
  };
}

describe('what a player\'s object does about seasons (season-flow.ts)', () => {
  const start = seasonStart('2026-10-19');

  it('starts the Heat of the season when it has begun, and not before', async () => {
    const profile: SeasonProfile = {};
    expect(await rollSeason(profile, deps(start - DAY))).toBe(false);
    expect(profile.heat).toBeUndefined();
    expect(await rollSeason(profile, deps(start + DAY))).toBe(true);
    expect(profile.heat?.season).toBe('s1');
    expect(await rollSeason(profile, deps(start + 2 * DAY))).toBe(false);
  });

  it('counts a finished daily board in the season\'s Heat once, and the day\'s titles with it', () => {
    const profile: SeasonProfile = { heat: emptyHeat('s1') };
    const d = deps(start + 3 * DAY);
    const standing: NonNullable<Standing> = { rank: 2, played: 40, speed: 4, depth: 30 };
    expect(settleBoard(profile, 'daily:2026-10-20', standing, d)).toBe(true);
    expect(profile.heat!.days['2026-10-20']).toBe(dayPoints(2, 40));
    expect(profile.honour).toEqual(['swift']);
    // The same board again changes nothing; a week's board and the arena's are not days.
    expect(settleBoard(profile, 'daily:2026-10-20', standing, d)).toBe(false);
    expect(settleBoard(profile, 'week:2026-W43', standing, d)).toBe(false);
    // A day before the season counts for nothing in Heat (its titles are still won).
    expect(settleBoard(profile, 'daily:2026-10-10', { rank: 1, played: 40, speed: null, depth: 2 }, d)).toBe(true);
    expect(Object.keys(profile.heat!.days)).toEqual(['2026-10-20']);
    expect(profile.honour).toEqual(['swift', 'deep']);
  });

  it('does not give a title for a place on a quiet day or outside the top 10', () => {
    const profile: SeasonProfile = { heat: emptyHeat('s1') };
    const d = deps(start + 3 * DAY);
    expect(settleBoard(profile, 'daily:2026-10-20', { rank: 1, played: 3, speed: 1, depth: 1 }, d)).toBe(true);
    expect(profile.honour).toBeUndefined();
    expect(settleBoard(profile, 'daily:2026-10-21', { rank: 50, played: 400, speed: 11, depth: null }, d)).toBe(true);
    expect(profile.honour).toBeUndefined();
  });

  it('keeps the old season\'s Heat aside until its hall of fame is written, then closes it with the final place and what it won', async () => {
    const profile: SeasonProfile = { heat: { ...emptyHeat('s1'), days: { '2026-12-10': 60 }, league: { '2026-W49': 60 } } };
    const over = start + SEASON_DAYS * DAY;
    // The first day of the next season: the old heat waits, the new one begins.
    const first = deps(over + DAY, { boards: { 'season:s1': { rank: 2, played: 800 } } });
    expect(await rollSeason(profile, first)).toBe(true);
    expect(profile.heatPrev?.season).toBe('s1');
    expect(profile.heat?.season).toBe('s2');
    expect(profile.seasons).toBeUndefined();
    // The grace days over: closed. The final place was 2: the cup, the frame and the title.
    const later = deps(over + 3 * DAY, { boards: { 'season:s1': { rank: 2, played: 800 } } });
    expect(await rollSeason(profile, later)).toBe(false);
    expect(await closeDueSeasons(profile, later)).toBe(true);
    expect(later.frozen).toEqual(['s1']);
    expect(profile.heatPrev).toBeUndefined();
    expect(profile.seasons).toEqual([{ id: 's1', heat: 120, rank: 2, played: 800, awards: ['cup.s1', 'frame.season.s1', 'season_beacon'] }]);
    expect(profile.honour).toEqual(['cup.s1', 'frame.season.s1', 'season_beacon']);
    // Closed once.
    expect(await closeDueSeasons(profile, later)).toBe(false);
  });

  it('gives nothing to a player who put no Heat on the board before the hall was written, and tries again when the board cannot be asked', async () => {
    const profile: SeasonProfile = { heatPrev: { ...emptyHeat('s1'), days: { '2026-12-10': 60 } }, heat: emptyHeat('s2') };
    const over = start + SEASON_DAYS * DAY;
    expect(await closeDueSeasons(profile, deps(over + 3 * DAY, { boards: { 'season:s1': 'error' } }))).toBe(false);
    expect(profile.heatPrev).toBeDefined();
    expect(await closeDueSeasons(profile, deps(over + 3 * DAY))).toBe(true);
    expect(profile.seasons?.[0]).toMatchObject({ id: 's1', rank: 0, awards: [] });
    expect(profile.honour).toBeUndefined();
  });

  it('gives the Beacon fire and the title of the season to a player who played its last week in the Beacon, whatever their place by Heat', async () => {
    const profile: SeasonProfile = { heatPrev: { ...emptyHeat('s1'), days: { '2026-11-01': 10 }, endTier: 'beacon' }, heat: emptyHeat('s2') };
    const over = start + SEASON_DAYS * DAY;
    await closeDueSeasons(profile, deps(over + 3 * DAY, { boards: { 'season:s1': { rank: 400, played: 900 } } }));
    expect(profile.honour).toEqual(['fire.beacon', 'season_beacon']);
    // A top ten place and the Beacon give the title once.
    const both: SeasonProfile = { heatPrev: { ...emptyHeat('s1'), days: { '2026-11-01': 60 }, endTier: 'beacon' }, heat: emptyHeat('s2') };
    await closeDueSeasons(both, deps(over + 3 * DAY, { boards: { 'season:s1': { rank: 8, played: 900 } } }));
    expect(both.honour).toEqual(['frame.season.s1', 'season_beacon', 'fire.beacon']);
  });

  it('gives the frame but not the cup to the 50th, and nothing but a line in the record to the 101st', async () => {
    const make = (): SeasonProfile => ({ heatPrev: { ...emptyHeat('s1'), days: { '2026-11-01': 60 } }, heat: emptyHeat('s2') });
    const over = start + SEASON_DAYS * DAY;
    const fifty = make();
    await closeDueSeasons(fifty, deps(over + 3 * DAY, { boards: { 'season:s1': { rank: 50, played: 900 } } }));
    expect(fifty.honour).toEqual(['frame.season.s1']);
    const late = make();
    await closeDueSeasons(late, deps(over + 3 * DAY, { boards: { 'season:s1': { rank: 101, played: 900 } } }));
    expect(late.honour).toBeUndefined();
    expect(late.seasons?.[0]).toMatchObject({ rank: 101, awards: [] });
  });

  it('puts the Heat on the season\'s board only when it has changed, and not on the board of a season whose hall is written', async () => {
    const profile: SeasonProfile = { heat: { ...emptyHeat('s1'), days: { '2026-10-20': 60 } } };
    const d = deps(start + 3 * DAY);
    expect(await putHeat(profile, d)).toBe(true);
    expect(d.puts).toEqual([[60, 's1']]);
    expect(await putHeat(profile, d)).toBe(false);
    profile.heat!.days['2026-10-21'] = 35;
    expect(await putHeat(profile, d)).toBe(true);
    expect(d.puts.at(-1)).toEqual([95, 's1']);
    // Nothing to put with no Heat.
    expect(await putHeat({ heat: emptyHeat('s1') }, deps(start + DAY))).toBe(false);
    // The old season's board no longer takes a put once its hall of fame may be written.
    const old: SeasonProfile = { heatPrev: { ...emptyHeat('s1'), days: { '2026-12-10': 60 } } };
    const afterHall = deps(start + (SEASON_DAYS + 3) * DAY);
    expect(await putHeat(old, afterHall)).toBe(false);
    const inGrace = deps(start + (SEASON_DAYS + 1) * DAY);
    expect(await putHeat(old, inGrace)).toBe(true);
  });

  it('counts the last days of the season that just ended while its hall waits, in the old Heat', () => {
    const profile: SeasonProfile = { heat: emptyHeat('s2') };
    const d = deps(start + (SEASON_DAYS + 1) * DAY);
    expect(settleBoard(profile, 'daily:2026-12-13', { rank: 1, played: 20 }, d)).toBe(true);
    expect(profile.heatPrev?.days['2026-12-13']).toBe(60);
    expect(profile.heat?.days).toEqual({});
    // After the hall is written the old days are no one's.
    const closed = deps(start + (SEASON_DAYS + 3) * DAY);
    const p2: SeasonProfile = { heat: emptyHeat('s2') };
    expect(settleBoard(p2, 'daily:2026-12-12', { rank: 1, played: 20 }, closed)).toBe(false);
  });
});
