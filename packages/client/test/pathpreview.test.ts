import { createWorld, F, hasFlag, HEIGHT, LENGTH, levelAt, T, WIDTH } from '@pd/core';
import { describe, expect, it } from 'vitest';
import { type HeldKey, interruptWalk, type Walking } from '../src/interrupt';
import { FAR_STEPS, needsConfirm, PathPreview, planRoute, type RouteOptions, stopForTap, underway, verdict } from '../src/pathpreview';

/*
 * The path preview's rules (pathpreview.ts): when a tap on a far cell asks to be confirmed, which route a tap plans in a fight, the
 * state of the preview (a second tap confirms, another cell plans again, a step puts it away) and that a tap stops a walk at once.
 */

describe('when a route asks to be confirmed', () => {
  it('the default mode asks with a hostile in sight, or for a route of more than six steps', () => {
    expect(needsConfirm('combat', true, 3)).toBe(true);
    expect(needsConfirm('combat', false, FAR_STEPS + 1)).toBe(true);
    expect(needsConfirm('combat', false, FAR_STEPS)).toBe(false);
    expect(needsConfirm('combat', false, 3)).toBe(false);
  });

  it('«always» asks for every route of two steps or more; «never» for none', () => {
    expect(needsConfirm('always', false, 2)).toBe(true);
    expect(needsConfirm('always', true, 40)).toBe(true);
    expect(needsConfirm('never', true, 40)).toBe(false);
    expect(needsConfirm('never', false, 12)).toBe(false);
  });

  it('a single step to a neighbour, and no route at all, never ask, in any mode and fight or none', () => {
    for (const mode of ['always', 'combat', 'never'] as const) {
      for (const hostile of [true, false]) {
        expect(needsConfirm(mode, hostile, 1)).toBe(false);
        expect(needsConfirm(mode, hostile, 0)).toBe(false);
      }
    }
  });
});

describe('the second tap', () => {
  it('a tap that needs no confirming walks, and so does the second tap on the cell on show', () => {
    expect(verdict(-1, 100, false)).toBe('walk');
    expect(verdict(-1, 100, true)).toBe('show');
    expect(verdict(100, 100, true)).toBe('walk');
  });

  it('a tap elsewhere shows its own route, a near one walks even while another is on show', () => {
    expect(verdict(100, 120, true)).toBe('show');
    expect(verdict(100, 120, false)).toBe('walk');
  });

  it('the preview holds a route until the hero moves or changes floor, and then it is put away', () => {
    const preview = new PathPreview();
    expect(preview.active).toBe(false);
    preview.show(100, [60, 61, 62, 100], 59, 2, 1000);
    expect(preview.active).toBe(true);
    expect(preview.stale(59, 2)).toBe(false);
    expect(preview.stale(60, 2)).toBe(true);
    expect(preview.active).toBe(false);
    preview.show(100, [60], 59, 2, 1000);
    expect(preview.stale(59, 3)).toBe(true);
  });

  it('a second route replaces the first', () => {
    const preview = new PathPreview();
    preview.show(100, [60, 100], 59, 1, 1000);
    preview.show(140, [60, 100, 140], 59, 1, 1200);
    expect(preview.cell).toBe(140);
    expect(preview.path).toEqual([60, 100, 140]);
  });
});

/** A level of the real generator with a room and a corridor carved into it: x 4..16, y 4..8 open (the room), a 1-wide way along y = 20. */
function arena(): { level: ReturnType<typeof levelAt>; options: RouteOptions } {
  const level = levelAt(createWorld(11), 1);
  const at = (x: number, y: number): number => x + y * WIDTH;
  for (let y = 2; y < 24; y++) for (let x = 2; x < 20; x++) level.map[at(x, y)] = T.WALL;
  for (let y = 4; y <= 8; y++) for (let x = 4; x <= 16; x++) level.map[at(x, y)] = T.EMPTY;
  for (let x = 4; x <= 16; x++) level.map[at(x, 20)] = T.EMPTY;
  const options: RouteOptions = {
    occupied: new Set(), gas: new Set(), explored: new Array<boolean>(LENGTH).fill(true), floating: false, heaps: new Set(), combat: false,
  };
  return { level, options };
}
const cellAt = (x: number, y: number): number => x + y * WIDTH;

describe('the route of a tap in a fight', () => {
  it('the arena is walkable as built', () => {
    const { level } = arena();
    expect(hasFlag(level.map[cellAt(10, 6)]!, F.PASSABLE)).toBe(true);
    expect(HEIGHT).toBeGreaterThan(24);
  });

  it('calm, the way goes over an item lying on the shortest one (and picks it up, as ever)', () => {
    const { level, options } = arena();
    const from = cellAt(4, 6);
    const to = cellAt(14, 6);
    const plain = planRoute(level, from, to, options);
    expect(plain).toHaveLength(10);
    // An item on every cell of the shortest ways is not avoided when no hostile is about.
    const heaps = new Set(plain.slice(0, -1));
    expect(planRoute(level, from, to, { ...options, heaps })).toEqual(plain);
  });

  it('with a hostile in sight, an item on the way is walked round where the way round is as short', () => {
    const { level, options } = arena();
    const from = cellAt(4, 6);
    const to = cellAt(14, 6);
    const plain = planRoute(level, from, to, options);
    const heap = plain[4]!;
    const route = planRoute(level, from, to, { ...options, heaps: new Set([heap]), combat: true });
    expect(route).toHaveLength(plain.length);
    expect(route).not.toContain(heap);
    expect(route.at(-1)).toBe(to);
  });

  it('a whole line of items across the room cannot be walked round without more steps: the route stays', () => {
    const { level, options } = arena();
    const from = cellAt(4, 6);
    const to = cellAt(14, 6);
    const wall = new Set<number>();
    for (let y = 4; y <= 8; y++) wall.add(cellAt(9, y));
    const plain = planRoute(level, from, to, options);
    expect(planRoute(level, from, to, { ...options, heaps: wall, combat: true })).toEqual(plain);
  });

  it('in a corridor there is no way round: the route goes over the item', () => {
    const { level, options } = arena();
    const from = cellAt(4, 20);
    const to = cellAt(14, 20);
    const route = planRoute(level, from, to, { ...options, heaps: new Set([cellAt(8, 20)]), combat: true });
    expect(route).toHaveLength(10);
    expect(route).toContain(cellAt(8, 20));
  });

  it('an item that is the goal itself is walked to, fight or none', () => {
    const { level, options } = arena();
    const from = cellAt(4, 6);
    const to = cellAt(12, 6);
    const route = planRoute(level, from, to, { ...options, heaps: new Set([to]), combat: true });
    expect(route.at(-1)).toBe(to);
    expect(route).toHaveLength(8);
  });

  it('a known trap is not stepped on when a way round exists (findPath), fight or none', () => {
    const { level, options } = arena();
    const trap = cellAt(9, 6);
    level.map[trap] = T.TOXIC_TRAP;
    const route = planRoute(level, cellAt(4, 6), cellAt(14, 6), { ...options, combat: true });
    expect(route.length).toBeGreaterThan(0);
    expect(route).not.toContain(trap);
  });

  it('monsters in the way are gone round, and gas too where it can be', () => {
    const { level, options } = arena();
    const from = cellAt(4, 6);
    const to = cellAt(14, 6);
    const plain = planRoute(level, from, to, options);
    const monster = plain[3]!;
    expect(planRoute(level, from, to, { ...options, occupied: new Set([monster]) })).not.toContain(monster);
    const cloud = plain[5]!;
    expect(planRoute(level, from, to, { ...options, gas: new Set([cloud]) })).not.toContain(cloud);
  });
});

describe('a tap stops a walk at once', () => {
  const walk = (): Walking => ({ queue: [11, 12, 13], chase: null, stairs: null, pickup: false, resting: false, open: null });
  const nokey = (): HeldKey => ({ code: '', striding: false });

  it('drops the queue, a chase, a rest, the stairs, a pickup, a chest and a key held', () => {
    const w: Walking = { queue: [1], chase: '#rat', stairs: 'descend', pickup: true, resting: true, open: 5 };
    const key: HeldKey = { code: 'ArrowUp', striding: true };
    expect(underway(w)).toBe(true);
    expect(stopForTap(w, key)).toBe(true);
    expect(w).toEqual({ queue: [], chase: null, stairs: null, pickup: false, resting: false, open: null });
    expect(key.code).toBe('');
    expect(underway(w)).toBe(false);
  });

  it('each kind of walk alone counts as under way, and stops', () => {
    const kinds: Array<Partial<Walking>> = [{ queue: [1, 2] }, { chase: '#rat' }, { stairs: 'ascend' }, { pickup: true }, { resting: true }, { open: 3 }];
    for (const kind of kinds) {
      const w = { ...walk(), queue: [], ...kind } as Walking;
      expect(underway(w)).toBe(true);
      expect(stopForTap(w, nokey())).toBe(true);
      expect(underway(w)).toBe(false);
    }
  });

  it('with nothing going on, a tap stops nothing', () => {
    const w = { ...walk(), queue: [] };
    expect(underway(w)).toBe(false);
    expect(stopForTap(w, nokey())).toBe(false);
  });

  it('is the one rule of every interruption: the same thing that damage does', () => {
    const a = walk();
    const b = walk();
    stopForTap(a, nokey());
    interruptWalk(b, nokey());
    expect(a).toEqual(b);
  });

  it('a route waiting for its second tap is not a walk: it stays, and a tap on its cell confirms it', () => {
    const preview = new PathPreview();
    preview.show(100, [60, 100], 59, 1, 0);
    const w = { ...walk(), queue: [] };
    expect(stopForTap(w, nokey())).toBe(false);
    expect(preview.active).toBe(true);
    expect(verdict(preview.cell, 100, true)).toBe('walk');
  });
});
