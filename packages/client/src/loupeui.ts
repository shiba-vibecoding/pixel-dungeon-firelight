import type { Item, World } from '@pd/core';
import { t } from './i18n';
import { itemName } from './itemtext';
import type { Tapped } from './loupe';

/*
 * The loupe's glass and label (fl-input.css): a bubble, placed above the finger, holding a magnified copy of the cells round the target
 * and the words for what lifting would do; and, for a mouse, only the words, by the cursor. Page elements: they take no touch and move
 * nothing under the finger. The copy is cut from the canvases in the task that drew the frame (the 3D scene keeps no picture of it), so
 * nothing is allocated per frame: the bubble's canvas is made once.
 */

/** The words for what a tap would do. */
export function tapLabel(world: World, tapped: Tapped): string {
  const L = t.input.loupe;
  const name = (item: Item | undefined): string | null => (item ? itemName(world, item) : null);
  // In the middle of a sentence a name starts small: «Attack: crab».
  const mob = (): string => (tapped.mob ? t.mobs[tapped.mob].replace(/^./, (c) => c.toLowerCase()) : '');
  switch (tapped.kind) {
    case 'walk': return L.walk(tapped.steps);
    case 'attack': return L.attack(mob());
    case 'approach': return L.approach(mob());
    case 'open': return L.open(tapped.steps);
    case 'pickup': return L.pickup(name(tapped.item), tapped.steps);
    case 'descend': return L.descend(tapped.steps);
    case 'ascend': return L.ascend(tapped.steps);
    default: return L[tapped.kind];
  }
}

/** The glass is this many CSS pixels across (three cells); it is as tall as the three cells are on the screen. */
const GLASS_W = 132;

export class LoupeGlass {
  readonly root: HTMLElement;
  private readonly glass: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly label: HTMLElement;
  private shown = '';
  /** The glass's height in CSS pixels. */
  private height = 0;

  constructor() {
    this.glass = document.createElement('canvas');
    this.glass.className = 'fl-loupe-glass';
    this.ctx = this.glass.getContext('2d');
    this.label = Object.assign(document.createElement('div'), { className: 'fl-loupe-label' });
    const frame = Object.assign(document.createElement('div'), { className: 'fl-loupe-frame' });
    const lens = Object.assign(document.createElement('div'), { className: 'fl-loupe-lens' });
    lens.append(this.glass, frame);
    this.root = Object.assign(document.createElement('div'), { className: 'fl-loupe' });
    this.root.hidden = true;
    this.root.append(lens, this.label);
    document.body.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  /**
   * Shows the bubble over the finger at (x, y) (CSS pixels): `text` for the action, `muted` when lifting would only cancel. `shape` is the
   * aspect of three cells on the screen (height over width), so the glass keeps their proportions.
   */
  show(text: string, muted: boolean, x: number, y: number, shape: number): void {
    const h = Math.round(GLASS_W * shape);
    if (this.height !== h) {
      this.height = h;
      const dpr = Math.min(3, Math.max(1, Math.round(devicePixelRatio || 1)));
      this.glass.width = GLASS_W * dpr;
      this.glass.height = h * dpr;
      this.glass.style.width = `${GLASS_W}px`;
      this.glass.style.height = `${h}px`;
    }
    if (this.shown !== text) {
      this.shown = text;
      this.label.textContent = text;
    }
    this.root.classList.toggle('muted', muted);
    this.root.hidden = false;
    const total = h + 48;
    // The bubble is as wide as its label (or the glass); it stays on the screen.
    const half = Math.max(GLASS_W + 14, this.root.offsetWidth) / 2;
    const left = Math.min(innerWidth - half - 4, Math.max(half + 4, x));
    // Above the finger, clear of it; under it when there is no room above (the top of the screen).
    const above = y - 56 - total;
    const top = above >= 4 ? above : Math.min(innerHeight - total - 4, y + 56);
    this.root.style.left = `${Math.round(left)}px`;
    this.root.style.top = `${Math.round(top)}px`;
  }

  /** Copies a region of the map canvas (device pixels) into the glass, magnified; each source has its own scale to those; the first is the lowest. */
  paint(sources: ReadonlyArray<{ image: CanvasImageSource; scale: number }>, sx: number, sy: number, sw: number, sh: number): void {
    const ctx = this.ctx;
    if (!ctx || this.root.hidden || this.glass.width === 0) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.glass.width, this.glass.height);
    for (const { image, scale } of sources) {
      try {
        ctx.drawImage(image, sx * scale, sy * scale, sw * scale, sh * scale, 0, 0, this.glass.width, this.glass.height);
      } catch {
        // A canvas that cannot be read this frame: the glass keeps what it has.
      }
    }
  }

  hide(): void {
    this.root.hidden = true;
    this.shown = '';
  }
}

/** A mouse's label: the words by the cursor, nothing more. */
export class HoverLabel {
  readonly root: HTMLElement;
  private shown = '';

  constructor() {
    this.root = Object.assign(document.createElement('div'), { className: 'fl-hover-label' });
    this.root.hidden = true;
    document.body.append(this.root);
  }

  show(text: string, x: number, y: number): void {
    if (this.shown !== text) {
      this.shown = text;
      this.root.textContent = text;
    }
    this.root.hidden = false;
    this.root.style.left = `${Math.round(Math.min(innerWidth - 120, x + 16))}px`;
    this.root.style.top = `${Math.round(Math.max(8, y - 34))}px`;
  }

  hide(): void {
    this.root.hidden = true;
    this.shown = '';
  }
}
