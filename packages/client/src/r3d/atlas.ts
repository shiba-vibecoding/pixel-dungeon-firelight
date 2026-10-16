/*
 * Packed sheets (packer.ts): every sprite sheet is copied once onto one canvas, and the whole thing is one texture, so every character, item
 * and flame is one draw. A second canvas of the same layout carries the glow of the pictures that glow (a wand, a ring, a fungus), black
 * for the rest; the sprites' material reads both. Pixel art: nearest, no mipmaps.
 */
import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';
import { RectPacker } from './packer';

export const ATLAS_W = 2048;
export const ATLAS_H = 1024;

export class Atlas {
  readonly color: CanvasTexture;
  readonly glow: CanvasTexture;
  private readonly colorCanvas: HTMLCanvasElement;
  private readonly glowCanvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly gg: CanvasRenderingContext2D;
  private readonly spots = new Map<CanvasImageSource, { x: number; y: number }>();
  /** Where the next sheet goes: they come in the order the player meets them (a hero's three views, a dozen monsters, looks and hats). */
  private readonly packer = new RectPacker(ATLAS_W, ATLAS_H);
  /** The atlas has something new to upload before the next frame. */
  dirty = false;

  constructor() {
    this.colorCanvas = document.createElement('canvas');
    this.colorCanvas.width = ATLAS_W;
    this.colorCanvas.height = ATLAS_H;
    this.g = this.colorCanvas.getContext('2d')!;
    this.glowCanvas = document.createElement('canvas');
    this.glowCanvas.width = ATLAS_W;
    this.glowCanvas.height = ATLAS_H;
    this.gg = this.glowCanvas.getContext('2d')!;
    this.gg.fillStyle = '#000';
    this.gg.fillRect(0, 0, ATLAS_W, ATLAS_H);
    this.color = new CanvasTexture(this.colorCanvas);
    this.glow = new CanvasTexture(this.glowCanvas);
    for (const texture of [this.color, this.glow]) {
      texture.colorSpace = SRGBColorSpace;
      texture.magFilter = texture.minFilter = NearestFilter;
      texture.generateMipmaps = false;
    }
  }

  /** Where an image lies on the atlas (copied there the first time, with its glow if it has one), or null if the atlas is full. */
  place(image: HTMLImageElement | HTMLCanvasElement, glow?: CanvasImageSource): { x: number; y: number } | null {
    const known = this.spots.get(image);
    if (known) return known;
    const w = image.width;
    const h = image.height;
    const spot = this.packer.place(w, h);
    if (!spot) return null;
    this.g.drawImage(image, spot.x, spot.y);
    if (glow) this.gg.drawImage(glow, spot.x, spot.y);
    this.spots.set(image, spot);
    this.dirty = true;
    return spot;
  }

  /** Uploads what has been added since the last frame. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.color.needsUpdate = true;
    this.glow.needsUpdate = true;
  }

  dispose(): void {
    this.color.dispose();
    this.glow.dispose();
    this.spots.clear();
  }
}
