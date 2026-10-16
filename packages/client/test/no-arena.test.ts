import { describe, expect, it } from 'vitest';
import { type Profile, withoutArena } from '../src/checked';
import { forgetArena } from '../src/season';

/** The arena of waves is gone; what an earlier edition left (on the device, or what an old server sends) is never shown. */
describe('what the arena of waves left behind', () => {
  it('forgets its save, its best wave and its setting on the device, and nothing else', () => {
    const kept = new Map([['pd-arena', '{}'], ['pd-arena-best', '9'], ['pd-live-arena', '1'], ['pd-solo', '{}'], ['pd-name', 'Ann']]);
    forgetArena({ removeItem: (key) => void kept.delete(key) });
    expect([...kept.keys()].sort()).toEqual(['pd-name', 'pd-solo']);
    expect(() => forgetArena({ removeItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });

  it('leaves its trophies, letters and finished runs out of a profile an old server sends', () => {
    const profile = {
      trophies: [{ board: 'arena:2026-W41', place: 2, at: 1 }, { board: 'week:2026-W41', place: 1, at: 2 }],
      mail: [{ id: 'a', kind: 'medal', board: 'arena:2026-W40', place: 1, at: 1, gifts: [] }, { id: 'b', kind: 'cup', board: 'daily:2026-10-14', place: 1, at: 2, gifts: [] }],
      history: [{ slot: 'arena', mode: 'arena', score: 5 }, { slot: 'dungeon', score: 7 }, { slot: 'daily', score: 9 }],
    } as unknown as Profile;
    const shown = withoutArena(profile);
    expect(shown.trophies.map((t) => t.board)).toEqual(['week:2026-W41']);
    expect(shown.mail!.map((l) => l.id)).toEqual(['b']);
    expect(shown.history.map((r) => r.score)).toEqual([7, 9]);
  });
});
