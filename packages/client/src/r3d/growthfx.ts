/*
 * Design part 11, variant A, the pure part: what the sparks round a hero's weapon and armour do. No Three.js, no DOM, nothing made per call
 * (the poses are written into one object). The numbers are the designer's (assets/ui/growth/growth.json: `shine.A`, `motion.moments.shine`,
 * `fx`, `curse`, `glyph`); test/growthfx.test.ts keeps them equal to the file, so a new art drop that moves one cannot go unseen.
 * growth3d.ts draws them.
 */

/** Sparks round the hand by the weapon's step (+1..2, +3..5, +6..9, +10 and more). */
export const SPARKS = [1, 2, 3, 4] as const;
/** One twinkle per this long (ms) for steps 1 to 3; step 4 never rests (0). */
export const SHINE_PERIOD = [1600, 1200, 900, 0] as const;
/** The orbit of step 4, ms for a turn. */
export const ORBIT_MS = 1400;
/** The warm light on the floor at the feet, by step. */
export const HALO = [0, 0, 0.1, 0.18] as const;
/** The viewer draws the halo three times stronger than the data's figure (a sprite's alpha against a soft light). */
export const HALO_GAIN = 3;
/** The orbit's radius in cells: the first spark's, and what each next one adds (so four reach 0.34). */
export const ORBIT_R0 = 0.22;
export const ORBIT_DR = 0.04;
/** How tall a spark is, in cells (a 16 px frame drawn at 0.7). */
export const SPARK_SIZE = 0.7;
export const RUNE_SIZE = 0.5;
export const GLYPH_RUNE_SIZE = 0.42;
export const WISP_SIZE = 0.7;
export const SIGIL_SIZE = 0.9;
/** A wisp changes its picture every this many ms. */
export const WISP_MS = 180;
/** The mastery sigil's flare, ms. */
export const SIGIL_MS = 400;
/** The glyph's rune beats at this pace (ms for one of its two lights). */
export const GLYPH_BEAT_MS = 300;
/** How the effects sheet is cut: frames of 16 px side by side, the rows of growth.json `fx` (y in px) and their heights. */
export const FX_ROW = { spark: 0, rune: 16, wisp: 32, burst: 48, glint: 64, sigil: 80, pillar: 96 } as const;
export const FX_FRAME = 16;
/** The glyph's colour (growth.json `glyph`) and the warm halo's (the palette's `f`), 0..255. */
export const GLYPH_RGB = [94, 200, 192] as const;
export const HALO_RGB = [255, 154, 58] as const;

/** The enchantments' colours (growth.json `enchant`, the same as view.ts ENCHANT_COLORS), 0..255. */
export const ENCHANT_RGB: Readonly<Record<string, readonly [number, number, number]>> = {
  death: [40, 40, 40], fire: [255, 68, 0], horror: [90, 90, 90], instability: [255, 255, 255], leech: [170, 0, 40], luck: [0, 255, 0],
  paralysis: [255, 255, 68], poison: [68, 0, 170], shock: [255, 255, 255], slow: [0, 68, 255], tempering: [204, 136, 136],
};
/** The least a rune's brightest channel is raised to (an added rune of death's 40 would not show). */
export const RUNE_FLOOR = 120;

export type Tier = 0 | 1 | 2 | 3 | 4;

/** How many sparks a step shows: none for 0; half (rounded up) in the light mode or where particles are off. */
export function sparkCount(tier: number, halved: boolean): number {
  if (tier < 1) return 0;
  const n = SPARKS[Math.min(4, tier) - 1]!;
  return halved ? Math.ceil(n / 2) : n;
}

/** The ms of one turn of a step's sparks (steps 1 to 3 twinkle once in it; step 4 keeps turning, lit). */
export const periodOf = (tier: number): number => (tier >= 4 ? ORBIT_MS : SHINE_PERIOD[Math.max(1, tier) - 1]!);

export interface SparkPose {
  /** Across (cells, to the figure's right on screen) and up from the centre of the orbit. */
  dx: number;
  dy: number;
  /** The frame of the spark row, 0..3. */
  frame: number;
  /** 0 or 1: between its twinkles a spark of steps 1 to 3 is dark. */
  alpha: number;
}

export const newPose = (): SparkPose => ({ dx: 0, dy: 0, frame: 0, alpha: 0 });

/**
 * Spark `k` of `n` at `ms`. `salt` shifts a hero's sparks out of step with the next hero's. Reduced motion (`still`): the spark stands where
 * it would be at the start of its twinkle, in its brightest frame, always lit. Written into `out`.
 */
export function sparkPose(tier: number, k: number, n: number, ms: number, salt: number, still: boolean, out: SparkPose): SparkPose {
  const per = periodOf(tier);
  const r = ORBIT_R0 + ORBIT_DR * k;
  if (still) {
    const a = (k / Math.max(1, n)) * Math.PI * 2 + 0.6;
    out.dx = Math.cos(a) * r;
    out.dy = 0.2 + Math.sin(a) * r * 0.9;
    out.frame = 2;
    out.alpha = 1;
    return out;
  }
  const ph = ((((ms + (k * per) / n + salt) % per) + per) % per) / per;
  const ang = ph * Math.PI * 2 + k;
  out.dx = Math.cos(ang) * r;
  out.dy = 0.2 + Math.sin(ang) * r * 0.9;
  if (tier >= 4) {
    // The permanent orbit: always lit, flickering through the three bright frames.
    out.frame = 1 + (Math.floor(ms / 120 + k) % 3);
    out.alpha = 1;
  } else {
    out.frame = Math.min(3, Math.floor(ph * 8));
    out.alpha = ph < 0.5 ? 1 : 0;
  }
  return out;
}

/** How bright the glyph's rune on the chest is at `ms`: it beats between two lights; still: the brighter. */
export const glyphLight = (ms: number, still: boolean): number => (still ? 0.85 : 0.45 + 0.4 * (Math.floor(ms / GLYPH_BEAT_MS) % 2));

/** The enchantment rune draws itself in over its first frames, holds, and dims for a moment: frame and light at `ms` (still: whole). */
export function runeLook(ms: number, still: boolean, out: { frame: number; light: number }): { frame: number; light: number } {
  if (still) {
    out.frame = 3;
    out.light = 1;
    return out;
  }
  const f = Math.floor(ms / 150) % 6;
  out.frame = f < 3 ? f : 3;
  out.light = f < 4 ? 1 : 0.6;
  return out;
}

/** The sigil flare: its frame at `t` ms after it began, or -1 once it is over. Still: the brightest frame for the whole flare. */
export function sigilFrame(t: number, still: boolean): number {
  if (t < 0 || t >= SIGIL_MS) return -1;
  return still ? 1 : Math.min(3, Math.floor((t * 4) / SIGIL_MS));
}

/**
 * Brightens a dull colour (the enchantments of death and horror are 40 and 90 of 255) so an added rune of it still shows: its largest
 * channel is raised to `floor`, the hue kept. Written into `out` as 0..255.
 */
export function lifted(rgb: readonly [number, number, number], floor: number, out: [number, number, number]): [number, number, number] {
  const m = Math.max(rgb[0], rgb[1], rgb[2]);
  const k = m > 0 && m < floor ? floor / m : 1;
  out[0] = rgb[0] * k;
  out[1] = rgb[1] * k;
  out[2] = rgb[2] * k;
  if (m === 0) out[0] = out[1] = out[2] = floor;
  return out;
}

/** Whether a figure's feet (world pixels) are on the screen, with `margin` cells to spare: off it, nothing is drawn. */
export function onScreen(px: number, py: number, camX: number, camY: number, zoom: number, width: number, height: number, ys: number, margin: number): boolean {
  const unit = 16 * zoom;
  const x = (px - camX) * zoom;
  const y = (py - camY) * zoom * ys;
  return x > -margin * unit && x < width + margin * unit && y > -margin * unit && y < height + margin * unit;
}

/** A hero's id as a number in 0..1600, so each hero's sparks keep their own time. */
export function saltOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 1600;
}
