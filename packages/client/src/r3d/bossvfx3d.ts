/*
 * The bosses' own particles in the 3D scene: smoke columns, dust that falls from a ceiling, jets of steam, sparks that fall and bounce,
 * droplets of slime, rings spreading over the floor, streaks of a thrown blade, a glare's beam. The effects module's old particles
 * (fx.ts) live on the floor's plane and rise a hand's breadth whatever their speed, so none of these could be made of them; these have
 * a height of their own, a gravity and a drag, and are written into the same two batches as the rest (soft: smoke and dust; glow: light).
 *
 * Nothing is made while a frame is drawn: the pool is a few typed arrays, particles are written in place and let go by clearing a flag.
 * The emitters (bossfx.ts) fill it a few at a time, fewer on the light effects quality; a full pool simply takes no more. Where a
 * particle is (cells; `y` the height over the floor, in cells) is all the 3D knows of it, so this file holds no scene and tests alone.
 */
import type { QuadBatch } from './quadbatch';

/** What a particle is drawn as. */
export const SHAPE = { dot: 0, mist: 1, solid: 2, ring: 3 } as const;
export type Shape = (typeof SHAPE)[keyof typeof SHAPE];

/** The pool's size: a boss's death can fill a good part of it for a second, and then it is empty again. */
export const VFX_CAP = 220;
export const STREAK_CAP = 14;

/** What a new particle is like: positions in cells, speeds in cells a second, times in ms. */
export interface Spawn {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** How long it lives, ms, and how long to wait before it appears. */
  life: number;
  delay?: number;
  /** Its size in cells (the diameter, for a ring), and what it grows to by the end, as a multiple. */
  size: number;
  grow?: number;
  /** Taller than wide by this multiple (a shaft of light, a column of steam); 1 is square. */
  tall?: number;
  /** '#rrggbb', and how bright (a glow can go over 1). */
  color: string;
  alpha?: number;
  glow?: boolean;
  shape?: Shape;
  /** Cells a second squared, downwards; and the share of speed lost a second. */
  gravity?: number;
  drag?: number;
  /** A solid piece bounces off the floor. */
  bounce?: boolean;
  /** It fades in over the first part of its life as well as out at the end (smoke, the light of a ring). */
  soft?: boolean;
}

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linear = new Map<string, readonly [number, number, number]>();
/** '#rrggbb' as linear red, green and blue (what the batches take). */
export function linearOf(hex: string): readonly [number, number, number] {
  let c = linear.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1, 7), 16);
    c = [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)];
    linear.set(hex, c);
  }
  return c;
}

/** The two batches' drawing calls, and the rectangle each shape has in the effects atlas (u, v, du, dv). */
export interface Painter {
  soft: Pick<QuadBatch, 'billboard' | 'flat'>;
  glow: Pick<QuadBatch, 'billboard' | 'flat'>;
  dot: readonly number[];
  mist: readonly number[];
  solid: readonly number[];
  ring: readonly number[];
}

/** A streak: a bright line that runs from one point to another (a blade in flight), or lies between them (a beam). */
interface Streak {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  start: number;
  dur: number;
  /** How long the bright tail behind the head is, cells (the whole length for a beam, 0 when it runs). */
  tail: number;
  width: number;
  rgb: readonly [number, number, number];
  beam: boolean;
}

export class BossVfx {
  private readonly alive = new Uint8Array(VFX_CAP);
  private readonly x = new Float32Array(VFX_CAP);
  private readonly y = new Float32Array(VFX_CAP);
  private readonly z = new Float32Array(VFX_CAP);
  private readonly vx = new Float32Array(VFX_CAP);
  private readonly vy = new Float32Array(VFX_CAP);
  private readonly vz = new Float32Array(VFX_CAP);
  private readonly age = new Float32Array(VFX_CAP);
  private readonly life = new Float32Array(VFX_CAP);
  private readonly size = new Float32Array(VFX_CAP);
  private readonly grow = new Float32Array(VFX_CAP);
  private readonly tall = new Float32Array(VFX_CAP);
  private readonly alpha = new Float32Array(VFX_CAP);
  private readonly gravity = new Float32Array(VFX_CAP);
  private readonly drag = new Float32Array(VFX_CAP);
  private readonly flags = new Uint8Array(VFX_CAP);
  private readonly rgb = new Float32Array(VFX_CAP * 3);
  private cursor = 0;
  private readonly streaks: Streak[] = [];
  /** How many are alive (tests, the overlay). */
  count = 0;

  /** Whether anything is on show or waiting to be: the picture is drawn at full pace meanwhile (pace.ts). */
  get busy(): boolean {
    return this.count > 0 || this.streaks.length > 0;
  }

  /** Puts a particle in the pool; false if the pool is full. */
  emit(s: Spawn): boolean {
    let i = -1;
    for (let k = 0; k < VFX_CAP; k++) {
      const at = (this.cursor + k) % VFX_CAP;
      if (!this.alive[at]) {
        i = at;
        break;
      }
    }
    if (i < 0) return false;
    this.cursor = (i + 1) % VFX_CAP;
    this.alive[i] = 1;
    this.x[i] = s.x;
    this.y[i] = s.y;
    this.z[i] = s.z;
    this.vx[i] = s.vx ?? 0;
    this.vy[i] = s.vy ?? 0;
    this.vz[i] = s.vz ?? 0;
    this.age[i] = -(s.delay ?? 0);
    this.life[i] = Math.max(1, s.life);
    this.size[i] = s.size;
    this.grow[i] = s.grow ?? 1;
    this.tall[i] = s.tall ?? 1;
    this.alpha[i] = s.alpha ?? 1;
    this.gravity[i] = s.gravity ?? 0;
    this.drag[i] = s.drag ?? 0;
    this.flags[i] = (s.glow ? 1 : 0) | ((s.shape ?? SHAPE.dot) << 1) | (s.bounce ? 16 : 0) | (s.soft ? 32 : 0);
    const c = linearOf(s.color);
    this.rgb[i * 3] = c[0];
    this.rgb[i * 3 + 1] = c[1];
    this.rgb[i * 3 + 2] = c[2];
    this.count++;
    return true;
  }

  /** A blade or a bolt of light running from (x0, z0) to (x1, z1) at a height, from `start` for `dur` ms. */
  streak(x0: number, z0: number, x1: number, z1: number, y: number, start: number, dur: number, color: string, tail = 2.2, width = 0.1): void {
    if (this.streaks.length >= STREAK_CAP) this.streaks.shift();
    this.streaks.push({ x0, z0, x1, z1, y, start, dur, tail, width, rgb: linearOf(color), beam: false });
  }

  /** A beam that stands between two points for `dur` ms, bright at once, fading. */
  beam(x0: number, z0: number, x1: number, z1: number, y: number, start: number, dur: number, color: string, width = 0.16): void {
    if (this.streaks.length >= STREAK_CAP) this.streaks.shift();
    this.streaks.push({ x0, z0, x1, z1, y, start, dur, tail: 0, width, rgb: linearOf(color), beam: true });
  }

  /** Moves everything on by `dtMs`, and lets the spent go. */
  update(dtMs: number, now: number): void {
    const dt = Math.min(100, Math.max(0, dtMs));
    const s = dt / 1000;
    let n = 0;
    for (let i = 0; i < VFX_CAP; i++) {
      if (!this.alive[i]) continue;
      const age = (this.age[i]! += dt);
      if (age < 0) {
        n++;
        continue;
      }
      if (age >= this.life[i]!) {
        this.alive[i] = 0;
        continue;
      }
      n++;
      const keep = Math.exp(-this.drag[i]! * s);
      this.vx[i]! *= keep;
      this.vz[i]! *= keep;
      this.vy[i] = this.vy[i]! * keep - this.gravity[i]! * s;
      this.x[i]! += this.vx[i]! * s;
      this.z[i]! += this.vz[i]! * s;
      this.y[i]! += this.vy[i]! * s;
      if (this.y[i]! < 0.02 && this.gravity[i]! > 0) {
        this.y[i] = 0.02;
        if (this.flags[i]! & 16) {
          this.vy[i] = -this.vy[i]! * 0.35;
          this.vx[i]! *= 0.6;
          this.vz[i]! *= 0.6;
        } else {
          this.vy[i] = 0;
          this.vx[i]! *= 0.5;
          this.vz[i]! *= 0.5;
        }
      }
    }
    this.count = n;
    let k = 0;
    for (const st of this.streaks) if (now - st.start < st.dur + (st.beam ? 0 : 160)) this.streaks[k++] = st;
    this.streaks.length = k;
  }

  /** Writes what is alive into the batches. `visible(x, z)` says whether the cell is in the party's sight (an unseen one is left out). */
  draw(p: Painter, now: number, visible: (x: number, z: number) => boolean): void {
    for (let i = 0; i < VFX_CAP; i++) {
      if (!this.alive[i]) continue;
      const age = this.age[i]!;
      if (age < 0) continue;
      const k = age / this.life[i]!;
      if (!visible(this.x[i]!, this.z[i]!)) continue;
      const f = this.flags[i]!;
      const glow = (f & 1) !== 0;
      const shape = (f >> 1) & 7;
      const batch = glow ? p.glow : p.soft;
      // Fades out over the last of its life; a soft one (smoke, a ring's light) comes in over the first.
      let fade = k < 0.6 ? 1 : (1 - k) / 0.4;
      if (f & 32) fade *= Math.min(1, k / 0.18);
      const a = this.alpha[i]! * fade;
      if (a < 0.005) continue;
      const size = this.size[i]! * (1 + (this.grow[i]! - 1) * Math.min(1, k));
      const r = this.rgb[i * 3]!;
      const g = this.rgb[i * 3 + 1]!;
      const b = this.rgb[i * 3 + 2]!;
      const boost = glow ? 1.6 : 1;
      if (shape === SHAPE.ring) {
        const uv = p.ring;
        batch.flat(this.x[i]!, 0.03 + this.y[i]!, this.z[i]!, size, size, 0, uv[0]!, uv[1]!, uv[2]!, uv[3]!, r * boost, g * boost, b * boost, a);
        continue;
      }
      const uv = shape === SHAPE.mist ? p.mist : shape === SHAPE.solid ? p.solid : p.dot;
      batch.billboard(this.x[i]!, this.y[i]!, this.z[i]!, size, size * this.tall[i]!, uv[0]!, uv[1]!, uv[2]!, uv[3]!, r * boost, g * boost, b * boost, a);
    }
    const uv = p.solid;
    for (const st of this.streaks) {
      const t = (now - st.start) / st.dur;
      if (t < 0) continue;
      const dx = st.x1 - st.x0;
      const dz = st.z1 - st.z0;
      const len = Math.hypot(dx, dz) || 1;
      const rot = -Math.atan2(dz, dx);
      if (st.beam) {
        const a = Math.max(0, 1 - t) ** 1.5;
        if (a < 0.01) continue;
        p.glow.flat((st.x0 + st.x1) / 2, st.y, (st.z0 + st.z1) / 2, len, st.width * (1.4 - 0.6 * Math.min(1, t)), rot, uv[0]!, uv[1]!, uv[2]!, uv[3]!, st.rgb[0] * 2.2, st.rgb[1] * 2.2, st.rgb[2] * 2.2, a);
        continue;
      }
      const head = Math.min(1, t);
      const hx = st.x0 + dx * head;
      const hz = st.z0 + dz * head;
      // A streak that has landed stays a moment, dimming (the blade's tail catches up).
      const after = t > 1 ? (t - 1) * (st.dur / 160) : 0;
      const a = 1 - Math.min(1, after);
      const reach = Math.min(st.tail, len * head);
      if (a < 0.02 || reach < 0.05) continue;
      const tailAt = Math.min(1, after);
      const cx = hx - (dx / len) * (reach * (0.5 + tailAt * 0.5));
      const cz = hz - (dz / len) * (reach * (0.5 + tailAt * 0.5));
      p.glow.flat(cx, st.y, cz, reach * (1 - tailAt * 0.6), st.width, rot, uv[0]!, uv[1]!, uv[2]!, uv[3]!, st.rgb[0] * 2.4, st.rgb[1] * 2.4, st.rgb[2] * 2.4, a);
      // The head: a hard bright point.
      if (t <= 1) p.glow.billboard(hx, st.y, hz, st.width * 2.6, st.width * 2.6, p.dot[0]!, p.dot[1]!, p.dot[2]!, p.dot[3]!, st.rgb[0] * 3, st.rgb[1] * 3, st.rgb[2] * 3, 1);
    }
  }

  clear(): void {
    this.alive.fill(0);
    this.count = 0;
    this.streaks.length = 0;
  }
}

/** The one pool the emitters fill and the 3D scene draws. */
export const bossVfx = new BossVfx();
