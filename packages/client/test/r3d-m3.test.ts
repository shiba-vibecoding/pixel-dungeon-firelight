import { describe, expect, it } from 'vitest';
import { Texture, Vector3 } from 'three';
import { LENGTH, T, WIDTH, createWorld, levelAt } from '@pd/core';
import { bloomWeights } from '../src/r3d/post';
import { TIERS } from '../src/r3d/governor';
import { blankMirror, makeMirrorUniforms, Mirror } from '../src/r3d/mirror';
import { K_FLOOR, K_WALL, K_WATER, LevelGeom, tileRect } from '../src/r3d/levelgeom';
import { FOLD_MS, Grass, crossedQuads, grassHeight } from '../src/r3d/grass3d';
import { makeAir } from '../src/r3d/fogofwar';
import { GOLD_ORE, GOLD_REGION, orePixels } from '../src/r3d/ore';
import { parseKit } from '../src/r3d/kit';
import { readFileSync } from 'node:fs';

const kit = parseKit(JSON.parse(readFileSync(new URL('../public/assets/hd2d/hd2d-kit.json', import.meta.url), 'utf8')));

describe('the bloom (post.ts)', () => {
  it('is on in the two highest tiers only', () => {
    expect(TIERS.map((t) => [t.name, t.bloom])).toEqual([['high', true], ['mid', true], ['low', false], ['min', false]]);
  });

  it('weights the wide glow more as the kit radius grows, and never more than the near one', () => {
    const narrow = bloomWeights(0);
    const kitted = bloomWeights(kit.bloom.radius);
    const wide = bloomWeights(1);
    expect(kitted.wide).toBeGreaterThan(narrow.wide);
    expect(wide.wide).toBeGreaterThan(kitted.wide);
    // With the kit's radius each step up adds a little less than the one before (a glow, not a fog).
    expect(kitted.mid).toBeGreaterThan(0);
    expect(kitted.mid).toBeLessThanOrEqual(1);
    expect(kitted.wide).toBeLessThanOrEqual(kitted.mid);
  });

  it('reads the kit\'s own numbers', () => {
    expect(kit.bloom).toEqual({ threshold: 0.82, strength: 0.55, radius: 0.35 });
  });
});

describe('the mirror under the water (mirror.ts)', () => {
  const kinds = (carve: ReadonlyArray<readonly [number, number, number]>): Uint8Array => {
    const k = new Uint8Array(LENGTH).fill(K_FLOOR);
    for (const [x, z, kind] of carve) k[x + z * WIDTH] = kind;
    return k;
  };
  const make = (): Mirror => new Mirror(makeMirrorUniforms(blankMirror()), kit.camera.pitch, { value: -1000 });

  it('is for the highest tier only', () => {
    expect(TIERS.map((t) => [t.name, t.mirror])).toEqual([['high', true], ['mid', false], ['low', false], ['min', false]]);
  });

  it('reflects only water with a wall or a block within three cells to its north', () => {
    const m = make();
    // Water at (5, 6) with a wall three cells north of it, and water at (20, 20) in the open.
    m.configure(kinds([[5, 3, K_WALL], [5, 6, K_WATER], [20, 20, K_WATER]]), -0.06);
    const all = new Array<boolean>(LENGTH).fill(true);
    expect(m.seen(4, 6, 5, 7, all)).toBe(true);
    expect(m.seen(19, 21, 19, 21, all)).toBe(false);
    // A wall to the south of the water gives it nothing to show.
    m.configure(kinds([[5, 9, K_WALL], [5, 6, K_WATER]]), -0.06);
    expect(m.seen(4, 6, 5, 7, all)).toBe(false);
  });

  it('is shown only where the water has been seen', () => {
    const m = make();
    m.configure(kinds([[5, 3, K_WALL], [5, 6, K_WATER]]), -0.06);
    const none = new Array<boolean>(LENGTH).fill(false);
    expect(m.seen(0, 47, 0, 47, none)).toBe(false);
  });

  it('finds a wall that stands over the shore where the water mirrors it', () => {
    const m = make();
    m.configure(kinds([[5, 3, K_WALL], [5, 6, K_WATER]]), -0.06);
    const u = m.uniforms.uMirror.value;
    m.update(8, 8, 8, 10);
    const at = (x: number, y: number, z: number): { u: number; v: number } => {
      const p = new Vector3(x, y, z).applyMatrix4(u);
      return { u: p.x, v: p.y };
    };
    // The reflected ray from a point of the plane goes up and north at the camera's pitch: what it meets is seen there.
    const sin = Math.sin((kit.camera.pitch * Math.PI) / 180);
    const cos = Math.cos((kit.camera.pitch * Math.PI) / 180);
    const water = { x: 5.5, z: 6.5 };
    for (const along of [0.4, 0.9, 1.4]) {
      const wall = at(water.x, -0.06 + along * sin, water.z - along * cos);
      const plane = at(water.x, -0.06, water.z);
      expect(wall.u).toBeCloseTo(plane.u, 5);
      expect(wall.v).toBeCloseTo(plane.v, 5);
    }
    // A point on the plane in view is inside the picture.
    const p = at(8.5, -0.06, 8.5);
    expect(p.u).toBeGreaterThan(0);
    expect(p.u).toBeLessThan(1);
    expect(p.v).toBeGreaterThan(0);
    expect(p.v).toBeLessThan(1);
  });

  it('has no water to show where the region reflects nothing (lava)', () => {
    const m = make();
    m.configure(new Uint8Array(LENGTH), -0.06);
    expect(m.seen(0, 47, 0, 47, new Array<boolean>(LENGTH).fill(true))).toBe(false);
  });
});

describe('the stairs as steps (levelgeom.ts)', () => {
  /** A room of floor with the entrance at (6, 5) and the exit at (13, 5), walls all round. */
  const room = (exit: number = T.EXIT): number[] => {
    const map = new Array<number>(LENGTH).fill(T.WALL);
    for (let z = 3; z <= 8; z++) for (let x = 3; x <= 15; x++) map[x + z * WIDTH] = T.EMPTY;
    map[6 + 5 * WIDTH] = T.ENTRANCE;
    map[13 + 5 * WIDTH] = exit;
    return map;
  };
  interface Q { xs: number[]; ys: number[]; zs: number[]; uv: number[]; normal: number[] }
  const quads = (geom: LevelGeom): Q[] => {
    const { pos, uv, normal, verts } = geom.boxes;
    const out: Q[] = [];
    for (let v = 0; v < verts; v += 4) {
      const ks = [0, 1, 2, 3].map((k) => (v + k) * 3);
      out.push({
        xs: ks.map((i) => pos[i]!), ys: ks.map((i) => pos[i + 1]!), zs: ks.map((i) => pos[i + 2]!),
        uv: [0, 1, 2, 3].flatMap((k) => [uv[(v + k) * 2]!, uv[(v + k) * 2 + 1]!]), normal: [normal[ks[0]!]!, normal[ks[0]! + 1]!, normal[ks[0]! + 2]!],
      });
    }
    return out;
  };
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
  /** Top faces (all four corners at one height) over cell (x, z) between the two z values. */
  const tread = (qs: Q[], x: number, y: number, z0: number, z1: number): Q | undefined =>
    qs.find((q) => q.ys.every((v) => near(v, y)) && near(Math.min(...q.xs), x) && near(Math.max(...q.xs), x + 1) && near(Math.min(...q.zs), z0) && near(Math.max(...q.zs), z1));

  it('has the entrance rise in three steps toward the north, each with a third of the stair tile', () => {
    const geom = new LevelGeom(room(), 16, 16);
    const qs = quads(geom);
    const rect = new Float32Array(4);
    tileRect(T.ENTRANCE, 16, 16, rect);
    for (let k = 0; k < 3; k++) {
      const south = 6 - k / 3;
      const t = tread(qs, 6, ((k + 1) * 0.5) / 3, south - 1 / 3, south);
      expect(t, `tread ${k}`).toBeDefined();
      // The tread's picture is the k-th third of the tile, south at the bottom.
      const band = (rect[3]! - rect[1]!) / 3;
      expect(t!.uv[1]).toBeCloseTo(rect[1]! + band * k, 6);
      expect(t!.uv[5]).toBeCloseTo(rect[1]! + band * (k + 1), 6);
      expect(t!.uv[0]).toBeCloseTo(rect[0]!, 6);
      expect(t!.uv[2]).toBeCloseTo(rect[2]!, 6);
      // And a riser under it that faces the camera.
      const riser = qs.find((q) => q.zs.every((v) => near(v, south)) && near(Math.min(...q.ys), (k * 0.5) / 3) && near(Math.max(...q.ys), ((k + 1) * 0.5) / 3) && q.normal[2] === 1);
      expect(riser, `riser ${k}`).toBeDefined();
    }
    // The floor under it is level.
    expect(geom.floor.pos[geom.slot[6 + 5 * WIDTH]! * 12 + 1]).toBe(0);
  });

  it('has the exit sink in three steps toward the north into a stairwell, the last one the darkest', () => {
    const geom = new LevelGeom(room(), 16, 16);
    const qs = quads(geom);
    for (let k = 0; k < 3; k++) {
      const south = 6 - k / 3;
      expect(tread(qs, 13, (-(k + 1) * 0.5) / 3, south - 1 / 3, south), `tread ${k}`).toBeDefined();
    }
    // Its floor is the bottom of the stairwell, and the rock at its far end stands from the bottom to the floor round it.
    expect(geom.floor.pos[geom.slot[13 + 5 * WIDTH]! * 12 + 1]).toBeCloseTo(-0.5, 6);
    const far = qs.find((q) => q.zs.every((v) => near(v, 5)) && near(Math.min(...q.xs), 13) && near(Math.min(...q.ys), -0.5) && near(Math.max(...q.ys), 0));
    expect(far).toBeDefined();
    // Darker as it goes down: the colour of a vertex of each tread.
    const shade = (k: number): number => {
      const south = 6 - k / 3;
      const want = (-(k + 1) * 0.5) / 3;
      for (let v = 0; v < geom.boxes.verts; v += 4) {
        const p = geom.boxes.pos;
        if (near(p[v * 3 + 1]!, want) && near(p[(v + 2) * 3 + 1]!, want) && near(p[v * 3]!, 13) && near(p[v * 3 + 2]!, south)) return geom.boxes.color[v * 3]!;
      }
      return NaN;
    };
    expect(shade(0)).toBeGreaterThan(shade(1));
    expect(shade(1)).toBeGreaterThan(shade(2));
  });

  it('lifts a figure to the step it stands on', () => {
    const geom = new LevelGeom(room(), 16, 16);
    expect(geom.groundAt(6.5, 5.9)).toBeCloseTo(0.5 / 3, 6);
    expect(geom.groundAt(6.5, 5.5)).toBeCloseTo(1 / 3, 6);
    expect(geom.groundAt(6.5, 5.1)).toBeCloseTo(0.5, 6);
    expect(geom.groundAt(13.5, 5.9)).toBeCloseTo(-0.5 / 3, 6);
    expect(geom.groundAt(13.5, 5.1)).toBeCloseTo(-0.5, 6);
    expect(geom.groundAt(8.5, 5.5)).toBe(0);
    expect(geom.groundAt(-3, 5)).toBe(0);
  });

  it('keeps the locked exit of a boss level a block, and gives the unlocked one its steps', () => {
    const geom = new LevelGeom(room(T.LOCKED_EXIT), 16, 16);
    expect(tread(quads(geom), 13, -0.5 / 3, 5 + 2 / 3, 6)).toBeUndefined();
    expect(geom.groundAt(13.5, 5.5)).toBe(0);
    const open = room(T.UNLOCKED_EXIT);
    expect(geom.patch(open)).toBe('solids');
    expect(tread(quads(geom), 13, -0.5 / 3, 5 + 2 / 3, 6)).toBeDefined();
    expect(geom.floor.pos[geom.slot[13 + 5 * WIDTH]! * 12 + 1]).toBeCloseTo(-0.5, 6);
    expect(geom.groundAt(13.5, 5.1)).toBeCloseTo(-0.5, 6);
  });

  it('takes a few quads of a real level and stays within its buffers', () => {
    const level = levelAt(createWorld(11), 1);
    const geom = new LevelGeom(level.map, 16, 16);
    expect(geom.boxes.verts).toBeLessThanOrEqual(geom.boxes.pos.length / 3);
    expect(geom.boxes.indices).toBeLessThanOrEqual(geom.boxes.index.length);
    const stairs = quads(geom).filter((q) => q.ys.some((y) => y !== 0 && Math.abs(y) <= 0.5) && q.xs.every((x) => Math.abs(x - level.entrance % WIDTH - 0.5) <= 0.5));
    expect(stairs.length).toBeGreaterThanOrEqual(6);
  });
});

describe('high grass as crossed billboards (grass3d.ts)', () => {
  const stub = { width: 16, height: 16 } as unknown as HTMLCanvasElement;
  const make = (): Grass => new Grass(makeAir(new Texture()), stub, stub, 0.14);
  const where = (g: Grass, i: number): [number, number] => {
    const m = g.mesh.instanceMatrix.array as Float32Array;
    return [m[i * 16 + 12]!, m[i * 16 + 14]!];
  };
  const fold = (g: Grass): number[] => Array.from(g.mesh.geometry.getAttribute('aFold').array as Float32Array).slice(0, g.drawn);

  it('is two quads a quarter turn apart in one geometry', () => {
    const geometry = crossedQuads();
    const pos = geometry.getAttribute('position').array as Float32Array;
    expect(pos.length / 3).toBe(8);
    expect(geometry.getIndex()!.count).toBe(12);
    // The foot line of each quad (its first two vertices) in the ground plane.
    const dir = (q: number): [number, number] => [pos[(q * 4 + 1) * 3]! - pos[q * 4 * 3]!, pos[(q * 4 + 1) * 3 + 2]! - pos[q * 4 * 3 + 2]!];
    const [a, b] = [dir(0), dir(1)];
    expect(a[0] * b[0] + a[1] * b[1]).toBeCloseTo(0, 6);
    for (const q of [0, 1]) {
      expect(pos[q * 12 + 1]).toBe(0);
      expect(pos[q * 12 + 4]).toBe(0);
      expect(pos[q * 12 + 7]!).toBeGreaterThan(0.5);
    }
  });

  it('is one instance a cell, standing in the middle of it, in one draw', () => {
    const g = make();
    g.set([10 + 3 * WIDTH, 11 + 3 * WIDTH, 12 + 4 * WIDTH], 0, true);
    expect(g.drawn).toBe(3);
    expect(g.mesh.count).toBe(3);
    expect(g.mesh.visible).toBe(true);
    expect(where(g, 0)).toEqual([10.5, 3.5]);
    expect(where(g, 2)).toEqual([12.5, 4.5]);
    const m = g.mesh.instanceMatrix.array as Float32Array;
    expect(m[5]).toBeCloseTo(grassHeight(10 + 3 * WIDTH), 6);
    expect(grassHeight(7)).toBeGreaterThanOrEqual(0.9);
    expect(grassHeight(7)).toBeLessThanOrEqual(1.1);
    expect(fold(g)).toEqual([0, 0, 0]);
  });

  it('folds a trampled cell flat in a third of a second and then lets it go', () => {
    const g = make();
    const cells = [10, 11, 12];
    g.set(cells, 0, true);
    // The rules turn the cell the hero steps on into short grass: it is no longer in the list.
    g.set([10, 12], 1000);
    expect(g.drawn).toBe(3);
    expect(fold(g)).toEqual([0, 0, 0]);
    g.frame(1000 + FOLD_MS / 2);
    expect(fold(g)[1]).toBeCloseTo(0.5, 6);
    expect(fold(g)[0]).toBe(0);
    g.frame(1000 + FOLD_MS);
    expect(g.drawn).toBe(2);
    expect(where(g, 0)).toEqual([10.5, 0.5]);
    expect(where(g, 1)).toEqual([12.5, 0.5]);
    expect(fold(g)).toEqual([0, 0]);
  });

  it('does nothing in a frame while nothing is folding, and takes new cells as they come', () => {
    const g = make();
    g.set([5], 0, true);
    g.mesh.instanceMatrix.version = 0;
    g.frame(10);
    g.frame(20);
    expect(g.mesh.instanceMatrix.version).toBe(0);
    g.set([5, 6], 30);
    expect(g.drawn).toBe(2);
    expect(g.mesh.instanceMatrix.version).toBeGreaterThan(0);
    // A new level starts clean.
    g.set([], 40, true);
    expect(g.drawn).toBe(0);
    expect(g.mesh.visible).toBe(false);
  });
});

describe('the gold ore of the caves (ore.ts)', () => {
  it('has the numbers the kit gives the gold of the caves', () => {
    // hd2d-kit.json, caves, override of wall_face: "the gold ore (12) is metal: roughness 0.3, metalness 0.9".
    const note = kit.regions.caves.override.wall_face as { roughness?: number };
    expect(note).toBeDefined();
    expect(GOLD_ORE).toEqual({ tile: 12, roughness: 0.3, metalness: 0.9 });
    expect(GOLD_REGION).toBe(2);
    expect(kit.regions.caves.emissive['12']).toBe('#ffd75a');
  });

  it('is the pixels the glow map lights, and no others', () => {
    const glow = new Uint8ClampedArray(16 * 16 * 4);
    for (const [x, y] of [[3, 4], [4, 4], [10, 11]] as const) {
      const o = (x + y * 16) * 4;
      glow[o] = 255; glow[o + 1] = 215; glow[o + 2] = 90; glow[o + 3] = 255;
    }
    // A pixel that only barely glows is stone.
    glow[(8 + 8 * 16) * 4] = 6;
    expect(orePixels(glow)).toEqual([3 + 4 * 16, 4 + 4 * 16, 10 + 11 * 16]);
    expect(orePixels(new Uint8ClampedArray(16 * 16 * 4))).toEqual([]);
  });
});

describe('the haze of the demon halls', () => {
  it('is for the two highest tiers, and the kit has the halls a low red mist', () => {
    expect(TIERS.map((t) => [t.name, t.haze])).toEqual([['high', true], ['mid', true], ['low', false], ['min', false]]);
    const mist = kit.regions.halls.fog.mist!;
    expect(mist).toEqual({ color: '#5a1a10', density: 0.18, height: 0.4 });
    expect(kit.regions.halls.particles.some((p) => p.type === 'haze')).toBe(true);
    // The other regions that have mist (the sewers, the caves) keep their wisps: the layer is the halls' own.
    expect(kit.regions.sewers.fog.mist).not.toBeNull();
  });

  it('is off until a level asks for it', () => {
    const air = makeAir(new Texture());
    expect(air.uMist.value.x).toBe(0);
    expect(air.uMist.value.y).toBeGreaterThan(0);
  });
});
