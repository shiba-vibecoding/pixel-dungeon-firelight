/*
 * Game feel: particles, screen shake, hit-stop and screen flashes; and what a
 * fight leaves behind: chunks thrown off the slain, splats, pools of blood
 * and bodies on the floor. Purely visual and kept apart from the rules:
 * nothing here touches the world. Coordinates are world pixels (a tile is
 * 16); time is the visual clock, which hit-stop slows down for a moment after
 * a heavy blow.
 */

import { F, HEIGHT, terrainFlags, WIDTH } from '@pd/core';
import { FLOOR, type Gib, gibTurned, stepGib, type Surface, SWALLOW, WALL } from './gibs';
import { quality } from './quality';
import { haptic } from './telegram';

const TILE = 16;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Pixels per second squared, downwards. */
  gravity: number;
  /** Fraction of speed kept per second. */
  drag: number;
  born: number;
  life: number;
  size: number;
  color: string;
  /** Drawn additively, as light. */
  glow: boolean;
  /** Kept low over the floor in the 3D view (dust at a footfall): it rises a hand's breadth, not to the knee. */
  low?: boolean;
}

export interface BurstOptions {
  count: number;
  colors: readonly string[];
  /** Initial speed range, pixels per second. */
  speed: readonly [number, number];
  life: readonly [number, number];
  gravity?: number;
  drag?: number;
  size?: readonly [number, number];
  glow?: boolean;
  /** Spread around the centre, pixels. */
  spread?: number;
  /** Preferred direction in radians and how wide a cone (radians); a full circle if absent. */
  angle?: number;
  cone?: number;
  /** Extra upward drift, pixels per second. */
  rise?: number;
  /** Stays near the floor in the 3D view (see Particle). */
  low?: boolean;
}

/** A chunk's colour and the darker one along its edge. */
export type Piece = readonly [color: string, shade: string];

export interface GibOptions {
  count: number;
  pieces: readonly Piece[];
  /** Left on the floor where a chunk bounces (blood, slime), or null. */
  smear: string | null;
  /** The way the blow went (radians), or undefined to scatter them all round. */
  angle?: number;
  /** How fast they fly out along the floor, and up, pixels per second. */
  speed: readonly [number, number];
  up: readonly [number, number];
  /** Embers: they glow and burn out; anything else stays on the floor. */
  glow?: boolean;
  life?: readonly [number, number];
  /** Smallest and largest side, pixels. */
  size?: readonly [number, number];
}

/** A body left where a monster fell. */
export interface CorpseOptions {
  image: CanvasImageSource;
  /** Its last frame in the sheet. */
  sx: number;
  sy: number;
  w: number;
  h: number;
  flip: boolean;
  /** Where the sprite's top-left corner lies, world pixels. */
  x: number;
  y: number;
  /** When it lies down (the end of its death), and how long it stays. */
  at: number;
  life: number;
  /** A pool spreading under it, from when, and its colours; none for the bloodless. */
  pool?: { start: number; radius: number; color: string; edge: string };
}

export interface Corpse {
  /** Darkened and turned, for the flat canvas. */
  image: HTMLCanvasElement;
  /** The frame as it is in the sheet, for the 3D view (which draws the body upright like a living figure). */
  src: { image: CanvasImageSource; sx: number; sy: number; w: number; h: number; flip: boolean };
  x: number;
  y: number;
  at: number;
  life: number;
  pool: { cx: number; cy: number; start: number; radius: number; color: string; edge: string } | null;
}

/** A splat, a drop or a chunk left on the floor. */
export interface Decal {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** A chunk's darker edge, or null for a flat splat. */
  shade: string | null;
  alpha: number;
  born: number;
}

export interface WaveOptions {
  /** One colour for every ring, or a list the rings take in turn. */
  colors: string | readonly string[];
  /** Rings sent out (the light quality and reduced motion send fewer). */
  rings: number;
  /** How far the last ring goes, in tiles. */
  tiles: number;
  /** How long each ring lives, ms. */
  duration: number;
  /** Stroke width in screen pixels (not world ones: the rings stay crisp at any zoom). Default 2. */
  width?: number;
  /** Gap between one ring and the next, ms. Default 120. */
  stagger?: number;
}

/** Rings of a wave: set out from a point, each a little behind the last. */
interface Wave {
  x: number;
  y: number;
  born: number;
  colors: readonly string[];
  rings: number;
  radius: number;
  duration: number;
  width: number;
  stagger: number;
}

/** The white streak of a heavy blow across whoever took it. */
interface Slash {
  x: number;
  y: number;
  cos: number;
  sin: number;
  born: number;
}

/** Blood in water: where it was shed (world pixels), when, how much, and how far the red spreads (cells). */
export interface Bleed {
  x: number;
  y: number;
  born: number;
  power: number;
  reach: number;
}

/** The red cloud in water spreads over about a second and a half, holds, and is gone by this long. */
const BLEED_MS = 9000;
const BLEED_SPREAD_MS = 900;
const MAX_BLEEDS = 10;
const MAX_BLEEDS_LIGHT = 4;

/** Expanding rings around a point (a scroll's shout, a hush, a pulse): how many are alive at once. */
const MAX_WAVES = 6;
const MAX_WAVES_LIGHT = 3;

const MAX_PARTICLES = 600;
/** Chunks in the air (or embers on the floor) at once. */
const MAX_GIBS = 160;
/** What stays on the floor for a whole visit: the oldest goes first. */
const MAX_DECALS = 500;
const MAX_DECALS_LIGHT = 150;
const MAX_CORPSES = 40;
const MAX_CORPSES_LIGHT = 12;
/** How long what a fight spills stays as it fell, then how long it takes to fade. */
const REMAINS_MS = 90_000;
const REMAINS_FADE_MS = 30_000;
/** A body fades over this long once its time is up. */
const CORPSE_FADE_MS = 8000;
/** How long a pool takes to spread under a body. */
const POOL_MS = 600;
/** A heavy blow's streak: three frames. */
const SLASH_MS = 100;
const SLASH_FRAME_MS = SLASH_MS / 3;
/** A slain sprite is darkened by this much as it lies. */
const CORPSE_DARK = 'rgba(16, 6, 6, 0.4)';

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const between = (range: readonly [number, number]): number => range[0] + Math.random() * (range[1] - range[0]);

/** Darkened, already turned the way it lay, one canvas per sprite frame: bodies are drawn with one call. */
const bodies = new Map<string, HTMLCanvasElement>();

function bodyImage(o: CorpseOptions): HTMLCanvasElement {
  const key = `${(o.image as HTMLImageElement).src ?? ''}|${o.sx}|${o.sy}|${o.w}|${o.h}|${o.flip ? 1 : 0}`;
  let canvas = bodies.get(key);
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = o.w;
  canvas.height = o.h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  if (o.flip) {
    ctx.translate(o.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(o.image, o.sx, o.sy, o.w, o.h, 0, 0, o.w, o.h);
  // Darkened only where the sprite has pixels.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = CORPSE_DARK;
  ctx.fillRect(0, 0, o.w, o.h);
  bodies.set(key, canvas);
  return canvas;
}

/** A flat pixel ellipse, row by row (no smoothing, whole pixels). */
function pixelEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  if (rx < 1) return;
  const rows = Math.max(0, Math.round(ry));
  for (let j = -rows; j <= rows; j++) {
    const k = j / (rows + 0.5);
    const half = Math.round(rx * Math.sqrt(1 - k * k));
    if (half > 0) ctx.fillRect(cx - half, cy + j, half * 2, 1);
  }
}

class Fx {
  particles: Particle[] = [];
  gibs: Gib[] = [];
  decals: Decal[] = [];
  corpses: Corpse[] = [];
  slashes: Slash[] = [];
  waves: Wave[] = [];
  /** Blood shed in water, which the water shows as a red cloud (the 3D water and the 2D overlay read `waterRed`). */
  bleeds: Bleed[] = [];
  /** Bursts of light at a place (a blast, a bolt striking): the 3D view lights the room with them. Position in world pixels, colour as `r, g, b`. */
  pulses: Array<{ x: number; y: number; color: string; power: number; born: number; life: number }> = [];
  /** The level's map, for where chunks may land. */
  floor: readonly number[] | null = null;
  private shakeUntil = 0;
  private shakeStart = 0;
  private shakePower = 0;
  private stopUntil = 0;
  private lastReal = 0;
  private visual = 0;
  /** Screen-wide flashes (white for lightning, red for the hero's wounds). */
  flashes: Array<{ color: string; start: number; duration: number; strength: number; edge: boolean }> = [];

  /**
   * The visual clock: real time, except during hit-stop, when it crawls
   * for a few dozen milliseconds so a heavy blow lands with weight.
   */
  /** The visual clock as the last frame left it: for taps and keys between frames, which must not move it on. */
  get now(): number {
    return this.visual;
  }

  time(real: number): number {
    if (this.lastReal === 0) {
      this.lastReal = real;
      this.visual = real;
    }
    const dt = Math.min(100, Math.max(0, real - this.lastReal));
    this.lastReal = real;
    this.visual += real < this.stopUntil ? dt * 0.12 : dt;
    return this.visual;
  }

  /** Hit-stop: the next `ms` of real time pass at a crawl. */
  hitStop(ms: number): void {
    const until = this.lastReal + ms;
    if (until > this.stopUntil) this.stopUntil = until;
  }

  shake(power: number, ms: number, now: number): void {
    // Reduced motion (the system setting): the view never shakes.
    if (quality.reducedMotion || quality.shake <= 0) return;
    // A hard shake (a boss's slam, a heavy blow taken, a quake) is felt in the hand as well.
    if (power >= 5) haptic('slam');
    // As hard as the player likes it (the settings' shake, 0 to 1; 0.6 is the old strength).
    power *= quality.shake / 0.6;
    // A stronger or longer shake takes over; a weaker one does not cut a strong one short.
    const left = Math.max(0, this.shakeUntil - now);
    if (power >= this.shakePower * (left / Math.max(1, this.shakeUntil - this.shakeStart)) || now >= this.shakeUntil) {
      this.shakePower = power;
      this.shakeStart = now;
      this.shakeUntil = now + ms;
    }
  }

  /** Whether the screen is shaking, flashing or slashed at (pace.ts); particles and chunks are covered by the effects that threw them. */
  moving(now: number): boolean {
    return now < this.shakeUntil || this.flashes.length > 0 || this.slashes.length > 0 || this.waves.length > 0;
  }

  /** How far the camera is thrown this frame, in world pixels. */
  shakeOffset(now: number): { x: number; y: number } {
    if (now >= this.shakeUntil) return { x: 0, y: 0 };
    const k = (this.shakeUntil - now) / (this.shakeUntil - this.shakeStart);
    const power = this.shakePower * k * k;
    return { x: Math.round((Math.random() * 2 - 1) * power), y: Math.round((Math.random() * 2 - 1) * power) };
  }

  flash(color: string, strength: number, duration: number, now: number, edge = false): void {
    this.flashes.push({ color, start: now, duration, strength, edge });
  }

  burst(x: number, y: number, now: number, o: BurstOptions): void {
    // Light effects: a third of the particles, and fewer at once.
    const room = (quality.light ? MAX_PARTICLES / 4 : MAX_PARTICLES) - this.particles.length;
    const count = Math.min(quality.light ? Math.ceil(o.count / 3) : o.count, Math.max(0, room));
    for (let i = 0; i < count; i++) {
      const angle = o.angle === undefined ? Math.random() * Math.PI * 2 : o.angle + (Math.random() - 0.5) * (o.cone ?? Math.PI / 2);
      const speed = o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]);
      const spread = o.spread ?? 2;
      const size = o.size ?? [1, 2];
      this.particles.push({
        x: x + (Math.random() - 0.5) * spread * 2,
        y: y + (Math.random() - 0.5) * spread * 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (o.rise ?? 0),
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 0.05,
        born: now,
        life: o.life[0] + Math.random() * (o.life[1] - o.life[0]),
        size: Math.round(size[0] + Math.random() * (size[1] - size[0])),
        color: o.colors[Math.floor(Math.random() * o.colors.length)]!,
        glow: o.glow ?? false,
        ...(o.low ? { low: true } : {}),
      });
    }
  }

  /**
   * ShadowParticle.CURSE: dark specks that draw in to a point from all round, each starting where it must to arrive as it ends
   * (a wraith rising, the curse taking shape, the curse falling on a hero). Half a second.
   */
  curse(x: number, y: number, now: number, count: number): void {
    const room = MAX_PARTICLES - this.particles.length;
    for (let i = 0; i < Math.min(count, room); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 16 + Math.random() * 16;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      this.particles.push({
        x: x - vx * 0.5, y: y - vy * 0.5, vx, vy, gravity: 0, drag: 1, born: now, life: 500,
        size: 3 + Math.round(Math.random()), color: pick(['#440044', '#330033', '#4a1a4a']), glow: false,
      });
    }
  }

  /**
   * A ring kicked up along the floor around a point: dust and gore spreading
   * flat (squashed, as the floor is seen from above) and settling at once.
   */
  ring(x: number, y: number, now: number, colors: readonly string[], count: number): void {
    const n = quality.light ? Math.ceil(count / 2) : count;
    const room = MAX_PARTICLES - this.particles.length;
    for (let i = 0; i < Math.min(n, room); i++) {
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 38 + Math.random() * 14;
      this.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.5, gravity: 0, drag: 0.004,
        born: now, life: 260 + Math.random() * 140, size: 1, color: pick(colors), glow: false,
      });
    }
  }

  /** Chunks thrown off a body, from a point on the floor (x, y) and a height over it (z). */
  gib(x: number, y: number, z: number, now: number, o: GibOptions): void {
    const count = Math.min(quality.light ? Math.max(2, Math.ceil(o.count / 2)) : o.count, Math.max(0, MAX_GIBS - this.gibs.length));
    const size = o.size ?? [2, 4];
    for (let i = 0; i < count; i++) {
      // Most fly on the way the blow went; a few anywhere.
      const angle = o.angle === undefined || Math.random() < 0.2 ? Math.random() * Math.PI * 2 : o.angle + (Math.random() - 0.5) * 1.9;
      const speed = between(o.speed);
      const [color, shade] = pick(o.pieces);
      const w = Math.round(between(size));
      this.gibs.push({
        x: x + (Math.random() - 0.5) * 4,
        y: y + (Math.random() - 0.5) * 2,
        z: z + Math.random() * 3,
        vx: Math.cos(angle) * speed,
        // The floor is seen from above and a little ahead: across it things travel at half pace.
        vy: Math.sin(angle) * speed * 0.6,
        vz: between(o.up),
        w,
        h: Math.max(2, w - (Math.random() < 0.6 ? 1 : 0)),
        color,
        shade,
        smear: o.smear,
        born: now,
        life: o.glow ? between(o.life ?? [500, 900]) : Infinity,
        glow: o.glow ?? false,
        bounces: 0,
        resting: false,
        spin: 50 + Math.random() * 60,
      });
    }
  }

  /**
   * Rings spreading out along the floor from a point (world pixels): crisp strokes, a little squashed because the floor is
   * seen from above, fading as they go. Reduced motion sends one ring, the light quality half of them.
   */
  wave(x: number, y: number, now: number, o: WaveOptions): void {
    const rings = quality.reducedMotion ? 1 : quality.light ? Math.max(1, Math.ceil(o.rings / 2)) : o.rings;
    const cap = quality.light ? MAX_WAVES_LIGHT : MAX_WAVES;
    if (this.waves.length >= cap) this.waves.splice(0, this.waves.length - cap + 1);
    this.waves.push({
      x, y, born: now, colors: typeof o.colors === 'string' ? [o.colors] : o.colors, rings, radius: o.tiles * TILE,
      duration: o.duration, width: o.width ?? 2, stagger: o.stagger ?? 120,
    });
  }

  /**
   * A creature struck or slain in water (world pixels): the water goes red round it, `reach` cells at most, for several seconds.
   * Nothing is made if it stands on dry ground. A second wound soon after, close by, only deepens the same cloud.
   */
  bleedWater(x: number, y: number, now: number, power: number, reach: number): void {
    if (!this.isWater(x, y)) return;
    for (const b of this.bleeds) {
      if (now - b.born < 600 && Math.hypot(b.x - x, b.y - y) < TILE) {
        b.power = Math.min(1, b.power + power * 0.5);
        b.reach = Math.max(b.reach, reach);
        return;
      }
    }
    const cap = quality.light ? MAX_BLEEDS_LIGHT : MAX_BLEEDS;
    if (this.bleeds.length >= cap) this.bleeds.shift();
    this.bleeds.push({ x, y, born: now, power: Math.min(1, power), reach });
  }

  /**
   * How red the water is at a cell's middle (cell units: x, z), 0 to 1: the cloud spreads out from where the blood fell, thins to its
   * edge and fades away. Reduced motion shows it at its full spread from the start.
   */
  waterRed(cx: number, cz: number, now: number): number {
    let v = 0;
    for (const b of this.bleeds) {
      const t = now - b.born;
      if (t < 0 || t >= BLEED_MS) continue;
      const spread = quality.reducedMotion ? 1 : 1 - Math.exp(-t / BLEED_SPREAD_MS);
      const r = 0.55 + b.reach * spread;
      const d = Math.hypot(cx - b.x / TILE, cz - b.y / TILE);
      if (d >= r) continue;
      const fade = t < 1200 ? 1 : 1 - (t - 1200) / (BLEED_MS - 1200);
      const edge = 1 - d / r;
      v = Math.max(v, b.power * fade * edge * Math.sqrt(edge));
    }
    return v;
  }

  /** The water cells near live blood, for the 2D overlay: red over each, under the characters. */
  drawWaterRed(ctx: CanvasRenderingContext2D, now: number, visible: (x: number, y: number) => boolean): void {
    if (this.bleeds.length === 0) return;
    ctx.fillStyle = '#8c0a14';
    for (const b of this.bleeds) {
      const c0 = Math.floor(b.x / TILE - b.reach - 1);
      const r0 = Math.floor(b.y / TILE - b.reach - 1);
      const n = Math.ceil(b.reach * 2 + 3);
      for (let dz = 0; dz < n; dz++) {
        for (let dx = 0; dx < n; dx++) {
          const cx = c0 + dx;
          const cz = r0 + dz;
          if (cx < 0 || cz < 0 || cx >= WIDTH || cz >= HEIGHT || !this.isWater(cx * TILE + 8, cz * TILE + 8) || !visible(cx * TILE + 8, cz * TILE + 8)) continue;
          const v = this.waterRed(cx + 0.5, cz + 0.5, now);
          if (v < 0.03) continue;
          ctx.globalAlpha = Math.min(0.6, v * 0.65);
          ctx.fillRect(cx * TILE, cz * TILE, TILE, TILE);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Whether a world pixel is over water (a liquid that is not a chasm). */
  private isWater(x: number, y: number): boolean {
    const map = this.floor;
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    if (!map || cx < 0 || cy < 0 || cx >= WIDTH || cy >= HEIGHT) return false;
    const flags = terrainFlags[map[cy * WIDTH + cx] ?? 0] ?? 0;
    return (flags & F.LIQUID) !== 0 && (flags & F.PIT) === 0;
  }

  /** A body lying where it fell, darkened, with a pool spreading under it. */
  corpse(o: CorpseOptions): void {
    if (typeof document === 'undefined') return;
    const pool = o.pool
      ? { cx: Math.round(o.x + o.w / 2), cy: Math.round(o.y + o.h - 2), start: o.pool.start, radius: o.pool.radius, color: o.pool.color, edge: o.pool.edge }
      : null;
    this.corpses.push({ image: bodyImage(o), src: { image: o.image, sx: o.sx, sy: o.sy, w: o.w, h: o.h, flip: o.flip }, x: Math.round(o.x), y: Math.round(o.y), at: o.at, life: o.life, pool });
    const cap = quality.light ? MAX_CORPSES_LIGHT : MAX_CORPSES;
    if (this.corpses.length > cap) this.corpses.splice(0, this.corpses.length - cap);
  }

  /** A heavy blow's white streak across a point, the way it went (a little askew, as a swing is). */
  slash(x: number, y: number, angle: number, now: number): void {
    const a = angle + (Math.random() - 0.5) * 0.7;
    this.slashes.push({ x, y, cos: Math.cos(a), sin: Math.sin(a), born: now });
  }

  /** Splats on the floor around a point: blood where a creature was struck. */
  splat(x: number, y: number, now: number, colors: readonly string[], count: number, spread = 6): void {
    for (let i = 0; i < count; i++) {
      const size = 1 + Math.floor(Math.random() * 2);
      this.stain(x + (Math.random() - 0.5) * spread * 2, y + (Math.random() - 0.5) * spread * 1.2 + 4, size, size, pick(colors), null, 0.75, now);
    }
  }

  /** Told of each thing left on the floor (a splat, a chunk at rest): the 3D view bakes it into the floor for good (gore.ts). */
  onStain: ((x: number, y: number, w: number, h: number, color: string, shade: string | null) => void) | null = null;
  /** Told when a cloud of blood in water has run its course, with where it was and how far it spread: it leaves a faint stain. */
  onBleedEnd: ((b: Bleed) => void) | null = null;

  /** One thing left on the floor; the oldest goes when there are too many. */
  private stain(x: number, y: number, w: number, h: number, color: string, shade: string | null, alpha: number, now: number): void {
    this.onStain?.(Math.round(x), Math.round(y), w, h, color, shade);
    this.decals.push({ x: Math.round(x), y: Math.round(y), w, h, color, shade, alpha, born: now });
    const cap = quality.light ? MAX_DECALS_LIGHT : MAX_DECALS;
    if (this.decals.length > cap) this.decals.splice(0, this.decals.length - cap);
  }

  /** What lies under a point: floor, a wall a chunk bounces off, or water and chasms that swallow it. */
  private readonly surface = (x: number, y: number): Surface => {
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    if (cx < 0 || cy < 0 || cx >= WIDTH || cy >= HEIGHT) return WALL;
    const map = this.floor;
    if (!map) return FLOOR;
    const flags = terrainFlags[map[cy * WIDTH + cx] ?? 0] ?? 0;
    if (flags & (F.PIT | F.LIQUID)) return SWALLOW;
    return flags & F.SOLID ? WALL : FLOOR;
  };

  /** Pools, stains and bodies, under the characters (world space). */
  drawDecals(ctx: CanvasRenderingContext2D, now: number, visible: (x: number, y: number) => boolean): void {
    this.expire(now);
    for (const c of this.corpses) {
      if (!c.pool || now < c.pool.start || !visible(c.pool.cx, c.pool.cy)) continue;
      ctx.globalAlpha = 0.85 * this.corpseFade(c, now);
      // The pool spreads quickly, then slower, to its full size.
      const k = Math.min(1, (now - c.pool.start) / POOL_MS);
      const r = Math.round(c.pool.radius * (1 - (1 - k) * (1 - k)));
      ctx.fillStyle = c.pool.edge;
      pixelEllipse(ctx, c.pool.cx, c.pool.cy, r, r * 0.45);
      ctx.fillStyle = c.pool.color;
      pixelEllipse(ctx, c.pool.cx, c.pool.cy, r - 1, (r - 1) * 0.45 - 0.5);
    }
    // Flat spatter first, then the bodies over it, then the chunks (which may have landed on a body).
    this.drawStains(ctx, now, visible, false);
    for (const c of this.corpses) {
      if (now < c.at || !visible(c.x + c.image.width / 2, c.y + c.image.height - 2)) continue;
      ctx.globalAlpha = this.corpseFade(c, now);
      ctx.drawImage(c.image, c.x, c.y);
    }
    this.drawStains(ctx, now, visible, true);
    ctx.globalAlpha = 1;
  }

  private drawStains(ctx: CanvasRenderingContext2D, now: number, visible: (x: number, y: number) => boolean, chunks: boolean): void {
    let alpha = -1;
    for (const d of this.decals) {
      if ((d.shade !== null) !== chunks || !visible(d.x, d.y)) continue;
      const age = now - d.born;
      const a = age < REMAINS_MS ? d.alpha : d.alpha * Math.max(0, 1 - (age - REMAINS_MS) / REMAINS_FADE_MS);
      if (a !== alpha) ctx.globalAlpha = alpha = a;
      if (d.shade) {
        // A chunk: its darker edge along the bottom (and the right, when it is wide enough to show).
        ctx.fillStyle = d.shade;
        ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x, d.y, d.w >= 3 ? d.w - 1 : d.w, d.h - 1);
      } else {
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x, d.y, d.w, d.h);
      }
    }
  }

  corpseFade(c: Corpse, now: number): number {
    const left = c.at + c.life - now;
    return left >= CORPSE_FADE_MS ? 1 : Math.max(0, left / CORPSE_FADE_MS);
  }

  /** Lets go of what has faded: stains and bodies go oldest first, so only the front is looked at. */
  private expire(now: number): void {
    let stale = 0;
    while (stale < this.decals.length && now - this.decals[stale]!.born >= REMAINS_MS + REMAINS_FADE_MS) stale++;
    if (stale > 0) this.decals.splice(0, stale);
    let n = 0;
    for (const c of this.corpses) if (now < c.at + c.life) this.corpses[n++] = c;
    this.corpses.length = n;
  }

  /** Moves every particle and chunk on to `now`, and lets the spent ones go. */
  update(now: number, dt: number): void {
    const step = Math.min(0.1, Math.max(0, dt / 1000));
    let n = 0;
    for (const p of this.particles) {
      if (now - p.born >= p.life) continue;
      const keep = Math.pow(p.drag, step);
      p.vx *= keep;
      p.vy = p.vy * keep + p.gravity * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      this.particles[n++] = p;
    }
    this.particles.length = n;
    this.updateGibs(now, step);
    n = 0;
    for (const b of this.bleeds) {
      if (now - b.born < BLEED_MS) this.bleeds[n++] = b;
      else this.onBleedEnd?.(b);
    }
    this.bleeds.length = n;
    n = 0;
    for (const w of this.waves) if (now - w.born < w.duration + (w.rings - 1) * w.stagger) this.waves[n++] = w;
    this.waves.length = n;
    n = 0;
    for (const p of this.pulses) if (now - p.born < p.life) this.pulses[n++] = p;
    this.pulses.length = n;
    n = 0;
    for (const s of this.slashes) if (now - s.born < SLASH_MS) this.slashes[n++] = s;
    this.slashes.length = n;
    n = 0;
    for (const f of this.flashes) if (now - f.start < f.duration) this.flashes[n++] = f;
    this.flashes.length = n;
  }

  private updateGibs(now: number, step: number): void {
    let n = 0;
    for (const g of this.gibs) {
      if (now - g.born >= g.life) continue;
      const result = stepGib(g, step, this.surface);
      if (result === 'swallowed') {
        // Into water or down a chasm: a little splash, and it is gone.
        this.burst(g.x, g.y, now, { count: 2, colors: ['#9ad4ff', '#d8f0ff'], speed: [10, 25], life: [150, 300], gravity: 200, angle: -Math.PI / 2, cone: 1.4, size: [1, 1], spread: 1 });
        continue;
      }
      if (result === 'bounced') {
        // A wet chunk leaves a smear where it hits the floor; a dry one knocks up a speck of dust.
        if (g.smear && !quality.light) this.stain(g.x - 1, g.y - 0.5, 1 + Math.round(Math.random()), 1, g.smear, null, 0.7, now);
        else if (!g.glow) this.burst(g.x, g.y, now, { count: 1, colors: [g.shade], speed: [6, 14], life: [150, 280], rise: 10, size: [1, 1], spread: 1 });
      }
      if (result === 'rested' && g.life === Infinity) {
        // At rest: it stays on the floor as part of what the fight left, wholly off any wall beside it.
        this.tuckIn(g);
        this.stain(g.x - g.w / 2, g.y - g.h / 2, g.w, g.h, g.color, g.shade, 1, now);
        continue;
      }
      this.gibs[n++] = g;
    }
    this.gibs.length = n;
  }

  /** A chunk resting against a wall is nudged back so none of it lies over the wall's tile. */
  private tuckIn(g: Gib): void {
    const hw = g.w / 2;
    const hh = g.h / 2;
    if (this.surface(g.x + hw, g.y) === WALL) g.x = Math.floor((g.x + hw) / TILE) * TILE - hw;
    if (this.surface(g.x - hw, g.y) === WALL) g.x = Math.ceil((g.x - hw) / TILE) * TILE + hw;
    if (this.surface(g.x, g.y + hh) === WALL) g.y = Math.floor((g.y + hh) / TILE) * TILE - hh;
    if (this.surface(g.x, g.y - hh) === WALL) g.y = Math.ceil((g.y - hh) / TILE) * TILE + hh;
  }

  /** Particles, chunks in flight and streaks, in world space (the camera transform already set), only where the party can see. */
  draw(ctx: CanvasRenderingContext2D, now: number, visible: (x: number, y: number) => boolean): void {
    this.drawGibs(ctx, now, visible, false);
    for (const glow of [false, true]) {
      ctx.globalCompositeOperation = glow ? 'lighter' : 'source-over';
      for (const p of this.particles) {
        if (p.glow !== glow || !visible(p.x, p.y)) continue;
        const age = (now - p.born) / p.life;
        ctx.globalAlpha = age < 0.7 ? 1 : Math.max(0, (1 - age) / 0.3);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
      }
    }
    this.drawGibs(ctx, now, visible, true);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    this.drawSlashes(ctx, now, visible);
    this.drawWaves(ctx, now, visible);
  }

  /** Each ring runs out fast and slows, fading as it goes; the stroke is `width` screen pixels whatever the zoom. */
  private drawWaves(ctx: CanvasRenderingContext2D, now: number, visible: (x: number, y: number) => boolean): void {
    if (this.waves.length === 0) return;
    const zoom = ctx.getTransform().a || 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const w of this.waves) {
      if (!visible(w.x, w.y)) continue;
      ctx.lineWidth = w.width / zoom;
      for (let i = 0; i < w.rings; i++) {
        const k = (now - w.born - i * w.stagger) / w.duration;
        if (k <= 0 || k >= 1) continue;
        const eased = 1 - (1 - k) * (1 - k);
        ctx.globalAlpha = 0.9 * (1 - k) * (1 - k * 0.4);
        ctx.strokeStyle = w.colors[i % w.colors.length]!;
        ctx.beginPath();
        // Floor seen from above: a little flatter than it is wide.
        ctx.ellipse(w.x, w.y, Math.max(0.5, w.radius * eased), Math.max(0.4, w.radius * eased * 0.8), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawGibs(ctx: CanvasRenderingContext2D, now: number, visible: (x: number, y: number) => boolean, glow: boolean): void {
    ctx.globalCompositeOperation = glow ? 'lighter' : 'source-over';
    if (!glow && !quality.light) {
      // Shadows on the floor under chunks in the air, so the arc reads as height.
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      for (const g of this.gibs) {
        if (g.glow || g.z < 1.5 || !visible(g.x, g.y)) continue;
        ctx.fillRect(Math.round(g.x - 1), Math.round(g.y), 2, 1);
      }
    }
    for (const g of this.gibs) {
      if (g.glow !== glow || !visible(g.x, g.y)) continue;
      // Embers burn down: the last part of their life they fade.
      const age = g.life === Infinity ? 0 : (now - g.born) / g.life;
      ctx.globalAlpha = age < 0.6 ? 1 : Math.max(0, (1 - age) / 0.4);
      const turned = gibTurned(g, now);
      const w = turned ? g.h : g.w;
      const h = turned ? g.w : g.h;
      const x = Math.round(g.x - w / 2);
      const y = Math.round(g.y - g.z - h / 2);
      ctx.fillStyle = g.shade;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = g.color;
      ctx.fillRect(x, y, w >= 3 ? w - 1 : w, h - 1);
    }
    ctx.globalAlpha = 1;
  }

  /** Three frames: a white streak, then a thinner warm one a little further on, then a faint short one. */
  private drawSlashes(ctx: CanvasRenderingContext2D, now: number, visible: (x: number, y: number) => boolean): void {
    for (const s of this.slashes) {
      if (!visible(s.x, s.y)) continue;
      const frame = Math.min(2, Math.floor((now - s.born) / SLASH_FRAME_MS));
      const half = frame === 2 ? 4 : 7;
      const cx = s.x + s.cos * frame * 2;
      const cy = s.y + s.sin * frame * 2;
      ctx.globalAlpha = frame === 2 ? 0.6 : 1;
      ctx.fillStyle = frame === 0 ? '#ffffff' : '#fff2c0';
      for (let i = -half; i <= half; i++) {
        const thick = frame === 0 && Math.abs(i) < half / 2 ? 2 : 1;
        ctx.fillRect(Math.round(cx + s.cos * i), Math.round(cy + s.sin * i), thick, thick);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Screen flashes and wound pulses, in screen space. */
  drawScreen(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): void {
    for (const f of this.flashes) {
      const k = 1 - (now - f.start) / f.duration;
      const alpha = f.strength * k * k;
      if (f.edge) {
        const g = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.75);
        g.addColorStop(0, `rgba(${f.color}, 0)`);
        g.addColorStop(1, `rgba(${f.color}, ${alpha})`);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = `rgba(${f.color}, ${alpha})`;
      }
      ctx.fillRect(0, 0, width, height);
    }
  }

  /** A new depth (or a new world): nothing of the last one stays. */
  /** A flash of light at (x, y): `power` is how bright (a blast 9), `life` how long it lasts, ms. */
  pulse(x: number, y: number, now: number, color: string, power: number, life: number): void {
    this.pulses.push({ x, y, color, power, born: now, life });
    if (this.pulses.length > 8) this.pulses.shift();
  }

  reset(): void {
    this.pulses = [];
    this.particles = [];
    this.gibs = [];
    this.decals = [];
    this.corpses = [];
    this.slashes = [];
    this.waves = [];
    // (What bled and has not run its course settles into the depth that is being left.)
    for (const b of this.bleeds) this.onBleedEnd?.(b);
    this.bleeds = [];
    this.flashes = [];
    this.shakeUntil = 0;
  }
}

export const fx = new Fx();
