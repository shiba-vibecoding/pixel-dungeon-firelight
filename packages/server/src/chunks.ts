import type { World } from '@pd/core';
import type { RoomState } from './room-logic';

/*
 * How a room is kept in Durable Object storage. A whole dungeon runs to a few
 * hundred kilobytes, more than one stored value should hold, so the state is
 * cut into a small "meta" record and one chunk per depth (its layout, its
 * live floor and what the party has explored of it). Only chunks that changed
 * are written again, which also keeps storage writes few.
 */

const META = 'state';
const depthKey = (depth: number): string => `depth:${depth}`;

interface Meta extends Omit<RoomState, 'world'> {
  world: Omit<World, 'levels' | 'floors' | 'explored'>;
  /** The depths that have chunks of their own. */
  depths: number[];
}

interface DepthChunk {
  level: World['levels'][number];
  floor: World['floors'][number];
  explored?: World['explored'][number];
}

/** Cuts a room's state into storage entries, keyed as they are stored. */
export function toChunks(state: RoomState): Record<string, string> {
  const { levels, floors, explored, ...rest } = state.world;
  const depths = Object.keys(levels).map(Number).sort((a, b) => a - b);
  const meta: Meta = { ...state, world: rest, depths };
  const entries: Record<string, string> = { [META]: JSON.stringify(meta) };
  for (const depth of depths) {
    const chunk: DepthChunk = { level: levels[depth]!, floor: floors[depth]!, explored: explored[depth] };
    entries[depthKey(depth)] = JSON.stringify(chunk);
  }
  return entries;
}

/** The keys a stored room needs, once its meta record is known. */
export function chunkKeys(meta: string): string[] {
  return (JSON.parse(meta) as Meta).depths.map(depthKey);
}

/** Puts a room's state back together from its stored entries; undefined if there is none. */
export function fromChunks(entries: ReadonlyMap<string, string>): RoomState | undefined {
  const raw = entries.get(META);
  if (raw === undefined) return undefined;
  const { depths, world, ...rest } = JSON.parse(raw) as Meta;
  const full = { ...world, levels: {}, floors: {}, explored: {} } as World;
  for (const depth of depths) {
    const chunkRaw = entries.get(depthKey(depth));
    if (chunkRaw === undefined) return undefined;
    const chunk = JSON.parse(chunkRaw) as DepthChunk;
    full.levels[depth] = chunk.level;
    full.floors[depth] = chunk.floor;
    if (chunk.explored) full.explored[depth] = chunk.explored;
  }
  return { ...rest, world: full };
}

/**
 * Remembers what was last written, so that only changed entries are written
 * again and chunks of depths that no longer exist (after a restart) are
 * deleted.
 */
export class ChunkWriter {
  private written = new Map<string, string>();

  /** What to put and what to delete to store `state`. */
  changes(state: RoomState): { put: Record<string, string>; remove: string[] } {
    const entries = toChunks(state);
    const put: Record<string, string> = {};
    for (const [key, value] of Object.entries(entries)) {
      if (this.written.get(key) !== value) put[key] = value;
    }
    const remove = [...this.written.keys()].filter((key) => !(key in entries));
    this.written = new Map(Object.entries(entries));
    return { put, remove };
  }

  /** Marks entries as already in storage, as they were loaded. */
  loaded(entries: ReadonlyMap<string, string>): void {
    this.written = new Map(entries);
  }

  /** Forgets what it believes is stored (a write may have failed): the next load tells it again. */
  reset(): void {
    this.written = new Map();
  }
}
