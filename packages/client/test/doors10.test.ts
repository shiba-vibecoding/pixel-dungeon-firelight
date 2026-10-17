import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MeshBasicMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { LENGTH, T, WIDTH } from '@pd/core';
import type { DoorKit } from '../src/r3d/doorkit';
import { CHAR_MS, DoorScene, GRATE_MS, KEY_MS, SECRET_DUST_MS, SECRET_HOLD_MS, SECRET_SINK_MS } from '../src/r3d/doorscene';
import { fitKit } from '../src/r3d/doorkit';
import { FRONT_WALL_H, LevelGeom } from '../src/r3d/levelgeom';

const kit = JSON.parse(readFileSync(fileURLToPath(new URL('../public/assets/doors/doors.json', import.meta.url)), 'utf8')) as DoorKit;
const at = (x: number, z: number): number => x + z * WIDTH;
const mapOf = (carve: ReadonlyArray<readonly [number, number, number]>): number[] => {
  const map = new Array<number>(LENGTH).fill(T.WALL);
  for (const [x, z, t] of carve) map[at(x, z)] = t;
  return map;
};
/** A door in an east-west wall line (floor north and south of it). */
const across = (t: number): number[] => mapOf([[20, 20, T.EMPTY], [20, 21, t], [20, 22, T.EMPTY]]);
/** A door in a north-south wall line (floor west and east of it). */
const standing = (t: number): number[] => mapOf([[19, 21, T.EMPTY], [20, 21, t], [21, 21, T.EMPTY]]);
const heightsAt = (geom: LevelGeom, x: number, z: number): number[] => {
  const { pos, verts } = geom.boxes;
  const found: number[] = [];
  for (let v = 0; v < verts; v++) {
    const px = pos[v * 3]!;
    const pz = pos[v * 3 + 2]!;
    if (px >= x && px <= x + 1 && pz >= z && pz <= z + 1) found.push(pos[v * 3 + 1]!);
  }
  return found;
};

describe('the fixed parts of a door (levelgeom.ts)', () => {
  it('stands a frame and a threshold at every kind of door, shut or open, and none without the kit', () => {
    for (const t of [T.DOOR, T.OPEN_DOOR, T.LOCKED_DOOR, T.BARRICADE]) {
      const bare = new LevelGeom(across(t), 16, 16);
      const dressed = new LevelGeom(across(t), 16, 16, undefined, undefined, kit);
      expect(dressed.boxes.verts, `terrain ${t}`).toBeGreaterThan(bare.boxes.verts);
    }
    // A hidden secret door is a wall, exactly as the original: nothing of it shows.
    const bare = new LevelGeom(across(T.SECRET_DOOR), 16, 16);
    const dressed = new LevelGeom(across(T.SECRET_DOOR), 16, 16, undefined, undefined, kit);
    expect(dressed.boxes.verts).toBe(bare.boxes.verts);
  });

  it('puts the frame a pixel over the wall, and the threshold on the floor lipping out into both rooms', () => {
    const geom = new LevelGeom(across(T.DOOR), 16, 16, undefined, undefined, kit);
    const top = Math.max(...heightsAt(geom, 20, 21));
    expect(top).toBeCloseTo(kit.heights.frameTop.full, 6);
    expect(kit.heights.frameTop.full).toBeGreaterThan(kit.heights.wall);
    const { pos, verts } = geom.boxes;
    let lip = 0;
    for (let v = 0; v < verts; v++) {
      if (Math.abs(pos[v * 3 + 1]! - kit.threshold.h) > 1e-6) continue;
      const z = pos[v * 3 + 2]!;
      lip = Math.max(lip, 21 - z, z - 22);
    }
    expect(lip).toBeCloseTo((kit.threshold.l - 1) / 2, 6);
  });

  it('treats a barricade as a gap in the wall line like a door: a frame round it, no stone cap over it', () => {
    const geom = new LevelGeom(across(T.BARRICADE), 16, 16, undefined, undefined, kit);
    const { pos, verts } = geom.boxes;
    for (let v = 0; v < verts; v += 4) {
      const xs = [0, 1, 2, 3].map((k) => pos[(v + k) * 3]!);
      const ys = [0, 1, 2, 3].map((k) => pos[(v + k) * 3 + 1]!);
      const zs = [0, 1, 2, 3].map((k) => pos[(v + k) * 3 + 2]!);
      const wholeCell = Math.min(...xs) === 20 && Math.max(...xs) === 21 && Math.min(...zs) === 21 && Math.max(...zs) === 22;
      expect(wholeCell && ys.every((y) => Math.abs(y - kit.heights.wall) < 1e-6)).toBe(false);
    }
    expect(Math.max(...heightsAt(geom, 20, 21))).toBeCloseTo(kit.heights.frameTop.full, 6);
  });

  it('lowers the wall cell just south of a door in a north-south wall to the shoulder, and no other', () => {
    const map = mapOf([[19, 21, T.EMPTY], [20, 21, T.DOOR], [21, 21, T.EMPTY], [19, 22, T.EMPTY], [21, 22, T.EMPTY]]);
    const geom = new LevelGeom(map, 16, 16, undefined, undefined, kit);
    expect(geom.doorAcross(20, 21)).toBe(false);
    expect(geom.isShoulder(at(20, 22))).toBe(true);
    // (It is a cut wall as well, with the doorway to its north: the shoulder is the cut wall's height.)
    expect(geom.heightOf(at(20, 22))).toBeCloseTo(Math.min(FRONT_WALL_H, kit.heights.shoulder), 6);
    // The wall north of the door, and any wall beside, stays whole.
    expect(geom.isShoulder(at(20, 20))).toBe(false);
    expect(geom.heightOf(at(20, 20))).toBeCloseTo(kit.heights.wall, 6);
    // A door in an east-west wall line has no shoulder.
    const flat = new LevelGeom(across(T.DOOR), 16, 16, undefined, undefined, kit);
    expect(flat.isShoulder(at(20, 22))).toBe(false);
    // Without the kit the wall is as it was.
    expect(new LevelGeom(map, 16, 16).heightOf(at(20, 22))).toBeCloseTo(FRONT_WALL_H, 6);
  });

  it('reads the look of a door from the terrain: closed, locked, barricade; open is closed and open', () => {
    const look = (t: number): string => new LevelGeom(across(t), 16, 16, undefined, undefined, kit).doorInfo(at(20, 21)).look;
    expect(look(T.DOOR)).toBe('closed');
    expect(look(T.OPEN_DOOR)).toBe('closed');
    expect(look(T.LOCKED_DOOR)).toBe('locked');
    expect(look(T.BARRICADE)).toBe('barricade');
    expect(new LevelGeom(across(T.OPEN_DOOR), 16, 16, undefined, undefined, kit).doorInfo(at(20, 21)).open).toBe(true);
  });
});

describe('the kit fitted to the cut walls of the game (doorkit.ts)', () => {
  it('keeps the frame a pixel proud of a cut wall, the leaf a little under it, and the shoulder no higher than the cut', () => {
    const fit = fitKit(kit, FRONT_WALL_H);
    expect(fit.heights.cut).toBe(FRONT_WALL_H);
    expect(fit.heights.frameTop.cut).toBeCloseTo(FRONT_WALL_H + 1 / 16, 6);
    const leafTop = kit.leaf.lift + fit.leaf.h.cut;
    expect(leafTop).toBeLessThan(FRONT_WALL_H);
    expect(leafTop).toBeGreaterThan(FRONT_WALL_H - 0.2);
    expect(fit.heights.shoulder).toBeLessThanOrEqual(FRONT_WALL_H);
    // The lintel's underside clears the leaf, so the transom light fits between.
    expect(fit.heights.frameTop.cut - kit.lintel.h).toBeGreaterThan(leafTop);
    // The full-height numbers are the designer's.
    expect(fit.heights.frameTop.full).toBe(kit.heights.frameTop.full);
    expect(fit.leaf.h.full).toBe(kit.leaf.h.full);
    expect(fitKit(fit, FRONT_WALL_H)).toBe(fit);
  });

  it('puts the frame of a door in a cut wall line that height over the floor', () => {
    // Floor north of the walls beside the door: they are cut, and so is the frame.
    const map = mapOf([[19, 20, T.EMPTY], [20, 20, T.EMPTY], [21, 20, T.EMPTY], [20, 21, T.DOOR], [20, 22, T.EMPTY]]);
    const geom = new LevelGeom(map, 16, 16, undefined, undefined, kit);
    expect(geom.doorInfo(at(20, 21)).cut).toBe(true);
    // (The top of the highest quad that lies wholly in the doorway's cell.)
    const { pos, verts } = geom.boxes;
    let top = 0;
    for (let v = 0; v < verts; v += 4) {
      const xs = [0, 1, 2, 3].map((k) => pos[(v + k) * 3]!);
      const zs = [0, 1, 2, 3].map((k) => pos[(v + k) * 3 + 2]!);
      if (Math.min(...xs) < 20 || Math.max(...xs) > 21 || Math.min(...zs) < 21 || Math.max(...zs) > 22) continue;
      top = Math.max(top, ...[0, 1, 2, 3].map((k) => pos[(v + k) * 3 + 1]!));
    }
    expect(top).toBeCloseTo(FRONT_WALL_H + 1 / 16, 6);
  });
});

describe('the vault door, told from the map (levelgeom.ts)', () => {
  /** A vault as the painter makes it: a ring of special floor round a plain middle, one locked door in. */
  const vault = (doors = 1, ring: number = T.EMPTY_SP, middle: number = T.EMPTY): number[] => {
    const carve: Array<[number, number, number]> = [];
    for (let z = 10; z <= 12; z++) for (let x = 10; x <= 14; x++) carve.push([x, z, x === 10 || x === 14 || z === 10 || z === 12 ? ring : middle]);
    carve.push([12, 13, T.LOCKED_DOOR], [12, 14, T.EMPTY], [11, 14, T.EMPTY], [13, 14, T.EMPTY]);
    if (doors > 1) carve.push([9, 11, T.LOCKED_DOOR], [8, 11, T.EMPTY]);
    return mapOf(carve);
  };
  const lookOf = (map: number[], cell: number): string => new LevelGeom(map, 16, 16, undefined, undefined, kit).doorInfo(cell).look;

  it('takes a locked door into a shut room ringed with special floor round a plain middle for a vault', () => {
    expect(lookOf(vault(), at(12, 13))).toBe('vault');
    // The pedestal of a vault with a single prize is a middle too.
    const pedestal = vault();
    pedestal[at(12, 11)] = T.PEDESTAL;
    expect(lookOf(pedestal, at(12, 13))).toBe('vault');
  });

  it('leaves a plain locked door when the room is anything else, or it is not clear', () => {
    // Two ways in: not a vault.
    expect(lookOf(vault(2), at(12, 13))).toBe('locked');
    // A ring of ordinary floor, or a ring with something else in the middle.
    expect(lookOf(vault(1, T.EMPTY, T.EMPTY), at(12, 13))).toBe('locked');
    // (Grass or water grown over a vault's middle is still a vault; a room of special floor all through is not.)
    expect(lookOf(vault(1, T.EMPTY_SP, T.GRASS), at(12, 13))).toBe('vault');
    expect(lookOf(vault(1, T.EMPTY_SP, T.EMPTY_SP), at(12, 13))).toBe('locked');
    // An open room (no walls round it) is not shut.
    const open = vault();
    open[at(15, 11)] = T.EMPTY;
    expect(lookOf(open, at(12, 13))).toBe('locked');
  });
});

describe('what plays on the doors (doorscene.ts)', () => {
  const materials = { leaf: new MeshBasicMaterial(), solid: new MeshBasicMaterial(), add: new MeshBasicMaterial(), fxAdd: new MeshBasicMaterial(), fxAlpha: new MeshBasicMaterial() };
  const sceneFor = (map: number[], sees = true): { doors: DoorScene; geom: LevelGeom; scene: Scene } => {
    const scene = new Scene();
    const doors = new DoorScene(scene, kit, materials, false);
    const geom = new LevelGeom(map, 16, 16, undefined, undefined, kit);
    doors.reset({ geom, lit: () => false, hero: () => at(20, 20), seen: () => sees }, map);
    return { doors, geom, scene };
  };
  /** The map changes at `now`: what the geometry is made from is shown, then it is made again. */
  const change = (s: { doors: DoorScene; geom: LevelGeom }, map: number[], now: number): ArrayLike<number> => {
    const shown = s.doors.display(map, now);
    s.geom.patch(shown);
    if (s.doors.takeBegun()) s.doors.refresh();
    return shown;
  };

  it('makes a mesh of leaves for each look: a shut door, a locked one, a vault door and a barricade each have their own', () => {
    const map = mapOf([[20, 20, T.EMPTY], [20, 21, T.DOOR], [20, 22, T.EMPTY], [24, 20, T.EMPTY], [24, 21, T.LOCKED_DOOR], [24, 22, T.EMPTY], [28, 20, T.EMPTY], [28, 21, T.BARRICADE], [28, 22, T.EMPTY]]);
    const { doors } = sceneFor(map);
    expect(doors.leafMeshes).toHaveLength(3);
    expect(doors.leafMeshes.flatMap((m) => m.cells).sort((a, b) => a - b)).toEqual([at(20, 21), at(24, 21), at(28, 21)]);
    for (const { mesh, cells } of doors.leafMeshes) expect(mesh.count).toBe(cells.length);
    doors.dispose();
  });

  it('shows a secret door as the wall until its cracks have played, then the door, then the wall has sunk and the dust has settled', () => {
    const s = sceneFor(across(T.SECRET_DOOR));
    const found = across(T.DOOR);
    const shown = change(s, found, 1000);
    expect(shown[at(20, 21)]).toBe(T.SECRET_DOOR);
    expect(s.geom.terrain[at(20, 21)]).toBe(T.SECRET_DOOR);
    expect(s.doors.moving).toBe(true);
    expect(s.doors.frame(1000 + SECRET_HOLD_MS - 1)).toBe(false);
    expect(s.doors.frame(1000 + SECRET_HOLD_MS + 1)).toBe(true);
    // The geometry is made from the real map once the hold is over.
    s.geom.patch(s.doors.display(found, 1000 + SECRET_HOLD_MS + 1));
    s.doors.refresh();
    expect(s.geom.terrain[at(20, 21)]).toBe(T.DOOR);
    expect(s.doors.leafMeshes).toHaveLength(1);
    expect(s.doors.moving).toBe(true);
    s.doors.frame(1000 + SECRET_HOLD_MS + SECRET_SINK_MS + SECRET_DUST_MS + 10);
    expect(s.doors.moving).toBe(false);
    s.doors.dispose();
  });

  it('does not hold a change that is out of sight', () => {
    const s = sceneFor(across(T.SECRET_DOOR), false);
    const found = across(T.DOOR);
    expect(change(s, found, 1000)).toBe(found);
    expect(s.doors.moving).toBe(false);
    s.doors.dispose();
  });

  it('turns the key before the door is plain: a locked door is shown locked for the key\'s four frames', () => {
    const s = sceneFor(across(T.LOCKED_DOOR));
    const shown = change(s, across(T.DOOR), 500);
    expect(shown[at(20, 21)]).toBe(T.LOCKED_DOOR);
    expect(s.doors.frame(500 + KEY_MS - 1)).toBe(false);
    expect(s.doors.frame(500 + KEY_MS + 1)).toBe(true);
    s.doors.dispose();
  });

  it('chars a barricade before it is gone, and opens the exit\'s grate after the key', () => {
    const s = sceneFor(across(T.BARRICADE));
    const shown = change(s, across(T.EMBERS), 0);
    expect(shown[at(20, 21)]).toBe(T.BARRICADE);
    expect(s.doors.leafMeshes.map((m) => m.cells)).toEqual([[at(20, 21)]]);
    expect(s.doors.frame(CHAR_MS - 1)).toBe(false);
    expect(s.doors.frame(CHAR_MS + 1)).toBe(true);
    s.geom.patch(s.doors.display(across(T.EMBERS), CHAR_MS + 1));
    s.doors.refresh();
    expect(s.doors.leafMeshes).toHaveLength(0);
    s.doors.dispose();

    const exit = sceneFor(across(T.LOCKED_EXIT));
    expect(change(exit, across(T.UNLOCKED_EXIT), 0)[at(20, 21)]).toBe(T.LOCKED_EXIT);
    expect(exit.doors.frame(KEY_MS + 1)).toBe(true);
    exit.geom.patch(exit.doors.display(across(T.UNLOCKED_EXIT), KEY_MS + 1));
    exit.doors.refresh();
    expect(exit.doors.moving).toBe(true);
    exit.doors.frame(KEY_MS + GRATE_MS + 50);
    expect(exit.doors.moving).toBe(false);
    exit.doors.dispose();
  });
});

describe('a patched level is the level built fresh (levelgeom.ts)', () => {
  /** The quads of a buffer as a sorted list of their corners and uv rects. */
  const quadsOf = (b: { pos: Float32Array; uv: Float32Array; verts: number }): string[] => {
    const out: string[] = [];
    for (let v = 0; v < b.verts; v += 4) {
      const p = Array.from(b.pos.subarray(v * 3, v * 3 + 12), (x) => x.toFixed(4));
      const t = Array.from(b.uv.subarray(v * 2, v * 2 + 8), (x) => x.toFixed(4));
      out.push(p.join(',') + '|' + t.join(','));
    }
    return out.sort();
  };
  const KINDS = [T.DOOR, T.OPEN_DOOR, T.LOCKED_DOOR, T.BARRICADE, T.SECRET_DOOR, T.EMBERS];
  it('gives the same quads when the boss exit is unlocked as when it is built so, and a locked one has its steps and no block', () => {
    const map = across(T.LOCKED_EXIT);
    const geom = new LevelGeom(map, 16, 16, undefined, undefined, kit);
    expect(geom.kinds[at(20, 21)]).toBe(0);
    map[at(20, 21)] = T.UNLOCKED_EXIT;
    geom.patch(map);
    const built = new LevelGeom(across(T.UNLOCKED_EXIT), 16, 16, undefined, undefined, kit);
    expect(quadsOf(geom.boxes)).toEqual(quadsOf(built.boxes));
    expect(quadsOf(geom.floor)).toEqual(quadsOf(built.floor));
  });
  for (const orient of ['across', 'standing'] as const) {
    it(`gives the same quads after any change of a door as after building it so (${orient})`, () => {
      const make = orient === 'across' ? across : standing;
      const bad: string[] = [];
      for (const a of KINDS) {
        for (const b of KINDS) {
          if (a === b) continue;
          const map = make(a);
          const geom = new LevelGeom(map, 16, 16, undefined, undefined, kit);
          map[at(20, 21)] = b;
          geom.patch(map);
          const built = new LevelGeom(make(b), 16, 16, undefined, undefined, kit);
          if (JSON.stringify(quadsOf(geom.boxes)) !== JSON.stringify(quadsOf(built.boxes))) bad.push(`boxes ${a}>${b}`);
          if (JSON.stringify(quadsOf(geom.floor)) !== JSON.stringify(quadsOf(built.floor))) bad.push(`floor ${a}>${b}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
});
