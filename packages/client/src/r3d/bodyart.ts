/*
 * A body as the 3D view draws it: the monster's own last frame of dying, a little desaturated and darkened so it reads as dead, with the
 * specks of its own blood on it (more for each time blood has spattered on it since). Baked once into a small canvas per body look; the
 * pixels are a pure function of the frame, the blood and a seed, so a body reloaded is the body that was saved.
 */
import { bloodRgb, shade } from '../gore';

/** A tiny generator: the same seed gives the same specks. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Desaturates (a share of the way to grey), darkens, and speckles the opaque pixels of RGBA data in place. */
export function deadLook(data: Uint8ClampedArray, w: number, h: number, kind: string, seed: number, hits: number): void {
  const grey = 0.4;
  const dark = 0.7;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! === 0) continue;
    const l = 0.3 * data[i]! + 0.59 * data[i + 1]! + 0.11 * data[i + 2]!;
    data[i] = (data[i]! + (l - data[i]!) * grey) * dark;
    data[i + 1] = (data[i + 1]! + (l - data[i + 1]!) * grey) * dark;
    data[i + 2] = (data[i + 2]! + (l - data[i + 2]!) * grey) * dark;
  }
  const rnd = seeded(seed);
  const blood = bloodRgb(kind);
  const specks = 1 + (seed % 3) + hits * 2;
  for (let n = 0; n < specks; n++) {
    for (let tries = 0; tries < 24; tries++) {
      const x = Math.floor(rnd() * w);
      const y = Math.floor(rnd() * h);
      const i = (y * w + x) * 4;
      if (data[i + 3]! < 200) continue;
      const c = shade(blood, 0.55 + rnd() * 0.45);
      data[i] = (c >> 16) & 255;
      data[i + 1] = (c >> 8) & 255;
      data[i + 2] = c & 255;
      break;
    }
  }
}

/** A frame of a sheet baked as a body: `size` is its width and height in art pixels. */
export function bakeBody(image: CanvasImageSource, sx: number, sy: number, w: number, h: number, kind: string, seed: number, hits: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(image, sx, sy, w, h, 0, 0, w, h);
  const pixels = g.getImageData(0, 0, w, h);
  deadLook(pixels.data, w, h, kind, seed, hits);
  g.putImageData(pixels, 0, 0);
  return canvas;
}
