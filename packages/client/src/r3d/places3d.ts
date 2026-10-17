/*
 * The life of the special places in the 3D view: a well's shimmer in its own colour, the altar's fire, the alchemy pot's bubbles, a garden's
 * pollen, a prize's light on its pedestal, the shelves' dust, a sign's glint, a dewdrop's twinkle; and the short things that happen over them
 * (a column of light when a well is used, the «z» over a creature put to sleep, the spikes of a ring, a glyph's rune).
 *
 * It costs no draw call: every piece is one more instance of the effects' two batches (added: light; blended: dust, steam), cut from the
 * soft shapes of the effects atlas (effects3d.ts). The motes need no memory: where one is at a moment is worked out from the time and its
 * cell, so a place with ten of them costs ten small sums and no array. Only what is in the party's sight is drawn (the batches dim the
 * rest through the fog), at most BUDGET pieces a frame, and nothing is made while a frame is drawn.
 */
import { WIDTH } from '@pd/core';
import { P_ALTAR, P_DEW, P_PEDESTAL, P_POT, P_SHELF, P_SIGN, P_SUNGRASS, P_WELL, placeStore, W_AWARE, W_CHANGE, W_HEALTH } from '../places';
import { LEAN, LEAN_STRETCH } from './project';
import type { QuadBatch } from './quadbatch';
import { stamps } from '../stamps';
import type { FxContext } from './effects3d';

/** A rectangle of the atlas as (u, v, du, dv). */
export type Uv = readonly [number, number, number, number];

export interface PlaceShapes {
  dot: Uv;
  solid: Uv;
  ring: Uv;
  mist: Uv;
  beam: Uv;
  z: Uv;
  star: Uv;
  plus: Uv;
  flame: Uv;
}

/** How many pieces the places may draw in a frame, and how far from the hero (cells) they are looked at. */
const BUDGET = 150;
const REACH = 10;
/** How high the surface of a well's water lies (the kit: a ring 0.4 high, the water 0.2 under its rim). */
const WATER_Y = 0.2;
const TAU = Math.PI * 2;
/** Marks on a figure are put a hair toward the camera, so the figure's own picture does not hide them. */
const NUDGE = 0.07;
/** The cracks of a waking statue, as (x offset, height over its middle, length, tilt): jagged, from the head down across the chest. */
const CRACKS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-0.02, 0.22, 0.34, 0.18], [0.06, 0.08, 0.3, -0.4], [-0.1, 0.0, 0.26, 0.5], [0.1, -0.16, 0.24, -0.15], [-0.04, -0.12, 0.22, 0.35],
];

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const WELL_RGB = [
  [0.42, 0.95, 0.55],
  [0.42, 0.74, 1.0],
  [0.78, 0.45, 1.0],
].map((c) => new Float32Array(c.map(lin)));
const FIRE_RGB = new Float32Array([1.0, 0.42, 0.16].map(lin));
const FLAME_RGB = new Float32Array([1.0, 0.78, 0.3].map(lin));
const POT_RGB = new Float32Array([0.4, 0.95, 0.8].map(lin));
const POLLEN_RGB = new Float32Array([1.0, 0.86, 0.4].map(lin));
const GOLD_RGB = new Float32Array([1.0, 0.9, 0.6].map(lin));
const DEW_RGB = new Float32Array([0.7, 0.92, 1.0].map(lin));
const PAPER_RGB = new Float32Array([0.9, 0.82, 0.62].map(lin));
const STEAM_RGB = new Float32Array([0.85, 0.95, 0.95].map(lin));
const WHITE = new Float32Array([1, 1, 1]);

/** A cheap hash of a cell and a salt in 0..1, the same every frame. */
const hash = (cell: number, salt: number): number => {
  const s = Math.sin(cell * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

export class Places3D {
  private used = 0;
  /** The altar's fire is lit, for the scene's sake of flicker (updated with the spots). */
  private readonly tmp = new Float32Array(3);

  constructor(
    private readonly glow: QuadBatch,
    private readonly soft: QuadBatch,
    private readonly uv: PlaceShapes,
  ) {}

  /** Draws the frame's places and short things. `light`: the low quality tier (fewer motes); `calm`: reduced motion (no flicker). */
  frame(c: FxContext, light: boolean, calm: boolean): void {
    this.used = 0;
    const spots = placeStore.spots;
    const t = c.now / 1000;
    for (let i = 0; i < spots.length && this.used < BUDGET; i++) {
      const s = spots[i]!;
      if (!c.visible[s.cell]) continue;
      const x = (s.cell % WIDTH) + 0.5;
      const z = Math.trunc(s.cell / WIDTH) + 0.5;
      if (Math.abs(x - c.hx) > REACH || Math.abs(z - c.hz) > REACH) continue;
      switch (s.kind) {
        case P_WELL: this.well(s.cell, s.water, x, z, t, light, calm); break;
        case P_ALTAR: this.altar(s.cell, x, z, t, light, calm); break;
        case P_POT: this.pot(s.cell, x, z, t, light); break;
        case P_SUNGRASS: this.pollen(s.cell, x, z, t, light); break;
        case P_PEDESTAL: this.prize(s.cell, x, z, t, light); break;
        case P_SHELF: this.dust(s.cell, x, z, t, c.hx, c.hz); break;
        case P_SIGN: this.glint(s.cell, x, z, t, c.hx, c.hz); break;
        case P_DEW: this.dew(s.cell, x, z, t); break;
        default: break;
      }
    }
    this.stampsFrame(c);
  }

  /* ---- one piece ------------------------------------------------------------------------------------------------------------------- */

  private pad(x: number, y: number, z: number, size: number, rgb: Float32Array, gain: number, a: number): void {
    const u = this.uv.dot;
    this.glow.flat(x, y, z, size, size, 0, u[0], u[1], u[2], u[3], rgb[0]! * gain, rgb[1]! * gain, rgb[2]! * gain, a);
    this.used++;
  }

  private halo(x: number, y: number, z: number, size: number, rgb: Float32Array, gain: number, a: number): void {
    const u = this.uv.dot;
    this.glow.billboard(x, y, z, size, size, u[0], u[1], u[2], u[3], rgb[0]! * gain, rgb[1]! * gain, rgb[2]! * gain, a);
    this.used++;
  }

  private mote(shape: Uv, x: number, y: number, z: number, size: number, rgb: Float32Array, gain: number, a: number): void {
    this.glow.billboard(x, y, z, size, size, shape[0], shape[1], shape[2], shape[3], rgb[0]! * gain, rgb[1]! * gain, rgb[2]! * gain, a);
    this.used++;
  }

  private puff(x: number, y: number, z: number, w: number, h: number, rgb: Float32Array, a: number): void {
    const u = this.uv.mist;
    this.soft.billboard(x, y, z, w, h, u[0], u[1], u[2], u[3], rgb[0]!, rgb[1]!, rgb[2]!, a);
    this.used++;
  }

  /* ---- the places ------------------------------------------------------------------------------------------------------------------ */

  /** A well: the water's colour in a pad and a halo over it, and each water's own motion over the surface. */
  private well(cell: number, water: number, x: number, z: number, t: number, light: boolean, calm: boolean): void {
    const rgb = WELL_RGB[water]!;
    const ph = hash(cell, 1) * TAU;
    const breathe = calm ? 1 : 0.82 + 0.18 * Math.sin(t * (water === W_AWARE ? 2.6 : 1.7) + ph);
    this.pad(x, 0.07, z, 2.2, rgb, 1.5 * breathe, 0.55);
    this.pad(x, WATER_Y + 0.02, z, 0.86, rgb, 2.2 * breathe, 0.5);
    this.halo(x, 0.62, z, 1.5, rgb, 1.4 * breathe, 0.28);
    const n = light ? 3 : 5;
    if (water === W_HEALTH) {
      // Crosses of life rise off the water, slowly, and fade as they climb.
      for (let k = 0; k < n; k++) {
        const u = (t * 0.42 + k / n + hash(cell, k)) % 1;
        const a = Math.sin(Math.PI * u);
        const px = x + (hash(cell, k + 9) - 0.5) * 0.6 + Math.sin(t + k * 2) * 0.05;
        this.mote(this.uv.plus, px, WATER_Y + 0.1 + u * 1.0, z + (hash(cell, k + 20) - 0.5) * 0.4, 0.2, rgb, 2.4, a * 0.95);
      }
    } else if (water === W_AWARE) {
      // Stars that blink on and off in the air above the water, each at its own time.
      for (let k = 0; k < n; k++) {
        const a = Math.max(0, Math.sin(t * (1.4 + hash(cell, k) * 1.4) + hash(cell, k + 3) * TAU));
        const ang = hash(cell, k + 5) * TAU;
        const r = 0.18 + hash(cell, k + 7) * 0.34;
        this.mote(this.uv.star, x + Math.cos(ang) * r, WATER_Y + 0.25 + hash(cell, k + 11) * 0.7, z + Math.sin(ang) * r * 0.8, 0.24 + 0.1 * a, rgb, 2.8, a);
      }
    } else if (water === W_CHANGE) {
      // Bits of colour wheel round the well in a tilted loop, the hue sliding as they go.
      for (let k = 0; k < n + 1; k++) {
        const ang = t * 1.6 + (k / (n + 1)) * TAU;
        const hue = (t * 0.25 + k / (n + 1)) % 1;
        this.tmp[0] = 0.55 + 0.45 * Math.cos(TAU * hue);
        this.tmp[1] = 0.45 + 0.45 * Math.cos(TAU * (hue + 0.33));
        this.tmp[2] = 0.7 + 0.3 * Math.cos(TAU * (hue + 0.66));
        this.mote(this.uv.dot, x + Math.cos(ang) * 0.46, WATER_Y + 0.3 + Math.sin(ang) * 0.14 + 0.1 * Math.sin(t * 2 + k), z + Math.sin(ang) * 0.3, 0.17, this.tmp, 2.6, 0.9);
      }
    }
  }

  /** The altar's fire: a pad of heat across its three cells, tongues of flame leaping, sparks, and a bright core that never keeps still. */
  private altar(cell: number, x: number, z: number, t: number, light: boolean, calm: boolean): void {
    const flick = calm ? 1 : 0.8 + 0.2 * Math.sin(t * 9 + cell) * Math.sin(t * 3.1 + cell * 2);
    this.pad(x, 0.06, z, 3.6, FIRE_RGB, 1.8 * flick, 0.5);
    this.pad(x, 0.07, z, 1.8, FLAME_RGB, 1.6 * flick, 0.45);
    this.halo(x, 0.7, z, 2.2, FIRE_RGB, 1.7 * flick, 0.34);
    const tongues = light ? 6 : 11;
    const f = this.uv.flame;
    for (let k = 0; k < tongues; k++) {
      // Each tongue stands in its own place over the fire's three cells and leaps up and falls back, out of step with the rest.
      const ang = hash(cell, k + 1) * TAU;
      const r = 0.1 + hash(cell, k + 2) * 0.85;
      const beat = 0.5 + 0.5 * Math.sin(t * (4 + hash(cell, k) * 5) + hash(cell, k + 40) * TAU);
      const height = (0.6 + 0.8 * hash(cell, k + 3)) * (0.55 + 0.45 * beat);
      const sway = calm ? 0 : Math.sin(t * 3 + k) * 0.05;
      const w = height * 0.5;
      const hot = 1 - r * 0.4;
      this.glow.billboard(x + Math.cos(ang) * r + sway, 0.12 + height * 0.5, z + Math.sin(ang) * r * 0.62, w, height, f[0], f[1], f[2], f[3], 2.6 * hot, (1.5 + 0.6 * beat) * hot, 0.3 * hot, 0.85);
      this.used++;
    }
    const sparks = light ? 3 : 7;
    for (let k = 0; k < sparks; k++) {
      const u = (t * (0.5 + hash(cell, k + 60) * 0.5) + hash(cell, k + 61)) % 1;
      const px = x + (hash(cell, k + 62) - 0.5) * 1.6 + Math.sin(t * 2 + k) * 0.18 * u;
      this.mote(this.uv.dot, px, 0.3 + u * 1.5, z + (hash(cell, k + 63) - 0.5) * 1.2, 0.07 + (1 - u) * 0.05, FLAME_RGB, 3, 1 - u);
    }
    if (!light) this.puff(x + Math.sin(t * 0.6) * 0.2, 1.2 + (t * 0.3 % 1) * 0.5, z, 1.1, 1.1, FIRE_RGB, 0.07);
  }

  /** The alchemy pot: a green-gold glow, bubbles that swell and burst on the brew, steam over it. */
  private pot(cell: number, x: number, z: number, t: number, light: boolean): void {
    this.pad(x, 0.06, z, 1.9, POT_RGB, 1.3, 0.4);
    this.halo(x, 0.62, z, 1.1, POT_RGB, 1.3, 0.22);
    const n = light ? 3 : 5;
    for (let k = 0; k < n; k++) {
      const u = (t * (0.55 + hash(cell, k) * 0.5) + hash(cell, k + 8)) % 1;
      const px = x + (hash(cell, k + 9) - 0.5) * 0.46;
      const pz = z + (hash(cell, k + 10) - 0.5) * 0.3;
      if (u < 0.85) {
        // A bubble on the brew: swelling, rising a little, then
        const size = 0.06 + u * 0.18;
        this.mote(this.uv.dot, px, 0.46 + u * 0.18, pz, size, POT_RGB, 2.4, 0.8);
      } else {
        // ... bursting in a flash of spray.
        const b = (u - 0.85) / 0.15;
        this.mote(this.uv.star, px, 0.62, pz, 0.28 * (1 - b * 0.4), STEAM_RGB, 2.6, 1 - b);
      }
    }
    if (!light) {
      for (let k = 0; k < 2; k++) {
        const u = (t * 0.32 + k * 0.5 + hash(cell, 30)) % 1;
        this.puff(x + Math.sin(t * 0.8 + k * 3) * 0.1, 0.7 + u * 0.75, z, 0.45 + u * 0.5, 0.45 + u * 0.5, STEAM_RGB, 0.16 * Math.sin(Math.PI * u));
      }
    }
  }

  /** Sungrass: warm pollen drifting up from the bush. */
  private pollen(cell: number, x: number, z: number, t: number, light: boolean): void {
    this.pad(x, 0.06, z, 1.6, POLLEN_RGB, 1.1, 0.3);
    const n = light ? 2 : 4;
    for (let k = 0; k < n; k++) {
      const u = (t * 0.22 + k / n + hash(cell, k)) % 1;
      this.mote(this.uv.dot, x + Math.sin(t * 0.7 + k * 2.1 + cell) * 0.32, 0.25 + u * 0.95, z + Math.cos(t * 0.6 + k * 1.7) * 0.25, 0.1, POLLEN_RGB, 2.6, Math.sin(Math.PI * u) * 0.9);
    }
  }

  /** A prize on its pedestal: a thin column of light over it and glints that come and go. */
  private prize(cell: number, x: number, z: number, t: number, light: boolean): void {
    const k = 0.8 + 0.2 * Math.sin(t * 1.9 + cell);
    this.pad(x, 0.06, z, 1.7, GOLD_RGB, 1.4 * k, 0.4);
    const b = this.uv.beam;
    this.glow.billboard(x, 1.0, z - 0.02, 0.5, 2.0, b[0], b[1], b[2], b[3], GOLD_RGB[0]! * 1.3, GOLD_RGB[1]! * 1.3, GOLD_RGB[2]! * 1.3, 0.26 * k);
    this.used++;
    const n = light ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, Math.sin(t * (1.2 + hash(cell, i) * 0.8) + hash(cell, i + 4) * TAU));
      const ang = hash(cell, i + 6) * TAU;
      this.mote(this.uv.star, x + Math.cos(ang) * 0.36, 0.55 + hash(cell, i + 8) * 0.55, z + Math.sin(ang) * 0.3, 0.2 + 0.1 * a, GOLD_RGB, 2.8, a);
    }
  }

  /** Dust hanging in the air before a bookshelf, and now and then the pale edge of a page catching the light. */
  private dust(cell: number, x: number, z: number, t: number, hx: number, hz: number): void {
    if (Math.abs(x - hx) > 6 || Math.abs(z - hz) > 6 || (cell & 1) !== 0) return;
    const u = (t * 0.1 + hash(cell, 1)) % 1;
    this.mote(this.uv.dot, x + Math.sin(t * 0.4 + cell) * 0.3, 0.5 + u * 0.7, z + 0.45, 0.07, PAPER_RGB, 1.6, Math.sin(Math.PI * u) * 0.55);
    const a = Math.max(0, Math.sin(t * 0.9 + hash(cell, 2) * TAU) - 0.8) * 5;
    if (a > 0) this.mote(this.uv.star, x + (hash(cell, 3) - 0.5) * 0.6, 0.55 + hash(cell, 4) * 0.4, z + 0.5, 0.2, PAPER_RGB, 2.2, a);
  }

  /** A sign: a single glint now and then, so it is noticed. */
  private glint(cell: number, x: number, z: number, t: number, hx: number, hz: number): void {
    if (Math.abs(x - hx) > 7 || Math.abs(z - hz) > 7) return;
    const a = Math.max(0, Math.sin(t * 0.8 + hash(cell, 5) * TAU) - 0.85) * 6.5;
    if (a > 0) this.mote(this.uv.star, x + 0.18, 0.72, z, 0.22, PAPER_RGB, 2.4, a);
  }

  /** A dewdrop on the floor: a small cold twinkle and a halo of damp light. */
  private dew(cell: number, x: number, z: number, t: number): void {
    const a = 0.5 + 0.5 * Math.sin(t * 2.2 + hash(cell, 1) * TAU);
    this.halo(x, 0.22, z, 0.7, DEW_RGB, 1.3, 0.2 + 0.1 * a);
    this.mote(this.uv.star, x + 0.12, 0.36 + 0.04 * a, z - 0.04, 0.16 + 0.1 * a, DEW_RGB, 3, 0.4 + 0.6 * a);
  }

  /* ---- the short things ------------------------------------------------------------------------------------------------------------ */

  private stampsFrame(c: FxContext): void {
    const now = c.now;
    const sinL = Math.sin(LEAN);
    const cosL = Math.cos(LEAN);
    for (let i = 0; i < stamps.cap && this.used < BUDGET + 60; i++) {
      if (!stamps.used[i]) continue;
      const k = (now - stamps.born[i]!) / stamps.life[i]!;
      if (k >= 1) {
        stamps.used[i] = 0;
        continue;
      }
      if (k < 0) continue;
      const x = stamps.x[i]!;
      const z = stamps.z[i]!;
      this.tmp[0] = stamps.r[i]!;
      this.tmp[1] = stamps.g[i]!;
      this.tmp[2] = stamps.b[i]!;
      const size = stamps.size[i]!;
      switch (stamps.kind[i]) {
        case stamps.BEAM: {
          // A column of light: it shoots up at once, holds, and thins away from the top down; a ring of light spreads from its foot.
          const grow = Math.min(1, k * 7);
          const fade = k < 0.25 ? 1 : 1 - (k - 0.25) / 0.75;
          const h = 3.2 * grow;
          const b = this.uv.beam;
          this.glow.billboard(x, h * 0.5, z, 1.5 * size, h, b[0], b[1], b[2], b[3], this.tmp[0]! * 2.4, this.tmp[1]! * 2.4, this.tmp[2]! * 2.4, 0.75 * fade);
          this.glow.billboard(x, h * 0.5, z, 0.5 * size, h, b[0], b[1], b[2], b[3], 3, 3, 3, 1 * fade);
          this.used += 2;
          const r = this.uv.ring;
          const grown = 0.5 + 2.6 * Math.min(1, k * 2.2) * size;
          this.glow.flat(x, 0.05, z, grown, grown * 0.8, 0, r[0], r[1], r[2], r[3], this.tmp[0]! * 2, this.tmp[1]! * 2, this.tmp[2]! * 2, 0.8 * (1 - Math.min(1, k * 1.6)));
          this.pad(x, 0.06, z, 2.6 * size, this.tmp, 2.2 * fade, 0.55 * fade);
          // Motes carried up the column.
          for (let m = 0; m < 6; m++) {
            const u = (k * 1.6 + m / 6) % 1;
            const ang = m * 2.4;
            this.mote(this.uv.dot, x + Math.cos(ang + k * 4) * 0.22, 0.1 + u * 2.6, z + Math.sin(ang + k * 4) * 0.15, 0.12, this.tmp, 3, (1 - u) * fade);
          }
          break;
        }
        case stamps.Z: {
          // A «z» that drifts up and to one side, swelling a little, and thins out.
          const rise = k * 0.8;
          const sway = Math.sin(k * 5 + stamps.rot[i]!) * 0.1;
          const a = Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.95;
          this.mote(this.uv.z, x + sway + 0.12 + k * 0.2 * (stamps.rot[i]! > 1.5 ? -1 : 1), stamps.lift[i]! + rise, z + NUDGE, size * (0.75 + k * 0.5), this.tmp, 1.3, a);
          break;
        }
        case stamps.SPIKES: {
          // Spikes thrown out of a point and drawn back in: thin streaks along every way, short and bright.
          const out = Math.sin(Math.PI * Math.min(1, k * 1.05));
          const n = 8;
          for (let s = 0; s < n; s++) {
            const ang = (s / n) * TAU + stamps.rot[i]!;
            const len = size * (0.35 + 0.65 * out);
            const r = size * 0.18 + len * 0.5;
            const ca = Math.cos(ang);
            const sa = Math.sin(ang);
            // Seen on the screen from the camera's lean: out sideways, up and down the figure's plane.
            this.glow.leaned(x + ca * r, stamps.lift[i]! + sa * r * cosL * LEAN_STRETCH * 0.9, z + NUDGE - sa * r * sinL * LEAN_STRETCH * 0.9, 0.06, len, ang - Math.PI / 2, this.uv.solid[0], this.uv.solid[1], this.uv.solid[2], this.uv.solid[3],
              this.tmp[0]! * 2.6, this.tmp[1]! * 2.6, this.tmp[2]! * 2.6, out * (1 - k * 0.4));
            this.used++;
          }
          this.mote(this.uv.star, x, stamps.lift[i]!, z, size * 0.6 * out, WHITE, 2.4, out * 0.9);
          break;
        }
        case stamps.RUNE: {
          // A glyph's flash: a ring of its colour on the floor, and four small marks that circle the chest and go out.
          const out = Math.min(1, k * 2.2);
          const r = this.uv.ring;
          const grown = (0.5 + 1.1 * out) * size;
          this.glow.flat(x, 0.05, z, grown, grown * 0.8, 0, r[0], r[1], r[2], r[3], this.tmp[0]! * 2.2, this.tmp[1]! * 2.2, this.tmp[2]! * 2.2, 0.9 * (1 - k));
          for (let m = 0; m < 4; m++) {
            const ang = k * 5 + (m / 4) * TAU;
            this.mote(this.uv.star, x + Math.cos(ang) * 0.36 * size, stamps.lift[i]! + 0.1 * Math.sin(ang), z + Math.sin(ang) * 0.24 * size, 0.2, this.tmp, 3, (1 - k) * 0.95);
          }
          this.halo(x, stamps.lift[i]!, z, 1.2 * size, this.tmp, 1.6, 0.4 * (1 - k));
          break;
        }
        case stamps.CRACKS: {
          // A statue waking: cracks that run over it and glow as the power in it takes hold, shaking light loose; then its eyes light.
          const grow = Math.min(1, k * 2.4);
          const flick = 0.75 + 0.25 * Math.sin(now * 0.07 + x * 9);
          for (let m = 0; m < CRACKS.length; m++) {
            const crack = CRACKS[m]!;
            const len = crack[2] * grow;
            if (len <= 0.01) continue;
            this.glow.leaned(x + crack[0], stamps.lift[i]! + crack[1], z + NUDGE, 0.06, len, crack[3], this.uv.solid[0], this.uv.solid[1], this.uv.solid[2], this.uv.solid[3],
              this.tmp[0]! * 3.2 * flick, this.tmp[1]! * 3.2 * flick, this.tmp[2]! * 3.2 * flick, 0.95 * (k > 0.85 ? (1 - k) / 0.15 : 1));
            this.used++;
          }
          if (k > 0.3) {
            const eye = Math.min(1, (k - 0.3) * 3) * flick;
            this.mote(this.uv.dot, x - 0.1, stamps.lift[i]! + 0.34, z + NUDGE, 0.15, this.tmp, 3.4, eye);
            this.mote(this.uv.dot, x + 0.1, stamps.lift[i]! + 0.34, z + NUDGE, 0.15, this.tmp, 3.4, eye);
          }
          this.halo(x, stamps.lift[i]! + 0.1, z + NUDGE, 1.5 * grow, this.tmp, 1.3, 0.3 * flick);
          break;
        }
        default:
          break;
      }
    }
  }
}
