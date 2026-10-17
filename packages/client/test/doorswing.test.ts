import { describe, expect, it } from 'vitest';
import { LENGTH, T, WIDTH } from '@pd/core';
import { BUMP_MS, CLOSE_MS, DoorSwing, easeOutBack, OPEN_MS, poseOf, REDUCED_MS, swingAngle, writeLeafMatrix, type Leaf } from '../src/r3d/doorswing';
import { doorLeafBuffers, FRONT_WALL_H, K_WALL, LEAF_REACH, LevelGeom } from '../src/r3d/levelgeom';

const mapOf = (carve: ReadonlyArray<readonly [number, number, number]>): number[] => {
  const map = new Array<number>(LENGTH).fill(T.WALL);
  for (const [x, y, t] of carve) map[x + y * WIDTH] = t;
  return map;
};
const column = (b: { pos: Float32Array; verts: number }, axis: number): number[] => Array.from({ length: b.verts }, (_, i) => b.pos[i * 3 + axis]!);

describe('a door leaf', () => {
  it('is a thin full-height panel in its own frame: the hinge at the origin, 0.18 thick, as tall as the wall, a door tile on both faces', () => {
    const b = doorLeafBuffers(false, 16, 16);
    const ys = column(b, 1);
    const zs = column(b, 2);
    const xs = column(b, 0);
    expect(Math.max(...ys)).toBeCloseTo(1.5, 6);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(0.18, 6);
    expect(Math.max(...xs)).toBeCloseTo(LEAF_REACH, 6);
    // The panel is a cell wide.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 6);
    // Five faces (the foot is not seen); a locked leaf has straps and plates besides.
    expect(b.verts).toBe(5 * 4);
    expect(doorLeafBuffers(true, 16, 16).verts).toBeGreaterThan(b.verts);
  });

  it('leaves no stone round the gap: a closed door is neither a box nor a cap, and the walls beside it are its jambs', () => {
    const map = mapOf([[20, 20, T.EMPTY], [20, 21, T.DOOR], [20, 22, T.EMPTY], [19, 21, T.WALL], [21, 21, T.WALL]]);
    const geom = new LevelGeom(map, 16, 16);
    expect(geom.kinds[20 + 21 * WIDTH]).toBe(K_WALL);
    // The wall west of the gap shows a face toward it (normal +x at x = 20) that reaches the floor.
    const { pos, verts, normal } = geom.boxes;
    let faceToGap = false;
    for (let v = 0; v < verts; v += 4) {
      if (normal[v * 3] === 1 && Math.abs(pos[v * 3]! - 20) < 1e-6 && Math.abs(pos[v * 3 + 2]! - 21) < 1.01 && Math.min(pos[v * 3 + 1]!, pos[(v + 1) * 3 + 1]!) === 0) faceToGap = true;
    }
    expect(faceToGap).toBe(true);
  });
});

describe('where a door hinges and how it turns', () => {
  const everywhere = (): boolean => true;
  const along = (a: number): [number, number] => [Math.cos(a), -Math.sin(a)];

  it('turns a quarter about a hinge at a jamb: in a wall line facing the camera the leaf swings south, into the room', () => {
    const leaf = {} as Leaf;
    poseOf(20 + 21 * WIDTH, true, everywhere, leaf);
    expect(Math.abs(leaf.openA - leaf.closedA)).toBeCloseTo(Math.PI / 2, 6);
    expect(leaf.pz).toBe(21.5);
    // Closed it lies along the wall line (x); open along +z, the room's side.
    const [cx, cz] = along(leaf.closedA);
    expect(Math.abs(cx)).toBeCloseTo(1, 6);
    expect(cz).toBeCloseTo(0, 6);
    const [ox, oz] = along(leaf.openA);
    expect(ox).toBeCloseTo(0, 6);
    expect(oz).toBeCloseTo(1, 6);
  });

  it('hinges at the other jamb on alternate doors, and swings to the same side', () => {
    const a = {} as Leaf;
    const b = {} as Leaf;
    poseOf(20 + 21 * WIDTH, true, everywhere, a);
    poseOf(21 + 21 * WIDTH, true, everywhere, b);
    expect(a.px).not.toBeCloseTo(b.px - 1, 6);
    expect(along(a.openA)[1]).toBeCloseTo(1, 6);
    expect(along(b.openA)[1]).toBeCloseTo(1, 6);
  });

  it('in a wall line running north-south hinges at the north jamb and lies along the passage when open', () => {
    const leaf = {} as Leaf;
    poseOf(20 + 21 * WIDTH, false, (x) => x === 21, leaf);
    expect(leaf.pz).toBeCloseTo(21.09, 6);
    expect(Math.abs(leaf.openA - leaf.closedA)).toBeCloseTo(Math.PI / 2, 6);
    // Open to the east, the only open side: the leaf lies along +x.
    expect(along(leaf.openA)[0]).toBeCloseTo(1, 6);
    // Closed, along z, down the cell.
    expect(along(leaf.closedA)[1]).toBeCloseTo(1, 6);
  });
});

describe('the swing', () => {
  const opening = { from: 0, to: -Math.PI / 2, opening: true, ms: OPEN_MS };

  it('opens in about a quarter of a second, a little past the mark (3 to 4 degrees) and settles on it', () => {
    let worst = 0;
    for (let t = 0; t <= OPEN_MS; t += 2) worst = Math.max(worst, Math.abs(swingAngle(opening, t, false).angle) - Math.PI / 2);
    const over = (worst * 180) / Math.PI;
    expect(over).toBeGreaterThan(2.8);
    expect(over).toBeLessThan(4.2);
    expect(swingAngle(opening, OPEN_MS, false)).toEqual({ angle: -Math.PI / 2, done: true });
    expect(OPEN_MS).toBeGreaterThanOrEqual(220);
    expect(OPEN_MS).toBeLessThanOrEqual(300);
    expect(easeOutBack(1)).toBeCloseTo(1, 12);
  });

  it('closes slowly at first, in 200 ms, meets its frame and gives back about two degrees before it settles', () => {
    const shut = { from: -Math.PI / 2, to: 0, opening: false, ms: CLOSE_MS };
    expect(CLOSE_MS).toBe(200);
    const early = Math.abs(swingAngle(shut, CLOSE_MS * 0.25, false).angle - shut.from);
    const late = Math.abs(swingAngle(shut, CLOSE_MS * 0.9, false).angle - shut.from);
    expect(early).toBeLessThan(late / 8);
    expect(swingAngle(shut, CLOSE_MS, false).angle).toBeCloseTo(0, 9);
    let rebound = 0;
    for (let t = CLOSE_MS; t < CLOSE_MS + BUMP_MS; t += 1) rebound = Math.max(rebound, Math.abs(swingAngle(shut, t, false).angle));
    expect((rebound * 180) / Math.PI).toBeGreaterThan(0.7);
    expect((rebound * 180) / Math.PI).toBeLessThan(2.2);
    expect(swingAngle(shut, CLOSE_MS + BUMP_MS, false).done).toBe(true);
  });

  it('is 100 ms with reduced motion, and never goes past the mark', () => {
    const plain = { from: 0, to: -Math.PI / 2, opening: true, ms: REDUCED_MS };
    for (let t = 0; t <= REDUCED_MS; t += 2) expect(Math.abs(swingAngle(plain, t, true).angle)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9);
    expect(swingAngle(plain, REDUCED_MS, true).done).toBe(true);
  });
});

describe('the doors of a level', () => {
  const terrain = (t: number): number[] => mapOf([[20, 20, T.EMPTY], [20, 21, t], [20, 22, T.EMPTY]]);
  const across = (): boolean => true;
  const passable = (x: number, z: number): boolean => x === 20 && z >= 20 && z <= 22;

  it('swing open when the map opens a door in sight, and snap when it is out of sight', () => {
    const swing = new DoorSwing();
    swing.reset(terrain(T.DOOR), across, passable);
    expect(swing.leaves).toHaveLength(1);
    const leaf = swing.leaves[0]!;
    expect(leaf.angle).toBe(leaf.closedA);
    expect(swing.sync(terrain(T.OPEN_DOOR), () => true, 1000)).toBe(1);
    expect(swing.moving).toBe(1);
    swing.step(1100);
    expect(leaf.angle).not.toBe(leaf.closedA);
    expect(leaf.angle).not.toBe(leaf.openA);
    swing.step(1000 + OPEN_MS + 5);
    expect(leaf.angle).toBe(leaf.openA);
    expect(swing.moving).toBe(0);
    // Shut again out of sight: no swing, the pose is taken.
    expect(swing.sync(terrain(T.DOOR), () => false, 3000)).toBe(0);
    expect(leaf.angle).toBe(leaf.closedA);
    expect(swing.moving).toBe(0);
  });

  it('turn back from where they are if the door is shut while it is still opening', () => {
    const swing = new DoorSwing();
    swing.reset(terrain(T.DOOR), across, passable);
    swing.sync(terrain(T.OPEN_DOOR), () => true, 0);
    swing.step(100);
    const mid = swing.leaves[0]!.angle;
    swing.sync(terrain(T.DOOR), () => true, 100);
    expect(swing.leaves[0]!.from).toBe(mid);
    expect(swing.leaves[0]!.opening).toBe(false);
    expect(swing.moving).toBe(1);
  });

  it('write matrices that turn the leaf about its pin and place the pin, and hide a leaf at scale 0', () => {
    const m = new Float32Array(16);
    writeLeafMatrix(m, 0, 5, 7, Math.PI / 2, 1);
    // The leaf's +x goes to (cos a, 0, -sin a) = (0, 0, -1).
    expect([m[0], m[1], m[2]].map((v) => Math.round(v! * 1e6) / 1e6)).toEqual([0, 0, -1]);
    expect([m[12], m[13], m[14]]).toEqual([5, 0, 7]);
    writeLeafMatrix(m, 0, 5, 7, 1, 0);
    expect(m[0]).toBe(0);
    expect(m[5]).toBe(0);
  });
});

describe('a secret door found, a door burnt, a wall mined', () => {
  const across = (x: number, z: number): boolean => x >= 0 && z >= 0;
  const open = (x: number, z: number): boolean => x === 20 && z >= 20 && z <= 22;
  const topAt = (geom: LevelGeom, x: number, z: number): boolean => {
    const { pos, verts } = geom.boxes;
    for (let v = 0; v < verts; v += 4) {
      const ys = [0, 1, 2, 3].map((k) => pos[(v + k) * 3 + 1]!);
      if (ys.some((y) => Math.abs(y - FRONT_WALL_H) > 1e-6)) continue;
      const xs = [0, 1, 2, 3].map((k) => pos[(v + k) * 3]!);
      const zs = [0, 1, 2, 3].map((k) => pos[(v + k) * 3 + 2]!);
      // (A cut wall's cap is two quads, the stone and the lip: any quad of the cap's height over the cell is the cap.)
      if (Math.min(...xs) === x && Math.max(...xs) === x + 1 && Math.min(...zs) >= z && Math.max(...zs) <= z + 1) return true;
    }
    return false;
  };

  it('has a gap and a leaf on the next frame: the geometry is patched and the doors are collected again', () => {
    const map = mapOf([[20, 20, T.EMPTY], [20, 21, T.SECRET_DOOR], [20, 22, T.EMPTY]]);
    const geom = new LevelGeom(map, 16, 16);
    const swing = new DoorSwing();
    swing.reset(geom.terrain, across, open);
    // Hidden, it is a wall: a stone cap, no leaf.
    expect(topAt(geom, 20, 21)).toBe(true);
    expect(swing.leaves).toHaveLength(0);
    // The search finds it (core turns it into a door).
    map[20 + 21 * WIDTH] = T.DOOR;
    expect(geom.patch(map)).toBe('solids');
    expect(topAt(geom, 20, 21)).toBe(false);
    expect(geom.kinds[20 + 21 * WIDTH]).toBe(K_WALL);
    expect(swing.refresh(geom.terrain, across, open)).toBe(true);
    expect(swing.leaves).toHaveLength(1);
    const leaf = swing.leaves[0]!;
    expect(leaf.cell).toBe(20 + 21 * WIDTH);
    expect(leaf.angle).toBe(leaf.closedA);
    // A second look changes nothing, and keeps the leaf as it is.
    expect(swing.refresh(geom.terrain, across, open)).toBe(false);
    expect(swing.leaves[0]).toBe(leaf);
  });

  it('keeps a swing going when the doors are collected again, and takes a burnt door away', () => {
    const map = mapOf([[20, 20, T.EMPTY], [20, 21, T.DOOR], [20, 22, T.EMPTY]]);
    const geom = new LevelGeom(map, 16, 16);
    const swing = new DoorSwing();
    swing.reset(geom.terrain, across, open);
    map[20 + 21 * WIDTH] = T.OPEN_DOOR;
    geom.patch(map);
    swing.sync(geom.terrain, () => true, 0);
    swing.step(80);
    const leaf = swing.leaves[0]!;
    expect(leaf.moving).toBe(true);
    expect(swing.refresh(geom.terrain, across, open)).toBe(false);
    expect(swing.leaves[0]).toBe(leaf);
    expect(swing.moving).toBe(1);
    // The door burns down to embers: no door, no leaf.
    map[20 + 21 * WIDTH] = T.EMBERS;
    geom.patch(map);
    expect(swing.refresh(geom.terrain, across, open)).toBe(true);
    expect(swing.leaves).toHaveLength(0);
    expect(swing.moving).toBe(0);
  });
});
