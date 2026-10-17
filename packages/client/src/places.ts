import { LENGTH, RoomType, T, type Level, type World, WIDTH } from '@pd/core';
import { AMBIENT_CADENCE, AMBIENT_LOOP, AMBIENT_MOTE, type AmbientEntry } from './fxplayer';

/*
 * Special places and objects: what the level has that looks and sounds like itself (the three wells, the altar's fire, the alchemy pot,
 * a garden's sungrass, the library's shelves, a prize on its pedestal, the signs, a dewdrop on the floor), what each says when examined,
 * and the little record the 3D view draws their light and life from.
 *
 * Presentation only: nothing here changes a rule, and nothing here knows what the rules keep hidden. What a place shows is what the
 * original shows: a well's water is plain to see (WellWater.tileDesc names it, its Speck rises off it); a prize lies on its pedestal in
 * the open; the sacrificial fire burns while it does. A heap (a prize, a dewdrop) is only ever drawn where the party sees it, and the
 * scene gates every place on the party's sight, so a place never shows through a wall or in the dark.
 */

export const P_WELL = 1;
export const P_ALTAR = 2;
export const P_POT = 3;
export const P_SUNGRASS = 4;
export const P_SHELF = 5;
export const P_PEDESTAL = 6;
export const P_SIGN = 7;
export const P_DEW = 8;
/** The blacksmith's forge (its light; the flames are the designer's `quest.forge` loop beside him). */
export const P_FORGE = 9;

/** A well's water, as the number the scene reads it by. */
export const W_HEALTH = 0;
export const W_AWARE = 1;
export const W_CHANGE = 2;

export interface Spot {
  kind: number;
  cell: number;
  /** For a well: which water. */
  water: number;
}


/** The record the 3D scene reads: the places of the floor shown, and whether the altar's fire burns. */
export const placeStore = {
  spots: [] as Spot[],
  /** The designer's loops of the floor (scanAmbient), for the effects player. */
  ambient: [] as AmbientEntry[],
  /** What the list was made for, so it is made again only when the floor or the turn changes. */
  key: '',
  /** The floor the list is of (the depth, and which run), so the sounds' clocks start over on a new one. */
  floor: '',
};

export const WATER_NUMBER = { health: W_HEALTH, awareness: W_AWARE, transmutation: W_CHANGE } as const;

/**
 * The places of a floor: wells that still hold water, the altar while its fire burns, alchemy pots, sungrass, bookshelves, pedestals with
 * a prize on them (the altar's own is the altar), signs, dewdrops lying about.
 */
export function scanPlaces(world: World, depth: number): Spot[] {
  const level: Level | undefined = world.levels[depth];
  const floor = world.floors[depth];
  const out: Spot[] = [];
  if (!level) return out;
  const wells = new Map<number, number>();
  for (const well of level.wells) wells.set(well.pos, WATER_NUMBER[well.water]);
  const altar = floor?.altar && floor.altar.volume > 0 ? floor.altar.pos : -1;
  const map = level.map;
  for (let cell = 0; cell < LENGTH; cell++) {
    switch (map[cell]) {
      case T.WELL: {
        const water = wells.get(cell);
        if (water !== undefined) out.push({ kind: P_WELL, cell, water });
        break;
      }
      case T.ALCHEMY:
        out.push({ kind: P_POT, cell, water: 0 });
        break;
      case T.BOOKSHELF:
        out.push({ kind: P_SHELF, cell, water: 0 });
        break;
      case T.SIGN:
        out.push({ kind: P_SIGN, cell, water: 0 });
        break;
      case T.PEDESTAL:
        if (cell === altar) out.push({ kind: P_ALTAR, cell, water: 0 });
        else if (floor?.heaps.some((h) => h.pos === cell && h.kind !== 'hidden' && h.items.length > 0)) out.push({ kind: P_PEDESTAL, cell, water: 0 });
        break;
      default:
        break;
    }
  }
  if (level.blacksmith !== undefined && level.blacksmith >= 0) out.push({ kind: P_FORGE, cell: level.blacksmith, water: 0 });
  for (const plant of floor?.plants ?? []) if (plant.kind === 'sungrass') out.push({ kind: P_SUNGRASS, cell: plant.pos, water: 0 });
  for (const heap of floor?.heaps ?? []) if (heap.kind === 'heap' && heap.items[0]?.kind === 'dew') out.push({ kind: P_DEW, cell: heap.pos, water: 0 });
  return out;
}

/** What the light of each place is: colour (sRGB, 0..1), how bright and far it reaches, and how it flickers. */
export interface PlaceLook {
  rgb: readonly [number, number, number];
  /** The strength of the glow on the floor, and the strength and reach of the scene's light (0: none; a torch is 11 to 14). */
  glow: number;
  light: number;
  reach: number;
  /** Flicker, Hz and share. */
  hz: number;
  amp: number;
}

export const WELL_LOOK: readonly PlaceLook[] = [
  // Health: the rose-scarlet of the designer's water (place.well.health, #ff8a9a).
  { rgb: [1.0, 0.5412, 0.6039], glow: 0.55, light: 4, reach: 5.5, hz: 0.5, amp: 0.1 },
  // Awareness: a cool clear blue, flickering like stars.
  { rgb: [0.42, 0.74, 1.0], glow: 0.55, light: 4, reach: 5.5, hz: 1.3, amp: 0.16 },
  // Transmutation: violet that never keeps one colour.
  { rgb: [0.78, 0.45, 1.0], glow: 0.55, light: 4, reach: 5.5, hz: 0.8, amp: 0.2 },
];
export const ALTAR_LOOK: PlaceLook = { rgb: [1.0, 0.42, 0.16], glow: 0.9, light: 10, reach: 8, hz: 3.2, amp: 0.28 };
// The brew's amber (place.pot.amber, #ffb84a).
export const POT_LOOK: PlaceLook = { rgb: [1.0, 0.72, 0.29], glow: 0.4, light: 3.5, reach: 4.2, hz: 0.9, amp: 0.12 };
export const SUNGRASS_LOOK: PlaceLook = { rgb: [1.0, 0.86, 0.4], glow: 0.35, light: 0, reach: 2.6, hz: 0.4, amp: 0.1 };
export const PEDESTAL_LOOK: PlaceLook = { rgb: [1.0, 0.9, 0.6], glow: 0.45, light: 3, reach: 4.2, hz: 0.6, amp: 0.08 };
/** The forge (quest.forge's light, #ff8a3a, flickering, 4 cells). */
export const FORGE_LOOK: PlaceLook = { rgb: [1.0, 0.5412, 0.2275], glow: 0.5, light: 3.2, reach: 4, hz: 3.4, amp: 0.25 };

/** The look of the light a spot gives, or null if it gives none. */
export function lookOf(spot: Spot): PlaceLook | null {
  switch (spot.kind) {
    case P_WELL: return WELL_LOOK[spot.water] ?? null;
    case P_ALTAR: return ALTAR_LOOK;
    case P_POT: return POT_LOOK;
    case P_SUNGRASS: return SUNGRASS_LOOK;
    case P_PEDESTAL: return PEDESTAL_LOOK;
    case P_FORGE: return FORGE_LOOK;
    default: return null;
  }
}

/** A colour of a look as the number Three.js takes. */
export const hexOf = (rgb: readonly [number, number, number]): number =>
  (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);

/* ---------- The designer's loops (fx.json ambient) ---------- */

/** How high the water of a well lies (the kit: the rim 0.4, the water 0.2 under it), cells. */
export const WATER_Y = 0.2;
/** A garden's firefly every this many cells of tall grass; a library's dust every this many shelves (fx.json ambient). */
export const FIREFLY_PER = 6;
export const DUST_PER = 4;
/** A glint runs over the spines of a shelf once every so many ms. */
export const SHELF_EVERY: readonly [number, number] = [4000, 7000];

/** The effect of each water's well (fx.json ambient.terrain.WELL). */
export const WELL_FX: readonly string[] = ['place.well.health', 'place.well.awareness', 'place.well.transmutation'];

/** A number in 0..1 from a cell and a salt, the same every time. */
export function cellSeed(cell: number, salt: number): number {
  let h = (Math.imul(cell | 0, 374761393) + Math.imul(salt | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const NO_EVERY: readonly [number, number] = [0, 0];

const entry = (id: string, mode: number, cell: number, dx: number, dz: number, lift: number, salt: number, every = NO_EVERY): AmbientEntry => ({
  id, mode, x: (cell % WIDTH) + 0.5 + dx, z: Math.trunc(cell / WIDTH) + 0.5 + dz, lift, seed: cellSeed(cell, salt), every,
});

/**
 * The loops the floor keeps in the designer's art, for the party's sight to show (only what the party sees is drawn: fxplayer.ts):
 * the water of the wells that hold water, the pot, a pedestal and the prize on it, the signs, the shelves' glints and the dust before
 * them, the garden's fireflies over its tall grass, a dewdrop on the floor, the forge beside the blacksmith. Nothing here is a thing the
 * level keeps secret: it is the terrain and the heaps that lie in the open, the same the places' own lights are made from.
 */
export function scanAmbient(world: World, depth: number): AmbientEntry[] {
  const level: Level | undefined = world.levels[depth];
  const floor = world.floors[depth];
  const out: AmbientEntry[] = [];
  if (!level) return out;
  const map = level.map;
  const wells = new Map<number, number>();
  for (const well of level.wells) wells.set(well.pos, WATER_NUMBER[well.water]);
  const altar = floor?.altar && floor.altar.volume > 0 ? floor.altar.pos : -1;
  const gardens = (level.rooms ?? []).filter((room) => room.type === RoomType.GARDEN);
  const inGarden = (cell: number): boolean => {
    const x = cell % WIDTH;
    const y = Math.trunc(cell / WIDTH);
    return gardens.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  };
  for (let cell = 0; cell < LENGTH; cell++) {
    switch (map[cell]) {
      case T.WELL: {
        const water = wells.get(cell);
        if (water !== undefined) out.push(entry(WELL_FX[water]!, AMBIENT_LOOP, cell, 0, 0, WATER_Y + 0.02, 1));
        break;
      }
      case T.ALCHEMY:
        out.push(entry('place.pot.amber', AMBIENT_LOOP, cell, 0, 0, NaN, 2));
        break;
      case T.BOOKSHELF:
        out.push(entry('place.shelf', AMBIENT_CADENCE, cell, 0, 0.05, 0.55, 3, SHELF_EVERY));
        if (cellSeed(cell, 4) < 1 / DUST_PER) out.push(entry('place.dust', AMBIENT_MOTE, cell, 0, 0.5, 0.5, 5));
        break;
      case T.SIGN:
        out.push(entry('place.sign', AMBIENT_LOOP, cell, 0, 0, 0.62, 6));
        break;
      case T.PEDESTAL:
        if (cell !== altar && floor?.heaps.some((h) => h.pos === cell && h.kind !== 'hidden' && h.items.length > 0)) {
          out.push(entry('place.pedestal', AMBIENT_LOOP, cell, 0, 0, NaN, 7));
          out.push(entry('place.prize', AMBIENT_LOOP, cell, 0, 0, 0.72, 8));
        }
        break;
      case T.HIGH_GRASS:
        if (cellSeed(cell, 9) < 1 / FIREFLY_PER && inGarden(cell)) out.push(entry('place.firefly', AMBIENT_MOTE, cell, 0, 0, 0.35, 10));
        break;
      default:
        break;
    }
  }
  for (const heap of floor?.heaps ?? []) if (heap.kind === 'heap' && heap.items[0]?.kind === 'dew') out.push(entry('place.dew', AMBIENT_LOOP, heap.pos, 0, 0, NaN, 11));
  if (level.blacksmith !== undefined && level.blacksmith >= 0) {
    // The forge stands beside him: to the east when that is open floor, else to the west.
    const open = (cell: number): boolean => map[cell] === T.EMPTY_SP || map[cell] === T.EMPTY;
    const east = level.blacksmith + 1;
    const west = level.blacksmith - 1;
    const at = open(east) ? east : open(west) ? west : level.blacksmith;
    out.push(entry('quest.forge', AMBIENT_LOOP, at, 0, 0, NaN, 12));
  }
  return out;
}
