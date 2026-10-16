/*
 * What a fight leaves behind, kept for the whole run (a cosmetic choice of Firelight, not the original's: there the dead fade away and the
 * blood is washed out of the next frame): the bodies that lie where the monsters fell, the splats of blood on the floor and on the faces of
 * the walls, and the red that has settled in the water. All of it is the client's own and kept apart from the rules: a compact record per
 * run and depth in local storage (kind, cell, flip, a seed; splats as a few numbers), replayed on load. Nothing here touches the world, so
 * replay and the checked runs are as they were.
 *
 * Pure but for the storage handed in (tests give a memory one) and the clock-free planning of spatter, which takes its dice.
 */

import { F, HEIGHT, T, terrainFlags, WIDTH } from '@pd/core';

/** The most bodies lying on one depth (the oldest fades out when another falls) and the most splats remembered of it. */
export const MAX_BODIES = 80;
export const MAX_SPLATS = 2400;

/**
 * Blood on the floor (`floor`), on the face of a wall (`wall`), a pool spread under a body (`pool`: a blob about (x, y), radii w and h),
 * or a chunk of meat, bone or stone lying on the floor (`chunk`: w is which of the little pictures (CHUNK_SHAPES), h how it lies:
 * bit 0 flipped, bits 1 and 2 turned by quarter turns).
 */
export type Layer = 0 | 1 | 2 | 3;
export const FLOOR = 0;
export const WALL = 1;
export const POOL = 2;
export const CHUNK = 3;

/** A splat in the layer's own pixels: the floor's are world pixels (a cell is 16), the wall's are 16 across and 24 up a face, cell by cell. */
export interface Splat {
  layer: Layer;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0xrrggbb. */
  rgb: number;
}

/** A body that lies where it fell: the kind (its sprite's last frame of dying), the cell, which way it faces, a seed for its look. */
export interface Body {
  kind: string;
  cell: number;
  flip: boolean;
  seed: number;
  /** Blood that has spattered on it since (each is a few more specks). */
  hits: number;
  /** Runtime only: when it lies down (the end of its death), and when it began to fade out (over the cap). */
  at?: number;
  fadeAt?: number;
}

export interface GoreData {
  bodies: Body[];
  splats: Splat[];
  /** How red the water of a cell has stayed, 0-255. */
  water: Map<number, number>;
  /** How much blood has spattered on the heap of items in a cell, and on the door in one (counts). */
  heaps: Map<number, number>;
  doors: Map<number, number>;
}

export const emptyData = (): GoreData => ({ bodies: [], splats: [], water: new Map(), heaps: new Map(), doors: new Map() });

/** The blood of each creature, as its sprite gives it in the original (CharSprite.blood: dark red unless the sprite says otherwise). */
const BLOOD: Readonly<Record<string, number>> = {
  acidic: 0x66ff22, bee: 0xffd500, crab: 0xffea80, dm300: 0xffff88, elemental: 0xff7d13, ghost: 0xffffff, golem: 0x80706c, goo: 0x000000,
  larva: 0xbbcc66, mimic: 0xcb9700, scorpio: 0x44ff22, skeleton: 0xcccccc, spinner: 0xbfe5b8, statue: 0xcdcdb7, swarm: 0x8ba077,
  undead: 0xcccccc, wraith: 0x222222, burningFist: 0xff7d13,
};
const RED = 0xbb0000;

export const bloodRgb = (kind: string): number => BLOOD[kind] ?? RED;

/** A shade of a colour (k < 1 darker, k > 1 lighter). */
export function shade(rgb: number, k: number): number {
  const c = (n: number): number => Math.max(0, Math.min(255, Math.round(n * k)));
  return (c((rgb >> 16) & 255) << 16) | (c((rgb >> 8) & 255) << 8) | c(rgb & 255);
}

/** Monsters that leave no body: those that go (the ghost, the wraith, the curse, a sheep, an imp), mirror images, the shopkeepers and the rest of the cast. */
export const NO_BODY: ReadonlySet<string> = new Set([
  'ghost', 'wraith', 'curse', 'mirror', 'sheep', 'imp', 'impShopkeeper', 'shopkeeper', 'wandmaker', 'blacksmith', 'ratKing',
]);

// ---- the store ----------------------------------------------------------------------------------------------------------------

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

const PREFIX = 'pd-gore:';

/** What is kept of a depth: bodies as [kind, cell, flip, seed, hits], splats as [layer, x, y, w, h, rgb], water as [cell, value]. */
interface Saved {
  b: Array<[string, number, number, number, number]>;
  s: Array<[number, number, number, number, number, number]>;
  w: Array<[number, number]>;
  h?: Array<[number, number]>;
  d?: Array<[number, number]>;
}

export class GoreStore {
  constructor(private readonly storage: StorageLike | null) {}

  private key(run: string, depth: number): string {
    return `${PREFIX}${run}:${depth}`;
  }

  load(run: string, depth: number): GoreData {
    const data = emptyData();
    try {
      const raw = this.storage?.getItem(this.key(run, depth));
      if (!raw) return data;
      const saved = JSON.parse(raw) as Partial<Saved>;
      for (const [kind, cell, flip, seed, hits] of saved.b ?? []) data.bodies.push({ kind, cell, flip: flip === 1, seed, hits });
      for (const [layer, x, y, w, h, rgb] of saved.s ?? []) data.splats.push({ layer: layer as Layer, x, y, w, h, rgb });
      for (const [cell, value] of saved.w ?? []) data.water.set(cell, value);
      for (const [cell, n] of saved.h ?? []) data.heaps.set(cell, n);
      for (const [cell, n] of saved.d ?? []) data.doors.set(cell, n);
    } catch {
      // A damaged record is no record.
      return emptyData();
    }
    return data;
  }

  save(run: string, depth: number, data: GoreData): void {
    const saved: Saved = {
      b: data.bodies.slice(-MAX_BODIES).map((b) => [b.kind, b.cell, b.flip ? 1 : 0, b.seed, b.hits]),
      s: data.splats.slice(-MAX_SPLATS).map((s) => [s.layer, s.x, s.y, s.w, s.h, s.rgb]),
      w: [...data.water],
      h: [...data.heaps],
      d: [...data.doors],
    };
    try {
      this.storage?.setItem(this.key(run, depth), JSON.stringify(saved));
    } catch {
      // Full, or private: this visit only.
    }
  }

  /** A new run: every record of another run is let go (and, with `run` undefined, all of them). */
  forgetOthers(run: string | undefined): void {
    const s = this.storage;
    if (!s) return;
    try {
      const doomed: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k?.startsWith(PREFIX) && (run === undefined || !k.startsWith(`${PREFIX}${run}:`))) doomed.push(k);
      }
      for (const k of doomed) s.removeItem(k);
    } catch {
      // Nothing to forget.
    }
  }
}

// ---- the state of the depth being shown ---------------------------------------------------------------------------------------

export class Gore {
  data: GoreData = emptyData();
  /** Counts each time a depth is bound, so a renderer knows to replay it. */
  version = 0;
  private run = '';
  private depth = -1;
  private store: GoreStore = new GoreStore(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Called with each splat added, to paint it at once. */
  onSplat: ((s: Splat) => void) | null = null;
  /** Called when the water has stained a little more. */
  onWater: (() => void) | null = null;

  setStore(store: GoreStore): void {
    this.store = store;
  }

  /** Brings the record of this run's depth up (the old one saved). `fresh`: a run just begun, nothing of an earlier one is kept. */
  bind(run: string, depth: number, fresh: boolean): void {
    this.flush();
    if (fresh) this.store.forgetOthers(undefined);
    else if (run !== this.run) this.store.forgetOthers(run);
    this.run = run;
    this.depth = depth;
    this.data = this.store.load(run, depth);
    this.version++;
  }

  /** Writes the record out now (leaving a depth, the page going away). */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.depth >= 0) this.store.save(this.run, this.depth, this.data);
  }

  private saveSoon(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.depth >= 0) this.store.save(this.run, this.depth, this.data);
    }, 2000);
  }

  /** A body falls: the oldest past the cap begins to fade (and is not kept). Returns the new body. */
  addBody(body: Body, now: number): Body {
    const live = this.data.bodies.filter((b) => b.fadeAt === undefined);
    this.data.bodies.push(body);
    if (live.length >= MAX_BODIES) live[0]!.fadeAt = now;
    this.saveSoon();
    return body;
  }

  /** Bodies that have faded out are let go (call now and then). */
  sweep(now: number, fadeMs: number): void {
    const keep = this.data.bodies.filter((b) => b.fadeAt === undefined || now - b.fadeAt < fadeMs);
    if (keep.length !== this.data.bodies.length) this.data.bodies = keep;
  }

  addSplat(s: Splat): void {
    const list = this.data.splats;
    list.push(s);
    if (list.length > MAX_SPLATS) list.splice(0, list.length - MAX_SPLATS);
    this.onSplat?.(s);
    this.saveSoon();
  }

  /** Blood reached the items lying in a cell, or the door of one: the picture of it is stained a little more. */
  stainHeap(cell: number): void {
    this.data.heaps.set(cell, Math.min(8, (this.data.heaps.get(cell) ?? 0) + 1));
    this.stains++;
    this.saveSoon();
  }

  stainDoor(cell: number): void {
    this.data.doors.set(cell, Math.min(8, (this.data.doors.get(cell) ?? 0) + 1));
    this.stains++;
    this.saveSoon();
  }

  /** Counts each time a heap or a door was stained, so the renderer knows to look again. */
  stains = 0;

  /** A cloud of blood in water has settled: a faint stain stays, cell by cell (never fainter than what was there). */
  settleWater(cell: number, value: number): void {
    const was = this.data.water.get(cell) ?? 0;
    if (value > was) {
      this.data.water.set(cell, value);
      this.onWater?.();
      this.saveSoon();
    }
  }

  /** The record, for the tests and the 3D view. */
  get bodies(): Body[] {
    return this.data.bodies;
  }
}

export const gore = new Gore();

// ---- spatter ------------------------------------------------------------------------------------------------------------------

/** What spatter needs of the level: which cells are ground it can land on, and which are walls with a face to the south. */
export interface SpatterMap {
  width: number;
  height: number;
  /** Floor a splat may lie on (not wall, water or chasm). */
  ground(cell: number): boolean;
  /** A wall whose south face shows (the cell south of it is open). */
  face(cell: number): boolean;
}

export interface SpatterBlow {
  /** Where the victim stands, world pixels (its feet). */
  x: number;
  y: number;
  kind: string;
  damage: number;
  /** Its greatest health. */
  ht: number;
}

const FACE_ROWS = 24;
const CELL = 16;

/**
 * The splats of one blow: random spatter on the floor round the victim and on the faces of the walls within two cells north of it, scaling
 * with the damage; and how many of the blood's specks reach each body and heap near (by cell). `light` is the light effects quality: half.
 * Pure given its dice.
 */
export function spatterOf(
  map: SpatterMap, blow: SpatterBlow, light: boolean, rnd: () => number,
  near: { bodies: ReadonlyArray<{ cell: number }>; heaps: readonly number[]; doors?: readonly number[] },
): { splats: Splat[]; bodyHits: number[]; heapSpecks: Splat[]; heapHits: number[]; doorHits: number[] } {
  const base = bloodRgb(blow.kind);
  const share = Math.min(1, blow.damage / Math.max(1, blow.ht));
  const splats: Splat[] = [];
  const colour = (): number => shade(base, 0.62 + rnd() * 0.5);
  const cx = Math.floor(blow.x / CELL);
  const cy = Math.floor(blow.y / CELL);
  const scale = light ? 0.5 : 1;

  // The floor: specks thrown out up to two cells, most near.
  const floorN = Math.round((5 + share * 22 + Math.min(10, blow.damage) * 0.8) * scale);
  for (let i = 0; i < floorN; i++) {
    const r = Math.pow(rnd(), 1.6) * 34;
    const a = rnd() * Math.PI * 2;
    const x = Math.round(blow.x + Math.cos(a) * r);
    const y = Math.round(blow.y + Math.sin(a) * r * 0.8);
    const cell = Math.floor(y / CELL) * map.width + Math.floor(x / CELL);
    if (x < 0 || y < 0 || x >= map.width * CELL || y >= map.height * CELL || !map.ground(cell)) continue;
    const big = rnd() < 0.15 + share * 0.3;
    splats.push({ layer: FLOOR, x, y, w: big ? 2 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2), h: big ? 1 + Math.floor(rnd() * 2) : 1, rgb: colour() });
  }

  // The faces of the walls north of the blow, a cell or two off to either side: a spray low on the face, with drips.
  for (let dy = 1; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const wx = cx + dx;
      const wy = cy - dy;
      if (wx < 0 || wy < 0 || wx >= map.width) continue;
      const wall = wy * map.width + wx;
      if (!map.face(wall)) continue;
      const n = Math.round(share * 9 * scale * (1 - (Math.abs(dx) + dy - 1) * 0.28) + (rnd() < 0.5 * scale ? 1 : 0));
      for (let i = 0; i < n; i++) {
        const u = Math.floor(rnd() * CELL);
        const up = Math.floor(Math.pow(rnd(), 1.8) * (dy === 1 ? 17 : 10));
        const v = FACE_ROWS - 1 - up;
        const rgb = colour();
        splats.push({ layer: WALL, x: wx * CELL + u, y: wy * FACE_ROWS + v, w: 1 + Math.floor(rnd() * 2), h: 1, rgb });
        // (A drip runs down the face and stops at the floor: never into the picture of the cell below.)
        if (rnd() < 0.45 && v < FACE_ROWS - 1) splats.push({ layer: WALL, x: wx * CELL + u, y: wy * FACE_ROWS + v + 1, w: 1, h: Math.min(1 + Math.floor(rnd() * 4), FACE_ROWS - 1 - v), rgb: shade(rgb, 0.9) });
      }
    }
  }

  // Bodies and heaps within two cells take specks.
  const bodyHits: number[] = [];
  for (let i = 0; i < near.bodies.length; i++) {
    const c = near.bodies[i]!.cell;
    if (Math.abs((c % map.width) - cx) <= 2 && Math.abs(Math.floor(c / map.width) - cy) <= 2 && rnd() < 0.4 + share) bodyHits.push(i);
  }
  const heapSpecks: Splat[] = [];
  const heapHits: number[] = [];
  for (const heap of near.heaps) {
    const hx = heap % map.width;
    const hy = Math.floor(heap / map.width);
    if (Math.abs(hx - cx) > 2 || Math.abs(hy - cy) > 2 || rnd() > 0.35 + share) continue;
    heapHits.push(heap);
    for (let i = 0; i < 2 + Math.round(share * 4 * scale); i++) {
      heapSpecks.push({ layer: FLOOR, x: hx * CELL + 4 + Math.floor(rnd() * 8), y: hy * CELL + 5 + Math.floor(rnd() * 8), w: 1 + Math.floor(rnd() * 2), h: 1, rgb: colour() });
    }
  }
  // The leaves of doors within two cells.
  const doorHits: number[] = [];
  for (const door of near.doors ?? []) {
    if (Math.abs((door % map.width) - cx) <= 2 && Math.abs(Math.floor(door / map.width) - cy) <= 2 && rnd() < 0.25 + share * 0.7) doorHits.push(door);
  }
  return { splats, bodyHits, heapSpecks, heapHits, doorHits };
}

// ---- meat and pieces ----------------------------------------------------------------------------------------------------------

/**
 * The little pictures of what a body bursts into, 3 to 6 art pixels: `a` the body of it, `b` its darker edge, `c` a lighter glint. Each
 * lies flat, flipped or turned by a quarter turn as the dice say. Meat first, then bits of bone (thin), then shards of stone and metal.
 */
export const CHUNK_SHAPES: readonly (readonly string[])[] = [
  ['.ab.', 'aaca', '.aab'],
  ['.aa.', 'abca', 'baab', '.bb.'],
  ['aab', 'acaa', '.aab'],
  ['.ab', 'aaa', 'aab', '.b.'],
  ['aaab.', 'acaab', '.bbb.'],
  ['.a.', 'aca', '.ab'],
  // Bone: a shaft with a knob at each end, a splinter, a curved rib.
  ['ca.....', '.aaaab.'],
  ['.ab', 'ab.', 'ab.'],
  ['..aa', '.ac.', 'ab..'],
  // Shards.
  ['.a.', 'acb', 'aab'],
  ['ab..', 'acab', '.bab'],
  ['aab', 'cab'],
];
const MEAT_SHAPES = [0, 1, 2, 3, 4, 5];
const BONE_SHAPES = [6, 7, 8, 5];
const SHARD_SHAPES = [9, 10, 11, 5];

export type ChunkKind = 'meat' | 'bone' | 'shard';

/** What a kind bursts into, and the colours of the pieces (the flesh tones and the creature's own blood, as the original's sprites give it). */
export function chunkStyle(kind: string): { shapes: readonly number[]; colors: readonly number[] } | null {
  if (NO_BLOOD.has(kind)) return null;
  switch (kind) {
    case 'skeleton': case 'undead':
      return { shapes: BONE_SHAPES, colors: [0xece6cc, 0xd6cfb4, 0xc4bea6, 0xb8b09a] };
    case 'golem': case 'statue': case 'dm300':
      return { shapes: SHARD_SHAPES, colors: [0x9a958a, 0xc0b8a4, 0x6e6a62, 0xc8ccd4, 0x80706c] };
    case 'goo': case 'acidic': case 'spinner': case 'larva': case 'swarm': case 'rottingFist':
      return { shapes: MEAT_SHAPES, colors: [0x5fcf2f, 0xa6e86a, 0x2f8f1f, 0x2f7f1f] };
    case 'eye': case 'yog':
      return { shapes: MEAT_SHAPES, colors: [0xb050d0, 0x6a2a9a, 0xe8a0ff] };
    case 'bee':
      return { shapes: [5, 9, 11], colors: [0xffd020, 0x4a3a18, 0xfff0a0] };
    default: {
      // Flesh: the dark red of the blood and the pinks and raw reds of what is under the skin; a creature with another blood adds its own.
      const own = bloodRgb(kind);
      const colors = [0xc42020, 0x8a1010, 0xe07070, 0xd83030, 0x7a0e0e];
      if (own !== RED) colors.push(shade(own, 0.9), shade(own, 0.7));
      return { shapes: MEAT_SHAPES, colors };
    }
  }
}

/** How many pieces a death throws: more for big creatures, for a boss's end, for a crit and for a blow far beyond what was left; fewer on light. */
export function chunkCount(ht: number, boss: boolean, heavy: boolean, light: boolean): number {
  const base = boss ? 22 + Math.min(10, Math.round(ht / 15)) : Math.max(4, Math.min(10, 4 + Math.round(ht / 7)));
  return Math.max(2, Math.round((base + (heavy ? 3 : 0)) * (light ? 0.5 : 1)));
}

/**
 * The pieces of a death: scattered within about a cell (a boss's within two) of where it fell, on ground only, never on a cell where
 * items lie. Pure given its dice.
 */
export function chunksOf(
  map: SpatterMap, kind: string, x: number, y: number, count: number, spread: number, avoid: ReadonlySet<number>, rnd: () => number,
): Splat[] {
  const style = chunkStyle(kind);
  if (!style) return [];
  const out: Splat[] = [];
  for (let tries = 0; out.length < count && tries < count * 4; tries++) {
    const r = Math.pow(rnd(), 0.75) * spread;
    const a = rnd() * Math.PI * 2;
    const px = Math.round(x + Math.cos(a) * r);
    const py = Math.round(y + Math.sin(a) * r * 0.85);
    const cell = Math.floor(py / CELL) * map.width + Math.floor(px / CELL);
    if (px < 3 || py < 3 || px >= map.width * CELL - 3 || py >= map.height * CELL - 3 || !map.ground(cell) || avoid.has(cell)) continue;
    const shape = style.shapes[Math.floor(rnd() * style.shapes.length)]!;
    out.push({ layer: CHUNK, x: px, y: py, w: shape, h: Math.floor(rnd() * 8), rgb: style.colors[Math.floor(rnd() * style.colors.length)]! });
  }
  return out;
}

/** A chunk's pixels as (dx, dy, tone) after its flip and turns, centred about (0, 0): tone 0 body, 1 edge, 2 glint. */
export function chunkPixels(shape: number, how: number): Array<[number, number, 0 | 1 | 2]> {
  const rows = CHUNK_SHAPES[shape] ?? CHUNK_SHAPES[0]!;
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const out: Array<[number, number, 0 | 1 | 2]> = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < rows[j]!.length; i++) {
      const c = rows[j]![i]!;
      if (c === '.') continue;
      let dx = i - (w >> 1);
      let dy = j - (h >> 1);
      if (how & 1) dx = -dx;
      for (let q = (how >> 1) & 3; q > 0; q--) [dx, dy] = [-dy, dx];
      out.push([dx, dy, c === 'b' ? 1 : c === 'c' ? 2 : 0]);
    }
  }
  return out;
}

/** The ellipse of a pool under a body, as one record (radii in floor pixels). */
export function poolSplat(x: number, y: number, radius: number, rgb: number): Splat {
  return { layer: POOL, x: Math.round(x), y: Math.round(y), w: Math.max(2, Math.round(radius)), h: Math.max(1, Math.round(radius * 0.45)), rgb };
}

// ---- the level, as spatter sees it ----------------------------------------------------------------------------------------------

/** Floor a splat may lie on (not wall, water or chasm). */
export const groundCell = (terrain: number): boolean => ((terrainFlags[terrain] ?? 0) & (F.SOLID | F.LIQUID | F.PIT)) === 0;
/** A plain wall (its face is stone, not a door's leaf). */
export const wallCell = (terrain: number): boolean => terrain === T.WALL || terrain === T.WALL_DECO || terrain === T.SECRET_DOOR;
/** A wall whose face looks onto open ground to the south. */
export function faceShows(map: ArrayLike<number>, cell: number): boolean {
  if (!wallCell(map[cell] ?? 0) || cell + WIDTH >= map.length) return false;
  const south = map[cell + WIDTH]!;
  return !wallCell(south) && ((terrainFlags[south] ?? 0) & F.SOLID) === 0;
}

/** Kinds whose wounds leave nothing to spatter: spirits and the figures of fire and mirrors. */
export const NO_BLOOD: ReadonlySet<string> = new Set(['ghost', 'wraith', 'curse', 'mirror', 'elemental', 'burningFist']);

export function levelSpatterMap(map: ArrayLike<number>): SpatterMap {
  return { width: WIDTH, height: HEIGHT, ground: (cell) => groundCell(map[cell] ?? T.WALL), face: (cell) => faceShows(map, cell) };
}
