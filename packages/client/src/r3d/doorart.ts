/*
 * The extra tiles of the doors' 3D dressing, drawn when a region's terrain is built (no new files): the strip of a door's top seen from
 * above (both ways round, plain and with a lock's straps), the frame's wood, steel, and the leaf's own picture: wood only (planks, hinge
 * straps and a ring, or straps and a lock). The original's door tile has a stone or plaster frame round its planks, which on a swinging
 * leaf looked like a piece of wall coming open, so the leaf takes only the colours of the planks from that tile (kept to brown wood, so
 * a city's grey door or the halls' green runes still give plank colour). They lie in the terrain atlas under the walls' rows
 * (tilemap.ts DOOR_FIRST), 16 x 16 pixel art each.
 */
import { DOOR_FIRST } from './tilemap';

/** Which tile of the door set is which. */
export const DOOR_TOP_H = DOOR_FIRST;
export const DOOR_TOP_V = DOOR_FIRST + 1;
export const DOOR_LOCK_H = DOOR_FIRST + 2;
export const DOOR_LOCK_V = DOOR_FIRST + 3;
export const DOOR_FRAME = DOOR_FIRST + 4;
export const DOOR_IRON = DOOR_FIRST + 5;
export const DOOR_LEAF = DOOR_FIRST + 6;
export const DOOR_LEAF_LOCK = DOOR_FIRST + 7;
export const DOOR_COUNT = 8;

type Rgb = readonly [number, number, number];

const STEEL: Rgb = [139, 147, 160];
const STEEL_DARK: Rgb = [66, 72, 84];
const STEEL_LIGHT: Rgb = [200, 206, 216];
/** Dark iron (a lock, straps, hinges): on wood it reads as ironwork, not as a grey block. */
const IRON: Rgb = [66, 69, 78];
const IRON_DARK: Rgb = [30, 32, 38];
const IRON_LIGHT: Rgb = [112, 116, 128];

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const css = (c: Rgb, k = 1): string => `rgb(${Math.round(Math.min(255, c[0] * k))},${Math.round(Math.min(255, c[1] * k))},${Math.round(Math.min(255, c[2] * k))})`;
const luma = (c: Rgb): number => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

/** The dark, middle and light wood of a door tile, from its own pixels (the darkest, median and lightest fifth that are not clear). */
export function woodOf(data: Uint8ClampedArray): { dark: Rgb; mid: Rgb; light: Rgb } {
  const px: Rgb[] = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]! > 200) px.push([data[i]!, data[i + 1]!, data[i + 2]!]);
  if (px.length === 0) return { dark: [70, 44, 24], mid: [120, 78, 40], light: [170, 120, 66] };
  px.sort((a, b) => luma(a) - luma(b));
  const at = (f: number): Rgb => px[Math.min(px.length - 1, Math.floor(px.length * f))]!;
  return { dark: at(0.12), mid: at(0.5), light: at(0.86) };
}

const BROWN: Rgb = [120, 76, 44];
const isWood = (c: Rgb): boolean => c[0] >= c[1] * 1.12 && c[0] >= c[2] * 1.2 && Math.max(...c) - Math.min(...c) > 24;

/**
 * Wood from what a door tile's middle gave: where a colour is not wood (a city's grey-brown, the halls' green runes, the plaster of
 * a frame) it is made brown at the same lightness, so every region's leaf is plank colour and nothing pale or stone.
 */
export function plankColours(w: { dark: Rgb; mid: Rgb; light: Rgb }): { dark: Rgb; mid: Rgb; light: Rgb } {
  const fix = (c: Rgb): Rgb => {
    if (isWood(c)) return c;
    const k = Math.min(1.3, Math.max(0.5, luma(c) / luma(BROWN)));
    return [BROWN[0] * k, BROWN[1] * k, BROWN[2] * k];
  };
  const dark = fix(w.dark);
  const mid = fix(w.mid);
  const light = fix(w.light);
  // Dark, middle and light stay in that order whatever was replaced.
  return luma(dark) <= luma(mid) && luma(mid) <= luma(light) ? { dark, mid, light } : { dark: mix(mid, [10, 6, 3], 0.45), mid, light: mix(mid, [255, 220, 170], 0.25) };
}

/** A cheap repeatable hash for the grain, 0 to 1. */
const noise = (x: number, y: number, seed: number): number => {
  let h = Math.imul(x * 374761393 + y * 668265263 + seed * 2246822519, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

type Painter = (x: number, y: number, c: Rgb) => void;

/** A slab of wooden planks seen from above, planks running along x; the south edge (the bottom rows) catches the light. */
function slab(paint: Painter, wood: { dark: Rgb; mid: Rgb; light: Rgb }, seed: number): void {
  for (let y = 0; y < 16; y++) {
    const plank = y < 5 ? 0 : y < 11 ? 1 : 2;
    const gap = y === 5 || y === 11 || y === 0 || y === 15;
    for (let x = 0; x < 16; x++) {
      let c = mix(wood.mid, wood.light, 0.25 + 0.2 * plank / 2);
      const grain = noise(Math.floor((x + plank * 5) / 3), y, seed);
      if (grain < 0.3) c = mix(c, wood.dark, 0.35);
      else if (grain > 0.86) c = mix(c, wood.light, 0.5);
      if (gap) c = mix(wood.dark, [10, 6, 3], 0.4);
      else if (y === 4 || y === 10 || y === 14) c = mix(c, wood.dark, 0.3);
      else if (y === 1 || y === 6 || y === 12) c = mix(c, wood.light, 0.35);
      paint(x, y, c);
    }
  }
}

/** The same slab with a dark iron strap bound round each end: the top edge of a locked leaf, wood with ironwork. */
function locked(paint: Painter, wood: { dark: Rgb; mid: Rgb; light: Rgb }, seed: number): void {
  slab(paint, wood, seed);
  for (const x0 of [2, 11]) {
    for (let x = x0; x < x0 + 3; x++) {
      for (let y = 0; y < 16; y++) paint(x, y, y === 0 || y === 15 ? IRON_DARK : x === x0 ? IRON_LIGHT : x === x0 + 2 ? IRON_DARK : IRON);
    }
    paint(x0 + 1, 3, IRON_DARK);
    paint(x0 + 1, 12, IRON_DARK);
  }
}

/**
 * The leaf's face: only wood. Three vertical planks with dark seams, a darker edge, grain, two iron hinge straps on the left and a ring
 * handle on the right; locked: iron straps across and a lock plate with a keyhole instead of the handle.
 */
function leafFace(paint: Painter, wood: { dark: Rgb; mid: Rgb; light: Rgb }, seed: number, lockedLeaf: boolean): void {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const plank = x < 5 ? 0 : x < 10 ? 1 : 2;
      let c = mix(wood.mid, wood.light, 0.1 + 0.18 * plank);
      const grain = noise(x + plank * 3, Math.floor(y / 3), seed + plank);
      if (grain < 0.28) c = mix(c, wood.dark, 0.4);
      else if (grain > 0.85) c = mix(c, wood.light, 0.5);
      if (x === 0 || x === 15) c = mix(wood.dark, [10, 6, 3], 0.4);
      else if (x === 5 || x === 10) c = mix(wood.dark, [10, 6, 3], 0.35);
      else if (x === 4 || x === 9 || x === 14) c = mix(c, wood.dark, 0.3);
      else if (x === 1 || x === 6 || x === 11) c = mix(c, wood.light, 0.3);
      paint(x, y, c);
    }
  }
  if (!lockedLeaf) {
    // Hinge straps, and an iron ring.
    for (const y of [3, 4, 11, 12]) for (let x = 0; x < 7; x++) paint(x, y, y === 3 || y === 11 ? IRON_LIGHT : IRON_DARK);
    for (const [x, y] of [[11, 7], [12, 7], [10, 8], [13, 8], [10, 9], [13, 9], [11, 10], [12, 10]] as const) paint(x, y, y < 9 ? IRON_LIGHT : IRON);
    return;
  }
  // Two dark iron straps across the planks, riveted; a lock plate at handle height with a keyhole; a small padlock hanging from it.
  for (const y of [3, 4, 11, 12]) for (let x = 0; x < 16; x++) paint(x, y, y === 3 || y === 11 ? IRON_LIGHT : x % 5 === 2 ? IRON_DARK : IRON);
  for (let y = 6; y < 10; y++) for (let x = 5; x < 11; x++) paint(x, y, y === 6 || x === 5 ? IRON_LIGHT : y === 9 || x === 10 ? IRON_DARK : IRON);
  for (const [x, y] of [[7, 7], [8, 7], [7, 8]] as const) paint(x, y, [6, 6, 8]);
  paint(8, 8, IRON_DARK);
  for (const [x, y] of [[7, 10], [8, 10], [6, 11], [9, 11]] as const) paint(x, y, IRON_LIGHT);
  for (const x of [7, 8]) for (const y of [11, 12]) paint(x, y, y === 11 ? [150, 120, 40] : [110, 86, 28]);
}

/** Paints a tile (16 x 16) of colour and of glow with a function that draws into an offscreen canvas, then lays both on the sheets. */
function lay(
  color: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, tile: number, cols: number, ox: number, oy: number,
  draw: (paint: Painter) => void, rim: Rgb | null,
): void {
  const x0 = ox + (tile % cols) * 16;
  const y0 = oy + Math.trunc(tile / cols) * 16;
  draw((x, y, c) => {
    color.fillStyle = css(c);
    color.fillRect(x0 + x, y0 + y, 1, 1);
    // A faint warm glow of its own: the rim of the tile (the door's lit edge) and a little over the rest.
    if (rim) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15 || x === 1 || y === 14 ? 1 : 0.35;
      glow.fillStyle = css(rim, edge * (0.55 + 0.45 * Math.min(1, luma(c) / 150)));
      glow.fillRect(x0 + x, y0 + y, 1, 1);
    }
  });
}

/**
 * Draws the door set onto the colour and glow canvases of the terrain (the colour's door tile is read from the same sheet `tiles`:
 * `cols` tiles across, the region's door at tile 5): the tiles go at DOOR_FIRST on, under the walls' rows.
 */
export function paintDoorTiles(color: CanvasRenderingContext2D, glow: CanvasRenderingContext2D, tiles: CanvasImageSource & { width: number; height: number }, cols: number): void {
  const probe = document.createElement('canvas');
  probe.width = 16;
  probe.height = 16;
  const pg = probe.getContext('2d', { willReadFrequently: true })!;
  pg.drawImage(tiles, 5 * 16, 0, 16, 16, 0, 0, 16, 16);
  // The planks only (the middle of the tile), not the frame round them, which may be plaster or iron.
  const wood = plankColours(woodOf(pg.getImageData(4, 3, 8, 10).data));
  const warm: Rgb = [92, 52, 20];
  const transposed = (draw: (paint: Painter) => void) => (paint: Painter): void => draw((x, y, c) => paint(y, x, c));
  const seed = Math.round(luma(wood.mid));
  lay(color, glow, DOOR_TOP_H, cols, 0, 0, (p) => slab(p, wood, seed), warm);
  lay(color, glow, DOOR_TOP_V, cols, 0, 0, transposed((p) => slab(p, wood, seed)), warm);
  lay(color, glow, DOOR_LOCK_H, cols, 0, 0, (p) => locked(p, wood, seed), warm);
  lay(color, glow, DOOR_LOCK_V, cols, 0, 0, transposed((p) => locked(p, wood, seed)), warm);
  // The leaf's own picture, wood only: the original's door tile has a plaster or stone frame round its planks, which on a leaf looks like
  // a piece of wall swinging open.
  lay(color, glow, DOOR_LEAF, cols, 0, 0, (p) => leafFace(p, wood, seed + 7, false), warm);
  lay(color, glow, DOOR_LEAF_LOCK, cols, 0, 0, (p) => leafFace(p, wood, seed + 7, true), warm);
  // The frame: darker, closer-grained wood, planks running up.
  lay(color, glow, DOOR_FRAME, cols, 0, 0, (paint) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let c = mix(wood.dark, wood.mid, 0.55);
        const grain = noise(x, Math.floor(y / 4), seed + 3);
        if (grain < 0.35) c = mix(c, wood.dark, 0.5);
        else if (grain > 0.8) c = mix(c, wood.light, 0.4);
        if (x === 0 || x === 15) c = mix(c, [8, 5, 3], 0.5);
        else if (x === 1 || x === 14) c = mix(c, wood.light, 0.25);
        paint(x, y, c);
      }
    }
  }, warm);
  lay(color, glow, DOOR_IRON, cols, 0, 0, (paint) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let c = y < 2 ? STEEL_LIGHT : y > 13 ? STEEL_DARK : STEEL;
        if ((x === 2 || x === 13) && y > 4 && y < 11) c = STEEL_LIGHT;
        paint(x, y, c);
      }
    }
  }, [60, 70, 90]);
}
