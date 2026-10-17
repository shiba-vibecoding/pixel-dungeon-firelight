/*
 * Packed sheets (packer.ts): every sprite sheet is copied once onto one canvas, and the whole thing is one texture, so every character, item
 * and flame is one draw. A second canvas of the same layout carries the glow of the pictures that glow (a wand, a ring, a fungus), black
 * for the rest; the sprites' material reads both. Pixel art: nearest, no mipmaps.
 */
import { CanvasTexture, DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType, Vector2, type WebGLRenderer } from 'three';
import { RectPacker } from './packer';
import { subImage, subImageSupported } from './texsub';

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
  /** The card has the atlas once the whole of it has gone up; after that only what is placed is sent, as the rectangle it is. */
  private onCard = false;
  /** Rectangles placed since the last flush, x, y, w, h each. */
  private pending: number[] = [];
  private staging = new Uint8Array(64 * 64 * 4);
  private readonly source = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat, UnsignedByteType);
  private readonly at = new Vector2();
  /** Bytes sent to the card since the start (tests, the overlay). */
  uploaded = 0;

  constructor() {
    this.colorCanvas = document.createElement('canvas');
    this.colorCanvas.width = ATLAS_W;
    this.colorCanvas.height = ATLAS_H;
    this.g = this.colorCanvas.getContext('2d', { willReadFrequently: true })!;
    this.glowCanvas = document.createElement('canvas');
    this.glowCanvas.width = ATLAS_W;
    this.glowCanvas.height = ATLAS_H;
    this.gg = this.glowCanvas.getContext('2d', { willReadFrequently: true })!;
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
    this.pending.push(spot.x, spot.y, w, h);
    return spot;
  }

  /**
   * Uploads what has been added since the last frame: the whole atlas the first time (or when the card has not got it yet), then each
   * newly placed sheet by itself, a few KB, not the 16 MB of the two canvases that every new monster, body or look used to send.
   */
  flush(renderer?: WebGLRenderer): void {
    if (!this.dirty) return;
    this.dirty = false;
    // (A card that cannot take a rectangle (texsub.ts) is sent the whole atlas, as it was before the rectangles.)
    if (!renderer || !this.onCard || !subImageSupported(renderer)) {
      this.pending.length = 0;
      this.onCard = renderer !== undefined;
      this.color.needsUpdate = true;
      this.glow.needsUpdate = true;
      this.uploaded += ATLAS_W * ATLAS_H * 8;
      return;
    }
    for (let i = 0; i < this.pending.length; i += 4) {
      const x = this.pending[i]!;
      const y = this.pending[i + 1]!;
      const w = this.pending[i + 2]!;
      const h = this.pending[i + 3]!;
      this.send(renderer, this.g, this.color, x, y, w, h);
      this.send(renderer, this.gg, this.glow, x, y, w, h);
    }
    this.pending.length = 0;
  }

  /** Sends one rectangle of a canvas to its texture (stored flipped, as a canvas texture is: y counts up from the bottom). */
  private send(renderer: WebGLRenderer, ctx: CanvasRenderingContext2D, texture: CanvasTexture, x: number, y: number, w: number, h: number): void {
    const pixels = ctx.getImageData(x, y, w, h).data;
    if (this.staging.length < pixels.length) this.staging = new Uint8Array(pixels.length);
    this.staging.set(pixels);
    const image = this.source.image as { data: Uint8Array; width: number; height: number };
    image.data = this.staging;
    image.width = w;
    image.height = h;
    this.source.unpackAlignment = 1;
    this.at.set(x, ATLAS_H - y - h);
    if (!subImage(renderer, texture, x, ATLAS_H - y - h, w, h, this.staging)) renderer.copyTextureToTexture(this.source, texture, null, this.at);
    this.uploaded += w * h * 4;
  }

  /** Marks the atlas as sent whole (after `renderer.initTexture`): from here only rectangles go up. */
  sent(): void {
    this.dirty = false;
    this.pending.length = 0;
    this.onCard = true;
  }

  dispose(): void {
    this.source.dispose();
    this.color.dispose();
    this.glow.dispose();
    this.spots.clear();
  }
}
