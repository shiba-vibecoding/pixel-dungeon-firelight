/*
 * Everything that glows, drifts, flashes or lies on the floor in the 3D view, in two batches (one added on, one blended): the kit's
 * particles of the region and of a boss's arena, the ripples on water, torch halos and the soft blobs under characters, clouds of
 * gas, and what the 2D game's effects module makes (sparks, smoke, chunks, splats and pools of blood, bodies' pools, blows, the rings
 * of a scroll's wave, flashes of a blast), which are drawn here in place of its flat canvas: in their place on the floor, hidden by
 * walls, dark in the dark. Bolts in flight are glow, with a light moving with them (the kit's colours). All of it reads the arrays
 * the effects module and the view already keep, and writes into arrays made once: nothing is made in the frame.
 */
import { CanvasTexture, Color, NearestFilter, SRGBColorSpace, type Scene } from 'three';
import { HEIGHT, WIDTH } from '@pd/core';
import { fx } from '../fx';
import type { View } from '../view';
import { type Atmosphere, type BoltKit, GLOWING, type Kit, type MistKit, PARTICLE_FRAME, type ParticleType, boltOf, hex } from './kit';
import { type AirUniforms } from './fogofwar';
import { K_FLOOR, K_WATER, type LevelGeom } from './levelgeom';
import { QuadBatch } from './quadbatch';
import { Fx3D } from './fx3d';
import { Growth3D } from './growth3d';
import { Places3D } from './places3d';
import { quality } from '../quality';
import { chunkSize, SPECK_GROW, stainSize } from './bloodsize';
import { ATLAS } from '../fxsheet';
import type { SharedImages } from './assets3d';

const TILE = 16;
/** The effects atlas (fxsheet.ts → ATLAS): the old 256 x 256 corner (below) and, round it, the room for the designer's sheets (fx3d.ts). */
const ATLAS_W = ATLAS.w;
const ATLAS_H = ATLAS.h;

/** Where each picture is in the effects atlas (256 x 256, pixels). */
const PARTICLES_AT = [0, 0, 96, 8] as const;
const RIPPLE_AT = [0, 8, 96, 16] as const;
export const SOLID_AT = [0, 24, 8, 8] as const;
export const DOT_AT = [16, 24, 32, 32] as const;
const DISC_AT = [64, 24, 32, 32] as const;
const RING_AT = [0, 64, 64, 64] as const;
const MIST_AT = [128, 0, 128, 128] as const;
/** The places' own shapes (places3d.ts): a column of light, a pixel «z», a four-point sparkle, a small plus. In the corner the designer's sheets leave alone. */
const BEAM_AT = [64, 64, 32, 64] as const;
const Z_AT = [96, 64, 8, 8] as const;
const PLUS_AT = [96, 72, 8, 8] as const;
const STAR_AT = [104, 64, 16, 16] as const;
/** A tongue of flame, 16 x 32, white and soft at the tip: tinted by the quad's colour. */
const FLAME_AT = [64, 144, 16, 32] as const;

/** A rectangle of the atlas as (u, v, du, dv) (flipped texture: v runs up). */
const rect = (at: readonly [number, number, number, number], i = 0, frames = 1): [number, number, number, number] => {
  const w = at[2] / frames;
  return [(at[0] + i * w) / ATLAS_W, 1 - (at[1] + at[3]) / ATLAS_H, w / ATLAS_W, at[3] / ATLAS_H];
};

const RIPPLE_UV: Array<[number, number, number, number]> = [0, 1, 2, 3, 4, 5].map((i) => rect(RIPPLE_AT, i, 6));
export const UV_SOLID = rect(SOLID_AT);
export const UV_DOT = rect(DOT_AT);
/** A small ellipse with a hard edge: the contact shadow under a foot. */
export const UV_DISC = rect(DISC_AT);
const UV_RING = rect(RING_AT);
const UV_MIST = rect(MIST_AT);
export const UV_BEAM = rect(BEAM_AT);
export const UV_Z = rect(Z_AT);
export const UV_PLUS = rect(PLUS_AT);
export const UV_STAR = rect(STAR_AT);
export const UV_FLAME = rect(FLAME_AT);

/** The effects atlas: the kit's particles and ripples, and a few soft shapes drawn here. */
export function fxTexture(images: SharedImages): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const g = canvas.getContext('2d')!;
  g.drawImage(images.particles, PARTICLES_AT[0], PARTICLES_AT[1]);
  g.drawImage(images.ripple, RIPPLE_AT[0], RIPPLE_AT[1]);
  g.fillStyle = '#fff';
  g.fillRect(SOLID_AT[0], SOLID_AT[1], SOLID_AT[2], SOLID_AT[3]);
  const radial = (at: readonly [number, number, number, number], stops: ReadonlyArray<readonly [number, string]>): void => {
    const r = at[2] / 2;
    const grad = g.createRadialGradient(at[0] + r, at[1] + r, 0, at[0] + r, at[1] + r, r);
    for (const [k, c] of stops) grad.addColorStop(k, c);
    g.fillStyle = grad;
    g.fillRect(at[0], at[1], at[2], at[3]);
  };
  radial(DOT_AT, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
  // The contact shadow: dark to the edge, which falls away over the last tenth, so it is sharp and not a smudge.
  radial(DISC_AT, [[0, 'rgba(255,255,255,1)'], [0.62, 'rgba(255,255,255,0.9)'], [0.86, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]);
  radial(MIST_AT, [[0, 'rgba(255,255,255,0.9)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
  // The ring of a wave: thin, a little soft on both sides.
  const rc = RING_AT[2] / 2;
  const ring = g.createRadialGradient(RING_AT[0] + rc, RING_AT[1] + rc, rc * 0.7, RING_AT[0] + rc, RING_AT[1] + rc, rc);
  ring.addColorStop(0, 'rgba(255,255,255,0)');
  ring.addColorStop(0.55, 'rgba(255,255,255,1)');
  ring.addColorStop(0.8, 'rgba(255,255,255,0.6)');
  ring.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = ring;
  g.fillRect(RING_AT[0], RING_AT[1], RING_AT[2], RING_AT[3]);
  placeShapes(g);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * The places' shapes: a column of light (soft at both sides, bright at the foot and thinning to nothing at the top), a pixel «z», a small
 * plus, and a four-point sparkle with a bright heart.
 */
function placeShapes(g: CanvasRenderingContext2D): void {
  const [bx, by, bw, bh] = BEAM_AT;
  g.save();
  g.beginPath();
  g.rect(bx, by, bw, bh);
  g.clip();
  const side = g.createLinearGradient(bx, 0, bx + bw, 0);
  side.addColorStop(0, 'rgba(255,255,255,0)');
  side.addColorStop(0.5, 'rgba(255,255,255,1)');
  side.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = side;
  g.fillRect(bx, by, bw, bh);
  // The vertical fade: keep the colour where the mask is, so the top and bottom edges thin out.
  g.globalCompositeOperation = 'destination-in';
  const up = g.createLinearGradient(0, by, 0, by + bh);
  up.addColorStop(0, 'rgba(255,255,255,0)');
  up.addColorStop(0.3, 'rgba(255,255,255,0.75)');
  up.addColorStop(0.85, 'rgba(255,255,255,1)');
  up.addColorStop(1, 'rgba(255,255,255,0.35)');
  g.fillStyle = up;
  g.fillRect(bx, by, bw, bh);
  g.restore();
  g.fillStyle = '#fff';
  // The «z»: a top bar, a slanted stroke and a bottom bar on a 5 x 5 grid.
  const z = (x: number, y: number): void => g.fillRect(Z_AT[0] + 1 + x, Z_AT[1] + 1 + y, 1, 1);
  for (let x = 0; x < 5; x++) { z(x, 0); z(x, 4); }
  z(3, 1); z(2, 2); z(1, 3);
  // The plus.
  g.fillRect(PLUS_AT[0] + 3, PLUS_AT[1] + 1, 2, 6);
  g.fillRect(PLUS_AT[0] + 1, PLUS_AT[1] + 3, 6, 2);
  // The sparkle: two thin crossing strokes, soft to their tips, and a bright heart.
  const [sx, sy, sw, sh] = STAR_AT;
  const cx = sx + sw / 2;
  const cy = sy + sh / 2;
  const arm = (horizontal: boolean): void => {
    const grad = horizontal ? g.createLinearGradient(sx, 0, sx + sw, 0) : g.createLinearGradient(0, sy, 0, sy + sh);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    if (horizontal) g.fillRect(sx, cy - 1, sw, 2);
    else g.fillRect(cx - 1, sy, 2, sh);
  };
  arm(true);
  arm(false);
  // The flame: a teardrop pointing up, solid at the bottom and fading to nothing at the tip, with a brighter heart low in it.
  const [fx0, fy0, fw, fh] = FLAME_AT;
  const mid = fx0 + fw / 2;
  const tongue = g.createLinearGradient(0, fy0 + fh, 0, fy0);
  tongue.addColorStop(0, 'rgba(255,255,255,0.95)');
  tongue.addColorStop(0.45, 'rgba(255,255,255,0.8)');
  tongue.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = tongue;
  g.beginPath();
  g.moveTo(mid, fy0 + 1);
  g.bezierCurveTo(mid + 3, fy0 + 9, mid + 8, fy0 + 17, mid + 5, fy0 + 26);
  g.bezierCurveTo(mid + 4, fy0 + 30, mid - 4, fy0 + 30, mid - 5, fy0 + 26);
  g.bezierCurveTo(mid - 8, fy0 + 17, mid - 3, fy0 + 9, mid, fy0 + 1);
  g.fill();
  const hot = g.createRadialGradient(mid, fy0 + 24, 0, mid, fy0 + 24, 7);
  hot.addColorStop(0, 'rgba(255,255,255,1)');
  hot.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hot;
  g.fillRect(fx0, fy0 + 14, fw, 18);
  const heart = g.createRadialGradient(cx, cy, 0, cx, cy, sw * 0.28);
  heart.addColorStop(0, 'rgba(255,255,255,1)');
  heart.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = heart;
  g.fillRect(sx, sy, sw, sh);
}

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** A colour as the game writes it ('#rrggbb', 'rgb(...)', 'rgba(...)' or 'r, g, b') as linear red, green, blue and alpha. */
const parsed = new Map<string, Float32Array>();
export function parseCss(css: string): Float32Array {
  let c = parsed.get(css);
  if (c) return c;
  c = new Float32Array([1, 1, 1, 1]);
  let r = 255, g = 255, b = 255, a = 1;
  if (css.startsWith('#')) {
    const v = css.length === 4 ? css.slice(1).split('').map((d) => parseInt(d + d, 16)) : [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16));
    [r, g, b] = [v[0]!, v[1]!, v[2]!];
  } else {
    const nums = css.replace(/rgba?\(/, '').replace(')', '').split(',').map((n) => parseFloat(n));
    if (nums.length >= 3 && nums.every((n) => Number.isFinite(n))) [r, g, b, a] = [nums[0]!, nums[1]!, nums[2]!, nums[3] ?? 1];
  }
  c[0] = lin(r / 255); c[1] = lin(g / 255); c[2] = lin(b / 255); c[3] = a;
  parsed.set(css, c);
  return c;
}

/** What the effects know of the frame. */
export interface FxContext {
  now: number;
  dt: number;
  /** The hero's cell, in cells (x, z) and the cell it is in. */
  hx: number;
  hz: number;
  visible: readonly boolean[];
  explored: readonly boolean[];
  view: View;
  /** Clouds of gas on the floor: the cell, how much there is, and the colour as 'r, g, b'. */
  gas: ReadonlyArray<{ pos: number; volume: number; color: string }> | undefined;
  /** A boss in sight and where (cells), or none. */
  bossFound: boolean;
  bossX: number;
  bossZ: number;
}

/** The light that moves with a bolt or a blast this frame, for the scene's one dynamic light. */
export interface Dynamic {
  on: boolean;
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
}

/** How each kind of the kit's particle lives: its life (s), where it starts (height), its rise and drift (cells a second), size and look. */
interface Behaviour {
  life: [number, number];
  y: [number, number];
  rise: number;
  fall: number;
  drift: number;
  size: [number, number];
  alpha: number;
  /** Grows by this share over its life. */
  grow: number;
}

const BEHAVE: Record<Exclude<ParticleType, 'haze'>, Behaviour> = {
  drip: { life: [0.9, 1.3], y: [1.3, 1.45], rise: 0, fall: 0, drift: 0, size: [0.16, 0.2], alpha: 0.85, grow: 0 },
  mist: { life: [4, 7], y: [0.15, 0.4], rise: 0.01, fall: 0, drift: 0.14, size: [1.3, 2.0], alpha: 0.16, grow: 0.4 },
  dust: { life: [4, 8], y: [0.3, 1.6], rise: 0.02, fall: 0, drift: 0.09, size: [0.11, 0.16], alpha: 0.6, grow: 0 },
  ember: { life: [1.6, 3], y: [0.1, 0.4], rise: 0.6, fall: 0, drift: 0.16, size: [0.13, 0.19], alpha: 1, grow: -0.3 },
  ash: { life: [3, 5], y: [1.8, 2.4], rise: 0, fall: 0.35, drift: 0.1, size: [0.13, 0.19], alpha: 0.75, grow: 0 },
  spore: { life: [3, 5], y: [0.2, 0.5], rise: 0.28, fall: 0, drift: 0.1, size: [0.15, 0.21], alpha: 1, grow: 0 },
  steam: { life: [1.4, 2.2], y: [0.3, 0.6], rise: 0.55, fall: 0, drift: 0.12, size: [0.3, 0.45], alpha: 0.35, grow: 1.2 },
  spark: { life: [0.5, 0.9], y: [0.3, 0.8], rise: 0.2, fall: 1.6, drift: 1.4, size: [0.1, 0.14], alpha: 1, grow: -0.5 },
  bubble: { life: [1.2, 2], y: [0.02, 0.05], rise: 0.14, fall: 0, drift: 0.04, size: [0.2, 0.28], alpha: 0.75, grow: 0.2 },
  magic: { life: [1.5, 2.5], y: [0.2, 0.6], rise: 0.3, fall: 0, drift: 0.0, size: [0.16, 0.22], alpha: 1, grow: 0 },
  fly: { life: [5, 9], y: [0.4, 1.0], rise: 0, fall: 0, drift: 0.0, size: [0.09, 0.12], alpha: 0.95, grow: 0 },
  smoke: { life: [2, 3.5], y: [0.25, 0.5], rise: 0.35, fall: 0, drift: 0.1, size: [0.3, 0.4], alpha: 0.3, grow: 1.1 },
};

/** The types in the order their numbers go. */
const TYPES = Object.keys(PARTICLE_FRAME) as Array<Exclude<ParticleType, 'haze'>>;
const CAP = 160;
const RIPPLES = 10;
const RIPPLE_MS = 1100;
/** Where a gas cloud's puffs are at most drawn: more would only be fill. */
const GAS_PUFFS = 48;
/** The most chunks and splats left on the floor that are drawn. */
const STAINS = 260;

/** Per type, the mean life, so the spawn rate keeps the room as full as the kit says. */
const MEAN_LIFE = (b: Behaviour): number => (b.life[0] + b.life[1]) / 2;

export class Effects3D {
  /** Blended (smoke, shade, blood, gas) and added (light, sparks, flames): one draw each. */
  readonly soft: QuadBatch;
  readonly glow: QuadBatch;
  readonly texture: CanvasTexture;
  /** The designer's effects (fx3d.ts), drawn into the same two batches. */
  readonly sheets: Fx3D;
  /** The hero's growth on his figure (part 11: sparks, runes, wisps), the same two batches again. */
  readonly growth: Growth3D;
  /** The special places' life and the short things over them (places3d.ts), the same two batches. */
  readonly places: Places3D;
  private geom: LevelGeom | null = null;
  private region = 0;
  /** The region's and the arena's particles, with their colours and the rate each is made at. */
  private kinds: Array<{ type: number; rgb: Float32Array; rate: number; glow: boolean; accrued: number }> = [];
  private readonly lamp = new Color();
  private particlesOn = true;

  // The kit's particles, one record each in these arrays.
  private readonly pType = new Uint8Array(CAP);
  private readonly pAlive = new Uint8Array(CAP);
  private readonly px = new Float32Array(CAP);
  private readonly py = new Float32Array(CAP);
  private readonly pz = new Float32Array(CAP);
  private readonly pvx = new Float32Array(CAP);
  private readonly pvz = new Float32Array(CAP);
  private readonly pAge = new Float32Array(CAP);
  private readonly pLife = new Float32Array(CAP);
  private readonly pSize = new Float32Array(CAP);
  private readonly pKind = new Uint8Array(CAP);
  /** An orbiting particle's centre. */
  private readonly pcx = new Float32Array(CAP);
  private readonly pcz = new Float32Array(CAP);

  // Ripples on the water.
  private readonly rx = new Float32Array(RIPPLES);
  private readonly rz = new Float32Array(RIPPLES);
  private readonly rBorn = new Float64Array(RIPPLES).fill(-1e9);
  private rippleAccrued = 0;
  private waterRipple: Float32Array = new Float32Array([1, 1, 1]);
  private hasWater = false;

  /** The glowing tiles of the level (the kit's emissive list, and lava), each with a soft glow of its colour over it: the kit's bloom, cheaply. */
  private glowCells = new Int32Array(0);
  private glowRgb = new Float32Array(0);
  private glowSize = new Float32Array(0);
  private glowAlpha = new Float32Array(0);
  private glowCount = 0;
  /** The real bloom is on (post.ts): the stand-in glow over the shining tiles is not drawn. */
  private bloomOn = false;

  private bolt: BoltKit | null = null;
  private kitRef: Kit | null = null;
  /** The light moving with a bolt or a blast. */
  readonly dynamic: Dynamic = { on: false, x: 0, y: 0, z: 0, color: 0xffffff, intensity: 0, distance: 4 };

  constructor(scene: Scene, air: AirUniforms, images: SharedImages) {
    this.texture = fxTexture(images);
    this.soft = new QuadBatch({ capacity: 900, texture: this.texture, additive: false, fog: air.tFog, renderOrder: 2 });
    this.glow = new QuadBatch({ capacity: 560, texture: this.texture, additive: true, fog: air.tFog, renderOrder: 4 });
    this.sheets = new Fx3D(this.soft, this.glow, this.texture, { w: ATLAS_W, h: ATLAS_H, regions: ATLAS.free });
    this.growth = new Growth3D(this.glow, this.soft, this.texture, { x: ATLAS.growth.x, y: ATLAS.growth.y, atlasW: ATLAS_W, atlasH: ATLAS_H }, UV_DOT);
    this.places = new Places3D(this.glow, this.soft, { dot: UV_DOT, solid: UV_SOLID, ring: UV_RING, mist: UV_MIST, beam: UV_BEAM, z: UV_Z, star: UV_STAR, plus: UV_PLUS, flame: UV_FLAME });
    scene.add(this.soft.mesh, this.glow.mesh);
  }

  /** A level's air: the particles of its region (and of a boss's arena), its water's ripple colour. */
  configure(kit: Kit, a: Atmosphere, geom: LevelGeom, region: number, quality: { particles: boolean }): void {
    this.geom = geom;
    this.region = region;
    this.kitRef = kit;
    this.particlesOn = quality.particles;
    this.kinds = [];
    for (const p of a.particles) {
      if (p.type === 'haze') continue;
      const type = TYPES.indexOf(p.type);
      if (type < 0) continue;
      // `rate` is how many the kit has about the room at once; the spawn rate keeps that many alive.
      const b = BEHAVE[p.type];
      this.kinds.push({ type, rgb: parseCss(p.color), rate: (p.rate * 16) / MEAN_LIFE(b), glow: GLOWING.has(p.type), accrued: 0 });
    }
    this.pAlive.fill(0);
    this.rBorn.fill(-1e9);
    this.waterRipple = parseCss(a.region.water.ripple);
    this.hasWater = false;
    for (let i = 0; i < geom.kinds.length && !this.hasWater; i++) this.hasWater = geom.kinds[i] === K_WATER;
    this.scanGlow(a, geom);
  }

  /** Finds the cells that glow, and with what. */
  private scanGlow(a: Atmosphere, geom: LevelGeom): void {
    const cells: number[] = [];
    const rgb: number[] = [];
    const size: number[] = [];
    const alpha: number[] = [];
    const emissive = a.region.emissive;
    const lava = a.region.water.emissive !== undefined;
    const lavaRgb = lava ? parseCss(a.region.water.emissive!) : null;
    for (let cell = 0; cell < geom.kinds.length && cells.length < 160; cell++) {
      const t = geom.terrain[cell]!;
      if (lava && geom.kinds[cell] === K_WATER) {
        // Lava: a glow over every other cell, which the neighbours fill in.
        if (((cell % WIDTH) + Math.trunc(cell / WIDTH)) % 2 === 0) {
          cells.push(cell); rgb.push(lavaRgb![0]!, lavaRgb![1]!, lavaRgb![2]!); size.push(2.0); alpha.push(0.2);
        }
        continue;
      }
      const colour = emissive[String(t)];
      if (typeof colour !== 'string') continue;
      const c = parseCss(colour);
      cells.push(cell); rgb.push(c[0]!, c[1]!, c[2]!); size.push(t === 9 ? 1.3 : 1.6); alpha.push(t === 9 ? 0.3 : 0.2);
    }
    this.glowCells = Int32Array.from(cells);
    this.glowRgb = Float32Array.from(rgb);
    this.glowSize = Float32Array.from(size);
    this.glowAlpha = Float32Array.from(alpha);
    this.glowCount = cells.length;
  }

  setBloom(on: boolean): void {
    this.bloomOn = on;
  }

  /** The glow over the tiles that shine: seen ones only, near the hero, flickering a little (embers more). */
  private glows(c: FxContext): void {
    if (this.bloomOn) return;
    const t = c.now / 1000;
    for (let i = 0; i < this.glowCount; i++) {
      const cell = this.glowCells[i]!;
      if (!c.visible[cell]) continue;
      const x = (cell % WIDTH) + 0.5;
      const z = Math.trunc(cell / WIDTH) + 0.5;
      if (Math.abs(x - c.hx) > 9 || Math.abs(z - c.hz) > 9) continue;
      const flick = 0.8 + 0.2 * Math.sin(t * 3 + cell * 1.7);
      this.glow.flat(x, 0.06, z, this.glowSize[i]!, this.glowSize[i]! * 0.9, 0, UV_DOT[0], UV_DOT[1], UV_DOT[2], UV_DOT[3], this.glowRgb[i * 3]!, this.glowRgb[i * 3 + 1]!, this.glowRgb[i * 3 + 2]!, this.glowAlpha[i]! * flick);
    }
  }

  setParticles(on: boolean): void {
    this.particlesOn = on;
  }

  private mist: { rgb: Float32Array; density: number; height: number } | null = null;

  /** The region's mist: a few big soft wisps over the floor near the hero (the kit's low layer of noise, kept off the whole screen). */
  setMist(mist: MistKit | null): void {
    this.mist = mist ? { rgb: parseCss(mist.color), density: mist.density, height: mist.height } : null;
  }

  private wisps(c: FxContext): void {
    const mist = this.mist;
    if (!mist) return;
    const t = c.now / 1000;
    for (let i = 0; i < 6; i++) {
      const size = 3.6 + (i % 3) * 1.0;
      const x = c.hx + Math.sin(t * 0.07 + i * 1.9) * 3.8;
      const z = c.hz + Math.cos(t * 0.06 + i * 2.3) * 3.4;
      this.soft.flat(x, mist.height * (0.5 + 0.12 * i), z, size, size * 0.8, t * 0.01 + i, UV_MIST[0], UV_MIST[1], UV_MIST[2], UV_MIST[3], mist.rgb[0]!, mist.rgb[1]!, mist.rgb[2]!, mist.density * 0.7);
    }
  }

  /** A blob of shade under a character or an item, `size` cells wide, on the ground at height `ground` (a step of the stairs). */
  shadowBlob(x: number, z: number, size: number, opacity = 0.55, squash = 0.42, ground = 0): void {
    this.soft.flat(x, 0.02 + ground, z, size, size * squash, 0, UV_DOT[0], UV_DOT[1], UV_DOT[2], UV_DOT[3], 0.01, 0.012, 0.03, opacity);
  }

  /**
   * The contact shadow: a small, sharp, dark ellipse right under a foot (`width` cells across, a little over a third as deep), on top of the
   * soft blob; it is drawn on the floor, before any figure. `lift` is how high the figure is off the floor (a flyer, a leap): it shrinks
   * and fades with it. `depth` is its extent front to back (a flat ellipse by default; contact.ts places it under the soles).
   */
  contactShadow(x: number, z: number, width: number, opacity: number, ground = 0, lift = 0, depth = width * 0.4): void {
    const k = Math.max(0, 1 - lift / 0.7);
    if (k <= 0.02) return;
    const w = width * (0.55 + 0.45 * k);
    this.soft.flat(x, 0.024 + ground, z, w, depth * (0.55 + 0.45 * k), 0, UV_DISC[0], UV_DISC[1], UV_DISC[2], UV_DISC[3], 0.005, 0.006, 0.014, Math.min(1, opacity * k));
  }

  /** A ring on the water where a foot comes down (see the drops': a quarter of a second later it is wide and gone). */
  ripple(x: number, z: number, now: number): void {
    this.ringAt(x, z, now);
  }

  /** The halo round a torch's flame. */
  halo(x: number, y: number, z: number, color: Float32Array, size: number, strength: number): void {
    this.glow.billboard(x, y, z, size, size, UV_DOT[0], UV_DOT[1], UV_DOT[2], UV_DOT[3], color[0]! * strength, color[1]! * strength, color[2]! * strength, 0.9);
  }

  private open(cell: number): boolean {
    const k = this.geom!.kinds[cell];
    return k === K_FLOOR || k === K_WATER;
  }

  /** Picks a place for a new particle of a kind near the hero (or the boss), or none; tries a few cells, never searches. */
  private place(type: Exclude<ParticleType, 'haze'>, c: FxContext, out: Float32Array): boolean {
    const geom = this.geom!;
    const boss = c.bossFound && (type === 'steam' || type === 'spark' || type === 'magic' || (type === 'smoke' && c.bossFound));
    for (let tries = 0; tries < 8; tries++) {
      const cx = Math.floor((boss ? c.bossX : c.hx) + (Math.random() * 2 - 1) * (boss ? 2.2 : 7));
      const cz = Math.floor((boss ? c.bossZ : c.hz) + (Math.random() * 2 - 1) * (boss ? 2.2 : 7));
      if (cx < 1 || cz < 1 || cx >= WIDTH - 1 || cz >= HEIGHT - 1) continue;
      const cell = cx + cz * WIDTH;
      if (!c.visible[cell] || !this.open(cell)) continue;
      const kind = geom.kinds[cell]!;
      if (type === 'drip' && geom.kinds[cell - WIDTH] !== 1) continue;
      if (type === 'bubble' && kind !== K_WATER) continue;
      if (type === 'mist' && tries < 5 && kind !== K_WATER) continue;
      if (type === 'spore' && tries < 6 && geom.terrain[cell] !== 15) continue;
      if (type === 'ember' && tries < 5 && geom.terrain[cell] !== 9 && geom.terrain[cell] !== 2 && kind !== K_WATER) continue;
      if (type === 'fly' && tries < 6 && geom.terrain[cell] !== 2 && geom.terrain[cell] !== 15) continue;
      out[0] = cx + Math.random();
      out[1] = cz + (type === 'drip' ? 0.15 : Math.random());
      return true;
    }
    return false;
  }

  private readonly spot = new Float32Array(2);

  private spawn(kindIndex: number, c: FxContext): void {
    const kind = this.kinds[kindIndex]!;
    const name = TYPES[kind.type]!;
    if (!this.place(name, c, this.spot)) return;
    let i = -1;
    for (let k = 0; k < CAP; k++) if (!this.pAlive[k]) { i = k; break; }
    if (i < 0) return;
    const b = BEHAVE[name];
    const x = this.spot[0]!;
    const z = this.spot[1]!;
    this.pAlive[i] = 1;
    this.pType[i] = kind.type;
    this.pKind[i] = kindIndex;
    this.px[i] = x;
    this.pz[i] = z;
    this.py[i] = b.y[0] + Math.random() * (b.y[1] - b.y[0]);
    this.pAge[i] = 0;
    this.pLife[i] = b.life[0] + Math.random() * (b.life[1] - b.life[0]);
    this.pSize[i] = b.size[0] + Math.random() * (b.size[1] - b.size[0]);
    const a = Math.random() * 6.2832;
    this.pvx[i] = Math.cos(a) * b.drift * (0.4 + Math.random() * 0.6);
    this.pvz[i] = Math.sin(a) * b.drift * (0.4 + Math.random() * 0.6);
    this.pcx[i] = x;
    this.pcz[i] = z;
  }

  /** Moves the particles on and draws them. */
  private particles(c: FxContext): void {
    const dt = Math.min(0.1, c.dt / 1000);
    for (let k = 0; k < this.kinds.length; k++) {
      const kind = this.kinds[k]!;
      kind.accrued += kind.rate * dt;
      while (kind.accrued >= 1) {
        kind.accrued -= 1;
        this.spawn(k, c);
      }
    }
    const t = c.now / 1000;
    for (let i = 0; i < CAP; i++) {
      if (!this.pAlive[i]) continue;
      const name = TYPES[this.pType[i]!]!;
      const b = BEHAVE[name];
      const age = (this.pAge[i]! += dt);
      const life = this.pLife[i]!;
      if (age >= life) {
        this.pAlive[i] = 0;
        continue;
      }
      const k = age / life;
      if (name === 'drip') {
        // Falls from the ceiling and breaks on the floor: a ring on water.
        const fall = 6 * age * age * 0.5;
        const y = (b.y[0] + 0.1) - fall;
        this.py[i] = y;
        if (y <= 0.03) {
          if (this.geom!.kinds[Math.floor(this.px[i]!) + Math.floor(this.pz[i]!) * WIDTH] === K_WATER) this.ringAt(this.px[i]!, this.pz[i]!, c.now);
          this.pAlive[i] = 0;
          continue;
        }
      } else if (name === 'magic' && c.bossFound) {
        const a = t * 2.2 + i * 1.7;
        this.px[i] = c.bossX + Math.cos(a) * 0.9;
        this.pz[i] = c.bossZ + Math.sin(a) * 0.9;
        this.py[i]! += b.rise * dt;
      } else if (name === 'fly') {
        const a = t * 2.4 + i * 2.3;
        this.px[i] = this.pcx[i]! + Math.cos(a) * 0.45 + Math.sin(a * 0.37) * 0.2;
        this.pz[i] = this.pcz[i]! + Math.sin(a * 1.3) * 0.35;
        this.py[i] = 0.55 + Math.sin(a * 0.7) * 0.18;
      } else {
        this.px[i]! += this.pvx[i]! * dt;
        this.pz[i]! += this.pvz[i]! * dt;
        this.py[i]! += (b.rise - b.fall * (name === 'spark' ? k * 2 : 1)) * dt;
        if (name === 'bubble' && this.py[i]! > 0.06) this.py[i] = 0.06;
        if (name === 'dust' || name === 'mist' || name === 'ash') {
          this.pvx[i]! += (Math.random() - 0.5) * 0.05 * dt * 10;
          this.pvz[i]! += (Math.random() - 0.5) * 0.05 * dt * 10;
        }
      }
      const x = this.px[i]!;
      const z = this.pz[i]!;
      const cell = Math.floor(x) + Math.floor(z) * WIDTH;
      if (!c.visible[cell]) continue;
      const fade = k < 0.15 ? k / 0.15 : k > 0.65 ? (1 - k) / 0.35 : 1;
      const grow = 1 + b.grow * k;
      const size = this.pSize[i]! * grow;
      const kind = this.kinds[this.pKind[i]!]!;
      const rgb = kind.rgb;
      const flick = kind.glow ? 0.75 + 0.25 * Math.sin(t * 17 + i * 3.1) : 1;
      if (name === 'mist') {
        this.soft.flat(x, this.py[i]!, z, size, size * 0.8, 0, UV_MIST[0], UV_MIST[1], UV_MIST[2], UV_MIST[3], rgb[0]!, rgb[1]!, rgb[2]!, b.alpha * fade);
        continue;
      }
      const uv = PARTICLE_UV[this.pType[i]!]!;
      const batch = kind.glow ? this.glow : this.soft;
      batch.billboard(x, this.py[i]!, z, size, size, uv[0]!, uv[1]!, uv[2]!, uv[3]!, rgb[0]! * (kind.glow ? 1.6 : 1) * flick, rgb[1]! * (kind.glow ? 1.6 : 1) * flick, rgb[2]! * (kind.glow ? 1.6 : 1) * flick, b.alpha * fade);
    }
  }

  private ringAt(x: number, z: number, now: number): void {
    let slot = 0;
    let oldest = Infinity;
    for (let i = 0; i < RIPPLES; i++) {
      if (this.rBorn[i]! < oldest) { oldest = this.rBorn[i]!; slot = i; }
    }
    this.rx[slot] = x;
    this.rz[slot] = z;
    this.rBorn[slot] = now;
  }

  private ripples(c: FxContext): void {
    if (this.hasWater && this.particlesOn) {
      this.rippleAccrued += 1.4 * (c.dt / 1000);
      while (this.rippleAccrued >= 1) {
        this.rippleAccrued -= 1;
        for (let tries = 0; tries < 8; tries++) {
          const cx = Math.floor(c.hx + (Math.random() * 2 - 1) * 6);
          const cz = Math.floor(c.hz + (Math.random() * 2 - 1) * 6);
          const cell = cx + cz * WIDTH;
          if (cx < 0 || cz < 0 || cx >= WIDTH || cz >= HEIGHT || !c.visible[cell] || this.geom!.kinds[cell] !== K_WATER) continue;
          this.ringAt(cx + 0.5, cz + 0.5, c.now);
          break;
        }
      }
    }
    const rc = this.waterRipple;
    for (let i = 0; i < RIPPLES; i++) {
      const age = c.now - this.rBorn[i]!;
      if (age < 0 || age >= RIPPLE_MS) continue;
      const k = age / RIPPLE_MS;
      const uv = RIPPLE_UV[Math.min(5, Math.floor(k * 6))]!;
      this.glow.flat(this.rx[i]!, 0.005, this.rz[i]!, 1, 1, 0, uv[0], uv[1], uv[2], uv[3], rc[0]!, rc[1]!, rc[2]!, 0.7 * (1 - k));
    }
  }

  /** The bolts in flight: glow with a trail, the nearest one's light moving with it. */
  private bolts(c: FxContext, kit: Kit): void {
    const dyn = this.dynamic;
    let best = 0;
    for (const p of c.view.projectiles) {
      if (p.sprite !== null) continue;
      const k = Math.min(1, (c.now - p.start) / p.duration);
      const name = p.bolt ?? 'magic';
      const bolt = boltOf(kit, name);
      this.bolt = bolt;
      const fromX = (p.from % WIDTH) + 0.5;
      const fromZ = Math.trunc(p.from / WIDTH) + 0.5;
      const toX = (p.to % WIDTH) + 0.5;
      const toZ = Math.trunc(p.to / WIDTH) + 0.5;
      const x = fromX + (toX - fromX) * k;
      const z = fromZ + (toZ - fromZ) * k;
      const rgb = parseCss(bolt.color);
      const aura = parseCss(bolt.light ?? bolt.color);
      // The head, a wider halo, and a short trail behind it (the beam of a disintegration lies along the whole way).
      const beam = name === 'beam';
      const length = Math.hypot(toX - fromX, toZ - fromZ);
      const steps = beam ? Math.max(2, Math.round(length * k * 2.4)) : 5;
      for (let s = 0; s < steps; s++) {
        const back = beam ? (s / steps) * k : (s * 0.045);
        const kk = Math.max(0, k - back);
        const fade = beam ? 0.9 - 0.4 * (s / steps) : 1 - s / steps;
        const bx = fromX + (toX - fromX) * kk;
        const bz = fromZ + (toZ - fromZ) * kk;
        const size = (s === 0 ? 0.5 : 0.34) * (beam ? 0.8 : 1);
        this.glow.billboard(bx, 0.55, bz, size, size, UV_DOT[0], UV_DOT[1], UV_DOT[2], UV_DOT[3], rgb[0]! * 2.2, rgb[1]! * 2.2, rgb[2]! * 2.2, fade);
      }
      this.glow.billboard(x, 0.55, z, 1.3, 1.3, UV_DOT[0], UV_DOT[1], UV_DOT[2], UV_DOT[3], aura[0]!, aura[1]!, aura[2]!, 0.55);
      // A flash of lightning lights the whole room for the length of its flight.
      const strength = bolt.light ? bolt.intensity : 0;
      if (strength > best) {
        best = strength;
        dyn.on = true;
        dyn.x = x; dyn.y = 0.7; dyn.z = z;
        dyn.color = hex(bolt.light!);
        dyn.intensity = strength;
        dyn.distance = bolt.distance;
      }
    }
    // The flash of a blast, a bolt that struck: from the effects module's pulses.
    for (const p of fx.pulses) {
      const k = (c.now - p.born) / p.life;
      if (k < 0 || k >= 1) continue;
      const rgb = parseCss(p.color);
      const px = p.x / TILE;
      const pz = p.y / TILE;
      const cell = Math.floor(px) + Math.floor(pz) * WIDTH;
      if (!c.visible[cell]) continue;
      const power = p.power * (1 - k) * (1 - k);
      const size = 1 + p.power * 0.28 * Math.sqrt(k);
      this.glow.billboard(px, 0.5, pz, size, size, UV_DOT[0], UV_DOT[1], UV_DOT[2], UV_DOT[3], rgb[0]! * 2.4, rgb[1]! * 2.4, rgb[2]! * 2.4, 1 - k);
      if (power > best) {
        best = power;
        dyn.on = true;
        dyn.x = px; dyn.y = 0.8; dyn.z = pz;
        this.lamp.setRGB(rgb[0]!, rgb[1]!, rgb[2]!);
        dyn.color = this.lamp.getHex();
        dyn.intensity = power * 1.2;
        dyn.distance = 6 + p.power * 0.4;
      }
    }
  }

  /** What the effects module keeps: sparks, smoke, chunks, splats, pools, blows, the rings of a wave. */
  private legacy(c: FxContext): void {
    const now = c.now;
    const visible = c.visible;
    const seen = (x: number, y: number): boolean => visible[Math.trunc(y / TILE) * WIDTH + Math.trunc(x / TILE)] === true;
    // Particles of a burst: little squares of light or smoke, rising a little as they live.
    for (const p of fx.particles) {
      if (!seen(p.x, p.y)) continue;
      const k = (now - p.born) / p.life;
      if (k < 0 || k >= 1) continue;
      const rgb = parseCss(p.color);
      // (Blood and dust are drawn bigger than their art pixel: seen from above and far away a single pixel is lost.)
      const size = Math.max(0.1, (p.size / TILE) * (p.glow ? 1.5 : SPECK_GROW));
      const a = rgb[3]! * (1 - k);
      if (p.glow) this.glow.billboard(p.x / TILE, (p.low ? 0.04 : 0.3) + (p.low ? 0.2 : 0.5) * k, p.y / TILE, size, size, UV_SOLID[0], UV_SOLID[1], UV_SOLID[2], UV_SOLID[3], rgb[0]! * 2, rgb[1]! * 2, rgb[2]! * 2, a);
      else this.soft.billboard(p.x / TILE, (p.low ? 0.04 : 0.3) + (p.low ? 0.14 : 0.35) * k, p.y / TILE, size, size, UV_SOLID[0], UV_SOLID[1], UV_SOLID[2], UV_SOLID[3], rgb[0]!, rgb[1]!, rgb[2]!, a);
    }
    // Chunks in the air and on the floor.
    for (const g of fx.gibs) {
      if (!seen(g.x, g.y)) continue;
      const rgb = parseCss(g.color);
      const size = chunkSize(g.w, g.h);
      const k = Number.isFinite(g.life) ? (now - g.born) / g.life : 0;
      const height = g.z / TILE;
      // A chunk that has come down lies on the floor, a few art pixels across, and is not a card standing up.
      if (!g.glow && height < 0.04) this.soft.flat(g.x / TILE, 0.017, g.y / TILE, size, size, 0, UV_SOLID[0], UV_SOLID[1], UV_SOLID[2], UV_SOLID[3], rgb[0]! * 0.8, rgb[1]! * 0.8, rgb[2]! * 0.8, 1);
      else if (g.glow) this.glow.billboard(g.x / TILE, 0.05 + height, g.y / TILE, size, size, UV_SOLID[0], UV_SOLID[1], UV_SOLID[2], UV_SOLID[3], rgb[0]! * 2, rgb[1]! * 2, rgb[2]! * 2, 1 - k);
      else this.soft.billboard(g.x / TILE, 0.04 + height, g.y / TILE, size, size, UV_SOLID[0], UV_SOLID[1], UV_SOLID[2], UV_SOLID[3], rgb[0]!, rgb[1]!, rgb[2]!, 1);
    }
    // (Splats, pools and chunks at rest are baked into the level's blood, gorelayer.ts, and stay.)
    // A blow: a streak of white across the floor.
    for (const s of fx.slashes) {
      if (!seen(s.x, s.y)) continue;
      const k = Math.min(1, (now - s.born) / 130);
      this.glow.flat(s.x / TILE, 0.5, s.y / TILE, 0.9 * (0.6 + 0.4 * k), 0.12, -Math.atan2(s.sin, s.cos), UV_SOLID[0], UV_SOLID[1], UV_SOLID[2], UV_SOLID[3], 1.4, 1.4, 1.4, 1 - k);
    }
    // The rings of a scroll's wave: out along the floor, thinning as they go.
    for (const w of fx.waves) {
      if (!seen(w.x, w.y)) continue;
      for (let ring = 0; ring < w.rings; ring++) {
        const k = (now - w.born - ring * w.stagger) / w.duration;
        if (k < 0 || k >= 1) continue;
        const rgb = parseCss(w.colors[ring % w.colors.length]!);
        const r = (w.radius / TILE) * k;
        this.glow.flat(w.x / TILE, 0.03, w.y / TILE, r * 2, r * 2, 0, UV_RING[0], UV_RING[1], UV_RING[2], UV_RING[3], rgb[0]! * 1.6, rgb[1]! * 1.6, rgb[2]! * 1.6, 0.85 * (1 - k));
      }
    }
  }

  /** Clouds of gas as soft puffs, tinted by the gas, a little thicker where there is more. */
  private gas(c: FxContext): void {
    if (!c.gas) return;
    let drawn = 0;
    const t = c.now / 1000;
    for (const cloud of c.gas) {
      if (!c.visible[cloud.pos] || drawn >= GAS_PUFFS) continue;
      const rgb = parseCss(cloud.color);
      const thick = Math.min(1, 0.25 + cloud.volume / 60);
      const x = (cloud.pos % WIDTH) + 0.5 + Math.sin(t * 0.7 + cloud.pos) * 0.12;
      const z = Math.trunc(cloud.pos / WIDTH) + 0.5 + Math.cos(t * 0.6 + cloud.pos * 1.3) * 0.1;
      this.soft.billboard(x, 0.45 + Math.sin(t * 0.9 + cloud.pos * 0.7) * 0.05, z, 1.8, 1.4, UV_MIST[0], UV_MIST[1], UV_MIST[2], UV_MIST[3], rgb[0]!, rgb[1]!, rgb[2]!, Math.min(0.5, 0.12 + 0.34 * thick));
      drawn++;
    }
  }

  /**
   * Draws the frame's effects into the two batches, and says what the dynamic light does. The caller has already put the shadows
   * and halos in (shadowBlob, halo) and calls end().
   */
  frame(c: FxContext): void {
    const kit = this.kitRef;
    if (!kit || !this.geom) return;
    this.dynamic.on = false;
    this.dynamic.intensity = 0;
    if (this.particlesOn) {
      this.particles(c);
      this.wisps(c);
    }
    this.ripples(c);
    this.glows(c);
    this.cellFlashes(c);
    this.places.frame(c, quality.light || !this.particlesOn, quality.reducedMotion);
    this.bolts(c, kit);
    this.legacy(c);
    // The designer's effects and clouds; until their sheets have come, the older puffs of gas.
    if (!this.sheets.frame(c, this.dynamic)) this.gas(c);
  }

  /**
   * Cells lit up for a moment (view.flashes): a secret found, a trap shown, a tinted burst of gas or flame. In 2D they are a coloured
   * square over the floor; here a soft pad of light on the floor, fading as that does, and for a discovery (no colour given) a few
   * little stars rising from the cell, as the original's Speck.DISCOVER.
   */
  private cellFlashes(c: FxContext): void {
    const flashes = c.view.flashes;
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i]!;
      const k = (c.now - f.start) / (f.duration ?? 600);
      if (k < 0 || k >= 1) continue;
      const rgb = parseCss(f.color ?? '255, 255, 200');
      const x = (f.cell % WIDTH) + 0.5;
      const z = Math.trunc(f.cell / WIDTH) + 0.5;
      const fade = 1 - k;
      this.glow.flat(x, 0.045, z, 1.15, 1.15, 0, UV_DOT[0], UV_DOT[1], UV_DOT[2], UV_DOT[3], rgb[0]! * 1.5 * fade, rgb[1]! * 1.5 * fade, rgb[2]! * 1.5 * fade, 0.85);
      if (f.color === undefined) {
        // The found sparkle: four stars, one after another, each rising and twinkling out.
        for (let s = 0; s < 4; s++) {
          const t = k * 1.6 - s * 0.16;
          if (t < 0 || t >= 1) continue;
          const sx = x + (s % 2 === 0 ? -0.22 : 0.22) + Math.sin(f.cell + s * 2.1) * 0.08;
          const sz = z + (s < 2 ? -0.12 : 0.14);
          const size = 0.2 * (1 - t * 0.5);
          this.glow.billboard(sx, 0.2 + t * 0.7, sz, size, size, UV_DOT[0], UV_DOT[1], UV_DOT[2], UV_DOT[3], rgb[0]! * 2.6, rgb[1]! * 2.6, rgb[2]! * 2.2, 1 - t);
        }
      }
    }
  }

  begin(): void {
    this.soft.begin();
    this.glow.begin();
  }

  end(): void {
    this.soft.end();
    this.glow.end();
  }

  get region3(): number {
    return this.region;
  }

  dispose(scene: Scene): void {
    scene.remove(this.soft.mesh, this.glow.mesh);
    this.soft.dispose();
    this.glow.dispose();
    this.texture.dispose();
  }
}

/** The rectangle of each particle's frame in the atlas, by the number of its kind. */
const PARTICLE_UV: Array<[number, number, number, number]> = TYPES.map((name) => rect(PARTICLES_AT, PARTICLE_FRAME[name], 12));
