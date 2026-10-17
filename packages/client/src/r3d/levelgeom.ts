/*
 * A level as geometry, with no Three.js and no DOM, so it can be counted and tested: typed arrays a renderer only has to upload.
 * Built from the world kit (heights in cells, the wall kit's tiles): all of it reads one atlas of 16 x 16 tiles (the region's own
 * eight rows, then the walls' two: assets3d.ts).
 *
 *   floor   - one quad per cell that is not plain wall (a door may open, a barricade burn), the tile of its terrain, darkened at
 *             the corners the walls touch. Patched in place when a cell's tile changes (grass trampled, a trap found).
 *   boxes   - walls and closed doors 1.5 cells high (a wall that has floor to its north and none to its south is cut down to `kit.cut`: the
 *             camera sees its back, which hid the floor behind it) (a cap chosen by which sides have floor, a face of a cell and a half, the
 *             door's leaf), statues, shelves and wells as lower blocks, and the edges of chasms that fall away three cells. Only
 *             what can be seen or cast a shadow, and only beside open ground. Rewritten, into the same arrays, when a box
 *             appears or goes (a door opens).
 *   doors   - closed and locked doors are gaps in the wall line (no box, no cap: the walls beside are the jambs, their faces and caps end
 *             at the gap); a door's leaf is not in these buffers but a small mesh of its own that swings (doorLeafBuffers, doorswing.ts).
 *   steps   - the stairs, in `boxes`: the entrance's three steps rise toward the north and the exit's three steps go down into the floor
 *             (the kit's stairs_up and stairs_down), the region's stair tile on the treads, the last of the way down the darkest.
 *   water   - a quad under every water cell, for the drifting water texture.
 *   decals  - the kit's contact shadows on the floor along the foot of every wall.
 *
 * Every vertex carries where the fog of war is looked up (`fog`: its own place on the map), so the darkness fades across a face
 * and from cell to cell.
 */
import { F, HEIGHT, LENGTH, T, terrainFlags, WIDTH } from '@pd/core';
import { DOOR_IRON, DOOR_LEAF, DOOR_LEAF_LOCK, DOOR_LOCK_H, DOOR_TOP_H } from './doorart';
import { PITCH } from './project';
import { CAP_FIRST, EDGE_LIP, EDGE_ROCK, FACE_DECO, FACE_UPPER, FACE_WALL, SHADOW_FIRST } from './tilemap';

export const K_FLOOR = 0;
/** A tall box: a wall, a door. */
export const K_WALL = 1;
/** A low block: a statue, a shelf, a well, a barricade. */
export const K_LOW = 2;
export const K_WATER = 3;
export const K_CHASM = 4;

/** The heights of the kit (hd2d-kit.json materials), in cells. */
export interface GeomKit {
  wall: number;
  door: number;
  statue: number;
  bookshelf: number;
  barricade: number;
  well: number;
  chasm: number;
  water: number;
  /** How far the exit's steps go down (negative) and the entrance's rise, in cells. */
  stairsDown: number;
  stairsUp: number;
  /** How high the stone base of a prop stands (a statue, a bookshelf, a barricade: the figure itself is a card over it, world3d.ts), cells. */
  base: number;
  /** How high a cut-away wall stands (see `LevelGeom.isCut`), cells. */
  cut: number;
}

/**
 * How high a front wall stands (levelgeom.ts isCut): every wall with floor to its north, whose back the camera sees. 0.95 still hid about a third
 * of a cell of the floor behind it (items on the bottom row of a room were half under it); 0.5 hides about 0.18, and a flat item or a figure's
 * feet are whole. One number to tune.
 */
export const FRONT_WALL_H = 0.5;
/** The brightness of the lip along a cut wall's cap. */
const CUT_LIP = 1.35;

/** The stone base a statue, a bookshelf or a barricade stands on, cells: low, so that the figure (a card of its tile) is what is seen. */
export const PROP_BASE = 0.1;

export const DEFAULT_GEOM: GeomKit = { base: PROP_BASE, cut: FRONT_WALL_H, wall: 1.5, door: 1.25, statue: 1.2, bookshelf: 1.4, barricade: 1.0, well: 0.4, chasm: -3, water: -0.06, stairsDown: -0.5, stairsUp: 0.5 };

/** How high a wall's lower face goes: the kit's face is a cell, and the rest of the wall's height is the upper half cell. */
const FACE_CELL = 1;

export interface Shape {
  kind: number;
  /** Height of the box (negative: how far down the floor lies). */
  h: number;
  /** The tile of the lower face, up to `lowerH`; then `upper` (a tile whose upper half is the rest) if there is one, else the lower tile goes all the way. */
  side: number;
  lowerH: number;
  upper: number;
  /** The tile of the top: -1 for a cap chosen by the sides that have floor. */
  top: number;
}

/** What each terrain is as a solid, worked out once from its flags and the kit's heights. */
export function shapesFor(kit: GeomKit): readonly Shape[] {
  const shapes: Shape[] = [];
  for (let t = 0; t < 256; t++) {
    const flags = terrainFlags[t] ?? 0;
    let shape: Shape = { kind: K_FLOOR, h: 0, side: t, lowerH: 0, upper: -1, top: t };
    if (t >= T.WATER_TILES && t <= T.WATER) shape = { kind: K_WATER, h: kit.water, side: t, lowerH: 0, upper: -1, top: t };
    else if (flags & F.PIT) shape = { kind: K_CHASM, h: kit.chasm, side: t, lowerH: 0, upper: -1, top: t };
    // A barricade, a bookshelf, a statue: a low stone base, and the prop itself a card of its tile at its true pixel scale standing on it
    // (world3d.ts addProps). The tile on the faces of a block 1.2 high was squeezed by the camera into a strip a few pixels deep.
    else if (t === T.BARRICADE || t === T.BOOKSHELF) shape = { kind: K_LOW, h: kit.base, side: FACE_WALL, lowerH: kit.base, upper: -1, top: -2 };
    else if (flags & F.SOLID && flags & F.LOS_BLOCKING) {
      const door = t === T.DOOR || t === T.LOCKED_DOOR;
      shape = {
        kind: K_WALL, h: kit.wall,
        side: door ? t : t === T.WALL_DECO ? FACE_DECO : FACE_WALL,
        lowerH: door ? kit.door : FACE_CELL, upper: FACE_UPPER, top: -1,
      };
    } else if (flags & F.SOLID) shape = { kind: K_LOW, h: kit.base, side: FACE_WALL, lowerH: kit.base, upper: -1, top: -2 };
    // The well: a stone rim, and its own tile on top.
    else if (t === T.WELL) shape = { kind: K_LOW, h: kit.well, side: FACE_WALL, lowerH: kit.well, upper: -1, top: t };
    shapes.push(shape);
  }
  return shapes;
}

/** The shapes of the kit's own heights. */
export const SHAPES: readonly Shape[] = shapesFor(DEFAULT_GEOM);

/** A door, closed, locked or open: the cells the 3D dressing of doors is for. */
export const isDoorTile = (terrain: number): boolean => terrain === T.DOOR || terrain === T.LOCKED_DOOR || terrain === T.OPEN_DOOR;
/** A closed or locked door: a gap in the wall line, with a thin panel standing in it (no stone cap, no box). */
export const isGapDoor = (terrain: number): boolean => terrain === T.DOOR || terrain === T.LOCKED_DOOR;
/** The wood of a door's frame and slab is lit: its colours are lifted above the plain, warm for wood and cool for steel. */
const WOOD_LIT = [1.45, 1.22, 0.98];
const STEEL_LIT = [1.2, 1.25, 1.4];
const LEAF_LIT = [1.5, 1.35, 1.2];
/** A locked door is the same wood as the others, lit the same: its ironwork is dark. */
const LEAF_LIT_LOCKED = LEAF_LIT;
const IRON_LIT = [0.45, 0.47, 0.53];

/** The entrance: three steps rising to the north. */
export const isStairsUp = (terrain: number): boolean => terrain === T.ENTRANCE;
/** The exit, and the exit a boss's death unlocks: three steps going down into the floor. */
export const isStairsDown = (terrain: number): boolean => terrain === T.EXIT || terrain === T.UNLOCKED_EXIT;
const isStairs = (terrain: number): boolean => isStairsUp(terrain) || isStairsDown(terrain);
/** Steps in a flight, and the most quads one needs (treads, risers, sides). */
const STEPS = 3;
const STAIR_QUADS = 14;
/**
 * How deep each tread is, in art pixels of the tile, south to north (a cell is 16): the stair tile is cut into these slices, so a tread
 * shows whole pixel rows of it at the scale it was drawn at, and none is cut through the middle of a row (a sixteenth does not go into thirds).
 */
const TREAD_ROWS = [5, 5, 6] as const;
/** The first row of each tread's slice of the tile, counted from the tile's top (north): the northern tread has the top rows. */
const TREAD_TOP = [11, 6, 0] as const;
/** The brightness down the stairwell, from its rim (1) to its far end, and up the entrance (a little light from above). */
const wellShade = (t: number): number => 1 - 0.5 * t ** 1.1;
const riseShade = (t: number): number => 0.9 + 0.26 * t;

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
  index: Uint32Array;
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
    index: new Uint32Array(indexCapacity),
    verts: 0,
    indices: 0,
  };
}

const rect = new Float32Array(4);
const corners = new Float32Array(12);

/**
 * Writes one quad; corners run bottom-left, bottom-right, top-right, top-left of the face, counter-clockwise seen from the normal.
 * `shade` is each corner's brightness (ambient occlusion, a face's darkening toward its foot); the fog of war is read at each
 * corner's own place on the map, so the darkness fades across the face and from cell to cell.
 */
function quad(
  b: Buffers, c: Float32Array, nx: number, ny: number, nz: number, shade: ArrayLike<number>, tint: ArrayLike<number>,
  u0: number, v0: number, u1: number, v1: number,
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
    b.color[p] = shade[k]! * tint[0]!;
    b.color[p + 1] = shade[k]! * tint[1]!;
    b.color[p + 2] = shade[k]! * tint[2]!;
    b.fog[(v + k) * 2] = c[k * 3]! / WIDTH;
    b.fog[(v + k) * 2 + 1] = c[k * 3 + 2]! / HEIGHT;
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

/** Wall cells within reach of open ground: the only ones whose tops and faces can be seen. */
function relevant(kinds: Uint8Array, cell: number, terrain: Uint8Array): boolean {
  const x = cell % WIDTH;
  const y = Math.trunc(cell / WIDTH);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= WIDTH || ny >= HEIGHT) continue;
      if (kinds[nx + ny * WIDTH] !== K_WALL || isGapDoor(terrain[nx + ny * WIDTH]!)) return true;
    }
  }
  return false;
}

/**
 * Wall torches: walls with open floor to their south (the face the camera sees), now and then, never closer than
 * `TORCH_SPACING` cells to one already chosen. The same level always gets the same torches.
 */
export const TORCH_SPACING = 4;
export const MAX_TORCHES = 40;
export function pickTorches(map: ArrayLike<number>): number[] {
  const picked: number[] = [];
  for (let cell = WIDTH; cell < LENGTH - WIDTH && picked.length < MAX_TORCHES; cell++) {
    const x = cell % WIDTH;
    if (x < 1 || x >= WIDTH - 1) continue;
    const terrain = map[cell]!;
    if (terrain !== T.WALL) continue;
    const south = map[cell + WIDTH]!;
    if (SHAPES[south]!.kind !== K_FLOOR || !((terrainFlags[south] ?? 0) & F.PASSABLE)) continue;
    if (SHAPES[map[cell - 1]!]!.kind !== K_WALL || SHAPES[map[cell + 1]!]!.kind !== K_WALL) continue;
    // (Not on a cut wall, a half cell high, with floor to its north: a torch hangs on a wall that stands.)
    const north = map[cell - WIDTH]!;
    if (SHAPES[north]!.kind !== K_WALL || isGapDoor(north)) continue;
    if ((Math.imul(cell, 2654435761) >>> 20) % 2 !== 0) continue;
    const cy = Math.trunc(cell / WIDTH);
    if (picked.some((other) => Math.max(Math.abs((other % WIDTH) - x), Math.abs(Math.trunc(other / WIDTH) - cy)) < TORCH_SPACING)) continue;
    picked.push(cell);
  }
  return picked;
}

/**
 * Where light falls through a grating in the ceiling: a cell inside a room (open ground all around it), now and then, at
 * most `MAX_SHAFTS`, never closer than 9 cells to one already chosen.
 */
export const MAX_SHAFTS = 2;
export function pickShafts(map: ArrayLike<number>): number[] {
  const picked: number[] = [];
  const open = (cell: number): boolean => SHAPES[map[cell]!]!.kind === K_FLOOR && ((terrainFlags[map[cell]!] ?? 0) & F.PASSABLE) !== 0;
  for (let cell = WIDTH * 2; cell < LENGTH - WIDTH * 2 && picked.length < MAX_SHAFTS; cell++) {
    const x = cell % WIDTH;
    if (x < 2 || x >= WIDTH - 2 || (Math.imul(cell, 2246822519) >>> 21) % 41 !== 0) continue;
    let room = true;
    for (let dy = -1; dy <= 1 && room; dy++) for (let dx = -1; dx <= 1 && room; dx++) room = open(cell + dx + dy * WIDTH);
    if (!room) continue;
    const cy = Math.trunc(cell / WIDTH);
    if (picked.some((other) => Math.max(Math.abs((other % WIDTH) - x), Math.abs(Math.trunc(other / WIDTH) - cy)) < 9)) continue;
    picked.push(cell);
  }
  return picked;
}

/** The neighbours of each floor corner (bottom-left, bottom-right, top-right, top-left of the quad), as steps from the cell. */
const CORNER_DX = [-1, 1, 1, -1];
const CORNER_DZ = [1, 1, -1, -1];
/** Brightness of a floor corner by how many walls touch it (ambient occlusion: the kit's contact shadows do the rest). */
const AO = [1, 0.9, 0.8, 0.7];
const WHITE = [1, 1, 1];
const ONE = [1, 1, 1, 1];
const shades = [1, 1, 1, 1];
/** How dark a wall face is at its foot against its head. */
const FACE_FOOT = 0.78;
/** Shade of a wall face by the way it looks: the camera sees south ones; the rest are for shadows. */
const SIDES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 1], // south: what the camera sees
  [1, 0, 0.85], // east
  [-1, 0, 0.85], // west
  [0, -1, 0.75], // north
];

/** The cap of a wall with no floor beside it, as the kit has it: darker where it is far from any room. */
const BURIED_SHADE = 0.55;

/**
 * Writes a box's faces into `b`: the top, then by the bits of `sides` the south (1), east (2), west (4) and north (8) faces, each with
 * the whole tile (the top may take a band of its own tile instead: five pixels of planks across a thin edge).
 */
function boxFaces(
  b: Buffers, cols: number, rows: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  tile: number, tint: ArrayLike<number>, sides: number, top?: { tile: number; tint: ArrayLike<number>; band: 'x' | 'z' },
): void {
  tileRect(tile, cols, rows, rect);
  const u0 = rect[0]!;
  const v0 = rect[1]!;
  const u1 = rect[2]!;
  const v1 = rect[3]!;
  shades.fill(1);
  set12(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0);
  if (top) {
    tileRect(top.tile, cols, rows, rect);
    const tu0 = rect[0]!;
    const tv0 = rect[1]!;
    const tu1 = rect[2]!;
    const tv1 = rect[3]!;
    if (top.band === 'z') quad(b, corners, 0, 1, 0, shades, top.tint, tu0, tv0 + (tv1 - tv0) * 0.34, tu1, tv0 + (tv1 - tv0) * 0.66);
    else quad(b, corners, 0, 1, 0, shades, top.tint, tu0 + (tu1 - tu0) * 0.34, tv0, tu0 + (tu1 - tu0) * 0.66, tv1);
  } else quad(b, corners, 0, 1, 0, shades, tint, u0, v0, u1, v1);
  shades[0] = shades[1] = FACE_FOOT;
  shades[2] = shades[3] = 1;
  if (sides & 1) {
    set12(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1);
    quad(b, corners, 0, 0, 1, shades, tint, u0, v0, u1, v1);
  }
  if (sides & 8) {
    set12(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0);
    quad(b, corners, 0, 0, -1, shades, tint, u0, v0, u1, v1);
  }
  shades[0] = shades[1] = FACE_FOOT * 0.85;
  shades[2] = shades[3] = 0.85;
  if (sides & 2) {
    set12(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1);
    quad(b, corners, 1, 0, 0, shades, tint, u0, v0, u1, v1);
  }
  if (sides & 4) {
    set12(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0);
    quad(b, corners, -1, 0, 0, shades, tint, u0, v0, u1, v1);
  }
  shades.fill(1);
}

/** How thick a door's leaf is, and how far from the hinge pin it reaches either way, in cells. */
export const LEAF_THICK = 0.18;
export const LEAF_REACH_BACK = LEAF_THICK / 2;
export const LEAF_REACH = 1 - LEAF_THICK / 2;

/**
 * A door's leaf as a mesh of its own, in its own frame: the hinge pin at the origin, the leaf reaching along +x (from just behind the pin
 * to a cell's width), 0.18 thick, as tall as the wall. Both faces carry a leaf picture of wood only (planks, hinge straps, a ring; or straps and a lock), its
 * top and ends are a strip of planks (dark iron on a locked door, which also has straps and a lock plate on both faces). The
 * renderer stands one of these at each door, turned about the pin as the door swings.
 */
export function doorLeafBuffers(locked: boolean, cols: number, rows: number, wall = DEFAULT_GEOM.wall): Buffers {
  const b = makeBuffers(12 * 4, 12 * 6);
  // Wood only (doorart.ts): the original's door tile has a stone or plaster frame round the planks.
  const tile = locked ? DOOR_LEAF_LOCK : DOOR_LEAF;
  const tint = locked ? LEAF_LIT_LOCKED : LEAF_LIT;
  // The top edge is planks either way; a locked leaf's is bound with two dark iron straps.
  const top = { tile: locked ? DOOR_LOCK_H : DOOR_TOP_H, tint: WOOD_LIT, band: 'z' as const };
  const h = LEAF_THICK / 2;
  boxFaces(b, cols, rows, -LEAF_REACH_BACK, 0, -h, LEAF_REACH, wall, h, tile, tint, 15, top);
  if (locked) {
    for (const side of [1, -1]) {
      const z0 = side > 0 ? h : -h - 0.04;
      const z1 = side > 0 ? h + 0.04 : -h;
      boxFaces(b, cols, rows, -LEAF_REACH_BACK, 0.3, z0, LEAF_REACH, 0.42, z1, DOOR_IRON, IRON_LIT, 1 | 8);
      boxFaces(b, cols, rows, -LEAF_REACH_BACK, 1.05, z0, LEAF_REACH, 1.17, z1, DOOR_IRON, IRON_LIT, 1 | 8);
      const p0 = side > 0 ? h : -h - 0.08;
      const p1 = side > 0 ? h + 0.08 : -h;
      boxFaces(b, cols, rows, 0.32, 0.55, p0, 0.6, 0.85, p1, DOOR_IRON, IRON_LIT, 1 | 8);
    }
  }
  return b;
}

export class LevelGeom {
  /** The terrain these buffers were made from. */
  readonly terrain = new Uint8Array(LENGTH);
  /** What each cell is (K_FLOOR and the rest). */
  readonly kinds = new Uint8Array(LENGTH);
  /** The floor quad of each cell, or -1: plain walls have none. */
  readonly slot = new Int32Array(LENGTH).fill(-1);
  floor!: Buffers;
  boxes!: Buffers;
  water!: Buffers;
  decals!: Buffers;
  torches: number[] = [];
  shafts: number[] = [];
  /** Bumped when the floor's uvs change, and when a box buffer is rewritten; a renderer uploads what is newer than it has. */
  floorVersion = 0;
  boxVersion = 0;
  /** The box, water or decal buffers were made bigger (their arrays are new): the renderer makes new geometry. */
  grew = false;
  /** Counts for tests and the perf overlay. */
  quads = { floor: 0, boxes: 0, water: 0, decals: 0 };
  private readonly shapes: readonly Shape[];

  constructor(
    map: ArrayLike<number>, readonly cols: number, readonly rows: number, readonly kit: GeomKit = DEFAULT_GEOM,
    /** Terrain that stands over the floor as a card (high grass, a sign), and the plain floor tile under it. */
    private readonly under: ReadonlyMap<number, number> = new Map(),
  ) {
    this.shapes = kit === DEFAULT_GEOM ? SHAPES : shapesFor(kit);
    this.build(map);
  }

  /** The shape of a terrain under this level's kit. */
  shapeOf(terrain: number): Shape {
    return this.shapes[terrain]!;
  }

  private build(map: ArrayLike<number>): void {
    for (let i = 0; i < LENGTH; i++) {
      this.terrain[i] = map[i]!;
      this.kinds[i] = this.shapes[this.terrain[i]!]!.kind;
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
    this.shafts = pickShafts(map);
    this.boxes = makeBuffers(8, 12);
    this.water = makeBuffers(8, 12);
    this.decals = makeBuffers(8, 12);
    this.rebuildSolids();
    this.floorVersion++;
    this.grew = true;
  }

  /** Whether a cell is a tall box (a wall or a door): what darkens the corners of the floor beside it. */
  private tall(x: number, z: number): number {
    return x >= 0 && z >= 0 && x < WIDTH && z < HEIGHT && this.kinds[x + z * WIDTH] === K_WALL ? 1 : 0;
  }

  /**
   * The floor quad of a cell: flat at its depth, the cell's tile, darkened at each corner by the walls around that corner
   * (the foot of every wall is in shadow). The fog is read at the corners.
   */
  private writeFloor(cell: number): void {
    const b = this.floor;
    const slot = this.slot[cell]!;
    const x = cell % WIDTH;
    const z = Math.trunc(cell / WIDTH);
    const shape = this.shapes[this.terrain[cell]!]!;
    const stairs = isStairs(this.terrain[cell]!);
    // The exit's floor is the bottom of its stairwell.
    const y = shape.kind === K_CHASM ? this.kit.chasm : isStairsDown(this.terrain[cell]!) ? this.kit.stairsDown : 0;
    // A box on the cell hides its floor; the tile there is the plain floor, for the day it opens. An open door is a gap in the wall: the
    // floor shows, not the original's picture of a frame (a pale stone portal round the doorway). Stairs stand on plain floor (their tile is on their steps).
    const tile = shape.kind === K_WALL || shape.kind === K_LOW || stairs || this.terrain[cell] === T.OPEN_DOOR ? (this.terrain[cell] === T.STATUE_SP ? T.EMPTY_SP : T.EMPTY) : shape.kind === K_CHASM ? T.CHASM : (this.under.get(this.terrain[cell]!) ?? this.terrain[cell]!);
    tileRect(tile, this.cols, this.rows, rect);
    set12(x, y, z + 1, x + 1, y, z + 1, x + 1, y, z, x, y, z);
    const v = slot * 4;
    for (let k = 0; k < 4; k++) {
      const p = (v + k) * 3;
      b.pos[p] = corners[k * 3]!;
      b.pos[p + 1] = corners[k * 3 + 1]!;
      b.pos[p + 2] = corners[k * 3 + 2]!;
      b.normal[p] = 0;
      b.normal[p + 1] = 1;
      b.normal[p + 2] = 0;
      // The corner's neighbours: the two cells beside it and the one across.
      const dx = CORNER_DX[k]!;
      const dz = CORNER_DZ[k]!;
      const s1 = this.tall(x + dx, z);
      const s2 = this.tall(x, z + dz);
      const diagonal = this.tall(x + dx, z + dz);
      const occluded = s1 && s2 ? 3 : s1 + s2 + diagonal;
      const ao = AO[occluded]!;
      b.color[p] = b.color[p + 1] = b.color[p + 2] = ao;
      b.fog[(v + k) * 2] = corners[k * 3]! / WIDTH;
      b.fog[(v + k) * 2 + 1] = corners[k * 3 + 2]! / HEIGHT;
    }
    const t = v * 2;
    b.uv[t] = rect[0]!; b.uv[t + 1] = rect[1]!;
    b.uv[t + 2] = rect[2]!; b.uv[t + 3] = rect[1]!;
    b.uv[t + 4] = rect[2]!; b.uv[t + 5] = rect[3]!;
    b.uv[t + 6] = rect[0]!; b.uv[t + 7] = rect[3]!;
  }

  /**
   * Whether a wall is cut down: it has floor (or a door's gap) to its north, whatever lies to its south. The camera looks from the south, so
   * what it sees of such a wall is its back (and its cap), and a wall of a cell and a half hides about half of the cell north of it (the
   * owner's «почти не видны предметы, которые прям за стеной»). It is drawn a half cell high, a clean cap at `kit.cut` (FRONT_WALL_H), as the cut-away
   * walls of a diorama are; a thin wall between two rooms is cut too, and the face the room south of it sees is the same half cell. A wall
   * with wall to its north (a room's back wall, the edge of the level) keeps its height, and so do the rooms' mood and the torches on them.
   */
  isCut(cell: number): boolean {
    if (this.kinds[cell] !== K_WALL || isGapDoor(this.terrain[cell]!)) return false;
    const z = Math.trunc(cell / WIDTH);
    if (z <= 0) return false;
    const solid = (c: number): boolean => this.kinds[c] === K_WALL && !isGapDoor(this.terrain[c]!);
    return !solid(cell - WIDTH);
  }

  /**
   * How tall the leaf of a door at (x, z) stands, as a share of a wall's height: the doors in a cut wall line are cut with it (a leaf standing
   * a cell and a half over its low jambs would be a post), the others are whole.
   */
  doorScale(x: number, z: number): number {
    if (!this.doorAcross(x, z)) return 1;
    const cut = (cx: number): boolean => cx >= 0 && cx < WIDTH && this.isCut(cx + z * WIDTH);
    return cut(x - 1) || cut(x + 1) ? this.kit.cut / this.kit.wall : 1;
  }

  /** The mask of a cell's sides that have floor beside them (the kit's caps: 1 north, 2 east, 4 south, 8 west). */
  capMask(x: number, z: number): number {
    const open = (cx: number, cz: number): number =>
      cx >= 0 && cz >= 0 && cx < WIDTH && cz < HEIGHT && (this.kinds[cx + cz * WIDTH] !== K_WALL || isGapDoor(this.terrain[cx + cz * WIDTH]!)) ? 1 : 0;
    return open(x, z - 1) | (open(x + 1, z) << 1) | (open(x, z + 1) << 2) | (open(x - 1, z) << 3);
  }

  /** Counts a cell's faces, so the buffers are big enough: tops, faces, edges and shadows. */
  private countSolids(): { box: number; water: number; decal: number } {
    let box = 0;
    let water = 0;
    let decal = 0;
    for (let i = 0; i < LENGTH; i++) {
      const kind = this.kinds[i]!;
      if (kind === K_WATER) water++;
      else if (kind === K_WALL && relevant(this.kinds, i, this.terrain)) box += 1 + 4 * 2;
      else if (kind === K_LOW) box += 1 + 4 * 2;
      else if (kind === K_CHASM) box += 4 * 2;
      if (kind === K_FLOOR || kind === K_LOW) decal += 4;
      if (isStairs(this.terrain[i]!)) box += STAIR_QUADS;
    }
    return { box, water, decal };
  }

  /** (Re)writes the boxes, the water and the decals: into the same arrays if they are big enough. */
  private rebuildSolids(): void {
    const need = this.countSolids();
    if (need.box * 4 > this.boxes.pos.length / 3) {
      this.boxes = makeBuffers(need.box * 4, need.box * 6);
      this.grew = true;
    }
    if (need.water * 4 > this.water.pos.length / 3) {
      this.water = makeBuffers(need.water * 4, need.water * 6);
      this.grew = true;
    }
    if (need.decal * 4 > this.decals.pos.length / 3) {
      this.decals = makeBuffers(need.decal * 4, need.decal * 6);
      this.grew = true;
    }
    this.boxes.verts = this.boxes.indices = 0;
    this.water.verts = this.water.indices = 0;
    this.decals.verts = this.decals.indices = 0;
    for (let i = 0; i < LENGTH; i++) {
      const kind = this.kinds[i]!;
      if (kind === K_WATER) this.writeWater(i);
      else if (kind === K_WALL && !isGapDoor(this.terrain[i]!) && relevant(this.kinds, i, this.terrain)) this.writeBox(i);
      else if (kind === K_LOW) this.writeBox(i);
      else if (kind === K_CHASM) this.writeEdges(i);
      // (Not on a stairs cell: the decal would lie across the mouth of the stairwell, a band of dark over the steps.)
      if ((kind === K_FLOOR || kind === K_LOW) && !isStairs(this.terrain[i]!)) this.writeShadows(i);
      if (isStairs(this.terrain[i]!)) this.writeSteps(i);
    }
    this.quads.boxes = this.boxes.verts / 4;
    this.quads.water = this.water.verts / 4;
    this.quads.decals = this.decals.verts / 4;
    this.boxVersion++;
  }

  /**
   * The rectangle of a tile that is `w` x `h` art pixels at (`col`, `row`) counted from its top-left corner, in the form `tileRect` gives (the
   * rect array): a vertical face is foreshortened by the camera, so what it shows of a tile is a few whole rows, and not the whole tile
   * squeezed into them (which is a handful of stripes).
   */
  private pixels(tile: number, col: number, row: number, w: number, h: number): void {
    tileRect(tile, this.cols, this.rows, rect);
    const u0 = rect[0]!;
    const v0 = rect[1]!;
    const du = rect[2]! - u0;
    const dv = rect[3]! - v0;
    rect[0] = u0 + (du * col) / 16;
    rect[2] = u0 + (du * (col + w)) / 16;
    rect[3] = v0 + dv * (1 - row / 16);
    rect[1] = v0 + dv * (1 - (row + h) / 16);
  }

  /** How many rows of art a vertical face of this height (cells) takes on the screen: its height times the camera's squeeze, at least one. */
  private static rowsOf(height: number): number {
    return Math.max(1, Math.round(Math.abs(height) * 16 * Math.cos(PITCH)));
  }

  /**
   * A flight of three steps on a stairs cell, the way up rising and the way down sinking toward the north (away from the camera), each
   * tread about a third of the cell deep (5, 5 and 6 sixteenths) with the matching rows of the region's stair tile on it, at the tile's scale. Up (the kit's stairs_up, 0.5 high): the risers face
   * south, the camera, and the sides are stone; down (stairs_down, 0.5 deep): the camera sees the treads going dark and, at the far end,
   * the rock of the stairwell. The cell's floor quad is the plain floor, or the bottom of the stairwell.
   */
  private writeSteps(cell: number): void {
    const x = cell % WIDTH;
    const z = Math.trunc(cell / WIDTH);
    const terrain = this.terrain[cell]!;
    const up = isStairsUp(terrain);
    const total = up ? this.kit.stairsUp : this.kit.stairsDown;
    const b = this.boxes;
    const east = this.kinds[cell + 1] !== K_WALL;
    const west = this.kinds[cell - 1] !== K_WALL;
    const shade = up ? riseShade : wellShade;
    let depth = 0;
    for (let k = 0; k < STEPS; k++) {
      const rows = TREAD_ROWS[k]!;
      const south = z + 1 - depth / 16;
      const north = z + 1 - (depth + rows) / 16;
      const y = (total * (k + 1)) / STEPS;
      const below = (total * k) / STEPS;
      // The tread: its slice of the stair tile at the tile's own scale, brightening or darkening smoothly from its south edge to its north.
      // (Going down, the camera sees no riser: the drop to the next tread is a one-pixel shadow along the tread's far edge, which is what makes a
      // flight of steps read as steps.)
      const edge = up ? 0 : 1;
      this.pixels(terrain, 0, TREAD_TOP[k]! + edge, 16, rows - edge);
      shades[0] = shades[1] = shade(depth / 16);
      shades[2] = shades[3] = shade((depth + rows - edge) / 16);
      set12(x, y, south, x + 1, y, south, x + 1, y, north + edge / 16, x, y, north + edge / 16);
      quad(b, corners, 0, 1, 0, shades, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
      if (edge) {
        this.pixels(terrain, 0, TREAD_TOP[k]!, 16, 1);
        shades.fill(shade((depth + rows) / 16) * 0.5);
        set12(x, y, north + 1 / 16, x + 1, y, north + 1 / 16, x + 1, y, north, x, y, north);
        quad(b, corners, 0, 1, 0, shades, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
      }
      if (up) {
        // The riser under the tread, facing the camera: the row of the slice at its front edge, a little darker (it is in the tread's own shade).
        this.pixels(terrain, 0, TREAD_TOP[k]! + rows - 1, 16, LevelGeom.rowsOf(y - below));
        shades.fill(shade(depth / 16) * 0.74);
        set12(x, below, south, x + 1, below, south, x + 1, y, south, x, y, south);
        quad(b, corners, 0, 0, 1, shades, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
        // The stone at the sides of the step: the wall's face, as many columns across as the tread is deep, as many rows as it is high.
        shades.fill(0.8);
        const col = Math.round(depth);
        if (east) {
          this.pixels(FACE_WALL, col, 0, rows, LevelGeom.rowsOf(y));
          set12(x + 1, 0, south, x + 1, 0, north, x + 1, y, north, x + 1, y, south);
          quad(b, corners, 1, 0, 0, shades, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
        }
        if (west) {
          this.pixels(FACE_WALL, col, 0, rows, LevelGeom.rowsOf(y));
          set12(x, 0, north, x, 0, south, x, y, south, x, y, north);
          quad(b, corners, -1, 0, 0, shades, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
        }
      }
      depth += rows;
    }
    if (!up) {
      // The stairwell's rock: the far end and the two sides, from the rim down to where the steps end. A vertical face shows only the rows the
      // camera lets it have (rowsOf), taken from the middle of the rock tile, and darkens smoothly toward the bottom.
      const rows = LevelGeom.rowsOf(total);
      const far = wellShade(1);
      this.pixels(EDGE_ROCK, 0, 6, 16, rows);
      shades[0] = shades[1] = far * 0.6;
      shades[2] = shades[3] = far * 0.9;
      set12(x, total, z, x + 1, total, z, x + 1, 0, z, x, 0, z);
      quad(b, corners, 0, 0, 1, shades, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
      // East wall (facing west), then west wall (facing east): south end brighter than the north, the bottom darker than the rim.
      this.pixels(EDGE_ROCK, 0, 6, 16, rows);
      shades[0] = far * 0.6;
      shades[1] = 0.6;
      shades[2] = 0.95;
      shades[3] = far * 0.9;
      set12(x + 1, total, z, x + 1, total, z + 1, x + 1, 0, z + 1, x + 1, 0, z);
      quad(b, corners, -1, 0, 0, shades, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
      shades[0] = 0.6;
      shades[1] = far * 0.6;
      shades[2] = far * 0.9;
      shades[3] = 0.95;
      set12(x, total, z + 1, x, total, z, x, 0, z, x, 0, z + 1);
      quad(b, corners, 1, 0, 0, shades, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
    }
    shades.fill(1);
  }

  /**
   * How high the ground is under a figure standing at (x, z), in cells: the step of a flight of stairs it is on (the entrance's rise, the
   * exit's sink), the floor's own height otherwise. A figure is lifted by it, so its feet are on the tread and not in it.
   */
  groundAt(x: number, z: number): number {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= WIDTH || cz >= HEIGHT) return 0;
    const terrain = this.terrain[cx + cz * WIDTH]!;
    if (!isStairs(terrain)) return 0;
    const into = (cz + 1 - z) * 16;
    const step = into < TREAD_ROWS[0]! ? 0 : into < TREAD_ROWS[0]! + TREAD_ROWS[1]! ? 1 : 2;
    return ((isStairsUp(terrain) ? this.kit.stairsUp : this.kit.stairsDown) * (step + 1)) / STEPS;
  }

  private writeWater(cell: number): void {
    const x = cell % WIDTH;
    const z = Math.trunc(cell / WIDTH);
    const d = this.kit.water;
    set12(x, d, z + 1, x + 1, d, z + 1, x + 1, d, z, x, d, z);
    // The water texture is 32 art pixels across: two tiles.
    quad(this.water, corners, 0, 1, 0, ONE, WHITE, x / 2, (z + 1) / 2, (x + 1) / 2, z / 2);
  }

  /** The kit's contact shadows: a decal on a floor cell for each side that a wall stands on. */
  private writeShadows(cell: number): void {
    if (this.kinds[cell] === K_LOW) return;
    const x = cell % WIDTH;
    const z = Math.trunc(cell / WIDTH);
    for (let side = 0; side < 4; side++) {
      const nx = x + (side === 1 ? 1 : side === 3 ? -1 : 0);
      const nz = z + (side === 2 ? 1 : side === 0 ? -1 : 0);
      if (this.tall(nx, nz) === 0) continue;
      tileRect(SHADOW_FIRST + side, this.cols, this.rows, rect);
      set12(x, 0.012, z + 1, x + 1, 0.012, z + 1, x + 1, 0.012, z, x, 0.012, z);
      quad(this.decals, corners, 0, 1, 0, ONE, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
    }
  }

  /** The faces where the floor ends and a chasm falls away: a lip, then rock going down into the dark. */
  private writeEdges(cell: number): void {
    const x = cell % WIDTH;
    const z = Math.trunc(cell / WIDTH);
    for (const [dx, dz] of [[0, -1], [0, 1], [1, 0], [-1, 0]] as const) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= WIDTH || nz >= HEIGHT) continue;
      const kind = this.kinds[nx + nz * WIDTH]!;
      if (kind === K_CHASM || kind === K_WALL) continue;
      const deep = this.kit.chasm;
      // The face points into the chasm, away from the floor it is the edge of.
      if (dz === -1) {
        const lip = (x + z) & 1 ? EDGE_LIP : EDGE_LIP + 1;
        tileRect(lip, this.cols, this.rows, rect);
        set12(x, -1, z, x + 1, -1, z, x + 1, 0, z, x, 0, z);
        quad(this.boxes, corners, 0, 0, 1, ONE, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
        tileRect(EDGE_ROCK, this.cols, this.rows, rect);
        set12(x, deep, z, x + 1, deep, z, x + 1, -1, z, x, -1, z);
        quad(this.boxes, corners, 0, 0, 1, shades.fill(0.45), WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
        shades.fill(1);
      } else if (dz === 1) {
        tileRect(EDGE_LIP, this.cols, this.rows, rect);
        set12(x + 1, -1, z + 1, x, -1, z + 1, x, 0, z + 1, x + 1, 0, z + 1);
        quad(this.boxes, corners, 0, 0, -1, ONE, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
        tileRect(EDGE_ROCK, this.cols, this.rows, rect);
        set12(x + 1, deep, z + 1, x, deep, z + 1, x, -1, z + 1, x + 1, -1, z + 1);
        quad(this.boxes, corners, 0, 0, -1, shades.fill(0.45), WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
        shades.fill(1);
      } else if (dx === 1) {
        tileRect(EDGE_LIP, this.cols, this.rows, rect);
        set12(x + 1, -1, z, x + 1, -1, z + 1, x + 1, 0, z + 1, x + 1, 0, z);
        quad(this.boxes, corners, -1, 0, 0, ONE, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
        tileRect(EDGE_ROCK, this.cols, this.rows, rect);
        set12(x + 1, deep, z, x + 1, deep, z + 1, x + 1, -1, z + 1, x + 1, -1, z);
        quad(this.boxes, corners, -1, 0, 0, shades.fill(0.45), WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
        shades.fill(1);
      } else {
        tileRect(EDGE_LIP, this.cols, this.rows, rect);
        set12(x, -1, z + 1, x, -1, z, x, 0, z, x, 0, z + 1);
        quad(this.boxes, corners, 1, 0, 0, ONE, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
        tileRect(EDGE_ROCK, this.cols, this.rows, rect);
        set12(x, deep, z + 1, x, deep, z, x, -1, z, x, -1, z + 1);
        quad(this.boxes, corners, 1, 0, 0, shades.fill(0.45), WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
        shades.fill(1);
      }
    }
  }

  private writeBox(cell: number): void {
    const b = this.boxes;
    const x = cell % WIDTH;
    const z = Math.trunc(cell / WIDTH);
    const shape = this.shapes[this.terrain[cell]!]!;
    const h = this.isCut(cell) ? this.kit.cut : shape.h;
    // The top: a cap by the sides that have floor (darker if none does), or the block's own.
    let tile = shape.top;
    let shade = 1;
    const tint: ArrayLike<number> = WHITE;
    const terrain = this.terrain[cell]!;
    if (tile === -1) {
      const mask = this.capMask(x, z);
      tile = CAP_FIRST + mask;
      if (mask === 0) shade = BURIED_SHADE;
    } else if (tile === -2) tile = CAP_FIRST;
    tileRect(tile, this.cols, this.rows, rect);
    const cut = h < shape.h - 0.001;
    shades.fill(shade);
    if (cut) {
      // A cut wall's cap: the stone, and along the cut (the north edge, the side the room is on) a row of lighter pixels, a clean lip.
      const lip = 1 / 16;
      const dv = rect[3]! - rect[1]!;
      set12(x, h, z + 1, x + 1, h, z + 1, x + 1, h, z + lip, x, h, z + lip);
      quad(b, corners, 0, 1, 0, shades, tint, rect[0]!, rect[1]!, rect[2]!, rect[3]! - dv * lip);
      set12(x, h, z + lip, x + 1, h, z + lip, x + 1, h, z, x, h, z);
      shades.fill(shade * CUT_LIP);
      quad(b, corners, 0, 1, 0, shades, tint, rect[0]!, rect[3]! - dv * lip, rect[2]!, rect[3]!);
      shades.fill(shade);
    } else {
      set12(x, h, z + 1, x + 1, h, z + 1, x + 1, h, z, x, h, z);
      quad(b, corners, 0, 1, 0, shades, tint, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
    }
    for (const [dx, dz, side] of SIDES) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= WIDTH || nz >= HEIGHT) continue;
      const next = this.terrain[nx + nz * WIDTH]!;
      const low = isGapDoor(next) ? 0 : this.shapes[next]!.h;
      if (low >= h - 0.001) continue;
      const bottom = Math.max(0, low);
      const lowerTop = Math.min(h, shape.lowerH);
      if (lowerTop > bottom) {
        // (A cut wall's face is a few pixels deep on the screen: whole rows of the tile's top, not the whole tile squeezed into them.)
        if (cut) this.pixels(shape.side, 0, 0, 16, LevelGeom.rowsOf(lowerTop - bottom));
        else tileRect(shape.side, this.cols, this.rows, rect);
        this.face(dx, dz, x, z, bottom, lowerTop);
        shades[0] = shades[1] = side * FACE_FOOT;
        shades[2] = shades[3] = side;
        quad(b, corners, dx, 0, dz, shades, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
      }
      if (shape.upper >= 0 && h > lowerTop) {
        // The rest of the wall's height: the upper half of the kit's face-top tile.
        tileRect(shape.upper, this.cols, this.rows, rect);
        const mid = (rect[1]! + rect[3]!) / 2;
        this.face(dx, dz, x, z, Math.max(bottom, lowerTop), h);
        shades.fill(side);
        quad(b, corners, dx, 0, dz, shades, WHITE, rect[0]!, mid, rect[2]!, rect[3]!);
      } else if (shape.upper < 0 && h > lowerTop) {
        tileRect(shape.side, this.cols, this.rows, rect);
        this.face(dx, dz, x, z, lowerTop, h);
        shades.fill(side);
        quad(b, corners, dx, 0, dz, shades, WHITE, rect[0]!, rect[1]!, rect[2]!, rect[3]!);
      }
    }
    shades.fill(1);
  }

  /**
   * Whether a door's wall line runs east-west, so that its face looks south at the camera (the passage is north-south): true if
   * floor lies to its north or south, or if it has no floor beside it at all.
   */
  doorAcross(x: number, z: number): boolean {
    const open = (cx: number, cz: number): boolean => cx >= 0 && cz >= 0 && cx < WIDTH && cz < HEIGHT && this.kinds[cx + cz * WIDTH] !== K_WALL;
    return open(x, z - 1) || open(x, z + 1) || !(open(x - 1, z) || open(x + 1, z));
  }

  /** The corners of a face of the box on cell (x, z), from height `y0` up to `y1`, on the side (dx, dz). */
  private face(dx: number, dz: number, x: number, z: number, y0: number, y1: number): void {
    if (dz === 1) set12(x, y0, z + 1, x + 1, y0, z + 1, x + 1, y1, z + 1, x, y1, z + 1);
    else if (dz === -1) set12(x + 1, y0, z, x, y0, z, x, y1, z, x + 1, y1, z);
    else if (dx === 1) set12(x + 1, y0, z + 1, x + 1, y0, z, x + 1, y1, z, x + 1, y1, z + 1);
    else set12(x, y0, z, x, y0, z + 1, x, y1, z + 1, x, y1, z);
  }

  /**
   * Brings the geometry up to date with the map. 'same': nothing changed; 'patched': only tiles of floor cells changed (patched in
   * place); 'solids': boxes or water changed too (a door opened) and were rewritten; 'rebuilt': plain walls came or went, all new.
   */
  patch(map: ArrayLike<number>): 'same' | 'patched' | 'solids' | 'rebuilt' {
    let tiles = false;
    let solids = false;
    const changed: number[] = [];
    for (let i = 0; i < LENGTH; i++) {
      const next = map[i]!;
      const prev = this.terrain[i]!;
      if (next === prev) continue;
      if (isPlainWall(next) !== isPlainWall(prev)) {
        this.build(map);
        return 'rebuilt';
      }
      const was = this.shapes[prev]!;
      const now = this.shapes[next]!;
      this.terrain[i] = next;
      this.kinds[i] = now.kind;
      changed.push(i);
      tiles = true;
      // Boxes and water are rewritten when one comes or goes, or a box's art or height changes; a floor tile alone is patched in place.
      const box = now.kind === K_WALL || now.kind === K_LOW;
      if (was.kind !== now.kind || (box && (was.side !== now.side || was.top !== now.top || was.h !== now.h))) solids = true;
    }
    // A cell's tile and the shade at the corners of the floor round a wall that came or went.
    for (const i of changed) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = (i % WIDTH) + dx;
          const z = Math.trunc(i / WIDTH) + dz;
          if (x >= 0 && z >= 0 && x < WIDTH && z < HEIGHT && this.slot[x + z * WIDTH]! >= 0) this.writeFloor(x + z * WIDTH);
        }
      }
    }
    if (solids) this.rebuildSolids();
    if (tiles) this.floorVersion++;
    return solids ? 'solids' : tiles ? 'patched' : 'same';
  }
}
