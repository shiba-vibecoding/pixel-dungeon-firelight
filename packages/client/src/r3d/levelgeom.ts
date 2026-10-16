/*
 * A level as geometry, with no Three.js and no DOM, so it can be counted and tested: typed arrays a renderer only has to upload.
 *
 *   floor  - one quad per cell that is not plain wall (a door may open, a barricade burn), textured from the region's tile
 *            sheet with the tile of its terrain. Patched in place when a cell's tile changes (grass trampled, a trap found).
 *   boxes  - walls, closed doors, shelves and statues as boxes with height: only the faces that can be seen (or cast a shadow)
 *            and only for walls beside open ground. One merged buffer; rewritten, in the same arrays, when a box appears
 *            or goes (a door opens).
 *   water  - a quad under every water cell, for the drifting water texture.
 *
 * Every vertex carries where the fog of war is looked up (`fog`): a floor corner looks up its own corner, so the darkness
 * fades from cell to cell; a box looks up the middle of its cell, so a wall is lit or dark as a whole.
 */
import { F, HEIGHT, LENGTH, T, terrainFlags, WIDTH } from '@pd/core';
import { WALL_H } from './project';

export const K_FLOOR = 0;
/** A tall box: a wall, a door, a shelf. */
export const K_WALL = 1;
/** A low box: a statue, a well. */
export const K_LOW = 2;
export const K_WATER = 3;
export const K_CHASM = 4;

export interface Shape {
  kind: number;
  /** Height of the box, in tiles. */
  h: number;
  /** The tile on the sides, and on the top. */
  side: number;
  top: number;
  /** The top's darkening (wall tops are the wall's art seen from above, a little dimmer). */
  tint: number;
}

/** The tile whose art the tops of walls and doors take. */
const WALL_TOP = T.WALL;
/** Where a chasm's floor lies, in tiles. */
export const CHASM_DEPTH = -0.6;
export const WATER_DEPTH = -0.04;

const WALLS: ReadonlySet<number> = new Set([T.WALL, T.WALL_DECO, T.SECRET_DOOR, T.DOOR, T.LOCKED_DOOR]);

/** What each terrain is as a solid, worked out once from its flags. */
export const SHAPES: readonly Shape[] = (() => {
  const shapes: Shape[] = [];
  for (let t = 0; t < 256; t++) {
    const flags = terrainFlags[t] ?? 0;
    let shape: Shape = { kind: K_FLOOR, h: 0, side: t, top: t, tint: 1 };
    if (t >= T.WATER_TILES && t <= T.WATER) shape = { kind: K_WATER, h: WATER_DEPTH, side: t, top: t, tint: 1 };
    else if (flags & F.PIT) shape = { kind: K_CHASM, h: CHASM_DEPTH, side: t, top: t, tint: 1 };
    else if (flags & F.SOLID && flags & F.LOS_BLOCKING) {
      shape = { kind: K_WALL, h: WALL_H, side: t, top: WALLS.has(t) ? WALL_TOP : t, tint: WALLS.has(t) ? 0.62 : 1 };
    } else if (flags & F.SOLID) shape = { kind: K_LOW, h: 0.55, side: t, top: t, tint: 1 };
    else if (t === T.WELL) shape = { kind: K_LOW, h: 0.4, side: t, top: t, tint: 1 };
    shapes.push(shape);
  }
  return shapes;
})();

/** Plain wall: no floor under it, and nothing ever changes it but a rebuild. */
const isPlainWall = (terrain: number): boolean => terrain === T.WALL || terrain === T.WALL_DECO;

/** The UV rectangle of a tile on a sheet `cols` by `rows` tiles (flipped textures: v runs up), a hair inside so no neighbour bleeds in. */
export function tileRect(tile: number, cols: number, rows: number, out: Float32Array, at = 0): void {
  const eu = 0.02 / (cols * 16);
  const ev = 0.02 / (rows * 16);
  const col = tile % cols;
  const row = Math.trunc(tile / cols);
  out[at] = col / cols + eu;
  out[at + 1] = 1 - (row + 1) / rows + ev;
  out[at + 2] = (col + 1) / cols - eu;
  out[at + 3] = 1 - row / rows - ev;
}

/** One merged mesh's worth of vertex data, in the order the renderer uploads it. */
export interface Buffers {
  pos: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  color: Float32Array;
  /** Where the fog of war is read: uv in the fog texture. */
  fog: Float32Array;
  index: Uint16Array;
  /** How many vertices and indices are in use now. */
  verts: number;
  indices: number;
}

function makeBuffers(vertexCapacity: number, indexCapacity: number): Buffers {
  return {
    pos: new Float32Array(vertexCapacity * 3),
    normal: new Float32Array(vertexCapacity * 3),
    uv: new Float32Array(vertexCapacity * 2),
    color: new Float32Array(vertexCapacity * 3),
    fog: new Float32Array(vertexCapacity * 2),
    index: new Uint16Array(indexCapacity),
    verts: 0,
    indices: 0,
  };
}

const rect = new Float32Array(4);
const corners = new Float32Array(12);
const fogs = new Float32Array(8);

/** Writes one quad; corners run bottom-left, bottom-right, top-right, top-left of the face, counter-clockwise seen from the normal. */
function quad(
  b: Buffers, c: Float32Array, nx: number, ny: number, nz: number, shade: number,
  u0: number, v0: number, u1: number, v1: number, fog: Float32Array,
): void {
  const v = b.verts;
  for (let k = 0; k < 4; k++) {
    const p = (v + k) * 3;
    b.pos[p] = c[k * 3]!;
    b.pos[p + 1] = c[k * 3 + 1]!;
    b.pos[p + 2] = c[k * 3 + 2]!;
    b.normal[p] = nx;
    b.normal[p + 1] = ny;
    b.normal[p + 2] = nz;
    b.color[p] = b.color[p + 1] = b.color[p + 2] = shade;
    b.fog[(v + k) * 2] = fog[k * 2]!;
    b.fog[(v + k) * 2 + 1] = fog[k * 2 + 1]!;
  }
  const t = v * 2;
  b.uv[t] = u0; b.uv[t + 1] = v0;
  b.uv[t + 2] = u1; b.uv[t + 3] = v0;
  b.uv[t + 4] = u1; b.uv[t + 5] = v1;
  b.uv[t + 6] = u0; b.uv[t + 7] = v1;
  const i = b.indices;
  b.index[i] = v; b.index[i + 1] = v + 1; b.index[i + 2] = v + 2;
  b.index[i + 3] = v; b.index[i + 4] = v + 2; b.index[i + 5] = v + 3;
  b.verts += 4;
  b.indices += 6;
}

const set12 = (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number): void => {
  corners[0] = a; corners[1] = b; corners[2] = c; corners[3] = d; corners[4] = e; corners[5] = f;
  corners[6] = g; corners[7] = h; corners[8] = i; corners[9] = j; corners[10] = k; corners[11] = l;
};

const fogCentre = (cell: number): void => {
  const u = ((cell % WIDTH) + 0.5) / WIDTH;
  const v = (Math.trunc(cell / WIDTH) + 0.5) / HEIGHT;
  for (let k = 0; k < 4; k++) {
    fogs[k * 2] = u;
    fogs[k * 2 + 1] = v;
  }
};

const fogCorners = (x: number, z: number): void => {
  fogs[0] = x / WIDTH; fogs[1] = (z + 1) / HEIGHT;
  fogs[2] = (x + 1) / WIDTH; fogs[3] = (z + 1) / HEIGHT;
  fogs[4] = (x + 1) / WIDTH; fogs[5] = z / HEIGHT;
  fogs[6] = x / WIDTH; fogs[7] = z / HEIGHT;
};

/** Wall cells within reach of open ground: the only ones whose tops and faces can be seen. */
function relevant(kinds: Uint8Array, cell: number): boolean {
  const x = cell % WIDTH;
  const y = Math.trunc(cell / WIDTH);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT) continue;
      if (kinds[nx + ny * WIDTH] !== K_WALL) return true;
    }
  }
  return false;
}

/**
 * Wall torches: walls with open floor to their south (the face the camera sees), now and then, never closer than
 * `TORCH_SPACING` cells to one already chosen. The same level always gets the same torches.
 */
export const TORCH_SPACING = 6;
export const MAX_TORCHES = 24;
export function pickTorches(map: ArrayLike<number>): number[] {
  const picked: number[] = [];
  for (let cell = WIDTH; cell < LENGTH - WIDTH && picked.length < MAX_TORCHES; cell++) {
    const x = cell % WIDTH;
    if (x < 1 || x >= WIDTH - 1) continue;
    const terrain = map[cell]!;
    if (terrain !== T.WALL && terrain !== T.WALL_DECO) continue;
    const south = map[cell + WIDTH]!;
    if (SHAPES[south]!.kind !== K_FLOOR || !((terrainFlags[south] ?? 0) & F.PASSABLE)) continue;
    if (SHAPES[map[cell - 1]!]!.kind !== K_WALL || SHAPES[map[cell + 1]!]!.kind !== K_WALL) continue;
    if ((Math.imul(cell, 2654435761) >>> 20) % 7 !== 0) continue;
    const cy = Math.trunc(cell / WIDTH);
    if (picked.some((other) => Math.max(Math.abs((other % WIDTH) - x), Math.abs(Math.trunc(other / WIDTH) - cy)) < TORCH_SPACING)) continue;
    picked.push(cell);
  }
  return picked;
}

const SIDES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 1], // south: what the camera sees
  [1, 0, 0.82], // east
  [-1, 0, 0.82], // west
  [0, -1, 0.72], // north
];

export class LevelGeom {
  /** The terrain these buffers were made from. */
  readonly terrain = new Uint8Array(LENGTH);
  private readonly kinds = new Uint8Array(LENGTH);
  /** The floor quad of each cell, or -1: plain walls have none. */
  readonly slot = new Int32Array(LENGTH).fill(-1);
  floor!: Buffers;
  boxes!: Buffers;
  water!: Buffers;
  torches: number[] = [];
  /** Bumped when the floor's uvs change, and when a box buffer is rewritten; a renderer uploads what is newer than it has. */
  floorVersion = 0;
  boxVersion = 0;
  /** The box or water buffers were made bigger (their arrays are new): the renderer makes new geometry. */
  grew = false;
  /** Counts for tests and the perf overlay. */
  quads = { floor: 0, boxes: 0, water: 0 };

  constructor(map: ArrayLike<number>, readonly cols: number, readonly rows: number) {
    this.build(map);
  }

  private build(map: ArrayLike<number>): void {
    for (let i = 0; i < LENGTH; i++) {
      this.terrain[i] = map[i]!;
      this.kinds[i] = SHAPES[this.terrain[i]!]!.kind;
    }
    this.slot.fill(-1);
    let quads = 0;
    for (let i = 0; i < LENGTH; i++) if (!isPlainWall(this.terrain[i]!)) this.slot[i] = quads++;
    this.floor = makeBuffers(quads * 4, quads * 6);
    this.quads.floor = quads;
    for (let i = 0; i < LENGTH; i++) if (this.slot[i]! >= 0) this.writeFloor(i);
    this.floor.verts = quads * 4;
    this.floor.indices = quads * 6;
    for (let q = 0; q < quads; q++) {
      const v = q * 4;
      const i = q * 6;
      const idx = this.floor.index;
      idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2;
      idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3;
    }
    this.torches = pickTorches(map);
    this.boxes = makeBuffers(8, 12);
    this.water = makeBuffers(8, 12);
    this.rebuildSolids();
    this.floorVersion++;
    this.grew = true;
  }

  /** The floor quad of a cell: flat at its depth, the cell's tile, fog read at its corners. */
  private writeFloor(cell: number): void {
    const b = this.floor;
    const slot = this.slot[cell]!;
    const x = cell % WIDTH;
    const z = Math.trunc(cell / WIDTH);
    const shape = SHAPES[this.terrain[cell]!]!;
    const y = shape.kind === K_CHASM ? CHASM_DEPTH : 0;
    // A box on the cell hides its floor; the tile there is the plain floor, for the day it opens.
    const tile = shape.kind === K_WALL || shape.kind === K_LOW ? T.EMPTY : shape.kind === K_CHASM ? T.CHASM : this.terrain[cell]!;
    tileRect(tile, this.cols, this.rows, rect);
    set12(x, y, z + 1, x + 1, y, z + 1, x + 1, y, z, x, y, z);
    fogCorners(x, z);
    const v = slot * 4;
    for (let k = 0; k < 4; k++) {
      const p = (v + k) * 3;
      b.pos[p] = corners[k * 3]!;
      b.pos[p + 1] = corners[k * 3 + 1]!;
      b.pos[p + 2] = corners[k * 3 + 2]!;
      b.normal[p] = 0;
      b.normal[p + 1] = 1;
      b.normal[p + 2] = 0;
      b.color[p] = b.color[p + 1] = b.color[p + 2] = 1;
      b.fog[(v + k) * 2] = fogs[k * 2]!;
      b.fog[(v + k) * 2 + 1] = fogs[k * 2 + 1]!;
    }
    const t = v * 2;
    b.uv[t] = rect[0]!; b.uv[t + 1] = rect[1]!;
    b.uv[t + 2] = rect[2]!; b.uv[t + 3] = rect[1]!;
    b.uv[t + 4] = rect[2]!; b.uv[t + 5] = rect[3]!;
    b.uv[t + 6] = rect[0]!; b.uv[t + 7] = rect[3]!;
  }

  /** (Re)writes the boxes and the water: the faces of every solid that can be seen, into the same arrays if they are big enough. */
  private rebuildSolids(): void {
    let boxFaces = 0;
    let waterQuads = 0;
    for (let i = 0; i < LENGTH; i++) {
      const kind = this.kinds[i];
      if (kind === K_WATER) waterQuads++;
      else if ((kind === K_WALL && relevant(this.kinds, i)) || kind === K_LOW) boxFaces += 5;
    }
    if (boxFaces * 4 > this.boxes.pos.length / 3) {
      this.boxes = makeBuffers(boxFaces * 4, boxFaces * 6);
      this.grew = true;
    }
    if (waterQuads * 4 > this.water.pos.length / 3) {
      this.water = makeBuffers(waterQuads * 4, waterQuads * 6);
      this.grew = true;
    }
    this.boxes.verts = this.boxes.indices = 0;
    this.water.verts = this.water.indices = 0;
    for (let i = 0; i < LENGTH; i++) {
      const kind = this.kinds[i];
      if (kind === K_WATER) this.writeWater(i);
      else if ((kind === K_WALL && relevant(this.kinds, i)) || kind === K_LOW) this.writeBox(i);
    }
    this.quads.boxes = this.boxes.verts / 4;
    this.quads.water = this.water.verts / 4;
    this.boxVersion++;
  }

  private writeWater(cell: number): void {
    const x = cell % WIDTH;
    const z = Math.trunc(cell / WIDTH);
    set12(x, WATER_DEPTH, z + 1, x + 1, WATER_DEPTH, z + 1, x + 1, WATER_DEPTH, z, x, WATER_DEPTH, z);
    fogCorners(x, z);
    // The water texture is 32 art pixels across: two tiles.
    quad(this.water, corners, 0, 1, 0, 1, x / 2, (z + 1) / 2, (x + 1) / 2, z / 2, fogs);
  }

  private writeBox(cell: number): void {
    const b = this.boxes;
    const x = cell % WIDTH;
    const z = Math.trunc(cell / WIDTH);
    const shape = SHAPES[this.terrain[cell]!]!;
    const h = shape.h;
    fogCentre(cell);
    tileRect(shape.top, this.cols, this.rows, rect);
    set12(x, h, z + 1, x + 1, h, z + 1, x + 1, h, z, x, h, z);
    quad(b, corners, 0, 1, 0, shape.tint, rect[0]!, rect[1]!, rect[2]!, rect[3]!, fogs);
    tileRect(shape.side, this.cols, this.rows, rect);
    for (const [dx, dz, shade] of SIDES) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= WIDTH || nz >= HEIGHT) continue;
      const low = SHAPES[this.terrain[nx + nz * WIDTH]!]!.h;
      if (low >= h - 0.001) continue;
      const bottom = Math.min(0, low);
      if (dz === 1) set12(x, bottom, z + 1, x + 1, bottom, z + 1, x + 1, h, z + 1, x, h, z + 1);
      else if (dz === -1) set12(x + 1, bottom, z, x, bottom, z, x, h, z, x + 1, h, z);
      else if (dx === 1) set12(x + 1, bottom, z + 1, x + 1, bottom, z, x + 1, h, z, x + 1, h, z + 1);
      else set12(x, bottom, z, x, bottom, z + 1, x, h, z + 1, x, h, z);
      quad(b, corners, dx, 0, dz, shade, rect[0]!, rect[1]!, rect[2]!, rect[3]!, fogs);
    }
  }

  /**
   * Brings the geometry up to date with the map. 'same': nothing changed; 'patched': only tiles of floor cells changed (patched in
   * place); 'solids': boxes or water changed too (a door opened) and were rewritten; 'rebuilt': plain walls came or went, all new.
   */
  patch(map: ArrayLike<number>): 'same' | 'patched' | 'solids' | 'rebuilt' {
    let tiles = false;
    let solids = false;
    for (let i = 0; i < LENGTH; i++) {
      const next = map[i]!;
      const prev = this.terrain[i]!;
      if (next === prev) continue;
      if (isPlainWall(next) !== isPlainWall(prev)) {
        this.build(map);
        return 'rebuilt';
      }
      const was = SHAPES[prev]!;
      const now = SHAPES[next]!;
      this.terrain[i] = next;
      this.kinds[i] = now.kind;
      if (this.slot[i]! >= 0) this.writeFloor(i);
      tiles = true;
      if (was.kind !== now.kind || was.side !== now.side || was.top !== now.top || was.h !== now.h || now.kind === K_WATER) solids = true;
    }
    if (solids) this.rebuildSolids();
    if (tiles) this.floorVersion++;
    return solids ? 'solids' : tiles ? 'patched' : 'same';
  }
}
