/*
 * Where a figure's feet are in its picture. A frame of a sprite sheet is a rectangle, and the walker's lowest opaque row is not always its
 * last: a frame may have a row or two of clear pixels under the feet (and a walking frame lifts a foot), so a figure drawn by its
 * rectangle stands a little above the floor, or bobs above it as it walks. The renderer lowers each frame by the clear rows under its feet
 * (`gapRows`), found once from the alpha of the sheet and kept, so that its lowest opaque pixel is on the floor plane in every frame.
 *
 * Only a little is made up: a frame whose feet are lifted by more than MAX_GAP rows is a leap or a flutter that is meant to be off the
 * ground, and is drawn as it is.
 */

/** The most clear rows under the feet that are put right; more is an animation. */
export const MAX_GAP = 3;
/** The alpha at which a pixel is opaque (the sprites are drawn with an alpha test at one half). */
const OPAQUE = 128;

interface Sheet {
  width: number;
  alpha: Uint8Array | null;
  frames: Map<number, number>;
  /** The footprints (a packed number, see `footprint`), by the same key. */
  prints: Map<number, number>;
}

const sheets = new WeakMap<object, Sheet>();

function sheetOf(image: HTMLImageElement | HTMLCanvasElement): Sheet {
  let sheet = sheets.get(image);
  if (sheet) return sheet;
  sheet = { width: image.width, alpha: null, frames: new Map(), prints: new Map() };
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(image, 0, 0);
    const data = g.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
    sheet.alpha = alpha;
  } catch {
    sheet.alpha = null;
  }
  sheets.set(image, sheet);
  return sheet;
}

/**
 * The clear rows under the lowest opaque pixel of a frame (the rectangle (sx, sy, w, h) of an image), 0 if the sheet cannot be read, if the
 * frame is empty, or if it is lifted by more than MAX_GAP rows. Found the first time a frame is asked for, then read from a table.
 */
export function gapRows(image: HTMLImageElement | HTMLCanvasElement, sx: number, sy: number, w: number, h: number): number {
  const sheet = sheetOf(image);
  const alpha = sheet.alpha;
  if (!alpha) return 0;
  const key = sy * 8192 + sx;
  const known = sheet.frames.get(key);
  if (known !== undefined) return known;
  let gap = h;
  for (let row = h - 1; row >= 0 && gap === h; row--) {
    for (let col = 0; col < w; col++) {
      if (alpha[(sy + row) * sheet.width + sx + col]! >= OPAQUE) {
        gap = h - 1 - row;
        break;
      }
    }
  }
  const rows = gap === h || gap > MAX_GAP ? 0 : gap;
  sheet.frames.set(key, rows);
  return rows;
}

/** The same from a bare alpha channel (tests): the frame (0, 0, w, h) of an image `width` wide. */
export function gapOfAlpha(alpha: ArrayLike<number>, width: number, w: number, h: number): number {
  let gap = h;
  for (let row = h - 1; row >= 0 && gap === h; row--) {
    for (let col = 0; col < w; col++) {
      if (alpha[row * width + col]! >= OPAQUE) {
        gap = h - 1 - row;
        break;
      }
    }
  }
  return gap === h || gap > MAX_GAP ? 0 : gap;
}

/**
 * Where a frame's feet are across its width: the columns, first to last (inclusive), of the opaque pixels in its lowest opaque row and the
 * row above it (a foot may be lifted by one row in a stride), and how many rows it has clear under them (not capped: a leap is a big
 * number). The contact shadow is centred on this and as wide as it, so it is under the feet, not under the middle of the picture.
 */
export interface Footprint {
  lo: number;
  hi: number;
  gap: number;
}

/** The footprint of the frame (0, 0, w, h) of a bare alpha channel `width` wide, written into `out`; false for an empty frame. */
export function footprintOfAlpha(alpha: ArrayLike<number>, width: number, sx: number, sy: number, w: number, h: number, out: Footprint): boolean {
  let last = -1;
  for (let row = h - 1; row >= 0 && last < 0; row--) {
    for (let col = 0; col < w; col++) {
      if (alpha[(sy + row) * width + sx + col]! >= OPAQUE) {
        last = row;
        break;
      }
    }
  }
  if (last < 0) return false;
  let lo = w;
  let hi = -1;
  for (let row = last; row >= Math.max(0, last - 1); row--) {
    for (let col = 0; col < w; col++) {
      if (alpha[(sy + row) * width + sx + col]! >= OPAQUE) {
        if (col < lo) lo = col;
        if (col > hi) hi = col;
      }
    }
  }
  out.lo = lo;
  out.hi = hi;
  out.gap = h - 1 - last;
  return true;
}

/** The same for a frame of a loaded sheet (read once, then from a table); false if the sheet cannot be read or the frame is empty. */
export function footprint(image: HTMLImageElement | HTMLCanvasElement, sx: number, sy: number, w: number, h: number, out: Footprint): boolean {
  const sheet = sheetOf(image);
  const alpha = sheet.alpha;
  if (!alpha) return false;
  const key = sy * 8192 + sx;
  let packed = sheet.prints.get(key);
  if (packed === undefined) {
    packed = footprintOfAlpha(alpha, sheet.width, sx, sy, w, h, out) ? out.lo | (out.hi << 8) | (Math.min(out.gap, 255) << 16) : -1;
    sheet.prints.set(key, packed);
  }
  if (packed < 0) return false;
  out.lo = packed & 255;
  out.hi = (packed >> 8) & 255;
  out.gap = packed >> 16;
  return true;
}
