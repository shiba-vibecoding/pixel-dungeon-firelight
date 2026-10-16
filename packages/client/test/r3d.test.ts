import { describe, expect, it } from 'vitest';
import { OrthographicCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { HEIGHT, LENGTH, T, WIDTH, createWorld, levelAt } from '@pd/core';
import { CELLS, LEAN_STRETCH, LEAN, PITCH, TILE_PX, WALL_H, YS, groundToScreen, pickCell, screenToGround, toVirtualY } from '../src/r3d/project';
import { K_FLOOR, K_WALL, LevelGeom, SHAPES, TORCH_SPACING, pickShafts, pickTorches, tileRect } from '../src/r3d/levelgeom';
import { CAP_FIRST, FACE_UPPER, FACE_WALL, SHADOW_FIRST } from '../src/r3d/tilemap';
import { Governor, RefreshMeter, TIERS } from '../src/r3d/governor';
import { Beta3D, covers3D } from '../src/r3d/setting';

const COLS = 16;
/** The sheet as the renderer lays it out: the tiles' own eight rows and eight more for the tiles made from them. */
const ROWS = 16;

/** A level of solid wall with the given cells carved out. */
function mapOf(carve: ReadonlyArray<readonly [number, number, number]>): number[] {
  const map = new Array<number>(LENGTH).fill(T.WALL);
  for (const [x, y, terrain] of carve) map[x + y * WIDTH] = terrain;
  return map;
}

/** Whether the box buffer holds a top face over cell (x, z) at height h. */
function hasTop(geom: LevelGeom, x: number, z: number, h = WALL_H): boolean {
  const { pos, verts } = geom.boxes;
  for (let v = 0; v < verts; v += 4) {
    const ys = [0, 1, 2, 3].map((k) => pos[(v + k) * 3 + 1]!);
    if (ys.some((y) => Math.abs(y - h) > 1e-6)) continue;
    const xs = [0, 1, 2, 3].map((k) => pos[(v + k) * 3]!);
    const zs = [0, 1, 2, 3].map((k) => pos[(v + k) * 3 + 2]!);
    if (Math.min(...xs) === x && Math.max(...xs) === x + 1 && Math.min(...zs) === z && Math.max(...zs) === z + 1) return true;
  }
  return false;
}

describe('picking a cell from the screen', () => {
  const view = { x: 120, y: 90, zoom: 4 };
  const width = 750;
  const height = 1624;

  /** The ortho camera the renderer builds (world3d.ts), unprojected by Three itself. */
  function threeGround(sx: number, sy: number): { x: number; z: number } {
    const unit = TILE_PX * view.zoom;
    const halfW = width / (2 * unit);
    const halfH = height / (2 * unit);
    const cx = view.x / TILE_PX + halfW;
    const cz = view.y / TILE_PX + height / YS / (2 * unit);
    const cam = new OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, 120);
    cam.rotation.x = -PITCH;
    cam.position.set(cx, 40 * Math.sin(PITCH), cz + 40 * Math.cos(PITCH));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2((sx / width) * 2 - 1, -((sy / height) * 2 - 1)), cam);
    const hit = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3());
    return { x: hit!.x, z: hit!.z };
  }

  it('is the same as casting a ray from Three.js camera to the floor plane', () => {
    for (const [sx, sy] of [[0, 0], [375, 812], [700, 1500], [123, 456], [749, 3]] as const) {
      const mine = screenToGround(view, sx, sy, { x: 0, y: 0 });
      const ray = threeGround(sx, sy);
      expect(mine.x / TILE_PX).toBeCloseTo(ray.x, 6);
      expect(mine.y / TILE_PX).toBeCloseTo(ray.z, 6);
    }
  });

  it('round-trips ground points through the screen', () => {
    const p = groundToScreen(view, 300, 250, { x: 0, y: 0 });
    const back = screenToGround(view, p.x, p.y, { x: 0, y: 0 });
    expect(back.x).toBeCloseTo(300);
    expect(back.y).toBeCloseTo(250);
  });

  it('names the cell under a tap, and none off the map', () => {
    // The screen's top-left is world pixel (120, 90): cell (7, 5) starts at (112, 80), so (120, 90) is inside it.
    expect(pickCell(view, 0, 0)).toBe(7 + 5 * WIDTH);
    // One cell (64 device pixels wide, 64 * sin(pitch) tall) on.
    expect(pickCell(view, 64, 0)).toBe(8 + 5 * WIDTH);
    const squeezed = Math.ceil(TILE_PX * view.zoom * YS) + 2;
    expect(pickCell(view, 0, squeezed)).toBe(7 + 6 * WIDTH);
    expect(pickCell({ x: -500, y: 0, zoom: 4 }, 0, 0)).toBe(-1);
    expect(pickCell({ x: 0, y: TILE_PX * HEIGHT + 500, zoom: 4 }, 0, 0)).toBe(-1);
  });

  it('works with the 2D camera on a stretched virtual screen: one division', () => {
    // CamControl and the tap code know only x, y, zoom on a screen stretched by 1 / sin(pitch): a real y goes through toVirtualY.
    const sy = 700;
    const virtual = { cell: Math.floor((view.y + toVirtualY(sy) / view.zoom) / TILE_PX) };
    expect(virtual.cell).toBe(Math.floor(pickCell(view, 0, sy) / WIDTH));
  });
});

describe('the lean of a figure', () => {
  it('keeps a sprite as tall on the screen as in its art', () => {
    // A sprite leaned back by LEAN is shortened by cos(pitch - lean) on the screen; drawn LEAN_STRETCH taller it is whole again.
    expect(LEAN_STRETCH * Math.cos(PITCH - LEAN)).toBeCloseTo(1, 10);
  });
});

describe('a level as geometry', () => {
  it('makes a lone floor cell: one quad, eight walls, sixteen faces, four contact shadows', () => {
    const geom = new LevelGeom(mapOf([[20, 20, T.EMPTY]]), COLS, ROWS);
    expect(geom.quads.floor).toBe(1);
    // Eight walls around the cell, each with a top; the four that touch the cell show a side to it, in two parts (the face and the upper half cell).
    expect(geom.quads.boxes).toBe(8 + 4 * 2);
    // And the kit's contact shadow on the floor under each of the four.
    expect(geom.quads.decals).toBe(4);
    expect(geom.quads.water).toBe(0);
    expect(geom.floor.verts).toBe(4);
    expect(geom.floor.indices).toBe(6);
    // The floor quad lies flat on the cell (x 20..21, z 20..21) at height 0.
    const xs = [0, 1, 2, 3].map((k) => geom.floor.pos[k * 3]!);
    const zs = [0, 1, 2, 3].map((k) => geom.floor.pos[k * 3 + 2]!);
    expect(Math.min(...xs)).toBe(20);
    expect(Math.max(...xs)).toBe(21);
    expect(Math.min(...zs)).toBe(20);
    expect(Math.max(...zs)).toBe(21);
    expect(geom.floor.pos[1]).toBe(0);
    // Tops are as high as a wall, over the walls beside the cell and not over the cell.
    expect(hasTop(geom, 19, 20)).toBe(true);
    expect(hasTop(geom, 21, 21)).toBe(true);
    expect(hasTop(geom, 20, 20)).toBe(false);
    // Walls far from any open ground are not built at all.
    expect(hasTop(geom, 5, 5)).toBe(false);
  });

  it('builds a room: floor everywhere inside, boxes only on its rim', () => {
    const carve: Array<[number, number, number]> = [];
    for (let y = 10; y <= 14; y++) for (let x = 10; x <= 14; x++) carve.push([x, y, T.EMPTY]);
    const geom = new LevelGeom(mapOf(carve), COLS, ROWS);
    expect(geom.quads.floor).toBe(25);
    // The rim: a ring of walls around a 5 x 5 room is 7 x 7 - 25 = 24 cells, each with a top; its 20 orthogonal neighbours show a side (two quads).
    expect(geom.quads.boxes).toBe(24 + 20 * 2);
    expect(geom.quads.decals).toBe(20);
    expect(geom.boxes.indices).toBe(geom.quads.boxes * 6);
    // Every index points at a vertex that is there.
    for (let i = 0; i < geom.boxes.indices; i++) expect(geom.boxes.index[i]!).toBeLessThan(geom.boxes.verts);
    // Normals of the camera-facing (south) sides point +z, tops +y.
    const normals = new Set<string>();
    for (let v = 0; v < geom.boxes.verts; v += 4) normals.add([0, 1, 2].map((k) => geom.boxes.normal[v * 3 + k]).join(','));
    expect([...normals].sort()).toEqual(['-1,0,0', '0,0,-1', '0,0,1', '0,1,0', '1,0,0'].sort());
  });

  it('puts water under water cells, with the tile on top', () => {
    const geom = new LevelGeom(mapOf([[10, 10, T.WATER], [11, 10, T.WATER_TILES + 3], [12, 10, T.EMPTY]]), COLS, ROWS);
    expect(geom.quads.water).toBe(2);
    expect(geom.quads.floor).toBe(3);
    // Water lies a little under the floor.
    expect(geom.water.pos[1]).toBeLessThan(0);
  });

  it('opens a door: its box goes, the floor takes the open-door tile, in place', () => {
    const carve: Array<[number, number, number]> = [[20, 20, T.EMPTY], [20, 21, T.DOOR], [20, 22, T.EMPTY]];
    const map = mapOf(carve);
    const geom = new LevelGeom(map, COLS, ROWS);
    expect(hasTop(geom, 20, 21)).toBe(true);
    const before = geom.quads.boxes;
    const floor = geom.floor;
    const versionBefore = geom.floorVersion;
    map[20 + 21 * WIDTH] = T.OPEN_DOOR;
    expect(geom.patch(map)).toBe('solids');
    expect(hasTop(geom, 20, 21)).toBe(false);
    expect(geom.quads.boxes).not.toBe(before);
    // The floor buffers were patched where they are (no new arrays), and flagged for upload.
    expect(geom.floor).toBe(floor);
    expect(geom.floorVersion).toBeGreaterThan(versionBefore);
    const slot = geom.slot[20 + 21 * WIDTH]!;
    expect(slot).toBeGreaterThanOrEqual(0);
    const u0 = geom.floor.uv[slot * 8]!;
    // The tile of an open door is column 6 of 16.
    expect(u0).toBeGreaterThan(6 / 16);
    expect(u0).toBeLessThan(7 / 16);
    // And closing it again puts the box back.
    map[20 + 21 * WIDTH] = T.DOOR;
    expect(geom.patch(map)).toBe('solids');
    expect(hasTop(geom, 20, 21)).toBe(true);
    expect(geom.quads.boxes).toBe(before);
  });

  it('patches trampled grass without touching the boxes', () => {
    const map = mapOf([[20, 20, T.HIGH_GRASS], [21, 20, T.EMPTY]]);
    const geom = new LevelGeom(map, COLS, ROWS);
    const boxVersion = geom.boxVersion;
    map[20 + 20 * WIDTH] = T.GRASS;
    expect(geom.patch(map)).toBe('patched');
    expect(geom.boxVersion).toBe(boxVersion);
    expect(geom.patch(map)).toBe('same');
  });

  it('rebuilds everything when plain wall comes or goes', () => {
    const map = mapOf([[20, 20, T.EMPTY]]);
    const geom = new LevelGeom(map, COLS, ROWS);
    map[21 + 20 * WIDTH] = T.EMPTY;
    expect(geom.patch(map)).toBe('rebuilt');
    expect(geom.quads.floor).toBe(2);
  });

  it('turns terrain into shapes by its flags', () => {
    expect(SHAPES[T.WALL]!.kind).toBe(K_WALL);
    expect(SHAPES[T.DOOR]!.kind).toBe(K_WALL);
    expect(SHAPES[T.OPEN_DOOR]!.kind).toBe(K_FLOOR);
    expect(SHAPES[T.EMPTY]!.kind).toBe(K_FLOOR);
    expect(SHAPES[T.WALL]!.h).toBe(WALL_H);
  });

  it('builds a real sewer: counts add up, indices stay in range, torches sit on lit walls', () => {
    const level = levelAt(createWorld(7), 1);
    const geom = new LevelGeom(level.map, COLS, ROWS);
    let plain = 0;
    for (let i = 0; i < LENGTH; i++) if (level.map[i] === T.WALL || level.map[i] === T.WALL_DECO) plain++;
    expect(geom.quads.floor).toBe(LENGTH - plain);
    expect(geom.quads.boxes).toBeGreaterThan(50);
    expect(geom.quads.boxes).toBeLessThan(LENGTH * 5);
    for (let i = 0; i < geom.floor.indices; i++) expect(geom.floor.index[i]!).toBeLessThan(geom.floor.verts);
    expect(geom.torches.length).toBeGreaterThan(0);
    for (const cell of geom.torches) {
      expect(SHAPES[level.map[cell]!]!.kind).toBe(K_WALL);
      expect(SHAPES[level.map[cell + WIDTH]!]!.kind).toBe(K_FLOOR);
    }
    // Torches are spaced, and the same level always gets the same ones.
    for (const a of geom.torches) {
      for (const b of geom.torches) {
        if (a >= b) continue;
        const d = Math.max(Math.abs((a % WIDTH) - (b % WIDTH)), Math.abs(Math.trunc(a / WIDTH) - Math.trunc(b / WIDTH)));
        expect(d).toBeGreaterThanOrEqual(TORCH_SPACING);
      }
    }
    expect(pickTorches(level.map)).toEqual(geom.torches);
    expect(CELLS).toBe(LENGTH);
  });
});

describe('how a level reads: walls against floor', () => {
  const room = (): LevelGeom => {
    const carve: Array<[number, number, number]> = [];
    for (let y = 10; y <= 14; y++) for (let x = 10; x <= 14; x++) carve.push([x, y, T.EMPTY]);
    return new LevelGeom(mapOf(carve), COLS, ROWS);
  };
  const cornerColor = (geom: LevelGeom, x: number, z: number, corner: number): number => {
    const v = geom.slot[x + z * WIDTH]! * 4 + corner;
    return geom.floor.color[v * 3 + 1]!;
  };

  it('is 1.5 cells high as the kit says, with a cap chosen by the sides that have floor', () => {
    expect(WALL_H).toBe(1.5);
    expect(SHAPES[T.WALL]!.h).toBe(1.5);
    expect(SHAPES[T.WALL]!.top).toBe(-1);
    expect(SHAPES[T.DOOR]!.lowerH).toBe(1.25);
    expect(SHAPES[T.WALL]!.side).toBe(FACE_WALL);
    expect(SHAPES[T.WALL]!.upper).toBe(FACE_UPPER);
    // The wall north of a lone floor cell has floor to its south (bit 4): its cap is the kit's cap with mask 4, in the sheet's second part.
    const geom = new LevelGeom(mapOf([[20, 20, T.EMPTY]]), COLS, ROWS);
    expect(geom.capMask(20, 19)).toBe(4);
    expect(geom.capMask(21, 20)).toBe(8);
    expect(geom.capMask(19, 20)).toBe(2);
    expect(geom.capMask(20, 21)).toBe(1);
    expect(geom.capMask(19, 19)).toBe(0);
    const cap = new Float32Array(4);
    tileRect(CAP_FIRST + 4, 16, 16, cap);
    const b = geom.boxes;
    let found = false;
    for (let v = 0; v < b.verts; v += 4) {
      if (b.normal[v * 3 + 1] === 1 && b.pos[v * 3 + 1] === WALL_H && b.pos[v * 3] === 20 && b.pos[v * 3 + 2] === 20) {
        // The cap quad of cell (20, 19) lies on z 19..20; its first uv corner is the mask-4 cap's.
        found = found || Math.abs(b.uv[v * 2]! - cap[0]!) < 1e-6;
      }
    }
    expect(found).toBe(true);
    // A wall with no floor beside it is the same cap, darker.
    expect(geom.capMask(19, 19)).toBe(0);
  });

  it('darkens the floor at the foot of a wall: corners by how many walls touch them', () => {
    const geom = room();
    // Cell (12, 12) is in the middle of the room: its corners touch no wall. Cell (10, 12) is on the west wall's edge: its two west corners do.
    for (let k = 0; k < 4; k++) expect(cornerColor(geom, 12, 12, k)).toBeCloseTo(cornerColor(geom, 12, 12, 0), 6);
    const open = cornerColor(geom, 12, 12, 0);
    // Corners 0 and 3 are the west ones (bottom-left, top-left).
    expect(cornerColor(geom, 10, 12, 0)).toBeLessThan(open);
    expect(cornerColor(geom, 10, 12, 3)).toBeLessThan(open);
    expect(cornerColor(geom, 10, 12, 1)).toBeCloseTo(open, 6);
    // A room's own corner (two walls and the one between) is the darkest.
    expect(cornerColor(geom, 10, 10, 3)).toBeLessThan(cornerColor(geom, 10, 12, 3));
  });

  it('darkens a wall face toward its foot, in two parts up to the height of the wall, and keeps the fog read at each vertex', () => {
    const geom = new LevelGeom(mapOf([[20, 20, T.EMPTY]]), COLS, ROWS);
    const b = geom.boxes;
    const south: number[] = [];
    for (let v = 0; v < b.verts; v += 4) if (b.normal[v * 3 + 2] === 1) south.push(v);
    // The wall north of the cell shows its south face to it: the lower cell, then the upper half cell.
    expect(south).toHaveLength(2);
    const [lower, upper] = south as [number, number];
    expect(b.pos[lower * 3 + 1]).toBe(0);
    expect(b.pos[(lower + 2) * 3 + 1]).toBe(1);
    expect(b.pos[upper * 3 + 1]).toBe(1);
    expect(b.pos[(upper + 2) * 3 + 1]).toBe(WALL_H);
    expect(b.color[lower * 3]!).toBeLessThan(b.color[(lower + 2) * 3]!);
    for (const v of south) {
      // The fog is looked up where the vertex stands on the map: x / 48 and z / 48.
      for (let k = 0; k < 4; k++) {
        expect(b.fog[(v + k) * 2]).toBeCloseTo(b.pos[(v + k) * 3]! / WIDTH, 6);
        expect(b.fog[(v + k) * 2 + 1]).toBeCloseTo(b.pos[(v + k) * 3 + 2]! / HEIGHT, 6);
      }
    }
  });

  it('lays the contact shadows of the kit on the floor, one for each side a wall stands on', () => {
    const geom = new LevelGeom(mapOf([[20, 20, T.EMPTY]]), COLS, ROWS);
    const d = geom.decals;
    const seen = new Set<number>();
    const tile = new Float32Array(4);
    for (let v = 0; v < d.verts; v += 4) {
      for (let side = 0; side < 4; side++) {
        tileRect(SHADOW_FIRST + side, 16, 16, tile);
        if (Math.abs(d.uv[v * 2]! - tile[0]!) < 1e-6 && Math.abs(d.uv[v * 2 + 1]! - tile[1]!) < 1e-6) seen.add(side);
      }
      expect(d.pos[v * 3 + 1]).toBeGreaterThan(0);
      expect(d.pos[v * 3 + 1]).toBeLessThan(0.05);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('places up to two shafts of light, in the middle of rooms', () => {
    const level = levelAt(createWorld(7), 1);
    const shafts = pickShafts(level.map);
    expect(shafts.length).toBeLessThanOrEqual(2);
    for (const cell of shafts) for (const d of [0, 1, -1, WIDTH, -WIDTH, WIDTH + 1, -WIDTH - 1]) expect(SHAPES[level.map[cell + d]!]!.kind).toBe(K_FLOOR);
  });
});

describe('the display refresh', () => {
  const feed = (meter: RefreshMeter, period: number, frames: number, jitter = 0): void => {
    let now = 1000;
    for (let i = 0; i < frames; i++) {
      meter.note(now);
      now += period + (i % 7 === 0 ? jitter : 0);
    }
  };

  it('reads 120 Hz, 60 Hz and 90 Hz from the gaps between frames', () => {
    for (const [period, hz] of [[1000 / 120, 120], [1000 / 60, 60], [1000 / 90, 90]] as const) {
      const meter = new RefreshMeter();
      feed(meter, period, 150, period * 0.9);
      expect(meter.hz).toBe(hz);
    }
  });
});

describe('the quality tier and the fall back to 2D', () => {
  const run = (governor: Governor, dt: number, hz: number, seconds: number): string[] => {
    const verdicts: string[] = [];
    for (let t = 0; t < seconds * 1000; t += dt) {
      const v = governor.frame(dt, hz);
      if (v !== 'ok') verdicts.push(v);
    }
    return verdicts;
  };

  it('holds the top tier while frames come at the refresh', () => {
    const g = new Governor();
    expect(run(g, 1000 / 120, 120, 12)).toEqual([]);
    expect(g.tier).toBe(TIERS[0]);
    expect(run(new Governor(), 1000 / 60, 60, 12)).toEqual([]);
  });

  it('steps down a tier when a 120 Hz screen gets 60, and then holds', () => {
    const g = new Governor();
    const verdicts = run(g, 1000 / 60, 120, 20);
    expect(verdicts).toEqual(['demote', 'demote']);
    expect(g.tier.name).toBe('low');
    expect(g.tier.shadowLights).toBe(0);
    expect(g.tier.dpr).toBe(1.5);
    expect(g.fellBack).toBe(false);
  });

  it('asks for the 2D renderer when even the lowest tier cannot play', () => {
    const g = new Governor();
    const verdicts = run(g, 1000 / 20, 60, 30);
    expect(verdicts).toContain('fallback');
    expect(verdicts.filter((v) => v === 'demote')).toHaveLength(2);
    expect(g.fellBack).toBe(true);
    expect(g.frame(16, 60)).toBe('fallback');
  });

  it('does not judge frames while a shader compiles or a floor is built', () => {
    const g = new Governor();
    g.hold(3000);
    expect(run(g, 400 / 3, 60, 2.5)).toEqual([]);
    expect(g.tier.name).toBe('high');
  });

  it('ignores gaps that are not frames (a hidden tab)', () => {
    const g = new Governor();
    for (let i = 0; i < 100; i++) expect(g.frame(5000, 60)).toBe('ok');
  });

  it('turns the switch off when it falls back, and keeps that', () => {
    const kept = new Map<string, string>();
    const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) };
    const beta = new Beta3D(storage);
    expect(beta.on).toBe(false);
    beta.set(true);
    expect(new Beta3D(storage).on).toBe(true);
    const g = new Governor();
    // The game's own reaction (main.ts): on 'fallback' the 3D view is put away and the switch goes off.
    for (let t = 0; t < 30_000; t += 50) if (g.frame(50, 60) === 'fallback') beta.set(false);
    expect(beta.on).toBe(false);
    expect(kept.get('pd-3d')).toBe('off');
    expect(new Beta3D(storage).on).toBe(false);
  });
});

describe('where the 3D view is used', () => {
  it('covers every depth in the look of its region, and never the arena of waves', () => {
    for (let depth = 1; depth <= 26; depth++) expect(covers3D(depth, Math.min(4, Math.floor((depth - 1) / 5)), false)).toBe(true);
    expect(covers3D(2, 0, true)).toBe(false);
    expect(covers3D(12, 2, true)).toBe(false);
  });
});
