/*
 * An item that lies where blood has spattered: its own picture with a few specks of blood on its pixels (never on the clear ones), baked
 * once into a small canvas. The specks are a pure function of the item, the place and how much blood reached it, so the same heap looks
 * the same after a reload.
 */
import { shade } from '../gore';
import { seeded } from './bodyart';

/** Paints `hits` worth of specks (opaque pixels only) onto RGBA data of w x h, in place. */
export function speckle(data: Uint8ClampedArray, w: number, h: number, hits: number, seed: number): void {
  const rnd = seeded(seed);
  const specks = Math.min(16, 2 + hits * 2);
  for (let n = 0; n < specks; n++) {
    for (let tries = 0; tries < 30; tries++) {
      const x = Math.floor(rnd() * w);
      const y = Math.floor(rnd() * h);
      const i = (y * w + x) * 4;
      if (data[i + 3]! < 200) continue;
      const c = shade(0xbb0000, 0.55 + rnd() * 0.55);
      data[i] = (c >> 16) & 255;
      data[i + 1] = (c >> 8) & 255;
      data[i + 2] = c & 255;
      break;
    }
  }
}

/** A 16 x 16 cell of an items sheet with blood on it. */
export function bakeItem(image: CanvasImageSource, sx: number, sy: number, hits: number, seed: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(image, sx, sy, 16, 16, 0, 0, 16, 16);
  const pixels = g.getImageData(0, 0, 16, 16);
  speckle(pixels.data, 16, 16, hits, seed);
  g.putImageData(pixels, 0, 0);
  return canvas;
}
