import { describe, expect, it } from 'vitest';
import { addHero, createWorld, levelAt } from '@pd/core';
import { ChunkWriter, chunkKeys, fromChunks, toChunks } from '../src/chunks';
import { type RoomState, STATE_FORMAT } from '../src/room-logic';

function deepRoom(): RoomState {
  const world = createWorld(11);
  addHero(world, { id: 'a', name: 'A', heroClass: 'warrior' });
  for (let depth = 1; depth <= 26; depth++) levelAt(world, depth);
  return { format: STATE_FORMAT, world, seq: 42, holdingSince: { a: 5 } };
}

describe('room storage chunks', () => {
  it('cuts a whole dungeon into small entries and puts it back together', () => {
    const state = deepRoom();
    const entries = toChunks(state);
    expect(Object.keys(entries)).toHaveLength(27);
    // Every stored value stays well under the 128 KiB a Durable Object value may hold.
    for (const value of Object.values(entries)) expect(value.length).toBeLessThan(64 * 1024);
    expect(chunkKeys(entries.state!)).toHaveLength(26);
    expect(fromChunks(new Map(Object.entries(entries)))).toEqual(JSON.parse(JSON.stringify(state)));
  });

  it('writes again only what changed, and drops depths that are gone', () => {
    const state = deepRoom();
    const writer = new ChunkWriter();
    expect(Object.keys(writer.changes(state).put)).toHaveLength(27);
    state.world.floors[3]!.now += 10;
    state.seq++;
    const second = writer.changes(state);
    expect(Object.keys(second.put).sort()).toEqual(['depth:3', 'state']);
    expect(second.remove).toEqual([]);
    // A restart leaves only the first depth.
    const fresh: RoomState = { ...state, world: createWorld(12) };
    levelAt(fresh.world, 1);
    const third = writer.changes(fresh);
    expect(third.remove).toHaveLength(25);
  });

  it('is missing when nothing was stored', () => {
    expect(fromChunks(new Map())).toBeUndefined();
  });
});