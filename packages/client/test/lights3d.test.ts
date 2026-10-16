import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { LENGTH, T, WIDTH, createWorld, levelAt } from '@pd/core';
import { LevelGeom } from '../src/r3d/levelgeom';
import { LightRig, type Strongest, sourcesOf } from '../src/r3d/lightrig';
import { atmosphere, lights, parseKit, regionKit } from '../src/r3d/kit';
import { parseCss } from '../src/r3d/effects3d';

const kit = parseKit(JSON.parse(readFileSync(new URL('../public/assets/hd2d/hd2d-kit.json', import.meta.url), 'utf8')));
const mapOf = (carve: ReadonlyArray<readonly [number, number, number]>): number[] => {
  const map = new Array<number>(LENGTH).fill(T.WALL);
  for (const [x, y, t] of carve) map[x + y * WIDTH] = t;
  return map;
};

describe('the light of a level, from the kit', () => {
  it('has the wall torches of the level with the region\'s own torch', () => {
    const level = levelAt(createWorld(7), 1);
    const geom = new LevelGeom(level.map, 16, 16);
    const sources = sourcesOf(kit, regionKit(kit, 0), geom, true);
    const torches = sources.filter((s) => s.torch);
    expect(torches).toHaveLength(geom.torches.length);
    expect(torches.length).toBeGreaterThan(3);
    for (const s of torches) {
      expect(s.intensity).toBe(13);
      expect(s.distance).toBe(9);
      // The kit's decay for the torch, plus the multiplier for r169.
      expect(s.decay).toBeCloseTo(1.2 + 0.5, 10);
      expect(s.hz).toBe(6);
      expect(s.amp).toBe(0.18);
    }
  });

  it('adds the lights of the glowing tiles: lava one cell in six, a fungus patch in three, a forge door each', () => {
    const lava: Array<[number, number, number]> = [];
    for (let i = 0; i < 12; i++) lava.push([10 + i, 10, T.WATER]);
    const halls = sourcesOf(kit, regionKit(kit, 4), new LevelGeom(mapOf(lava), 16, 16), false);
    expect(halls).toHaveLength(2);
    expect(halls.every((s) => !s.torch && s.intensity === 2.5)).toBe(true);
    const fungus: Array<[number, number, number]> = [];
    for (let i = 0; i < 9; i++) fungus.push([10 + i, 10, 15]);
    expect(sourcesOf(kit, regionKit(kit, 2), new LevelGeom(mapOf(fungus), 16, 16), false)).toHaveLength(3);
    const doors = [[10, 10, T.EMPTY], [10, 11, T.DOOR], [10, 12, T.EMPTY], [14, 10, T.EMPTY], [14, 11, T.DOOR], [14, 12, T.EMPTY]] as const;
    expect(sourcesOf(kit, regionKit(kit, 3), new LevelGeom(mapOf(doors), 16, 16), false)).toHaveLength(2);
    // The sewers have none of these.
    expect(sourcesOf(kit, regionKit(kit, 0), new LevelGeom(mapOf(lava), 16, 16), false)).toHaveLength(0);
  });

  it('lights the nearest torches, keeping the ones already lit while they are near', () => {
    const level = levelAt(createWorld(7), 1);
    const geom = new LevelGeom(level.map, 16, 16);
    const rig = new LightRig(new Scene(), false);
    rig.configure(lights(kit, atmosphere(kit, 0, 1)), sourcesOf(kit, regionKit(kit, 0), geom, true), 2);
    const explored = new Array<boolean>(LENGTH).fill(true);
    const first = geom.torches[0]!;
    const hx = (first % WIDTH) + 0.5;
    const hz = Math.trunc(first / WIDTH) + 3;
    rig.assign(hx, hz, explored, 2);
    const sources = sourcesOf(kit, regionKit(kit, 0), geom, true);
    // The shadow lights hold torches, the nearest ones.
    const lit = [rig.slot(0), rig.slot(1)].filter((i) => i >= 0);
    expect(lit.length).toBeGreaterThan(0);
    for (const i of lit) expect(sources[i]!.torch).toBe(true);
    const near = (i: number): number => Math.hypot(sources[i]!.x - hx, sources[i]!.z - hz);
    const nearest = sources.map((_, i) => i).filter((i) => sources[i]!.torch).sort((a, b) => near(a) - near(b)).slice(0, 2);
    expect([...lit].sort()).toEqual([...nearest].sort());
    // Standing still, nothing changes; and unseen torches are never lit.
    const before = [rig.slot(0), rig.slot(1), rig.slot(2), rig.slot(3)];
    rig.assign(hx, hz, explored, 2);
    expect([rig.slot(0), rig.slot(1), rig.slot(2), rig.slot(3)]).toEqual(before);
    rig.assign(hx, hz, new Array<boolean>(LENGTH).fill(false), 2);
    expect([0, 1, 2, 3].map((i) => rig.slot(i))).toEqual([-1, -1, -1, -1]);
    // No accent lights on the lowest tier.
    rig.assign(hx, hz, explored, 0);
    expect(rig.slot(2)).toBe(-1);
    expect(rig.slot(3)).toBe(-1);
  });

  it('flickers a torch by the kit\'s rate and amount, and a lamp not at all', () => {
    const level = levelAt(createWorld(7), 1);
    const geom = new LevelGeom(level.map, 16, 16);
    const rig = new LightRig(new Scene(), false);
    const sources = sourcesOf(kit, regionKit(kit, 0), geom, true);
    rig.configure(lights(kit, atmosphere(kit, 0, 1)), sources, 2);
    const explored = new Array<boolean>(LENGTH).fill(true);
    const t = sources[0]!;
    rig.assign(t.x, t.z, explored, 2);
    const seen = new Set<number>();
    for (let ms = 0; ms < 400; ms += 7) {
      rig.frame(ms, t.x, t.z);
      seen.add(Math.round(rig.shadow[0]!.intensity * 100));
    }
    const values = [...seen];
    expect(Math.max(...values) / 100).toBeLessThanOrEqual(13 * (1 + 0.18 * 0.8) + 0.01);
    expect(Math.min(...values) / 100).toBeGreaterThanOrEqual(13 * (1 - 0.18 * 0.8) - 0.01);
    expect(values.length).toBeGreaterThan(5);
  });
});

describe('the colours the game\'s effects write', () => {
  it('reads hex, rgb, rgba and the view\'s plain triples, as linear light', () => {
    const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const hex = parseCss('#ff8000');
    expect([hex[0], hex[1]!.toFixed(4), hex[2], hex[3]]).toEqual([1, lin(128 / 255).toFixed(4), 0, 1]);
    expect(parseCss('#f80')[1]!).toBeCloseTo(lin(136 / 255), 5);
    const rgba = parseCss('rgba(190, 180, 160, 0.7)');
    expect(rgba[0]!).toBeCloseTo(lin(190 / 255), 5);
    expect(rgba[3]!).toBeCloseTo(0.7, 5);
    expect(parseCss('120, 180, 255')[2]).toBe(1);
    // Kept: the same array comes back, so a frame parses nothing twice.
    expect(parseCss('#ff8000')).toBe(hex);
    // What cannot be read is white, not an error in the middle of a frame.
    expect(Array.from(parseCss('mauve'))).toEqual([1, 1, 1, 1]);
  });

  it('picks the strongest light near a figure for its rim, nothing when none reaches it', () => {
    const level = levelAt(createWorld(7), 1);
    const geom = new LevelGeom(level.map, 16, 16);
    const sources = sourcesOf(kit, regionKit(kit, 0), geom, true);
    const rig = new LightRig(new Scene(), false);
    rig.configure(lights(kit, atmosphere(kit, 0, 1)), sources, 0);
    const torch = sources.find((s) => s.torch)!;
    const explored = new Array<boolean>(LENGTH).fill(true);
    rig.assign(torch.x, torch.z + 3, explored, 2);
    const out: Strongest = { ux: 0, uz: 0, r: 0, g: 0, b: 0, strength: 0 };
    // Three cells south of a torch: it lies due north (toward -z), and is as strong as the cap allows.
    expect(rig.strongest(torch.x, torch.z + 3, 0.3, 0.6, out)).toBe(true);
    expect(out.uz).toBeLessThan(-0.9);
    expect(out.strength).toBeGreaterThan(0);
    expect(out.strength).toBeLessThanOrEqual(0.6);
    expect(Math.hypot(out.ux, out.uz)).toBeCloseTo(1, 5);
    // Far from every light (past each one's distance): none.
    expect(rig.strongest(-100, -100, 0.3, 0.6, out)).toBe(false);
  });
});
