/*
 * Which sprite sheets have soft (partly transparent) pixels: a ghost's body, a wraith's, a bee's wings, an elemental's flame. The main
 * sprite batch cuts at an alpha of one half, which keeps the opaque face and throws the body away; these go to a second, blended batch.
 * No DOM here: the caller reads the pixels.
 */

/** The share of the picture's visible pixels that are neither clear nor solid (alpha 1 to 249): pixel art made for opaque colour has almost none. */
export function softShare(rgba: ArrayLike<number>): number {
  let visible = 0;
  let soft = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    const a = rgba[i]!;
    if (a === 0) continue;
    visible++;
    if (a < 250) soft++;
  }
  return visible === 0 ? 0 : soft / visible;
}

/** A sheet is drawn blended when more than 5% of what shows of it is soft (the bats' and eyes' shading is 7%; a stray pixel does not count). */
export const SOFT_LIMIT = 0.05;

export const isSoft = (rgba: ArrayLike<number>): boolean => softShare(rgba) > SOFT_LIMIT;
