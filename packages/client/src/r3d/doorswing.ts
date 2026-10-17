/*
 * How the doors' leaves swing, with no Three.js and no DOM so it can be tested: where each leaf's hinge pin is, which way it turns, how
 * far, and the angle it is at over time. The renderer (world3d.ts) stands one leaf mesh at each door and gives it the matrix this writes.
 *
 * A door is a gap in the wall line with a thin leaf in it. Closed, the leaf lies in the wall line, centred on it, across the gap; open,
 * it has swung a quarter turn about its hinge, into the room, to lie against the jamb along the room-side edge of the doorway (the
 * walls beside the gap are the jambs). Opening takes about 240 ms, quick at first and a little past the mark (3 to 4 degrees) before it
 * settles; closing takes 200 ms, slow at first, ending in a tiny bump (the leaf meets its frame and gives back two degrees). With
 * reduced motion the swing is 100 ms, plain. A door out of sight just takes its pose. Nothing here allocates once a level is set.
 */
import { LENGTH, T, WIDTH } from '@pd/core';

export const OPEN_MS = 240;
export const CLOSE_MS = 200;
/** After the leaf has met its frame it gives back a little and settles. */
export const BUMP_MS = 70;
export const REDUCED_MS = 100;
/** The overshoot of an opening (degrees, near enough), and the bump of a closing. */
const OVERSHOOT = 1.05;
const BUMP_RAD = (2 * Math.PI) / 180;

/** Ease-out with a small overshoot: 1 at the end, past 1 by about 4% on the way (3.5 degrees of a quarter turn). */
export const easeOutBack = (t: number): number => {
  const u = t - 1;
  return 1 + (OVERSHOOT + 1) * u * u * u + OVERSHOOT * u * u;
};
export const easeInQuad = (t: number): number => t * t;
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t);

/** One door's leaf. */
export interface Leaf {
  cell: number;
  /** The leaf is the locked kind (iron straps and a lock): until it is unlocked. */
  locked: boolean;
  /** The hinge pin on the floor, cells. */
  px: number;
  pz: number;
  /** The leaf's turn about the vertical axis (radians, three's rotation about y) closed and open. */
  closedA: number;
  openA: number;
  /** The angle now, and where the swing began from and is going to. */
  angle: number;
  from: number;
  to: number;
  start: number;
  /** The swing's length in ms and whether it is an opening; `moving` while it lasts. */
  ms: number;
  opening: boolean;
  moving: boolean;
  /** The door is open (or opening). */
  open: boolean;
}

const HALF = Math.PI / 2;
const HINGE = 0.125;

/**
 * Where a door's leaf hinges and which way it turns. `passable(x, z)` says whether a cell beside is open ground. In a wall line that
 * faces the camera (floor north or south of the door) the leaf hinges at the west or east jamb (alternating) and swings south into the
 * room if it can, else north; in a wall line running north-south it hinges at the north jamb and swings east or west, to the open side.
 */
export function poseOf(cell: number, across: boolean, passable: (x: number, z: number) => boolean, out: Pick<Leaf, 'px' | 'pz' | 'closedA' | 'openA'>): void {
  const x = cell % WIDTH;
  const z = Math.trunc(cell / WIDTH);
  if (across) {
    const west = ((x + z) & 1) === 0;
    const south = passable(x, z + 1) || !passable(x, z - 1);
    out.pz = z + 0.5;
    if (west) {
      out.px = x + HINGE;
      out.closedA = 0;
      out.openA = south ? -HALF : HALF;
    } else {
      out.px = x + 1 - HINGE;
      out.closedA = Math.PI;
      out.openA = south ? Math.PI + HALF : HALF;
    }
  } else {
    const east = passable(x + 1, z) && (!passable(x - 1, z) || ((x + z) & 1) === 0);
    out.px = x + 0.5;
    out.pz = z + HINGE;
    out.closedA = -HALF;
    out.openA = east ? 0 : -Math.PI;
  }
}

/** The leaf's angle `ms` into a swing: from `from` to `to`, or `to` and moving false when it is over. */
export function swingAngle(leaf: Pick<Leaf, 'from' | 'to' | 'opening' | 'ms'>, elapsed: number, reduced: boolean): { angle: number; done: boolean } {
  const total = reduced ? leaf.ms : leaf.opening ? leaf.ms : leaf.ms + BUMP_MS;
  if (elapsed >= total) return { angle: leaf.to, done: true };
  if (elapsed < 0) return { angle: leaf.from, done: false };
  const span = leaf.to - leaf.from;
  if (reduced) return { angle: leaf.from + span * easeOutQuad(elapsed / leaf.ms), done: false };
  if (leaf.opening) return { angle: leaf.from + span * easeOutBack(elapsed / leaf.ms), done: false };
  if (elapsed < leaf.ms) return { angle: leaf.from + span * easeInQuad(elapsed / leaf.ms), done: false };
  // Met the frame: a small rebound toward open, settling.
  const k = (elapsed - leaf.ms) / BUMP_MS;
  return { angle: leaf.to - Math.sign(span) * BUMP_RAD * Math.sin(Math.PI * k) * (1 - k), done: false };
}

const isDoor = (terrain: number): boolean => terrain === T.DOOR || terrain === T.LOCKED_DOOR || terrain === T.OPEN_DOOR || terrain === T.BARRICADE;

/** Writes a leaf's instance matrix (column-major, 16 floats at `at`): the hinge pin placed, turned by `angle`; `scale` 0 hides it, `tall` (a share of the height) cuts the leaf down with the walls beside it. */
export function writeLeafMatrix(m: Float32Array, at: number, px: number, pz: number, angle: number, scale: number, tall = 1): void {
  const c = Math.cos(angle) * scale;
  const s = Math.sin(angle) * scale;
  m[at] = c; m[at + 1] = 0; m[at + 2] = -s; m[at + 3] = 0;
  m[at + 4] = 0; m[at + 5] = scale * tall; m[at + 6] = 0; m[at + 7] = 0;
  m[at + 8] = s; m[at + 9] = 0; m[at + 10] = c; m[at + 11] = 0;
  m[at + 12] = px; m[at + 13] = 0; m[at + 14] = pz; m[at + 15] = 1;
}

/** All the doors of a level and their swings. */
export class DoorSwing {
  readonly leaves: Leaf[] = [];
  /** Which leaf is at each cell, or -1. */
  private readonly at = new Int32Array(LENGTH).fill(-1);
  /** Leaves swinging now. */
  moving = 0;
  /** Something changed that the meshes do not show yet. */
  dirty = true;
  reduced = false;

  /** (Re)makes the leaves for a level's terrain, each at the pose of its door's state, none moving. */
  reset(terrain: ArrayLike<number>, across: (x: number, z: number) => boolean, passable: (x: number, z: number) => boolean): void {
    this.leaves.length = 0;
    this.at.fill(-1);
    this.moving = 0;
    for (let cell = 0; cell < LENGTH; cell++) {
      const t = terrain[cell]!;
      if (!isDoor(t)) continue;
      const x = cell % WIDTH;
      const z = Math.trunc(cell / WIDTH);
      const leaf: Leaf = {
        cell, locked: t === T.LOCKED_DOOR, px: 0, pz: 0, closedA: 0, openA: 0, angle: 0, from: 0, to: 0, start: 0, ms: 0,
        opening: false, moving: false, open: t === T.OPEN_DOOR,
      };
      poseOf(cell, across(x, z), passable, leaf);
      leaf.angle = leaf.from = leaf.to = leaf.open ? leaf.openA : leaf.closedA;
      this.at[cell] = this.leaves.length;
      this.leaves.push(leaf);
    }
    this.dirty = true;
  }

  /**
   * The map has changed: a door that is open now and was closed swings open, one that is closed and was open swings shut (from where
   * its leaf is, if it was still swinging). A door out of sight (`seen` false) snaps. Returns how many began a swing in sight.
   */
  sync(terrain: ArrayLike<number>, seen: (cell: number) => boolean, now: number): number {
    let began = 0;
    for (const leaf of this.leaves) {
      const t = terrain[leaf.cell]!;
      const wantOpen = t === T.OPEN_DOOR;
      const locked = t === T.LOCKED_DOOR;
      if (leaf.locked !== locked) {
        leaf.locked = locked;
        this.dirty = true;
      }
      if (wantOpen === leaf.open) continue;
      leaf.open = wantOpen;
      const target = wantOpen ? leaf.openA : leaf.closedA;
      this.dirty = true;
      if (!seen(leaf.cell)) {
        if (leaf.moving) this.moving--;
        leaf.moving = false;
        leaf.angle = leaf.from = leaf.to = target;
        continue;
      }
      if (!leaf.moving) this.moving++;
      leaf.moving = true;
      leaf.opening = wantOpen;
      leaf.from = leaf.angle;
      leaf.to = target;
      leaf.start = now;
      leaf.ms = this.reduced ? REDUCED_MS : wantOpen ? OPEN_MS : CLOSE_MS;
      began++;
    }
    return began;
  }

  /** Brings the swinging leaves to the angle of `now`; true if any leaf's angle changed (the matrices are to be uploaded). */
  step(now: number): boolean {
    let changed = this.dirty;
    this.dirty = false;
    if (this.moving === 0) return changed;
    for (const leaf of this.leaves) {
      if (!leaf.moving) continue;
      const r = swingAngle(leaf, now - leaf.start, this.reduced);
      leaf.angle = r.angle;
      changed = true;
      if (r.done) {
        leaf.moving = false;
        this.moving--;
      }
    }
    return changed;
  }

  /**
   * The terrain has changed in a way that may add or take away doors (a secret door found, a door burnt to embers, a wall mined): the
   * leaves are collected again. A leaf that is still at a door keeps its state and its swing; a new one stands closed (or open, if the
   * cell is an open door); one whose door is gone is dropped; every pose is worked out again, as the cells beside may have changed.
   * Returns whether the set of leaves changed (the meshes are to be made again).
   */
  refresh(terrain: ArrayLike<number>, across: (x: number, z: number) => boolean, passable: (x: number, z: number) => boolean): boolean {
    const before = this.leaves.slice();
    const kept = new Map<number, Leaf>();
    for (const leaf of before) kept.set(leaf.cell, leaf);
    this.leaves.length = 0;
    this.at.fill(-1);
    this.moving = 0;
    let changed = false;
    for (let cell = 0; cell < LENGTH; cell++) {
      const t = terrain[cell]!;
      if (!isDoor(t)) continue;
      const x = cell % WIDTH;
      const z = Math.trunc(cell / WIDTH);
      let leaf = kept.get(cell);
      if (!leaf) {
        changed = true;
        leaf = {
          cell, locked: t === T.LOCKED_DOOR, px: 0, pz: 0, closedA: 0, openA: 0, angle: 0, from: 0, to: 0, start: 0, ms: 0,
          opening: false, moving: false, open: t === T.OPEN_DOOR,
        };
        poseOf(cell, across(x, z), passable, leaf);
        leaf.angle = leaf.from = leaf.to = leaf.open ? leaf.openA : leaf.closedA;
      } else {
        const was = { closed: leaf.closedA, open: leaf.openA };
        poseOf(cell, across(x, z), passable, leaf);
        if (was.closed !== leaf.closedA || was.open !== leaf.openA) {
          // The doorway's surroundings changed: the pose is taken, not swung to.
          leaf.moving = false;
          leaf.angle = leaf.from = leaf.to = leaf.open ? leaf.openA : leaf.closedA;
        }
      }
      if (leaf.moving) this.moving++;
      this.at[cell] = this.leaves.length;
      this.leaves.push(leaf);
    }
    if (this.leaves.length !== before.length) changed = true;
    this.dirty = true;
    return changed;
  }

  leafAt(cell: number): Leaf | undefined {
    const i = this.at[cell]!;
    return i < 0 ? undefined : this.leaves[i];
  }
}
