/*
 * How big the blood and what a fight throws are drawn in the 3D view, in cells (a cell is 16 art pixels). Seen from above and far away a
 * single pixel is lost, so they are drawn a little bigger than their art, but never into solid cards: a chunk 4 pixels across stays about a
 * quarter of a cell, and a speck of blood a few pixels.
 */

/** A flying speck of blood or dust is this much bigger than its art pixels (a glowing one is drawn 1.5 times). */
export const SPECK_GROW = 1.6;

/** A chunk (gib) of the given width and height in art pixels: its side, cells. Never less than 0.08. */
export function chunkSize(w: number, h: number): number {
  return Math.max(0.08, (Math.max(w, h) / 16) * 1.1);
}

/** One side of a stain left on the floor, art pixels: a chunk's (it has an edge) hardly grown, a splat's a little more. Cells. */
export function stainSize(side: number, chunk: boolean): number {
  return Math.max(0.08, (side / 16) * (chunk ? 1.1 : 1.4));
}
