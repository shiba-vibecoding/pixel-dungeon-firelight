import { artSeason, artUrl, compete } from './compete';

/*
 * The season's cup and frame (design part 7): drawn once in four greys (#e0e0e0 #a0a0a0 #606060 #303030) and dressed in the palette of any
 * season by swapping those four for its four shades; every other colour (the outline, the highlights, the golden flame) stays. So a new
 * season needs a palette, not art. The designer's four ready seasons (season/cup-s1.png ...) are the same thing made ahead.
 */

/** The template's four greys, light to dark. */
export const KEYS: readonly string[] = ['#e0e0e0', '#a0a0a0', '#606060', '#303030'];

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

/** Swaps the template's greys for the palette's shades in RGBA pixels (in place): the same index, exact matches only, alpha untouched. Returns how many pixels changed. */
export function recolorPixels(data: Uint8ClampedArray, palette: readonly string[], keys: readonly string[] = KEYS): number {
  const from = keys.map(rgb);
  const to = palette.slice(0, from.length).map(rgb);
  let changed = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const at = from.findIndex(([r, g, b]) => data[i] === r && data[i + 1] === g && data[i + 2] === b);
    const shade = to[at];
    if (at < 0 || !shade) continue;
    [data[i], data[i + 1], data[i + 2]] = shade;
    changed++;
  }
  return changed;
}

/** The palette of a season's art (the designer's four come round again after the fourth). */
export function paletteOf(number: number): readonly string[] {
  const id = artSeason(number);
  return compete()?.season.seasons.find((season) => season.id === id)?.palette ?? KEYS;
}

const made = new Map<string, Promise<HTMLCanvasElement | null>>();

/** A template picture (the cup's, the frame's) in the colours of a season, on a canvas of its own size; null if it cannot be had. */
export function dressed(path: string, number: number): Promise<HTMLCanvasElement | null> {
  const key = `${path}|${artSeason(number)}`;
  let found = made.get(key);
  if (!found) {
    found = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = Object.assign(document.createElement('canvas'), { width: image.naturalWidth, height: image.naturalHeight });
        const g = canvas.getContext('2d')!;
        g.drawImage(image, 0, 0);
        const pixels = g.getImageData(0, 0, canvas.width, canvas.height);
        recolorPixels(pixels.data, paletteOf(number));
        g.putImageData(pixels, 0, 0);
        resolve(canvas);
      };
      image.onerror = () => resolve(null);
      image.src = artUrl(path);
    });
    made.set(key, found);
  }
  return found;
}

/** A copy of a canvas (the dressed pictures are kept once and shown many times: one canvas cannot be in two places), at `scale` screen pixels to an art pixel. */
export function copyOf(canvas: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const copy = Object.assign(document.createElement('canvas'), { width: canvas.width, height: canvas.height });
  copy.getContext('2d')!.drawImage(canvas, 0, 0);
  copy.style.width = `${canvas.width * scale}px`;
  copy.style.height = `${canvas.height * scale}px`;
  copy.style.imageRendering = 'pixelated';
  return copy;
}

/** The season's cup, drawn `scale` screen pixels to an art pixel, as a node (filled when it has come). */
export function cupNode(number: number, scale = 3): HTMLElement {
  const holder = document.createElement('span');
  holder.className = 'fl-cup';
  const template = compete()?.season.template.cup;
  if (!template) return holder;
  void dressed(template, number).then((canvas) => {
    if (canvas) holder.append(copyOf(canvas, scale));
  });
  return holder;
}
