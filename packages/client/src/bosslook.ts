/*
 * How a boss's body is drawn in a fight, as plain numbers: how wide and how tall it stands, what colour it is multiplied by, how hard
 * its glow shines, and whether it has gone altogether. A slime jiggles when struck and pops when it dies, a machine darkens and chars as
 * it is worn down and flickers as it blows up, a king slumps, a summoned dwarf rises out of the floor, a fist slams up through it, a
 * blade-master flickers back into being. Nothing here knows of the screen or the game's rules: a state (what happened to the body and
 * when) goes in with the time, a look comes out (test/bosslook.test.ts). The 3D scene reads the look (world3d.ts), the director
 * (bossfx.ts) keeps the states.
 */

/** The look of one body this frame; written in place by `lookOf`. */
export interface BodyLook {
  /** Width and height multiples (1 is as drawn), kept at the feet. */
  sx: number;
  sy: number;
  /** Colour multiples (1 is as drawn; over 1 is brighter). */
  r: number;
  g: number;
  b: number;
  /** How hard the picture's own glow shines, 0 to 1 (the damaged machine's cracks). */
  glow: number;
  /** The worn-down stage of a machine, 0 to 3 (which damaged picture to draw). */
  stage: number;
  /** Not drawn at all. */
  hide: boolean;
}

export const newLook = (): BodyLook => ({ sx: 1, sy: 1, r: 1, g: 1, b: 1, glow: 0, stage: 0, hide: false });

/** What has happened to a body and when (ms on the frame clock; undefined for what has not). */
export interface BodyState {
  kind: string;
  /** Health as a share, 1 to 0, for the stages. */
  frac: number;
  hitAt?: number;
  deathAt?: number;
  /** It came out of the floor / flickered in at this time, and how long it takes. */
  riseAt?: number;
  riseMs?: number;
  /** A boss's mending (the machine repairs itself on a spent trap). */
  repairAt?: number;
  /** An eye's glare. */
  glareAt?: number;
  /** A phase for its flicker (the machine's cracks), fixed for the body. */
  seed?: number;
}

export type Stage = 0 | 1 | 2 | 3;
/** The machine's wear: whole, scuffed (three quarters), scorched (a half), cracked and glowing (a quarter). */
export const damageStage = (frac: number): Stage => (frac > 0.75 ? 0 : frac > 0.5 ? 1 : frac > 0.25 ? 2 : 3);

/** How long each moment lasts, ms. */
export const JIGGLE_MS = 520;
export const POP_MS = 170;
export const REPAIR_MS = 1500;
export const GLARE_MS = 900;
export const COLLAPSE_MS = 900;
export const DM_BLAST_MS = 1100;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (x: number): number => 1 - (1 - clamp01(x)) ** 3;
/** Overshoots a little before it settles on 1 (a slam, a spring). */
const easeBack = (x: number): number => {
  const t = clamp01(x) - 1;
  return 1 + 2.4 * t * t * t + 1.4 * t * t;
};

/**
 * A damped spring's offset `ms` after a blow: 1 at the blow, swinging through zero to the other side and back, gone by JIGGLE_MS. A
 * hair of it is kept for reduced motion (`calm`).
 */
export function jiggle(ms: number, calm = false): number {
  if (ms < 0 || ms >= JIGGLE_MS) return 0;
  const k = Math.exp(-ms / 190) * Math.cos((ms / 300) * Math.PI * 2);
  return calm ? k * 0.35 : k;
}

/**
 * The shape of one body now. `calm` is reduced motion: the springs and the shudders are quieter, the pops and the slams are kept (they
 * are what says «it died» and «it came»), and nothing flickers.
 */
export function lookOf(s: BodyState, now: number, calm: boolean, out: BodyLook): BodyLook {
  out.sx = out.sy = out.r = out.g = out.b = 1;
  out.glow = 0;
  out.stage = 0;
  out.hide = false;

  // A body coming up: through the floor (a summoned dwarf grows out of it, a fist slams up through it), or flickering into being.
  if (s.riseAt !== undefined && s.riseMs) {
    const t = (now - s.riseAt) / s.riseMs;
    if (t < 0) {
      out.hide = true;
      return out;
    }
    if (t < 1) {
      if (s.kind === 'rottingFist' || s.kind === 'burningFist') {
        // Up with a slam: taller than it stands, then down to its size, as dust flies.
        const up = easeBack(t);
        out.sy = Math.max(0.02, up);
        out.sx = 1 + 0.18 * (1 - clamp01(t * 1.4));
        const dim = 0.35 + 0.65 * easeOut(t * 1.2);
        out.r = out.g = out.b = dim;
      } else if (s.kind === 'tengu') {
        // He flickers in: thin and tall for a beat, white, then himself.
        const k = 1 - t;
        out.sx = 1 - 0.55 * k * k;
        out.sy = 1 + 0.12 * k;
        const gl = 1 + 1.6 * k * k;
        out.r = out.g = out.b = calm ? 1 + 0.5 * k : gl;
      } else {
        // Up out of the ground: its feet stay where they are and the figure grows from them; dark with earth at first.
        out.sy = Math.max(0.02, easeOut(t));
        out.sx = 1 + 0.1 * (1 - easeOut(t));
        const dim = 0.25 + 0.75 * easeOut(t);
        out.r = dim * 0.95;
        out.g = dim;
        out.b = dim * 0.9;
      }
    }
  }

  if (s.kind === 'goo') {
    // A blow squashes it wide and flat, and it wobbles back.
    if (s.hitAt !== undefined) {
      const k = jiggle(now - s.hitAt, calm);
      out.sx *= 1 + 0.42 * k;
      out.sy *= 1 - 0.34 * k;
    }
    // Its death: it swells, white with strain, and bursts (the burst is the director's: slime flies at POP_MS).
    if (s.deathAt !== undefined) {
      const t = (now - s.deathAt) / POP_MS;
      if (t >= 0 && t < 1) {
        const swell = easeOut(t);
        out.sx *= 1 + 0.5 * swell;
        out.sy *= 1 + 0.42 * swell;
        const white = 1 + 1.1 * swell;
        out.r *= white;
        out.g *= white;
        out.b *= white;
      }
    }
    return out;
  }

  if (s.kind === 'dm300') {
    const stage = damageStage(s.frac);
    out.stage = stage;
    // Soot and rust, the more the lower it is: the picture is multiplied toward a burnt brown, and red as the cracks come to glow.
    const burnt = [0, 0.1, 0.2, 0.3][stage]!;
    out.r = 1 - burnt * 0.5;
    out.g = 1 - burnt * 1.25;
    out.b = 1 - burnt * 1.55;
    if (stage === 3) {
      out.glow = 0.55 + (calm ? 0 : 0.35 * Math.sin(now / 150 + (s.seed ?? 0)));
      out.r = 1 + 0.12 * (calm ? 0 : Math.sin(now / 150 + (s.seed ?? 0)));
    }
    // A blow: a flash of white, short.
    if (s.hitAt !== undefined && now - s.hitAt < 90) {
      out.r *= 1.7;
      out.g *= 1.7;
      out.b *= 1.7;
    }
    // Its mending: green light running over it in pulses, and it shines.
    if (s.repairAt !== undefined) {
      const t = (now - s.repairAt) / REPAIR_MS;
      if (t >= 0 && t < 1) {
        const pulse = calm ? 0.7 : 0.5 + 0.5 * Math.sin(t * Math.PI * 7);
        const strength = (1 - t) * (0.55 + 0.45 * pulse);
        out.r = out.r * (1 - 0.35 * strength);
        out.g = out.g * (1 + 0.9 * strength);
        out.b = out.b * (1 + 0.35 * strength);
        out.glow = Math.max(out.glow, strength);
      }
    }
    // Its death: shudders, flickers white and orange, then it is a heap.
    if (s.deathAt !== undefined) {
      const t = (now - s.deathAt) / DM_BLAST_MS;
      if (t >= 0 && t < 1) {
        const flick = calm ? 0.5 : Math.floor(now / 70) % 2;
        out.sx *= 1 + (calm ? 0 : 0.05 * (flick ? 1 : -1) * (1 - t));
        out.sy *= 1 + (calm ? 0 : 0.04 * (flick ? -1 : 1) * (1 - t));
        const heat = 1.2 + 1.4 * (1 - t);
        out.r *= flick ? heat : heat * 1.1;
        out.g *= flick ? heat * 0.85 : heat * 0.45;
        out.b *= flick ? heat * 0.8 : heat * 0.2;
        out.glow = 1;
      }
    }
    return out;
  }

  if (s.kind === 'king') {
    // The collapse: he sags in the middle and slumps, greying as the colour leaves him.
    if (s.deathAt !== undefined) {
      const t = easeOut((now - s.deathAt) / COLLAPSE_MS);
      out.sy *= 1 - 0.38 * t;
      out.sx *= 1 + 0.16 * t;
      const grey = 1 - 0.28 * t;
      out.r *= grey;
      out.g *= grey;
      out.b *= grey;
    } else if (s.hitAt !== undefined && !calm) {
      const k = jiggle(now - s.hitAt) * 0.5;
      out.sx *= 1 + 0.04 * k;
      out.sy *= 1 - 0.05 * k;
    }
    return out;
  }

  if (s.kind === 'yog') {
    // The glare: the eye flares, then dims back.
    if (s.glareAt !== undefined) {
      const t = (now - s.glareAt) / GLARE_MS;
      if (t >= 0 && t < 1) {
        const env = Math.sin(clamp01(t) * Math.PI);
        out.r *= 1 + 1.3 * env;
        out.g *= 1 + 0.15 * env;
        out.b *= 1 + 0.5 * env;
        out.glow = env;
        if (!calm) out.sx *= 1 + 0.035 * env;
        if (!calm) out.sy *= 1 + 0.035 * env;
      }
    }
    if (s.hitAt !== undefined && !calm) {
      const k = jiggle(now - s.hitAt) * 0.6;
      out.sx *= 1 + 0.05 * k;
      out.sy *= 1 - 0.05 * k;
    }
    return out;
  }
  return out;
}

/* ---------- the camera and the music of a fight, as numbers ---------- */

/** A slow push of the camera: how long it takes to come in, to hold, and to let go (ms), and how far (the share the zoom grows by). */
export interface Push {
  at: number;
  inMs: number;
  holdMs: number;
  outMs: number;
  amount: number;
  /** How far the view slides toward the boss as well (0 stays on the hero, 1 puts the boss in the middle). */
  slide: number;
}

/** The push's strength, 0 to 1, `ms` after it began: eased in, held, eased out. */
export function pushEnvelope(p: Push, now: number): number {
  const t = now - p.at;
  if (t <= 0 || t >= p.inMs + p.holdMs + p.outMs) return 0;
  if (t < p.inMs) return easeInOut(t / p.inMs);
  if (t < p.inMs + p.holdMs) return 1;
  return 1 - easeInOut((t - p.inMs - p.holdMs) / p.outMs);
}
const easeInOut = (x: number): number => {
  const k = clamp01(x);
  return k * k * (3 - 2 * k);
};

/** A push for reduced motion: a short, small one, no slide. */
export const calmPush = (p: Push): Push => ({ ...p, inMs: Math.min(p.inMs, 420), holdMs: Math.min(p.holdMs, 300), outMs: Math.min(p.outMs, 420), amount: p.amount * 0.3, slide: 0 });

/**
 * How hard the music plays in a boss fight, 0 to 1, from the boss's health share: the plain boss layer while it is healthy, then
 * more of it in steps (a third lost, half, two thirds, the last of it), so each phase is heard to begin.
 */
export function bossIntensity(frac: number): number {
  if (frac > 0.66) return 0;
  if (frac > 0.5) return 0.35;
  if (frac > 0.33) return 0.6;
  if (frac > 0.15) return 0.85;
  return 1;
}
