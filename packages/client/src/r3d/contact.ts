/*
 * Where a figure's contact shadow goes, in the floor's own measure, from where its feet are in its picture (feet.ts). The shadow is a small
 * dark ellipse, and what makes a figure stand on the floor and not hang over it is that it touches the soles: its top edge is under the
 * lowest row of the feet's pixels on the screen (the figure is drawn over it, so only the part below the soles shows), it is as wide as the
 * feet and centred on them, and it does not slip away from the light (the soft blob under it may, a little).
 *
 * In water the lowest row of the feet is under the surface (the sprite shader drops it), so the waterline is one row up and the shadow
 * with it; and water does not take a crisp shadow, so it is much fainter there.
 */
import { YS } from './project';

const TILE = 16;
/** A margin of this many art pixels each side of the feet's own width. */
const MARGIN = 1;
/** How far under the soles' line the top edge of the shadow starts, in screen art pixels (the lowest row of the feet is one pixel high). */
const OVERLAP = 1.5;
/** The same in water: the waterline is a row up. */
const OVERLAP_WADING = 2.5;
/** The narrowest and widest contact shadow, cells. */
const MIN_WIDTH = 0.26;
const MAX_WIDTH = 1.2;
/** The shallowest, in screen art pixels: a flatter ellipse than this is a line, not a shadow. */
const MIN_DEPTH_PX = 3.2;
/** How much of its strength a contact shadow, and the soft blob, keep on water. */
export const WATER_CONTACT = 0.35;
export const WATER_BLOB = 0.3;

/** One art pixel on the screen, in cells of floor depth (the floor is squeezed by the sine of the pitch). */
export const pixelDepth = (): number => 1 / (TILE * YS);

export interface Contact {
  /** Middle of the ellipse on the floor, cells. */
  x: number;
  z: number;
  /** Across and front to back, cells. */
  width: number;
  depth: number;
}

/**
 * The shadow of feet whose lowest opaque row spans the columns `lo` to `hi` of a picture `pictureW` wide, drawn `scale` times as big and
 * mirrored if `flip`, standing at (tx, tz) (the point of the floor under the bottom edge of the lowest row of the feet).
 */
export function contactAt(tx: number, tz: number, lo: number, hi: number, pictureW: number, flip: boolean, scale: number, wading: boolean, out: Contact): Contact {
  const middle = (lo + hi + 1) / 2 - pictureW / 2;
  out.x = tx + ((flip ? -middle : middle) / TILE) * scale;
  out.width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ((hi - lo + 1 + 2 * MARGIN) / TILE) * scale));
  const px = pixelDepth();
  out.depth = Math.max(out.width * 0.4, MIN_DEPTH_PX * px * scale);
  const top = tz - (wading ? OVERLAP_WADING : OVERLAP) * px * scale;
  out.z = top + out.depth / 2;
  return out;
}
