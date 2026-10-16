import { describe, expect, it } from 'vitest';
import {
  bloodRgb, CHUNK, CHUNK_SHAPES, chunkCount, chunkPixels, chunksOf, chunkStyle, emptyData, FLOOR, Gore, GoreStore, MAX_BODIES, MAX_SPLATS, NO_BODY, poolSplat, type SpatterMap, spatterOf, type StorageLike, WALL,
} from '../src/gore';
import { deadLook, seeded } from '../src/r3d/bodyart';
import { speckle } from '../src/r3d/itemblood';

class Memory implements StorageLike {
  readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

const body = (n: number) => ({ kind: 'rat', cell: 100 + n, flip: n % 2 === 0, seed: 1000 + n, hits: n % 3 });
const plain = (b: { kind: string; cell: number; flip: boolean; seed: number; hits: number }) => ({ kind: b.kind, cell: b.cell, flip: b.flip, seed: b.seed, hits: b.hits });

describe('the gore that stays', () => {
  it('saves and reloads the same bodies, splats and water stain', () => {
    const mem = new Memory();
    const a = new Gore();
    a.setStore(new GoreStore(mem));
    a.bind('7:abc', 3, true);
    a.addBody(body(1), 0);
    a.addBody({ ...body(2), kind: 'skeleton' }, 0);
    a.addSplat({ layer: FLOOR, x: 10, y: 20, w: 2, h: 1, rgb: 0xbb0000 });
    a.addSplat({ layer: WALL, x: 40, y: 90, w: 1, h: 3, rgb: 0x66ff22 });
    a.addSplat(poolSplat(100, 120, 6, 0x7a0e0e));
    a.settleWater(55, 40);
    a.settleWater(55, 20);
    a.addSplat({ layer: CHUNK, x: 50, y: 60, w: 4, h: 5, rgb: 0xc42020 });
    a.stainHeap(77);
    a.stainHeap(77);
    a.stainDoor(90);
    a.flush();
    const water = [...a.data.water];

    // Another visit: a fresh state, the same run and depth.
    const b = new Gore();
    b.setStore(new GoreStore(mem));
    b.bind('7:abc', 3, false);
    expect(b.data.bodies.map(plain)).toEqual(a.data.bodies.map(plain));
    expect(b.data.splats).toEqual(a.data.splats);
    expect([...b.data.water]).toEqual(water);
    // Never fainter than it was.
    expect(b.data.water.get(55)).toBe(40);
    // The blood on the items and the doors comes back too.
    expect([...b.data.heaps]).toEqual([[77, 2]]);
    expect([...b.data.doors]).toEqual([[90, 1]]);
  });

  it('keeps each depth apart, and forgets another run (and everything at the start of a new one)', () => {
    const mem = new Memory();
    const g = new Gore();
    g.setStore(new GoreStore(mem));
    g.bind('r1', 1, true);
    g.addBody(body(1), 0);
    g.bind('r1', 2, false);
    expect(g.data.bodies).toHaveLength(0);
    g.addBody(body(2), 0);
    g.bind('r1', 1, false);
    expect(g.data.bodies).toHaveLength(1);
    expect(g.data.bodies[0]!.cell).toBe(101);
    g.bind('r2', 1, false);
    expect([...mem.map.keys()].some((k) => k.startsWith('pd-gore:r1:'))).toBe(false);
    expect(g.data.bodies).toHaveLength(0);
    g.addBody(body(3), 0);
    g.flush();
    g.bind('r3', 1, true);
    expect(mem.map.size).toBe(0);
  });

  it('holds at most 80 bodies a depth: the oldest fades out, and only the rest are kept', () => {
    const mem = new Memory();
    const g = new Gore();
    g.setStore(new GoreStore(mem));
    g.bind('r', 1, true);
    for (let i = 0; i < MAX_BODIES + 5; i++) g.addBody(body(i), 1000 + i);
    const fading = g.data.bodies.filter((b) => b.fadeAt !== undefined);
    expect(fading).toHaveLength(5);
    expect(fading.map((b) => b.cell)).toEqual([100, 101, 102, 103, 104]);
    g.sweep(1000 + 3500, 3000);
    expect(g.data.bodies).toHaveLength(MAX_BODIES);
    g.flush();
    const again = new Gore();
    again.setStore(new GoreStore(mem));
    again.bind('r', 1, false);
    expect(again.data.bodies).toHaveLength(MAX_BODIES);
    expect(again.data.bodies[0]!.cell).toBe(105);
  });

  it('remembers at most 2400 splats a depth, the newest, and tells the painter of each', () => {
    const g = new Gore();
    const painted: number[] = [];
    g.onSplat = (s) => void painted.push(s.x);
    for (let i = 0; i < MAX_SPLATS + 30; i++) g.addSplat({ layer: FLOOR, x: i, y: 0, w: 1, h: 1, rgb: 1 });
    expect(g.data.splats).toHaveLength(MAX_SPLATS);
    expect(g.data.splats[0]!.x).toBe(30);
    expect(painted).toHaveLength(MAX_SPLATS + 30);
  });

  it('survives a damaged record and storage that is full or missing', () => {
    const mem = new Memory();
    mem.setItem('pd-gore:r:1', '{not json');
    const g = new Gore();
    g.setStore(new GoreStore(mem));
    g.bind('r', 1, false);
    expect(g.data).toEqual(emptyData());
    const full: StorageLike = {
      length: 0, key: () => null, getItem: () => null, removeItem: () => undefined,
      setItem: () => {
        throw new Error('full');
      },
    };
    const h = new Gore();
    h.setStore(new GoreStore(full));
    h.bind('r', 1, false);
    h.addBody(body(1), 0);
    expect(() => h.flush()).not.toThrow();
    const n = new Gore();
    n.bind('r', 1, false);
    n.addBody(body(1), 0);
    expect(() => n.flush()).not.toThrow();
  });
});

/** A room (columns 2 to 9, rows 5 to 8) under a wall (row 4), water at (6, 6). */
const room: SpatterMap = {
  width: 12,
  height: 12,
  ground: (c) => {
    const x = c % 12;
    const y = Math.trunc(c / 12);
    return x >= 2 && x <= 9 && y >= 5 && y <= 8 && !(x === 6 && y === 6);
  },
  face: (c) => {
    const x = c % 12;
    const y = Math.trunc(c / 12);
    return y === 4 && x >= 1 && x <= 10;
  },
};
const blow = (damage: number, kind = 'rat') => ({ x: 5 * 16 + 8, y: 6 * 16 + 8, kind, damage, ht: 10 });
const none = { bodies: [], heaps: [] };

describe('spatter', () => {
  it("flings blood on the floor and on the wall faces north of a blow, more for more damage, in the creature's own blood", () => {
    const light = spatterOf(room, blow(2), false, seeded(1), none);
    const heavy = spatterOf(room, blow(10), false, seeded(1), none);
    expect(heavy.splats.length).toBeGreaterThan(light.splats.length);
    expect(heavy.splats.some((s) => s.layer === WALL)).toBe(true);
    // Floor splats land on ground only; wall splats on the rectangle (16 across, 24 up) of a wall that shows, within two cells.
    for (const s of heavy.splats) {
      if (s.layer === FLOOR) expect(room.ground(Math.trunc(s.y / 16) * 12 + Math.trunc(s.x / 16))).toBe(true);
      else {
        expect(Math.trunc(s.y / 24)).toBe(4);
        expect(Math.abs(Math.trunc(s.x / 16) - 5)).toBeLessThanOrEqual(2);
      }
    }
    const green = spatterOf(room, blow(10, 'acidic'), false, seeded(1), none);
    expect((green.splats[0]!.rgb >> 8) & 255).toBeGreaterThan((green.splats[0]!.rgb >> 16) & 255);
    expect(bloodRgb('rat')).toBe(0xbb0000);
    expect(bloodRgb('skeleton')).toBe(0xcccccc);
  });

  it('is the same for the same dice, and half as much on the light effects quality', () => {
    const a = spatterOf(room, blow(8), false, seeded(5), none);
    const b = spatterOf(room, blow(8), false, seeded(5), none);
    expect(a).toEqual(b);
    const l = spatterOf(room, blow(8), true, seeded(5), none);
    expect(l.splats.length).toBeLessThan(a.splats.length * 0.75);
  });

  it('reaches the bodies and heaps within two cells, and no farther', () => {
    const near = { bodies: [{ cell: 6 * 12 + 6 }, { cell: 8 * 12 + 9 }], heaps: [6 * 12 + 4, 8 * 12 + 9] };
    let hit = 0;
    let far = 0;
    let heap = 0;
    for (let seed = 1; seed < 40; seed++) {
      const out = spatterOf(room, blow(10), false, seeded(seed), near);
      if (out.bodyHits.includes(0)) hit++;
      if (out.bodyHits.includes(1)) far++;
      heap += out.heapSpecks.filter((s) => Math.trunc(s.x / 16) === 4).length;
      expect(out.heapSpecks.every((s) => Math.trunc(s.x / 16) !== 9)).toBe(true);
    }
    expect(hit).toBeGreaterThan(20);
    expect(far).toBe(0);
    expect(heap).toBeGreaterThan(0);
  });

  it('names the kinds that leave no body', () => {
    for (const k of ['ghost', 'wraith', 'curse', 'mirror', 'sheep']) expect(NO_BODY.has(k)).toBe(true);
    for (const k of ['rat', 'skeleton', 'golem', 'goo']) expect(NO_BODY.has(k)).toBe(false);
  });
});

describe('the look of a body', () => {
  const frame = (): Uint8ClampedArray => {
    const d = new Uint8ClampedArray(14 * 15 * 4);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 200;
      d[i + 1] = 120;
      d[i + 2] = 60;
      d[i + 3] = (i / 4) % 2 === 0 ? 255 : 0;
    }
    return d;
  };

  it('is greyed and darkened, blood on it, and the same body for the same seed', () => {
    const a = frame();
    const b = frame();
    deadLook(a, 14, 15, 'rat', 42, 0);
    deadLook(b, 14, 15, 'rat', 42, 0);
    expect(a).toEqual(b);
    const whole = frame();
    // Darker than it was.
    expect(a.some((v, k) => k % 4 === 0 && a[k + 3]! === 255 && v < 200 && v > 100)).toBe(true);
    // Transparent pixels stay clear.
    expect(a.every((v, k) => k % 4 !== 3 || v === whole[k])).toBe(true);
    // More blood on it, more specks of blood's red.
    const c = frame();
    deadLook(c, 14, 15, 'rat', 42, 4);
    const specks = (d: Uint8ClampedArray): number => d.reduce((n, v, k) => n + (k % 4 === 0 && d[k + 1]! === 0 && d[k + 3]! === 255 && v > 50 ? 1 : 0), 0);
    expect(specks(c)).toBeGreaterThan(specks(a));
  });
});

const open: SpatterMap = {
  width: 12, height: 12,
  ground: (c) => {
    const x = c % 12;
    const y = Math.trunc(c / 12);
    return x >= 2 && x <= 9 && y >= 2 && y <= 9;
  },
  face: () => false,
};

describe('meat and pieces', () => {
  it('has small pictures, 3 to 6 art pixels across, and turns and flips them without losing a pixel', () => {
    expect(CHUNK_SHAPES.length).toBeGreaterThanOrEqual(8);
    CHUNK_SHAPES.forEach((rows, shape) => {
      const base = chunkPixels(shape, 0).length;
      const w = Math.max(...rows.map((r) => r.length));
      expect(Math.max(w, rows.length), `shape ${shape}`).toBeLessThanOrEqual(7);
      expect(base).toBeGreaterThanOrEqual(5);
      for (let how = 1; how < 8; how++) expect(chunkPixels(shape, how)).toHaveLength(base);
    });
    expect(chunkPixels(0, 0)).not.toEqual(chunkPixels(0, 1));
    expect(chunkPixels(6, 0)).not.toEqual(chunkPixels(6, 2));
  });

  it('throws more for the big, the boss and the hard kill, and half as many on the light quality', () => {
    expect(chunkCount(8, false, false, false)).toBe(5);
    expect(chunkCount(8, false, false, false)).toBeGreaterThanOrEqual(4);
    expect(chunkCount(100, false, false, false)).toBe(10);
    expect(chunkCount(8, false, true, false)).toBeGreaterThan(chunkCount(8, false, false, false));
    expect(chunkCount(100, true, false, false)).toBeGreaterThanOrEqual(22);
    expect(chunkCount(8, false, false, true)).toBeLessThan(chunkCount(8, false, false, false));
  });

  it('scatters within a cell or so on ground only, never on a cell with items, the same for the same dice', () => {
    const avoid = new Set([5 * 12 + 6]);
    const a = chunksOf(open, 'rat', 5 * 16 + 8, 5 * 16 + 8, 8, 20, avoid, seeded(3));
    const b = chunksOf(open, 'rat', 5 * 16 + 8, 5 * 16 + 8, 8, 20, avoid, seeded(3));
    expect(a).toEqual(b);
    expect(a).toHaveLength(8);
    for (const c of a) {
      expect(c.layer).toBe(CHUNK);
      expect(Math.hypot(c.x - (5 * 16 + 8), (c.y - (5 * 16 + 8)) / 0.85)).toBeLessThanOrEqual(21);
      expect(open.ground(Math.trunc(c.y / 16) * 12 + Math.trunc(c.x / 16))).toBe(true);
      expect(avoid.has(Math.trunc(c.y / 16) * 12 + Math.trunc(c.x / 16))).toBe(false);
      expect(c.w).toBeLessThan(CHUNK_SHAPES.length);
      expect(c.h).toBeLessThan(8);
    }
  });

  it("is meat in flesh tones and the creature's own blood, bone for skeletons, shards for golems, nothing for spirits", () => {
    const meat = chunkStyle('rat')!;
    expect(meat.colors).toContain(0xc42020);
    expect(chunkStyle('crab')!.colors.length).toBeGreaterThan(meat.colors.length);
    expect(chunkStyle('skeleton')!.colors.every((c) => (c >> 16) > 0xb0)).toBe(true);
    expect(chunkStyle('skeleton')!.shapes).not.toEqual(meat.shapes);
    expect(chunkStyle('golem')!.shapes).not.toEqual(meat.shapes);
    expect(chunkStyle('ghost')).toBeNull();
    expect(chunksOf(open, 'wraith', 50, 50, 6, 20, new Set(), seeded(1))).toEqual([]);
  });

  it('speckles an item only on its own pixels, more with more blood, the same every time', () => {
    const item = (): Uint8ClampedArray => {
      const d = new Uint8ClampedArray(16 * 16 * 4);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = d[i + 1] = d[i + 2] = 180;
        d[i + 3] = (i / 4) % 16 < 8 ? 255 : 0;
      }
      return d;
    };
    const a = item();
    const b = item();
    speckle(a, 16, 16, 1, 9);
    speckle(b, 16, 16, 1, 9);
    expect(a).toEqual(b);
    const red = (d: Uint8ClampedArray): number => d.reduce((n, v, k) => n + (k % 4 === 0 && d[k + 1]! < 30 && d[k + 3]! === 255 ? 1 : 0), 0);
    expect(red(a)).toBeGreaterThan(0);
    const c = item();
    speckle(c, 16, 16, 6, 9);
    expect(red(c)).toBeGreaterThan(red(a));
    // Clear pixels stay clear.
    const whole = item();
    expect(a.every((v, k) => k % 4 !== 3 || v === whole[k])).toBe(true);
  });
});
