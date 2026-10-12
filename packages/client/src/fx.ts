/*
 * Game feel: particles, screen shake, hit-stop and screen flashes. Purely
 * visual and kept apart from the rules: nothing here touches the world.
 * Coordinates are world pixels (a tile is 16); time is the visual clock,
 * which hit-stop slows down for a moment after a heavy blow.
 */

import { quality } from './quality';

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
}

const MAX_PARTICLES = 600;
const MAX_DECALS = 240;
/** How long a splat stays on the floor, and how long it takes to fade. */
const DECAL_MS = 14000;
const DECAL_FADE_MS = 4000;

/** A splat left on the floor by a blow or a death. */
export interface Decal {
  x: number;
  y: number;
  size: number;
  color: string;
  born: number;
}

class Fx {
  particles: Particle[] = [];
  decals: Decal[] = [];
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
      });
    }
  }

  /** Splats on the floor around a point: blood where a creature was struck. */
  splat(x: number, y: number, now: number, colors: readonly string[], count: number, spread = 6): void {
    for (let i = 0; i < count; i++) {
      this.decals.push({
        x: Math.round(x + (Math.random() - 0.5) * spread * 2),
        y: Math.round(y + (Math.random() - 0.5) * spread * 1.2 + 4),
        size: 1 + Math.floor(Math.random() * 2),
        color: colors[Math.floor(Math.random() * colors.length)]!,
        born: now,
      });
    }
    if (this.decals.length > MAX_DECALS) this.decals.splice(0, this.decals.length - MAX_DECALS);
  }

  /** Splats, under the characters (world space). */
  drawDecals(ctx: CanvasRenderingContext2D, now: number, visible: (x: number, y: number) => boolean): void {
    this.decals = this.decals.filter((d) => now - d.born < DECAL_MS);
    for (const d of this.decals) {
      if (!visible(d.x, d.y)) continue;
      const left = DECAL_MS - (now - d.born);
      ctx.globalAlpha = 0.75 * Math.min(1, left / DECAL_FADE_MS);
      ctx.fillStyle = d.color;
      ctx.fillRect(d.x, d.y, d.size, d.size);
    }
    ctx.globalAlpha = 1;
  }

  /** Moves every particle on to `now`, and lets the spent ones go. */
  update(now: number, dt: number): void {
    const step = Math.min(0.1, Math.max(0, dt / 1000));
    this.particles = this.particles.filter((p) => now - p.born < p.life);
    for (const p of this.particles) {
      const keep = Math.pow(p.drag, step);
      p.vx *= keep;
      p.vy = p.vy * keep + p.gravity * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
    }
    this.flashes = this.flashes.filter((f) => now - f.start < f.duration);
  }

  /** Particles, in world space (the camera transform already set), only where the party can see. */
  draw(ctx: CanvasRenderingContext2D, now: number, visible: (x: number, y: number) => boolean): void {
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
    ctx.globalCompositeOperation = 'source-over';
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

  reset(): void {
    this.particles = [];
    this.decals = [];
    this.flashes = [];
    this.shakeUntil = 0;
  }
}

export const fx = new Fx();
