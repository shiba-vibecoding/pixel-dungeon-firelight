import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { LENGTH, WIDTH } from '@pd/core';
import { bloomWeights } from '../src/r3d/post';
import { TIERS } from '../src/r3d/governor';
import { blankMirror, makeMirrorUniforms, Mirror } from '../src/r3d/mirror';
import { K_FLOOR, K_WALL, K_WATER } from '../src/r3d/levelgeom';
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
  const make = (): Mirror => new Mirror(makeMirrorUniforms(blankMirror()), kit.camera.pitch);

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
