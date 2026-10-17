/*
 * Design part 11, «3D gleam», variant A: what the hero's growth looks like on his figure in the scene. Sparks round the hand that holds an
 * upgraded weapon (1 to 4 by its step), the same on the torso for the armour, an enchantment's rune by the blade, a glyph's rune on the
 * chest, violet wisps for a curse that is known, a warm light on the floor at the feet from the third step, and the mastery sigil that
 * flares over the head for a moment (`sigilFlash`).
 *
 * It costs no draw call: every piece is one more instance in the effects' two batches (added: sparks, runes, halo, sigil; blended: wisps),
 * cut from the designer's sheet (assets/ui/growth/growth-fx.png, 64 x 128), which is put once into a reserved corner of the effects
 * atlas (fxsheet.ts ATLAS.growth) as soon as it has loaded. Until it has, nothing is drawn. A figure with nothing to show costs one test;
 * what is off the screen is not looked at. Nothing is made while a frame is drawn.
 *
 * The hand is the held-weapon pipeline's: the cell of the weapon in this frame (held.ts), whose middle is the grip.
 */
import type { CanvasTexture } from 'three';
import type { Aura } from '../growth';
import { hasAura } from '../growthcache';
import { flImage, flReady } from '../flart';
import type { Held } from '../held';
import { quality } from '../quality';
import {
  ENCHANT_RGB, FX_FRAME, FX_ROW, glyphLight, GLYPH_RGB, GLYPH_RUNE_SIZE, HALO, HALO_GAIN, HALO_RGB, lifted, newPose, RUNE_FLOOR, RUNE_SIZE, runeLook,
  saltOf, SIGIL_SIZE, sigilFrame, sparkCount, sparkPose, SPARK_SIZE, WISP_MS, WISP_SIZE,
} from './growthfx';
import { LEAN, LEAN_STRETCH } from './project';
import type { QuadBatch } from './quadbatch';

const TILE = 16;
const SHEET = 'ui/growth/growth-fx.png';
/** Quads of the effects are pushed a hair toward the camera along the figure's plane, so the hero's own depth never hides them. */
const NUDGE = 0.04;
/** Added sparks are a little brighter than their art, as the other small added effects are (fx3d.ts). */
const SPARK_GAIN = 1.2;

const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** A reserved rectangle of the atlas (its top left corner), and the atlas's size, in pixels. */
export interface GrowthSpot {
  x: number;
  y: number;
  atlasW: number;
  atlasH: number;
}

/** The mastery sigils waiting to flare or flaring: when asked for (wall clock, so one never shown goes stale) and when its first frame was drawn. */
const flares = new Map<string, { asked: number; start: number }>();
/** A flare not drawn within this long of being asked for (the hero is on another floor, or off the screen) is dropped. */
const STALE_MS = 3000;

/**
 * The mastery sigil flares over a hero's head for about 400 ms (design part 11). The UI calls this when the hero masters a subclass (the
 * `mastered` effect); `heroId` is the hero's id (Hero.id, the figure's Puppet.id). Safe to call before the art has loaded: it waits.
 */
export function sigilFlash(heroId: string): void {
  flares.set(heroId, { asked: typeof performance !== 'undefined' ? performance.now() : 0, start: NaN });
}

/** Whether any hero's sigil is waiting to be drawn. */
export const sigilPending = (): boolean => flares.size > 0;

/** Forgets the waiting flares (a new run). */
export const clearSigils = (): void => flares.clear();

export class Growth3D {
  private ready = false;
  private readonly pose = newPose();
  private readonly look = { frame: 0, light: 1 };
  private readonly rgb: [number, number, number] = [0, 0, 0];
  private readonly salts = new Map<string, number>();
  private readonly colours = new Map<string, Float32Array>();
  private readonly glyph = new Float32Array([lin(GLYPH_RGB[0]), lin(GLYPH_RGB[1]), lin(GLYPH_RGB[2])]);
  private readonly warm = new Float32Array([lin(HALO_RGB[0]), lin(HALO_RGB[1]), lin(HALO_RGB[2])]);

  constructor(
    private readonly glow: QuadBatch,
    private readonly soft: QuadBatch,
    private readonly texture: CanvasTexture,
    private readonly at: GrowthSpot,
    /** The soft round light of the effects atlas (u, v, du, dv): the halo on the floor. */
    private readonly dot: readonly [number, number, number, number],
  ) {}

  /** Puts the sheet into its corner of the atlas once it has come; false until then (it is asked for the first time a figure needs it). */
  private sync(): boolean {
    if (this.ready) return true;
    const image = flImage(SHEET);
    if (!flReady(image)) return false;
    const canvas = this.texture.image as HTMLCanvasElement;
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(this.at.x, this.at.y, image.naturalWidth, image.naturalHeight);
    g.drawImage(image, this.at.x, this.at.y);
    this.texture.needsUpdate = true;
    this.ready = true;
    return true;
  }

  private saltFor(id: string): number {
    let s = this.salts.get(id);
    if (s === undefined) {
      s = saltOf(id);
      this.salts.set(id, s);
    }
    return s;
  }

  /** The enchantment's colour, linear and raised if dull, once per kind. */
  private enchantColour(key: string): Float32Array | null {
    let c = this.colours.get(key);
    if (c) return c;
    const base = ENCHANT_RGB[key];
    if (!base) return null;
    const v = lifted(base, RUNE_FLOOR, this.rgb);
    c = new Float32Array([lin(v[0]), lin(v[1]), lin(v[2])]);
    this.colours.set(key, c);
    return c;
  }

  /** One frame of the sheet as an instance of a batch: a quad on the figure's leaned plane, `up` screen cells above the sprite's bottom. */
  private put(batch: QuadBatch, row: number, frame: number, x: number, by: number, bz: number, up: number, size: number, r: number, g: number, b: number, a: number): void {
    if (a <= 0) return;
    const W = this.at.atlasW;
    const H = this.at.atlasH;
    const sl = Math.sin(LEAN);
    const cl = Math.cos(LEAN);
    const tall = up * LEAN_STRETCH;
    batch.leaned(
      x, by + tall * cl + NUDGE * sl, bz - tall * sl + NUDGE * cl, size, size * LEAN_STRETCH, 0,
      (this.at.x + frame * FX_FRAME) / W, 1 - (this.at.y + row + FX_FRAME) / H, FX_FRAME / W, FX_FRAME / H, r, g, b, a,
    );
  }

  /**
   * A hero's growth for this frame. `tx`, `tz` are where he stands on the floor (cells), `by`, `bz` the bottom of his sprite's plane and
   * `ground` the floor's height; `scale` and `fh` his size (a fall's shrink, a crouch); `sw`, `sh` the frame's size in pixels; `held` what
   * he holds in this frame (null: the sparks go to a hand's usual place); `tint` his dimming (an invisible hero shows his sparks faintly);
   * `halved` the light mode (half the sparks).
   */
  figure(
    id: string, aura: Aura, now: number, tx: number, tz: number, by: number, bz: number, ground: number, scale: number, fh: number,
    sw: number, sh: number, flip: boolean, held: Held | null, tint: number, halved: boolean,
  ): void {
    const flare = flares.size > 0 ? flares.get(id) : undefined;
    const shows = hasAura(aura);
    if (!shows && !flare) return;
    if (!this.sync()) {
      // The art is not here yet: a flare waits for it, but not forever.
      if (flare && typeof performance !== 'undefined' && performance.now() - flare.asked > STALE_MS) flares.delete(id);
      return;
    }
    const still = quality.reducedMotion;
    const k = scale / TILE;
    const ky = k * fh;
    const alpha = Math.min(1, tint);
    if (alpha <= 0) return;
    const salt = this.saltFor(id);
    const glow = this.glow;
    // The hand that holds the weapon: the middle of the weapon's cell (the grip), as the held pipeline put it; else where a hand usually is.
    let right: number;
    let handUp: number;
    if (held) {
      const r = held.left + held.w / 2 - sw / 2;
      right = flip ? -r : r;
      handUp = sh - held.top - held.h / 2;
    } else {
      right = flip ? -3 : 3;
      handUp = 0.42 * sh;
    }
    const hx = tx + right * k;
    const hu = handUp * ky;
    const out = right < -0.5 ? -1 : right > 0.5 ? 1 : flip ? -1 : 1;
    const torso = 0.42 * sh * ky;

    if (shows) {
      const p = this.pose;
      // The weapon's sparks.
      const wn = sparkCount(aura.weapon, halved);
      for (let i = 0; i < wn; i++) {
        sparkPose(aura.weapon, i, wn, now, salt, still, p);
        this.put(glow, FX_ROW.spark, p.frame, hx + p.dx * scale, by, bz, hu + p.dy * scale, SPARK_SIZE * scale, SPARK_GAIN, SPARK_GAIN, SPARK_GAIN, p.alpha * alpha);
      }
      // The armour's, round the torso (a little wider, out of step with the weapon's).
      const an = sparkCount(aura.armor, halved);
      for (let i = 0; i < an; i++) {
        sparkPose(aura.armor, i, an, now, salt + 530, still, p);
        this.put(glow, FX_ROW.spark, p.frame, tx + p.dx * 1.15 * scale, by, bz, torso + (p.dy - 0.1) * scale, SPARK_SIZE * scale, SPARK_GAIN, SPARK_GAIN, SPARK_GAIN, p.alpha * alpha);
      }
      // The warm light on the floor at the feet, from the third step of either.
      const top = Math.max(aura.weapon, aura.armor);
      const halo = HALO[Math.max(0, Math.min(3, top - 1))] ?? 0;
      if (top >= 3 && halo > 0) {
        const s = halo * HALO_GAIN * alpha;
        const w = this.warm;
        glow.flat(tx, ground + 0.02, tz, 1.2 * scale, 0.75 * scale, 0, this.dot[0], this.dot[1], this.dot[2], this.dot[3], w[0]! * s, w[1]! * s, w[2]! * s, 0.9);
      }
      // (No runes by the blade or on the chest: the owner found the floating symbols by the hero puzzling. The enchantment and the glyph
      // show in the item's card and slot, not as signs in the air.)
      // A curse known: two violet wisps about him, blended (not added), 180 ms a picture.
      if (aura.cursed) {
        const step = still ? 0 : Math.floor(now / WISP_MS);
        for (let i = 0; i < 2; i++) {
          this.put(this.soft, FX_ROW.wisp, (step + i * 2) % 4, tx + (i ? 0.3 : -0.26) * scale, by, bz, 0.55 * sh * ky, WISP_SIZE * scale, 1, 1, 1, alpha);
        }
      }
    }
    if (flare) {
      if (Number.isNaN(flare.start)) flare.start = now;
      const f = sigilFrame(now - flare.start, still);
      if (f < 0) flares.delete(id);
      else this.put(glow, FX_ROW.sigil, f, tx, by, bz, sh * ky + 0.3, SIGIL_SIZE * scale, 1.3, 1.3, 1.3, 1);
    }
  }
}
