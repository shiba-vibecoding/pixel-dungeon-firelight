import { WIDTH } from '@pd/core';
import type { Worn } from './wear';

/*
 * What the hero's cosmetics put on the floor, as little pictures to draw (the 2D renderer and the 3D one both draw the same list):
 * the footprints of the trail, the effect that plays where a foe falls to the hero, the one at the hero's grave, and the pet that
 * follows one cell behind (a flyer hangs 0.35 of a cell up and bobs). Pure bookkeeping, no drawing and no rules: nothing here can
 * change a run. Positions are world pixels, a cell's top-left corner, as a walker's are (view.ts position); a picture says which
 * pixel of itself stands on the feet point of that cell, and how far from it.
 */

const TILE = 16;
/** The pet takes its step this long after the hero's (the designer's `follow.lag_ms`). */
const PET_LAG_MS = 220;
/** Footprints kept at once, kills and falls. */
const MAX_TRAILS = 8;
/** A fall's last frame stays this long, ms. */
const GRAVE_HOLD_MS = 2400;
/** A flyer's height over the floor and the size of its bob (px; the kit's sprites.fly: 0.35 and 0.06 of a cell, 1.2 Hz). */
const FLY_LIFT = 0.35 * TILE;
const FLY_BOB = 0.06 * TILE;
const FLY_HZ = 1.2;

export interface WearQuad {
  image: HTMLImageElement;
  /** The rectangle of the picture. */
  sx: number;
  sy: number;
  w: number;
  h: number;
  /** The cell's top-left corner, world pixels. */
  x: number;
  y: number;
  /** The pixel of the picture that stands on the cell's feet point, and the offset from that point (px, up is negative). */
  ax: number;
  ay: number;
  ox: number;
  oy: number;
  flip: boolean;
  /** Height over the floor, px. */
  lift: number;
  alpha: number;
  glow?: HTMLImageElement;
  /** A blob of shade on the floor under it: its width in px (0 for none) and how dark. */
  shade: number;
  shadeAlpha: number;
  /** What it is, so the renderer can tell a pet from a puff. */
  kind: 'trail' | 'kill' | 'death' | 'pet';
}

const quad = (): WearQuad => ({
  image: undefined as unknown as HTMLImageElement, sx: 0, sy: 0, w: 0, h: 0, x: 0, y: 0, ax: 0, ay: 0, ox: 0, oy: 0, flip: false, lift: 0, alpha: 1, shade: 0, shadeAlpha: 0,
  kind: 'trail',
});

interface Spot {
  x: number;
  y: number;
  start: number;
}

/** What `collect` needs to know of the hero: where it is shown, and how long a step lasts. */
export interface HeroPlace {
  /** The cell the hero is on now, as shown on screen. */
  cell: number;
  /** The depth (a new floor puts the pet by the hero). */
  depth: number;
  stepMs: number;
}

export class WearFx {
  private readonly trails: Spot[] = [];
  private readonly kills: Spot[] = [];
  private grave: Spot | null = null;
  private readonly out: WearQuad[] = [];
  private used = 0;

  // The pet: the cells the hero has left (it walks to each in turn, a moment after), and where it is.
  private petCell = -1;
  private petFromX = 0;
  private petFromY = 0;
  private petToCell = -1;
  private petStart = 0;
  private petDur = 0;
  private petFlip = false;
  private readonly queue: Array<{ cell: number; due: number }> = [];
  private heroCell = -1;
  private depth = -1;

  /** Starts over (a new floor, a new run). */
  reset(): void {
    this.trails.length = 0;
    this.kills.length = 0;
    this.grave = null;
    this.queue.length = 0;
    this.petCell = this.petToCell = this.heroCell = -1;
  }

  /** A foe fell at (x, y), a cell's corner. */
  kill(x: number, y: number, now: number): void {
    this.kills.push({ x, y, start: now });
    if (this.kills.length > 6) this.kills.shift();
  }

  /** The hero fell at (x, y). */
  fall(x: number, y: number, now: number): void {
    this.grave = { x, y, start: now };
  }

  /** The pictures to draw at `now`: the objects are the same from frame to frame, written in place. */
  collect(worn: Worn, hero: HeroPlace | null, now: number): { quads: readonly WearQuad[]; count: number } {
    this.used = 0;
    if (hero) this.follow(hero, worn, now);
    this.addTrails(worn, now);
    this.addKills(worn, now);
    this.addGrave(worn, now);
    this.addPet(worn, now);
    return { quads: this.out, count: this.used };
  }

  private next(kind: WearQuad['kind']): WearQuad {
    let q = this.out[this.used];
    if (!q) {
      q = quad();
      this.out[this.used] = q;
    }
    this.used++;
    q.kind = kind;
    q.glow = undefined;
    q.flip = false;
    q.lift = 0;
    q.alpha = 1;
    q.shade = 0;
    q.shadeAlpha = 0;
    q.ox = 0;
    q.oy = 0;
    return q;
  }

  /** Watches where the hero is shown: a step left behind is a footprint, and a cell for the pet to walk to. */
  private follow(hero: HeroPlace, worn: Worn, now: number): void {
    if (hero.depth !== this.depth) {
      this.reset();
      this.depth = hero.depth;
    }
    const cell = hero.cell;
    if (this.heroCell < 0) {
      this.heroCell = cell;
      this.petCell = cell;
      this.petToCell = cell;
      this.petFromX = (cell % WIDTH) * TILE;
      this.petFromY = Math.trunc(cell / WIDTH) * TILE;
      return;
    }
    if (cell !== this.heroCell) {
      const was = this.heroCell;
      const near = Math.abs((cell % WIDTH) - (was % WIDTH)) <= 1 && Math.abs(Math.trunc(cell / WIDTH) - Math.trunc(was / WIDTH)) <= 1;
      if (near) {
        if (worn.trail) {
          this.trails.push({ x: (was % WIDTH) * TILE, y: Math.trunc(was / WIDTH) * TILE, start: now });
          if (this.trails.length > MAX_TRAILS) this.trails.shift();
        }
        this.queue.push({ cell: was, due: now + (worn.pet?.lag ?? PET_LAG_MS) });
        if (this.queue.length > 4) this.queue.shift();
      } else {
        // A blink, a fall to the next floor, a push: the pet is brought along to the cell behind.
        this.queue.length = 0;
        this.petCell = this.petToCell = was;
        this.petFromX = (was % WIDTH) * TILE;
        this.petFromY = Math.trunc(was / WIDTH) * TILE;
        this.petStart = 0;
      }
      this.heroCell = cell;
    }
    // The pet starts on the next cell in its queue when it has stopped and the time has come; it hurries with several waiting.
    const moving = this.petToCell !== this.petCell && now < this.petStart + this.petDur;
    if (!moving) {
      if (this.petToCell !== this.petCell) {
        this.petCell = this.petToCell;
        this.petFromX = (this.petCell % WIDTH) * TILE;
        this.petFromY = Math.trunc(this.petCell / WIDTH) * TILE;
      }
      const head = this.queue[0];
      if (head && now >= head.due) {
        this.queue.shift();
        if (head.cell !== this.petCell) {
          const dx = (head.cell % WIDTH) - (this.petCell % WIDTH);
          if (dx !== 0) this.petFlip = dx < 0;
          this.petToCell = head.cell;
          this.petStart = now;
          this.petDur = Math.max(70, hero.stepMs / (1 + this.queue.length * 0.6));
        }
      }
    }
  }

  private addTrails(worn: Worn, now: number): void {
    const art = worn.trail;
    let n = 0;
    for (const spot of this.trails) {
      const frame = art ? Math.floor((now - spot.start) / art.ms) : 99;
      if (!art || frame >= art.frames) continue;
      this.trails[n++] = spot;
      const q = this.next('trail');
      q.image = art.image; q.sx = frame * art.w; q.sy = 0; q.w = art.w; q.h = art.h; q.x = spot.x; q.y = spot.y; q.ax = art.atX; q.ay = art.atY;
    }
    this.trails.length = n;
  }

  private addKills(worn: Worn, now: number): void {
    const art = worn.kill;
    let n = 0;
    for (const spot of this.kills) {
      const frame = art ? Math.floor((now - spot.start) / art.ms) : 99;
      if (!art || frame >= art.frames) continue;
      this.kills[n++] = spot;
      // Still on its way (a bolt or a missile has yet to land): kept, not drawn.
      if (frame < 0) continue;
      const q = this.next('kill');
      // Centred on the foe: the middle of the picture a little above the cell's feet.
      q.image = art.image; q.sx = frame * art.w; q.sy = 0; q.w = art.w; q.h = art.h; q.x = spot.x; q.y = spot.y; q.ax = art.w / 2; q.ay = art.h / 2; q.oy = -6;
    }
    this.kills.length = n;
  }

  private addGrave(worn: Worn, now: number): void {
    const spot = this.grave;
    const art = worn.death;
    if (!spot || !art) return;
    const elapsed = now - spot.start;
    if (elapsed > art.frames * art.ms + GRAVE_HOLD_MS) {
      this.grave = null;
      return;
    }
    const frame = Math.min(art.frames - 1, Math.floor(elapsed / art.ms));
    const q = this.next('death');
    q.image = art.image; q.sx = frame * art.w; q.sy = 0; q.w = art.w; q.h = art.h; q.x = spot.x; q.y = spot.y; q.ax = art.atX; q.ay = art.atY;
    q.alpha = elapsed > art.frames * art.ms + GRAVE_HOLD_MS - 600 ? Math.max(0, (art.frames * art.ms + GRAVE_HOLD_MS - elapsed) / 600) : 1;
  }

  private addPet(worn: Worn, now: number): void {
    const art = worn.pet;
    if (!art || this.petCell < 0) return;
    let x = (this.petCell % WIDTH) * TILE;
    let y = Math.trunc(this.petCell / WIDTH) * TILE;
    let walking = false;
    if (this.petToCell !== this.petCell) {
      const k = Math.min(1, Math.max(0, (now - this.petStart) / this.petDur));
      const tx = (this.petToCell % WIDTH) * TILE;
      const ty = Math.trunc(this.petToCell / WIDTH) * TILE;
      x = this.petFromX + (tx - this.petFromX) * k;
      y = this.petFromY + (ty - this.petFromY) * k;
      walking = k < 1;
    }
    const frames = walking ? art.walk : art.idle;
    const frame = frames[Math.floor(now / art.ms) % frames.length]!;
    const q = this.next('pet');
    q.image = art.image; q.sx = frame * art.w; q.sy = 0; q.w = art.w; q.h = art.h; q.x = x; q.y = y; q.ax = art.feetX; q.ay = art.feetY + 1;
    q.flip = this.petFlip;
    if (art.glow) q.glow = art.glow;
    if (art.fly) {
      q.lift = FLY_LIFT + FLY_BOB * Math.sin((now / 1000) * FLY_HZ * Math.PI * 2);
      q.shade = art.w * 0.9 * 0.7;
      q.shadeAlpha = 0.55 * 0.55;
    } else {
      q.shade = art.w * 0.9;
      q.shadeAlpha = 0.55;
    }
  }

  /** Whether anything is playing or moving (so the 2D loop keeps drawing). */
  busy(now: number): boolean {
    return this.trails.length > 0 || this.kills.length > 0 || (this.grave !== null && now - this.grave.start < GRAVE_HOLD_MS + 2000) ||
      this.queue.length > 0 || this.petToCell !== this.petCell;
  }
}
