import { describe, expect, it } from 'vitest';
import { BOARD_KINDS, boardName, boardsFor, finishedBoards, isArenaBoard } from '../src/boards';
import { emptyProfile, parseSlot, PlayerLogic, RUN_SLOTS } from '../src/runs';
import { EntryWriter, fromEntries, toEntries } from '../src/run-store';

/** The arena of waves is gone: no slot, no boards, no letters; what it stored stays stored. */
describe('the server without the arena of waves', () => {
  it('has no arena slot or boards, and refuses them', () => {
    expect(RUN_SLOTS).toEqual(['dungeon', 'daily']);
    expect(parseSlot('arena')).toBeNull();
    expect(BOARD_KINDS).toEqual(['daily', 'week', 'all']);
    expect(finishedBoards(Date.UTC(2026, 9, 20)).some(isArenaBoard)).toBe(false);
    expect(boardName('week', Date.UTC(2026, 9, 20))).toMatch(/^week:/);
    expect(isArenaBoard('arena:2026-W41') && isArenaBoard('arena-all') && !isArenaBoard('week:2026-W41')).toBe(true);
    const summary = { heroClass: 'warrior', score: 1, depth: 1, level: 1, gold: 0, kills: 0, won: false, killedBy: null, turns: 1, challenges: 0, slot: 'dungeon', ranked: true, at: 0 } as const;
    expect(boardsFor(summary)).toEqual(['week', 'all']);
  });

  it('leaves a stored arena run alone: never loaded, never rewritten, never deleted', () => {
    const logic = new PlayerLogic(emptyProfile('Ann'));
    logic.start({ slot: 'dungeon', heroClass: 'warrior', challenges: 0, name: 'Ann', seed: 7, id: 'r', now: 0, today: '2026-10-14' });
    const stored = new Map(Object.entries(toEntries(logic.profile, logic.runs)));
    // What the old server kept for a player's arena run.
    stored.set('run:arena', '{"format":40,"world":{},"depths":[1]}');
    stored.set('run:arena:1', '{}');
    const loaded = fromEntries(stored);
    expect(Object.keys(loaded.runs)).toEqual(['dungeon']);
    const writer = new EntryWriter();
    writer.loaded(stored);
    const { remove } = writer.changes(toEntries(loaded.profile, loaded.runs));
    expect(remove).toEqual([]);
  });
});
