import { describe, expect, it } from 'vitest';
import { emptyWallet, walletPay } from '@pd/core';
import { BOARD_KINDS, boardName, boardObject, SEASON } from '../src/boards';
import { Leaderboard } from '../src/leaderboard';
import { loadPlayer, needsWipe } from '../src/season';
import { toEntries } from '../src/run-store';
import { applyWalletChange, emptyRecord } from '../src/wallet';
import { emptyProfile, PlayerLogic } from '../src/runs';

/** A veteran of the previous season: records, history, a streak with freezes, trophies, and a run under way. */
function veteran() {
  const logic = new PlayerLogic(emptyProfile('Alice'));
  logic.start({ slot: 'dungeon', heroClass: 'warrior', challenges: 0, name: 'Alice', seed: 7, id: 'r1', now: 0, today: '2026-10-13' });
  const p = logic.profile;
  Object.assign(p, { games: 40, wins: 3, deepest: 14, best: 9000, arenaWaves: 12, arenaBest: 700, dailyDate: '2026-10-14' });
  p.bestByClass = { warrior: 9000 };
  p.streak = { last: '2026-10-14', count: 20, best: 20, freezes: 2 };
  p.trophies = [{ board: 'week:2026-W41', place: 1, at: 5 }];
  p.claimed = ['week:2026-W41'];
  delete p.season;
  return { profile: p, runs: logic.runs };
}

describe('the season wipe', () => {
  it('starts an old profile afresh and drops its runs, keeping only the name', () => {
    const { profile, runs } = veteran();
    const entries = new Map(Object.entries(toEntries(profile, runs)));
    expect(entries.has('run:dungeon')).toBe(true);
    expect(needsWipe(profile)).toBe(true);
    const loaded = loadPlayer(entries);
    expect(loaded.wiped).toBe(true);
    expect(loaded.runs).toEqual({});
    expect(loaded.profile).toEqual({ ...emptyProfile('Alice'), season: SEASON });
    expect(loaded.profile.trophies).toEqual([]);
    expect(loaded.profile.streak).toEqual({ last: null, count: 0, best: 0, freezes: 0 });
  });

  it('keeps the settings: the tutorial seen, the news seen, the bug hunter’s honour, the day’s problem count', () => {
    const { profile, runs } = veteran();
    Object.assign(profile, { coachDone: true, newsSeen: '3.1', honors: ['bughunter'], problems: { day: '2026-10-14', count: 2 } });
    const loaded = loadPlayer(new Map(Object.entries(toEntries(profile, runs))));
    expect(loaded.wiped).toBe(true);
    expect(loaded.profile).toEqual({
      ...emptyProfile('Alice'), season: SEASON, coachDone: true, newsSeen: '3.1', honors: ['bughunter'], problems: { day: '2026-10-14', count: 2 },
    });
    expect(loaded.profile.mail).toEqual([]);
  });

  it('leaves a profile of this season, and a new player, as they are', () => {
    const { profile, runs } = veteran();
    profile.season = SEASON;
    const kept = loadPlayer(new Map(Object.entries(toEntries(profile, runs))));
    expect(kept.wiped).toBe(false);
    expect(kept.profile.games).toBe(40);
    expect(kept.runs.dungeon).toBeDefined();
    const born = loadPlayer(new Map());
    expect(born.wiped).toBe(false);
    expect(born.profile.season).toBe(SEASON);
  });

  it('keeps every Pixel-Mart purchase: they live in the wallet, which the profile and its wipe never hold', () => {
    let record = emptyRecord();
    record = applyWalletChange(record, { kind: 'pay', sku: 'effect.snow', charge: 'c1', stars: 50, at: 1 });
    const before = JSON.stringify(record);
    expect(record.wallet).not.toEqual(emptyWallet());
    const { profile, runs } = veteran();
    const loaded = loadPlayer(new Map(Object.entries(toEntries(profile, runs))));
    // Nothing paid is a field of the profile (a fresh profile has exactly the keys of an empty one, plus the season) ...
    expect(Object.keys(loaded.profile).sort()).toEqual([...Object.keys(emptyProfile()), 'season'].sort());
    expect(JSON.stringify(profile)).not.toMatch(/owned|charges|patronUntil|tipped/);
    // ... and the wallet record is not touched by loading a wiped player.
    expect(JSON.stringify(record)).toBe(before);
    expect(walletPay(record.wallet, 'effect.snow', 'c1', 50, 1)).toBe(record.wallet);
  });

  it('puts every board in the objects of this season, so the old boards are not seen', () => {
    for (const kind of BOARD_KINDS) {
      const name = boardName(kind, Date.parse('2026-10-15T12:00:00Z'));
      expect(boardObject(name)).toBe(`s${SEASON}:${name}`);
      expect(boardObject(name)).not.toBe(name);
      expect(boardObject(name)).not.toBe(boardObject(name, SEASON - 1));
    }
    expect(SEASON).toBeGreaterThan(1);
    // An old board sits in the object named by the bare name; the new one is another object, and starts empty.
    const old = new Leaderboard();
    old.put({ id: 'p0123456789abcdef', name: 'A', heroClass: 'warrior', depth: 5, level: 5, gold: 1, won: false, score: 100, at: 1 });
    const objects = new Map<string, Leaderboard>([['daily:2026-10-15', old]]);
    expect(objects.get(boardObject('daily:2026-10-15'))).toBeUndefined();
    expect(objects.get('daily:2026-10-15')!.entries()).toHaveLength(1);
  });
});
