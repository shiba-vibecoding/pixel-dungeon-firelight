/*
 * Gibs: chunks thrown off a creature by a killing blow. The game is seen from
 * above, so a chunk keeps its spot on the floor (x, y) apart from its height
 * over it (z): it flies up and out, falls back, bounces once or twice and
 * comes to rest where it lands. Walls throw it back; water and chasms swallow
 * it. Pure arithmetic, so it can be tested without a canvas.
 */

/** What lies under a point of the floor, as far as a falling chunk cares. */
export const FLOOR = 0;
export const WALL = 1;
/** Water or a chasm: what lands there is gone. */
export const SWALLOW = 2;
export type Surface = typeof FLOOR | typeof WALL | typeof SWALLOW;

export interface Gib {
  /** Where on the floor it is, world pixels. */
  x: number;
  y: number;
  /** How high over the floor, pixels. */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Its size: tumbling swaps the two. */
  w: number;
  h: number;
  color: string;
  /** The darker edge along its bottom and right. */
  shade: string;
  /** Left on the floor where it bounces, or null for none. */
  smear: string | null;
  born: number;
  /** How long it lasts, ms: Infinity for a chunk that stays on the floor once it rests. */
  life: number;
  /** Drawn as light (an ember). */
  glow: boolean;
  bounces: number;
  resting: boolean;
  /** How often it turns over in the air, ms per turn. */
  spin: number;
}

/** Downward pull on a chunk in the air, pixels per second squared. */
export const GIB_GRAVITY = 560;
/** Of its fall, how much a bounce gives back upwards; and of its slide, how much it keeps. */
const BOUNCE_UP = 0.38;
const BOUNCE_ALONG = 0.5;
/** A wall takes this much out of a chunk thrown against it. */
const WALL_KEEP = 0.45;
/** Slower than this when it lands (pixels per second), a chunk stays put. */
const REST_SPEED = 40;
const MAX_BOUNCES = 2;

export type GibStep = 'flying' | 'bounced' | 'rested' | 'swallowed';

/**
 * Moves a chunk on by `dt` seconds. Returns what happened: still in the air,
 * bounced off the floor, came to rest (the caller turns it into remains), or
 * fell into water or a chasm (the caller lets it go).
 */
export function stepGib(g: Gib, dt: number, surface: (x: number, y: number) => Surface): GibStep {
  if (g.resting) return 'rested';
  let nx = g.x + g.vx * dt;
  let ny = g.y + g.vy * dt;
  if (surface(nx, ny) === WALL) {
    // Thrown against a wall: back off it along whichever way met it, never into it.
    if (surface(nx, g.y) !== WALL) {
      g.vy = -g.vy * WALL_KEEP;
      ny = g.y;
    } else if (surface(g.x, ny) !== WALL) {
      g.vx = -g.vx * WALL_KEEP;
      nx = g.x;
    } else {
      g.vx = -g.vx * WALL_KEEP;
      g.vy = -g.vy * WALL_KEEP;
      nx = g.x;
      ny = g.y;
    }
  }
  g.x = nx;
  g.y = ny;
  g.vz -= GIB_GRAVITY * dt;
  g.z += g.vz * dt;
  if (g.z > 0) return 'flying';
  g.z = 0;
  if (surface(g.x, g.y) === SWALLOW) return 'swallowed';
  if (-g.vz < REST_SPEED || g.bounces >= MAX_BOUNCES) {
    g.vx = 0;
    g.vy = 0;
    g.vz = 0;
    g.resting = true;
    return 'rested';
  }
  g.vz = -g.vz * BOUNCE_UP;
  g.vx *= BOUNCE_ALONG;
  g.vy *= BOUNCE_ALONG;
  g.bounces++;
  return 'bounced';
}

/** Its size as drawn now: a chunk in the air turns over, swapping width and height. */
export function gibTurned(g: Gib, now: number): boolean {
  return !g.resting && Math.floor((now - g.born) / g.spin) % 2 === 1;
}
