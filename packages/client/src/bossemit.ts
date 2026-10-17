/*
 * The recipes of the bosses' particles: what a slime's burst, a machine's sparks and smoke, the jets of steam, the dust shaken from a
 * ceiling, a blink's smoke, bones thrown by a rising dwarf, the rings of a shockwave are made of. Each is a handful of `bossVfx.emit`
 * calls (r3d/bossvfx3d.ts), in cells (x, z on the floor; y the height over it) and ms, with a share of them left out on the light
 * effects quality and in reduced motion. Nothing here reads the game or the screen: it is all «put these particles there», which the
 * director (bossfx.ts) says on the events. The client alone, and it rolls with Math.random, never the core's generator.
 */
import { bossVfx, SHAPE } from './r3d/bossvfx3d';
import { quality } from './quality';

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

/** How much of a recipe is made: all of it, most of it for reduced motion, a third on the light effects. */
export const density = (): number => (quality.light ? 0.35 : quality.reducedMotion ? 0.6 : 1);
const count = (n: number): number => (n <= 0 ? 0 : Math.max(1, Math.round(n * density())));

export const SLIME = ['#5fcf2f', '#a6e86a', '#2f8f1f', '#8be04a'];
export const SPARK = ['#ffe9a0', '#ffffff', '#ffb040'];
export const FIRE = ['#ffcf60', '#ff7a20', '#ffefa0', '#ff4010'];
export const SOOT = ['#2a2a2c', '#3a3633', '#1c1c1e'];
export const GREY = ['#6a6a72', '#8a8a94', '#4a4a52'];
export const STEAM = ['#eef2f4', '#d6dde0', '#ffffff'];
export const DUST = ['#b8ad8f', '#8f866c', '#d6ccae'];
export const BONE = ['#ece6cc', '#c4bea6', '#8f8a78'];
export const REPAIR = ['#7fff7f', '#c8ffc8', '#40e040'];
export const GOLD = ['#ffe070', '#fff6c0', '#e0a020'];
export const RUBBLE = ['#9a958a', '#c0b8a4', '#6e6a62'];
export const ROT = ['#5fcf2f', '#2f8f1f', '#4a6a1a'];
export const VOID = ['#b050d0', '#6a2a9a', '#e8a0ff'];

/** A puff of smoke, dust or steam that grows as it drifts. */
export function puff(x: number, y: number, z: number, o: { colors: readonly string[]; size: number; grow?: number; rise?: number; spread?: number; life: number; alpha?: number; delay?: number; drift?: number; tall?: number }): void {
  const a = Math.random() * Math.PI * 2;
  const v = rnd(0.1, 1) * (o.drift ?? 0.3);
  bossVfx.emit({
    x: x + Math.cos(a) * rnd(0, o.spread ?? 0.1), y, z: z + Math.sin(a) * rnd(0, o.spread ?? 0.1),
    vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: o.rise ?? 0.4, drag: 0.8,
    life: o.life * rnd(0.8, 1.2), size: o.size * rnd(0.8, 1.2), grow: o.grow ?? 2.2, color: pick(o.colors), alpha: o.alpha ?? 0.6,
    shape: SHAPE.mist, soft: true, ...(o.delay ? { delay: o.delay } : {}), ...(o.tall ? { tall: o.tall } : {}),
  });
}

/** A ring on the floor that spreads out, `from` cells across to `to`. */
export function ring(x: number, z: number, o: { color: string; from: number; to: number; life: number; alpha?: number; delay?: number; glow?: boolean }): void {
  bossVfx.emit({
    x, y: 0, z, life: o.life, size: o.from, grow: o.to / o.from, color: o.color, alpha: o.alpha ?? 0.9, glow: o.glow ?? true, shape: SHAPE.ring,
    ...(o.delay ? { delay: o.delay } : {}),
  });
}

/** Droplets thrown up and out that fall back, `power` 0 to 1 for how many and how far: a slime struck, or burst. */
export function slimeSplatter(x: number, z: number, y: number, power: number, delay = 0): void {
  const n = count(6 + power * 22);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = rnd(0.8, 2.2 + power * 2.2);
    bossVfx.emit({
      x, y: y + rnd(0, 0.15), z, vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.8, vy: rnd(1.6, 3.4 + power * 1.6), gravity: 13,
      life: rnd(520, 950), size: rnd(0.07, 0.13 + power * 0.06), color: pick(SLIME), alpha: 0.95, shape: SHAPE.dot, ...(delay ? { delay } : {}),
    });
  }
  for (let i = 0; i < count(2 + power * 4); i++) puff(x, y, z, { colors: SLIME, size: 0.35, grow: 1.8, rise: 0.5, spread: 0.3, life: 700, alpha: 0.35, delay, drift: 0.8 });
}

/** The slime's burst: drops thrown everywhere, and (when the designer's pop is not there to be the splash) a green ring along the floor. */
export function slimePop(x: number, z: number, y: number, delay = 0, rings = true): void {
  slimeSplatter(x, z, y, rings ? 1 : 0.7, delay);
  if (!rings) return;
  ring(x, z, { color: '#7fdc4a', from: 0.5, to: 3.4, life: 560, alpha: 0.8, delay, glow: false });
  ring(x, z, { color: '#c8ff9a', from: 0.3, to: 2.2, life: 420, alpha: 0.7, delay });
}

/** Sparks that fly up, fall and bounce on the floor. `side` is the way a blow came (radians) to throw them from, or none for all round. */
export function sparks(x: number, y: number, z: number, n: number, side?: number, delay = 0): void {
  for (let i = 0; i < count(n); i++) {
    const a = side === undefined ? Math.random() * Math.PI * 2 : side + rnd(-0.9, 0.9);
    const v = rnd(0.7, 2.6);
    bossVfx.emit({
      x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.8, vy: rnd(1.4, 3.6), gravity: 9, bounce: true,
      life: rnd(380, 820), size: rnd(0.04, 0.075), color: pick(SPARK), alpha: 1, glow: true, ...(delay ? { delay } : {}),
    });
  }
}

/** Smoke rising from a point: dark and thick, or thin and pale. */
export function smoke(x: number, y: number, z: number, o: { dark?: boolean; n?: number; size?: number; rise?: number; life?: number; delay?: number } = {}): void {
  for (let i = 0; i < count(o.n ?? 1); i++) {
    puff(x, y, z, {
      colors: o.dark ? SOOT : GREY, size: o.size ?? 0.35, grow: 2.6, rise: o.rise ?? 0.7, spread: 0.12, life: o.life ?? 1800, alpha: o.dark ? 0.62 : 0.4,
      drift: 0.25, ...(o.delay ? { delay: o.delay } : {}),
    });
  }
}

/** A blast: a ball of fire, sparks and black smoke, and a ring on the floor; `size` 1 is a barrel, 3 a boiler. */
export function explosion(x: number, y: number, z: number, size: number, delay = 0): void {
  const n = count(10 + size * 6);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = rnd(0.5, 1.8 + size * 0.7);
    bossVfx.emit({
      x, y: y + rnd(-0.1, 0.1), z, vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.8, vy: rnd(-0.2, 1.8 + size * 0.5), drag: 1.4,
      life: rnd(320, 700 + size * 120), size: rnd(0.16, 0.3) * (0.7 + size * 0.3), grow: 1.5, color: pick(FIRE), alpha: 0.95, glow: true, shape: SHAPE.dot,
      ...(delay ? { delay } : {}),
    });
  }
  sparks(x, y, z, 6 + size * 4, undefined, delay);
  smoke(x, y + 0.1, z, { dark: true, n: 2 + Math.round(size * 2), size: 0.4 + size * 0.15, rise: 0.9, life: 2200, delay: delay + 120 });
  ring(x, z, { color: '#ffb040', from: 0.4, to: 1.6 + size * 1.1, life: 420, alpha: 0.85, delay });
}

/** Dust shaken from the ceiling over a place: a few specks that drift down, and a pebble now and then that lands in a puff. */
export function fallingDust(x: number, z: number, radius: number, n: number, pebbles: number): void {
  for (let i = 0; i < count(n); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    bossVfx.emit({
      x: x + Math.cos(a) * r, y: rnd(1.6, 2.4), z: z + Math.sin(a) * r, vy: -rnd(0.3, 0.8), vx: rnd(-0.05, 0.05), drag: 0.4,
      life: rnd(1500, 2400), size: rnd(0.035, 0.07), color: pick(DUST), alpha: 0.85, shape: SHAPE.dot, delay: rnd(0, 500),
    });
  }
  for (let i = 0; i < pebbles; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const h = rnd(1.8, 2.5);
    const g = 14;
    const fall = Math.sqrt((2 * h) / g) * 1000;
    const delay = rnd(0, 400);
    bossVfx.emit({ x: px, y: h, z: pz, gravity: g, life: fall + 80, size: rnd(0.07, 0.11), color: pick(RUBBLE), alpha: 1, shape: SHAPE.solid, delay });
    puff(px, 0.06, pz, { colors: DUST, size: 0.3, grow: 2.4, rise: 0.35, spread: 0.05, life: 900, alpha: 0.45, delay: delay + fall });
    sparks(px, 0.05, pz, 0, undefined, delay + fall);
  }
}

/** The machine mending: green light rising in a column, a ring on the floor under it. */
export function mendColumn(x: number, z: number, height: number): void {
  for (let i = 0; i < count(20); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rnd(0.1, 0.55);
    bossVfx.emit({
      x: x + Math.cos(a) * r, y: rnd(0, 0.3), z: z + Math.sin(a) * r * 0.8, vy: rnd(0.8, 1.9), vx: -Math.cos(a) * 0.1, vz: -Math.sin(a) * 0.1,
      life: rnd(700, 1400), size: rnd(0.05, 0.1), color: pick(REPAIR), alpha: 1, glow: true, delay: rnd(0, 700),
    });
  }
  bossVfx.emit({ x, y: height * 0.5, z, life: 1100, size: 0.9, tall: 2.2 * height, grow: 1.2, color: '#7fff7f', alpha: 0.28, glow: true, shape: SHAPE.mist, soft: true });
  ring(x, z, { color: '#7fff7f', from: 0.6, to: 2.6, life: 700 });
  ring(x, z, { color: '#c8ffc8', from: 0.4, to: 1.7, life: 560, delay: 220, alpha: 0.7 });
}

/**
 * A blink's smoke: a trail of puffs between the two cells and sparks at the one it left; and, when the designer's smoke is not there to be
 * the clouds at both ends (`clouds`), a thick one where it left and a thin one where it lands.
 */
export function blinkSmoke(fromX: number, fromZ: number, toX: number, toZ: number, clouds = true): void {
  if (clouds) {
    for (let i = 0; i < count(12); i++) puff(fromX, rnd(0.1, 0.8), fromZ, { colors: GREY, size: 0.4, grow: 2.4, rise: 0.35, spread: 0.3, life: 1200, alpha: 0.7, drift: 0.9 });
    for (let i = 0; i < count(7); i++) puff(toX, rnd(0.1, 0.7), toZ, { colors: GREY, size: 0.3, grow: 2.2, rise: 0.3, spread: 0.25, life: 1000, alpha: 0.55, drift: 0.7, delay: 60 });
  }
  const steps = count(7);
  for (let k = 1; k < steps; k++) {
    const f = k / steps;
    puff(fromX + (toX - fromX) * f, rnd(0.2, 0.6), fromZ + (toZ - fromZ) * f, { colors: GREY, size: 0.22, grow: 2, rise: 0.2, spread: 0.15, life: 800, alpha: 0.4, delay: f * 140, drift: 0.2 });
  }
  for (let i = 0; i < count(9); i++) {
    const a = Math.random() * Math.PI * 2;
    bossVfx.emit({ x: fromX, y: 0.5, z: fromZ, vx: Math.cos(a) * rnd(1, 2.4), vz: Math.sin(a) * rnd(1, 2.4), vy: rnd(0, 1), drag: 2.2, life: rnd(300, 560), size: 0.07, color: '#d8e4ff', glow: true });
  }
  ring(fromX, fromZ, { color: '#c8d0ff', from: 0.3, to: 1.6, life: 420, alpha: 0.7 });
  ring(toX, toZ, { color: '#c8d0ff', from: 0.2, to: 1.1, life: 360, alpha: 0.5, delay: 60 });
}

/** Chips of bone and earth thrown up by something rising from the ground, and a puff of dust. */
export function riseBurst(x: number, z: number, o: { bone?: boolean; color?: string; delay?: number; n?: number } = {}): void {
  const delay = o.delay ?? 0;
  for (let i = 0; i < count(o.n ?? 9); i++) {
    const a = Math.random() * Math.PI * 2;
    const v = rnd(0.4, 1.4);
    bossVfx.emit({
      x, y: 0.05, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.8, vy: rnd(1.6, 3), gravity: 13, bounce: true,
      life: rnd(500, 900), size: rnd(0.05, 0.1), color: pick(o.bone ? BONE : RUBBLE), alpha: 1, shape: SHAPE.solid, ...(delay ? { delay } : {}),
    });
  }
  for (let i = 0; i < count(7); i++) puff(x, 0.1, z, { colors: DUST, size: 0.3, grow: 2.6, rise: 0.5, spread: 0.3, life: 1000, alpha: 0.5, drift: 0.7, delay });
  ring(x, z, { color: o.color ?? '#b8ffb0', from: 0.3, to: 1.5, life: 640, alpha: 0.7, delay });
}

/** A shockwave: rings of light running out along the floor, one after another. */
export function shockwave(x: number, z: number, radius: number, colors: readonly string[], rings = 3, delay = 0): void {
  for (let i = 0; i < rings; i++) {
    ring(x, z, { color: colors[i % colors.length]!, from: 0.6, to: radius * 2 * (1 - i * 0.12), life: 1000 + i * 140, alpha: 0.9 - i * 0.12, delay: delay + i * 150 });
  }
  for (let i = 0; i < count(18); i++) {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
    bossVfx.emit({ x, y: 0.1, z, vx: Math.cos(a) * rnd(5, 8), vz: Math.sin(a) * rnd(5, 8) * 0.8, drag: 2.6, life: rnd(500, 900), size: 0.1, color: pick(colors), glow: true, delay });
  }
}

/** Dust thrown up in a ring and flakes of gold: a king falling. */
export function collapse(x: number, z: number): void {
  for (let i = 0; i < count(26); i++) {
    const a = Math.random() * Math.PI * 2;
    puff(x + Math.cos(a) * rnd(0, 0.5), 0.1, z + Math.sin(a) * rnd(0, 0.4), { colors: DUST, size: 0.5, grow: 3, rise: rnd(0.3, 0.9), spread: 0.2, life: 1800, alpha: 0.6, drift: 1.5, delay: rnd(0, 260) });
  }
  for (let i = 0; i < count(18); i++) {
    const a = Math.random() * Math.PI * 2;
    const v = rnd(0.6, 2);
    bossVfx.emit({
      x, y: rnd(0.3, 0.8), z, vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.8, vy: rnd(1.5, 3.4), gravity: 12, bounce: true,
      life: rnd(900, 1500), size: rnd(0.04, 0.08), color: pick(GOLD), alpha: 1, glow: true,
    });
  }
  ring(x, z, { color: '#d6ccae', from: 0.5, to: 4.2, life: 900, alpha: 0.5, glow: false });
}

/** Motes of light that drift up in a shaft: the throne room's light. */
export function motes(x: number, z: number, radius: number, n: number, color = '#ffe9a0'): void {
  for (let i = 0; i < count(n); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    bossVfx.emit({
      x: x + Math.cos(a) * r, y: rnd(0, 0.4), z: z + Math.sin(a) * r * 0.8, vy: rnd(0.15, 0.45), vx: rnd(-0.06, 0.06), life: rnd(1800, 3200),
      size: rnd(0.03, 0.06), color, alpha: 0.9, glow: true, delay: rnd(0, 900),
    });
  }
}

/** The eye's glare: a red flare growing over it. */
export function glareFlare(x: number, y: number, z: number): void {
  bossVfx.emit({ x, y, z, life: 900, size: 0.9, grow: 3.4, color: '#ff3040', alpha: 0.85, glow: true, soft: true });
  bossVfx.emit({ x, y, z, life: 700, size: 0.35, grow: 2, color: '#ffffff', alpha: 0.9, glow: true });
  for (let i = 0; i < count(10); i++) {
    const a = Math.random() * Math.PI * 2;
    bossVfx.emit({ x, y, z, vx: Math.cos(a) * rnd(0.6, 1.6), vz: Math.sin(a) * rnd(0.6, 1.6), vy: rnd(-0.2, 0.6), drag: 1.6, life: rnd(400, 800), size: 0.06, color: pick(VOID), glow: true });
  }
}
