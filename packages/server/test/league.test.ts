import { describe, expect, it } from 'vitest';
import { weekEnd, weekOf } from '@pd/core';
import { heatOf } from '../src/heat';
import type { DailyEntry } from '../src/leaderboard';
import { afterIdle, BEACON, leaguesOpen, OPEN_AT, outcomeOf, ROOM_SIZE, roomOf, TIERS, weekMonday, weeksBetween, zones } from '../src/league-rules';
import { currentTier, inRoom, type LeagueDeps, type LeagueProfile, settleLeague, syncLeague } from '../src/league-flow';
import { leagueJob, mayWrite, type Subscriber } from '../src/reminders';
import { SEASON_DAYS, seasonStart } from '../src/season-clock';
import { rankKey } from '../src/slices';

const DAY = 86_400_000;

describe('the leagues\' rules (league-rules.ts)', () => {
  it('are five steps, rooms of 30, five up and five down, as the owner and the designer set them', () => {
    expect(TIERS).toEqual(['spark', 'coal', 'flame', 'bonfire', 'beacon']);
    expect(ROOM_SIZE).toBe(30);
    expect(zones(30)).toEqual({ up: 5, down: 5 });
    expect(BEACON).toBe('beacon');
  });

  it('shrink the zones in a smaller room to a third of it, never past five, and none in a room of two', () => {
    expect(zones(12)).toEqual({ up: 4, down: 4 });
    expect(zones(9)).toEqual({ up: 3, down: 3 });
    expect(zones(3)).toEqual({ up: 1, down: 1 });
    expect(zones(2)).toEqual({ up: 0, down: 0 });
    expect(zones(1)).toEqual({ up: 0, down: 0 });
    expect(zones(100)).toEqual({ up: 5, down: 5 });
  });

  it('open the leagues when 60 players have played the week, not before', () => {
    expect(OPEN_AT).toBe(60);
    expect(leaguesOpen(59)).toBe(false);
    expect(leaguesOpen(60)).toBe(true);
  });

  it('fill rooms in the order of coming: the first 30 the first room, the next 30 the second', () => {
    expect([0, 1, 29].map(roomOf)).toEqual([1, 1, 1]);
    expect([30, 59].map(roomOf)).toEqual([2, 2]);
    expect(roomOf(60)).toBe(3);
  });

  it('send the first five of a full room up, the last five down, the rest stay', () => {
    const at = (place: number) => outcomeOf('coal', place, 30);
    expect([1, 5].map((place) => at(place).result)).toEqual(['up', 'up']);
    expect(at(1).to).toBe('flame');
    expect([6, 15, 25].map((place) => at(place).result)).toEqual(['stay', 'stay', 'stay']);
    expect([26, 30].map((place) => at(place).result)).toEqual(['down', 'down']);
    expect(at(30).to).toBe('spark');
  });

  it('let no one up from the Beacon or down from the Spark', () => {
    expect(outcomeOf('beacon', 1, 30)).toMatchObject({ result: 'stay', to: 'beacon' });
    expect(outcomeOf('spark', 30, 30)).toMatchObject({ result: 'stay', to: 'spark' });
    expect(outcomeOf('spark', 1, 30)).toMatchObject({ result: 'up', to: 'coal' });
    expect(outcomeOf('beacon', 30, 30)).toMatchObject({ result: 'down', to: 'bonfire' });
  });

  it('give Heat for the week: up 60, stayed 20, down 0, any week in the Beacon 100, and the mark to the Beacon\'s first five', () => {
    expect(outcomeOf('flame', 2, 30).points).toBe(60);
    expect(outcomeOf('flame', 12, 30).points).toBe(20);
    expect(outcomeOf('flame', 28, 30).points).toBe(0);
    expect(outcomeOf('beacon', 1, 30)).toMatchObject({ points: 100, mark: true });
    expect(outcomeOf('beacon', 5, 30).mark).toBe(true);
    expect(outcomeOf('beacon', 6, 30)).toMatchObject({ points: 100, mark: false });
    expect(outcomeOf('flame', 1, 30).mark).toBe(false);
  });

  it('take a step down for two weeks in a row away, and none for one', () => {
    expect(afterIdle('flame', 0)).toBe('flame');
    expect(afterIdle('flame', 1)).toBe('flame');
    expect(afterIdle('flame', 2)).toBe('coal');
    expect(afterIdle('flame', 5)).toBe('spark');
    expect(afterIdle('spark', 9)).toBe('spark');
  });

  it('count weeks by their Mondays', () => {
    expect(new Date(weekMonday('2026-W43')).toISOString().slice(0, 10)).toBe('2026-10-19');
    expect(weeksBetween('2026-W41', '2026-W44')).toBe(3);
    expect(weeksBetween('2026-W52', '2027-W01')).toBe(2);
    // 2026 has 53 weeks.
    expect(weeksBetween('2026-W52', '2027-W02')).toBe(3);
    expect(Number.isNaN(weekMonday('soon'))).toBe(true);
  });
});

const start = seasonStart('2026-10-19');
const entry = (score: number, over: Partial<DailyEntry> = {}): DailyEntry => ({
  id: 'x', owner: 'tg1', name: 'N', heroClass: 'mage', depth: 8, level: 8, gold: 0, won: false, score, turns: 2000, at: 1, ...over,
});

/** The league's objects as plain records: the rooms a desk gives, what has been put, and the standing a room gives back. */
function deps(now: number, over: Partial<LeagueDeps> & { standings?: Record<string, { place: number; size: number } | null | 'error'> } = {}) {
  const joins: string[] = [];
  const puts: Array<[string, string, number, number]> = [];
  const full: LeagueDeps & { joins: string[]; puts: Array<[string, string, number, number]> } = {
    now, start, joins, puts,
    standing: async (tier, week, room) => over.standings?.[`${tier}:${week}:${room}`] ?? null,
    join: async (tier, week) => {
      joins.push(`${tier}:${week}`);
      return 7;
    },
    put: async (tier, week, room, e) => {
      puts.push([tier, week, room, e.score]);
      return true;
    },
    ...over,
  };
  return full;
}

describe('a player\'s part of the leagues (league-flow.ts)', () => {
  const monday = (week: string): number => weekMonday(week) + 2 * 3_600_000;

  it('joins no room while the leagues are closed, and sends nothing', async () => {
    const profile: LeagueProfile = {};
    const d = deps(monday('2026-W43'));
    expect(await syncLeague(profile, entry(900), false, d, '2026-W43')).toBe(false);
    expect(profile.league).toBeUndefined();
    expect(d.joins).toEqual([]);
  });

  it('puts a new player in a room of the Spark on their first run of a week, and keeps their best run there', async () => {
    const profile: LeagueProfile = {};
    const d = deps(monday('2026-W43'));
    expect(await syncLeague(profile, entry(900), true, d, '2026-W43')).toBe(true);
    expect(profile.league).toMatchObject({ tier: 'spark', week: '2026-W43', room: 7, roomTier: 'spark', best: 1 });
    expect(d.joins).toEqual(['spark:2026-W43']);
    expect(d.puts).toEqual([['spark', '2026-W43', 7, 900]]);
    expect(inRoom(profile, '2026-W43')).toBe(true);
    // A worse or equal run is not sent again; a better one is, in the same room.
    expect(await syncLeague(profile, entry(500), true, d, '2026-W43')).toBe(false);
    expect(await syncLeague(profile, entry(900), true, d, '2026-W43')).toBe(false);
    expect(await syncLeague(profile, entry(1500), true, d, '2026-W43')).toBe(true);
    expect(d.joins).toHaveLength(1);
    expect(d.puts.at(-1)).toEqual(['spark', '2026-W43', 7, 1500]);
    expect(profile.league?.put).toBe(rankKey(entry(1500)));
  });

  it('stays out when the desk cannot be reached, and tries again at the next run', async () => {
    const profile: LeagueProfile = {};
    const d = deps(monday('2026-W43'), { join: async () => null });
    expect(await syncLeague(profile, entry(900), true, d, '2026-W43')).toBe(false);
    expect(inRoom(profile, '2026-W43')).toBe(false);
    expect(profile.league?.week).toBeUndefined();
  });

  it('settles a week lazily at the next visit: the first five go up, with the Heat of the week', async () => {
    const profile: LeagueProfile = { league: { tier: 'coal', best: 2, week: '2026-W43', room: 3, roomTier: 'coal', put: 5 }, heat: { season: 's1', days: {}, league: {}, circle: {} } };
    const d = deps(monday('2026-W44'), { standings: { 'coal:2026-W43:3': { place: 4, size: 30 } } });
    expect(await settleLeague(profile, d, '2026-W44')).toBe(true);
    expect(profile.league).toMatchObject({ tier: 'flame', best: 3, last: '2026-W43' });
    expect(profile.league?.week).toBeUndefined();
    expect(profile.leagueResult).toEqual({ week: '2026-W43', tier: 'coal', to: 'flame', result: 'up', place: 4, size: 30, points: 60, mark: false });
    expect(heatOf(profile.heat)).toBe(60);
    // Settled once: nothing more to do, and the same week asked again changes nothing.
    expect(await settleLeague(profile, d, '2026-W44')).toBe(false);
    expect(heatOf(profile.heat)).toBe(60);
  });

  it('does not settle the week that is still on, and waits when the room cannot be asked', async () => {
    const profile: LeagueProfile = { league: { tier: 'coal', best: 2, week: '2026-W43', room: 3, roomTier: 'coal' } };
    expect(await settleLeague(profile, deps(monday('2026-W43')), '2026-W43')).toBe(false);
    expect(await settleLeague(profile, deps(monday('2026-W44'), { standings: { 'coal:2026-W43:3': 'error' } }), '2026-W44')).toBe(false);
    expect(profile.league?.week).toBe('2026-W43');
    expect(profile.leagueResult).toBeUndefined();
  });

  it('sends the last five down, keeps the middle, and takes nothing from a Spark player at the bottom', async () => {
    const down: LeagueProfile = { league: { tier: 'flame', best: 3, week: '2026-W43', room: 1, roomTier: 'flame' }, heat: { season: 's1', days: {}, league: {}, circle: {} } };
    await settleLeague(down, deps(monday('2026-W44'), { standings: { 'flame:2026-W43:1': { place: 28, size: 30 } } }), '2026-W44');
    expect(down.league?.tier).toBe('coal');
    expect(down.leagueResult).toMatchObject({ result: 'down', points: 0, to: 'coal' });
    expect(down.league?.best).toBe(3);
    const stay: LeagueProfile = { league: { tier: 'spark', best: 1, week: '2026-W43', room: 1, roomTier: 'spark' }, heat: { season: 's1', days: {}, league: {}, circle: {} } };
    await settleLeague(stay, deps(monday('2026-W44'), { standings: { 'spark:2026-W43:1': { place: 30, size: 30 } } }), '2026-W44');
    expect(stay.league?.tier).toBe('spark');
    expect(stay.leagueResult?.result).toBe('stay');
    expect(heatOf(stay.heat)).toBe(20);
  });

  it('gives 100 Heat for a week in the Beacon, and marks the end of a season spent in it', async () => {
    const lastWeek = new Date(start + SEASON_DAYS * DAY - 7 * DAY).toISOString().slice(0, 10);
    const week = weekOf(Date.parse(`${lastWeek}T12:00:00Z`));
    // The first visit of the next season: the old season's heat waits aside, the new one has begun.
    const profile: LeagueProfile = {
      league: { tier: 'beacon', best: 5, week, room: 1, roomTier: 'beacon' }, heatPrev: { season: 's1', days: {}, league: {}, circle: {} }, heat: { season: 's2', days: {}, league: {}, circle: {} },
    };
    const next = weekEnd(Date.parse(`${lastWeek}T12:00:00Z`)) + 3_600_000;
    await settleLeague(profile, deps(next, { standings: { [`beacon:${week}:1`]: { place: 12, size: 30 } } }), weekOf(next));
    expect(heatOf(profile.heatPrev)).toBe(100);
    expect(heatOf(profile.heat)).toBe(0);
    expect(profile.heatPrev?.endTier).toBe('beacon');
    // An earlier week of the season leaves no mark.
    const early: LeagueProfile = { league: { tier: 'beacon', best: 5, week: '2026-W43', room: 1, roomTier: 'beacon' }, heat: { season: 's1', days: {}, league: {}, circle: {} } };
    await settleLeague(early, deps(monday('2026-W44'), { standings: { 'beacon:2026-W43:1': { place: 1, size: 30 } } }), '2026-W44');
    expect(early.heat?.endTier).toBeUndefined();
    expect(early.leagueResult).toMatchObject({ mark: true, points: 100 });
  });

  it('puts a player back a step for two weeks away, and joins them in the room of that step', async () => {
    const profile: LeagueProfile = { league: { tier: 'flame', best: 3, last: '2026-W40' } };
    // Weeks 41, 42 and 43 passed without a room (41 and 42 count: 43 is the one being played): one step down.
    expect(currentTier(profile.league, '2026-W43')).toBe('coal');
    const d = deps(monday('2026-W43'));
    await syncLeague(profile, entry(700), true, d, '2026-W43');
    expect(d.joins).toEqual(['coal:2026-W43']);
    expect(profile.league).toMatchObject({ tier: 'coal', roomTier: 'coal' });
    // One week away is no loss.
    expect(currentTier({ tier: 'flame', best: 3, last: '2026-W42' }, '2026-W43')).toBe('flame');
  });
});

describe('the bot\'s league result (reminders.ts)', () => {
  const sub: Subscriber = { chat: 5, ru: true, streak: 0, last: null };

  it('tells the place in the room and whether the player goes up, stays or goes down, in their language', () => {
    const up = leagueJob(sub, '2026-W43', 'coal', 3, 30);
    expect(up.text).toContain('Неделя 43');
    expect(up.text).toContain('место 3 из 30');
    expect(up.text).toContain('«Уголь»');
    expect(up.text).toContain('поднимаетесь в «Пламя»');
    expect(up.start).toBe('league');
    expect(leagueJob(sub, '2026-W43', 'coal', 15, 30).text).toContain('остаётесь');
    expect(leagueJob(sub, '2026-W43', 'coal', 29, 30).text).toContain('спускаетесь в «Искра»');
    const en = leagueJob({ ...sub, ru: false }, '2026-W43', 'beacon', 2, 30);
    expect(en.text).toContain('place 2 of 30 in «Beacon»');
    expect(en.text).toContain('You stay.');
    expect(en.button).toBe('My league');
  });

  it('counts against the one message a day', () => {
    expect(mayWrite({ sent: '2026-10-26' }, Date.parse('2026-10-26T08:00:00Z'))).toBe(false);
    expect(mayWrite({ sent: '2026-10-19' }, Date.parse('2026-10-26T08:00:00Z'))).toBe(true);
  });
});
