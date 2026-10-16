import { describe, expect, it } from 'vitest';
import { applyPut, entryKey, putSlices, RANKS, readSlice } from '../src/board-state';
import { BOARD_SIZE, type DailyEntry, Leaderboard } from '../src/leaderboard';
import { RankIndex } from '../src/rank-index';
import { ALL_SLICES, eligible, orderOf, parseSlice, rankKey, SLICE_SIZE, sliceKey, slicesOf, SPEED_MIN_DEPTH, turnsPerDepth } from '../src/slices';

const entry = (id: string, over: Partial<DailyEntry> = {}): DailyEntry => ({
  id, owner: `tg${id}`, name: id, heroClass: 'warrior', depth: 8, level: 8, gold: 100, won: false, score: 900, turns: 2400, at: 1, ...over,
});

/** A board object's storage, in memory: put and read the way daily-board.ts does. */
class Store {
  readonly data = new Map<string, unknown>();

  put(e: DailyEntry) {
    const keys = putSlices(e).map(sliceKey);
    const lists = new Map<string, DailyEntry[]>();
    for (const key of keys) if (this.data.has(key)) lists.set(key, structuredClone(this.data.get(key) as DailyEntry[]));
    const { answer, writes } = applyPut({ lists, ranks: this.data.get(RANKS) as number[] | undefined, previous: this.data.get(entryKey(e.id)) as DailyEntry | undefined }, structuredClone(e));
    for (const [key, value] of Object.entries(writes)) this.data.set(key, structuredClone(value));
    return answer;
  }

  read(me: string | null, metric?: string, cls?: string, top = 100) {
    const slice = parseSlice(metric, cls)!;
    const list = (this.data.get(sliceKey(slice)) as DailyEntry[] | undefined) ?? [];
    const own = me && !list.some((x) => x.id === me) ? (this.data.get(entryKey(me)) as DailyEntry | undefined) : undefined;
    return readSlice(slice, { list, ranks: this.data.get(RANKS) as number[] | undefined, own }, { me, owner: null, top }) as {
      rank: number | null; top: DailyEntry[]; total: number; played: number; you?: DailyEntry;
    };
  }
}

describe('board slices (slices.ts)', () => {
  it('knows a metric and a hero, and takes an absent one for the score over all heroes', () => {
    expect(parseSlice(undefined, undefined)).toEqual({ metric: 'score', cls: null });
    expect(parseSlice('speed', 'mage')).toEqual({ metric: 'speed', cls: 'mage' });
    expect(parseSlice('depth', 'all')).toEqual({ metric: 'depth', cls: null });
    expect(parseSlice('luck', undefined)).toBeNull();
    expect(parseSlice('score', 'wizard')).toBeNull();
    expect(ALL_SLICES).toHaveLength(15);
    expect(new Set(ALL_SLICES.map(sliceKey)).size).toBe(15);
    // The score list keeps the key it always had.
    expect(sliceKey({ metric: 'score', cls: null })).toBe('board');
  });

  it('puts only runs from depth 5 on the speed lists, and a hero\'s runs on his own', () => {
    expect(eligible(entry('a', { depth: SPEED_MIN_DEPTH - 1 }), { metric: 'speed', cls: null })).toBe(false);
    expect(eligible(entry('a', { depth: SPEED_MIN_DEPTH }), { metric: 'speed', cls: null })).toBe(true);
    expect(eligible(entry('a', { turns: undefined }), { metric: 'speed', cls: null })).toBe(false);
    expect(eligible(entry('a', { heroClass: 'mage' }), { metric: 'depth', cls: 'warrior' })).toBe(false);
    // A deep warrior's run is on 3 lists over all heroes and 3 of his own.
    expect(slicesOf(entry('a'))).toHaveLength(6);
    expect(slicesOf(entry('a', { depth: 2 }))).toHaveLength(4);
  });

  it('ranks speed by turns for each depth, and depth by the deepest, a tie by fewer turns', () => {
    const slow = entry('slow', { depth: 10, turns: 5000 });
    const quick = entry('quick', { depth: 6, turns: 1800 });
    expect(turnsPerDepth(quick)).toBe(300);
    expect([slow, quick].sort(orderOf('speed'))[0]!.id).toBe('quick');
    const deep = entry('deep', { depth: 12, turns: 9000 });
    const deeperFaster = entry('deeper', { depth: 12, turns: 7000 });
    expect([slow, deep, deeperFaster].sort(orderOf('depth')).map((e) => e.id)).toEqual(['deeper', 'deep', 'slow']);
  });
});

describe('the rank index (rank-index.ts)', () => {
  it('says where a key stands among all the players', () => {
    const index = new RankIndex();
    for (const key of [50, 90, 70, 10]) index.add(key);
    expect(index.keys).toEqual([90, 70, 50, 10]);
    expect(index.rankOf(90)).toBe(1);
    expect(index.rankOf(60)).toBe(3);
    expect(index.rankOf(5)).toBe(5);
    // Equal keys share a place; a better run replaces the old one.
    index.add(70);
    expect(index.rankOf(70)).toBe(2);
    index.add(95, 10);
    expect(index.keys).toEqual([95, 90, 70, 70, 50]);
    expect(index.size).toBe(5);
  });

  it('orders by score, then by fewer turns', () => {
    expect(rankKey({ score: 900, turns: 100 })).toBeGreaterThan(rankKey({ score: 900, turns: 200 }));
    expect(rankKey({ score: 901, turns: 999_999 })).toBeGreaterThan(rankKey({ score: 900, turns: 1 }));
    expect(rankKey({ score: 900 })).toBeLessThan(rankKey({ score: 900, turns: 5 }));
  });
});

describe('a board object (board-state.ts)', () => {
  it('counts the players of the day and gives each their true place, beyond the top 100 too', () => {
    const store = new Store();
    for (let i = 0; i < 260; i++) store.put(entry(`p${i}`, { score: 1000 + i * 10, at: i }));
    const asked = store.read('p0');
    expect(asked.played).toBe(260);
    expect(asked.top).toHaveLength(BOARD_SIZE);
    // The worst of them is far below the 100 the board lists, and still has a place and a row to show.
    expect(asked.rank).toBe(260);
    expect(asked.you?.id).toBe('p0');
    expect(store.read('p259').rank).toBe(1);
    expect(store.read('p200').rank).toBe(60);
    // A stranger is on no place, but the board still says how many played.
    expect(store.read('nobody')).toMatchObject({ rank: null, played: 260 });
  });

  it('keeps a player\'s best run, counts them once, and leaves the board alone for a worse one', () => {
    const store = new Store();
    store.put(entry('a', { score: 500 }));
    store.put(entry('b', { score: 700 }));
    const worse = store.put(entry('a', { score: 100, at: 5 }));
    expect(worse).toMatchObject({ rank: 2, played: 2 });
    const better = store.put(entry('a', { score: 800, at: 6 }));
    expect(better).toMatchObject({ rank: 1, played: 2 });
    expect((store.data.get(entryKey('a')) as DailyEntry).score).toBe(800);
    expect(store.read('b').rank).toBe(2);
  });

  it('serves each slice from its own list, in its own order', () => {
    const store = new Store();
    store.put(entry('rich', { score: 9000, depth: 9, turns: 9000, heroClass: 'warrior' }));
    store.put(entry('fast', { score: 4000, depth: 8, turns: 800, heroClass: 'mage' }));
    store.put(entry('deep', { score: 6000, depth: 15, turns: 6000, heroClass: 'mage' }));
    store.put(entry('shallow', { score: 100, depth: 3, turns: 100, heroClass: 'rogue' }));
    expect(store.read(null).top.map((e) => e.id)).toEqual(['rich', 'deep', 'fast', 'shallow']);
    expect(store.read(null, 'speed').top.map((e) => e.id)).toEqual(['fast', 'deep', 'rich']);
    expect(store.read(null, 'depth').top.map((e) => e.id)).toEqual(['deep', 'rich', 'fast', 'shallow']);
    expect(store.read(null, 'speed', 'mage').top.map((e) => e.id)).toEqual(['fast', 'deep']);
    expect(store.read(null, 'score', 'rogue').top.map((e) => e.id)).toEqual(['shallow']);
    // A player not eligible for a list still has their own row to show, and no place there.
    expect(store.read('shallow', 'speed')).toMatchObject({ rank: null, you: { id: 'shallow' } });
  });

  it('bounds every slice to 50 entries', () => {
    const store = new Store();
    for (let i = 0; i < 120; i++) store.put(entry(`p${i}`, { depth: 6 + (i % 9), turns: 2000 + i * 7, score: 500 + i, heroClass: i % 2 ? 'mage' : 'rogue', at: i }));
    expect((store.data.get('l:speed') as unknown[]).length).toBe(SLICE_SIZE);
    expect((store.data.get('l:depth:mage') as unknown[]).length).toBe(SLICE_SIZE);
    expect((store.data.get('board') as unknown[]).length).toBe(BOARD_SIZE);
    expect(store.read(null, 'speed', 'mage', 100).top).toHaveLength(SLICE_SIZE);
  });

  it('keeps a speed list\'s own best run of a player, which may not be their best score', () => {
    const store = new Store();
    store.put(entry('a', { score: 9000, depth: 12, turns: 12_000, at: 1 }));
    store.put(entry('a', { score: 2000, depth: 6, turns: 900, at: 2 }));
    expect((store.data.get(entryKey('a')) as DailyEntry).score).toBe(9000);
    expect(store.read(null, 'speed').top[0]).toMatchObject({ id: 'a', score: 2000 });
    expect(store.read(null).top[0]).toMatchObject({ id: 'a', score: 9000 });
  });

  it('starts the index of a board from before it from the players on its list, without counting them twice', () => {
    const store = new Store();
    // A board as it was stored before the index: a score list only.
    store.data.set('board', [entry('old1', { score: 900 }), entry('old2', { score: 500 })]);
    expect(store.read('old2')).toMatchObject({ rank: 2, played: 2 });
    const first = store.put(entry('old1', { score: 950, at: 9 }));
    expect(first).toMatchObject({ rank: 1, played: 2 });
    const news = store.put(entry('new', { score: 700, at: 10 }));
    expect(news).toMatchObject({ rank: 2, played: 3 });
    expect((store.data.get(entryKey('old2')) as DailyEntry).id).toBe('old2');
  });

  it('says whom a result passed: the player right behind it now, and only when it moved up', () => {
    const board = new Leaderboard();
    board.place(entry('a', { score: 900 }));
    board.place(entry('b', { score: 800 }));
    const passing = board.place(entry('c', { score: 850, name: 'Cee' }));
    expect(passing.rank).toBe(2);
    expect(passing.passed).toEqual({ owner: 'tgb', name: 'Cee', rank: 3 });
    // Last place passes nobody; a worse run of the same player changes nothing.
    expect(board.place(entry('d', { score: 10 })).passed).toBeUndefined();
    expect(board.place(entry('c', { score: 5 }))).toMatchObject({ changed: false });
    // A player bettering their own place passes the one behind them only if they moved up past them.
    expect(board.place(entry('a', { score: 950, at: 3 })).passed).toBeUndefined();
    expect(board.place(entry('c', { score: 990, at: 4, name: 'Cee' })).passed).toEqual({ owner: 'tga', name: 'Cee', rank: 2 });
  });

  it('tells the player passed on a board put in a Durable Object answer (the daily board)', () => {
    const store = new Store();
    store.put(entry('a', { score: 900, owner: 'tg1' }));
    const answer = store.put(entry('b', { score: 1200, owner: 'tg2', name: 'Bea' }));
    expect(answer.passed).toEqual({ owner: 'tg1', name: 'Bea', rank: 2 });
    expect(store.put(entry('c', { score: 50, owner: 'tg3' })).passed).toBeUndefined();
  });

  it('puts a changed name on every entry of the player, however many lists they are on (hiding on the boards)', () => {
    const lists = [
      new Leaderboard([entry('a', { name: 'Anna', owner: 'tgA' }), entry('b', { name: 'Bob', owner: 'tgB' })]),
      new Leaderboard([entry('a2', { name: 'Anna', owner: 'tgA' })]),
    ];
    for (const list of lists) list.patchName('tgA', 'Hero');
    expect(lists[0]!.entries().map((e) => e.name)).toEqual(['Hero', 'Bob']);
    expect(lists[1]!.patchName('tgA', 'Hero')).toBe(false);
    expect(lists[1]!.entries()[0]!.name).toBe('Hero');
  });
});
