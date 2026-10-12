/*
 * Cards and numbers over the map, as the design system draws them
 * (docs/design/system/canvas-fx.md, PD.fx): Galmuri at whole multiples of
 * its pixel, a pixel outline of eight copies and a hard shadow, and motion
 * in steps — each value holds until the next frame, nothing in between.
 * Sizes are in font pixels; `px` is how many device pixels one CSS pixel is.
 */

export const FX_COLORS = {
  ink: '#e8e2c8', gold: '#ffeba4', goldDeep: '#ffcc66', damage: '#ff4433', heal: '#44ff44', boss: '#ff6a4a', line: '#9fa896',
  outline: '#0b0b09', shadow: 'rgba(0, 0, 0, 0.5)', band: 'rgba(11, 11, 9, 0.78)',
} as const;

const FONTS = { ui: { family: 'Galmuri11', em: 12 }, small: { family: 'Galmuri9', em: 10 } } as const;
const AROUND = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;

const snap = (v: number, s: number): number => Math.round(v / s) * s;

/** With reduced motion, a card shows at once without moving and goes in one frame. */
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type Frames<T> = ReadonlyArray<readonly [number, T]>;
interface Timeline<T> {
  /** The frame a card holds on with reduced motion. */
  hold: number;
  dur: number;
  frames: Frames<T>;
}

/** Frame layouts; one frame is 66 ms for cards (15 a second), 100 ms for numbers. */
export const TIMELINES = {
  level: {
    hold: 3, dur: 1600,
    frames: [[0, { a: 0, dy: 4 }], [66, { a: 0.5, dy: 2 }], [133, { a: 1, dy: -1 }], [200, { a: 1, dy: 0 }], [1400, { a: 0.66, dy: -1 }], [1466, { a: 0.33, dy: -2 }], [1533, { a: 0, dy: -3 }]],
  } as Timeline<{ a: number; dy: number }>,
  boss: {
    hold: 6, dur: 3000,
    frames: [
      [0, { band: 0.33, rule: 0, name: 0, sub: 0 }], [66, { band: 0.66, rule: 0.25, name: 0, sub: 0 }], [133, { band: 1, rule: 0.5, name: 0, sub: 0 }],
      [200, { band: 1, rule: 1, name: 0.5, sub: 0 }], [266, { band: 1, rule: 1, name: 1, sub: 0 }], [466, { band: 1, rule: 1, name: 1, sub: 0.5 }],
      [533, { band: 1, rule: 1, name: 1, sub: 1 }], [2733, { band: 0.66, rule: 0.66, name: 0.66, sub: 0.66 }],
      [2800, { band: 0.33, rule: 0.33, name: 0.33, sub: 0.33 }], [2866, { band: 0, rule: 0, name: 0, sub: 0 }],
    ],
  } as Timeline<{ band: number; rule: number; name: number; sub: number }>,
  slain: {
    hold: 2, dur: 2200,
    frames: [[0, { a: 1, flash: 1, rule: 0 }], [66, { a: 1, flash: 0, rule: 0.5 }], [133, { a: 1, flash: 0, rule: 1 }], [2000, { a: 0.66, flash: 0, rule: 0.66 }], [2066, { a: 0.33, flash: 0, rule: 0.33 }], [2133, { a: 0, flash: 0, rule: 0 }]],
  } as Timeline<{ a: number; flash: number; rule: number }>,
  number: {
    hold: 0, dur: 700,
    frames: [[0, { a: 1, dy: 0 }], [100, { a: 1, dy: -2 }], [200, { a: 1, dy: -4 }], [300, { a: 1, dy: -6 }], [400, { a: 0.66, dy: -8 }], [500, { a: 0.33, dy: -8 }], [600, { a: 0, dy: -8 }]],
  } as Timeline<{ a: number; dy: number }>,
};

/** The frame showing `t` ms into a timeline: the last one whose time has come. */
function step<T>(timeline: Timeline<T>, t: number): T {
  const { frames } = timeline;
  if (reduced) {
    const last = frames[frames.length - 1]!;
    return t >= last[0] ? last[1] : frames[timeline.hold]![1];
  }
  let value = frames[0]![1];
  for (const [at, v] of frames) {
    if (at <= t) value = v;
    else break;
  }
  return value;
}

export interface TextOptions {
  font?: 'ui' | 'small';
  /** Font pixel size in CSS pixels: 2 is Galmuri11 at 24px. */
  scale?: number;
  color?: string;
  outline?: string | 'none';
  /** Shadow depth in font pixels; 0 for none. */
  shadow?: number;
  align?: CanvasTextAlign;
  alpha?: number;
}

/** Text with a pixel outline and a hard shadow; returns its width in device pixels. */
export function fxText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, o: TextOptions = {}): number {
  const font = FONTS[o.font ?? 'ui'];
  const s = (o.scale ?? 2) * px;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.font = `${Math.round(font.em * s)}px "${font.family}"`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'alphabetic';
  x = snap(x, s);
  y = snap(y, s);
  const shadow = o.shadow ?? 1;
  const outline = o.outline ?? FX_COLORS.outline;
  if (shadow) {
    ctx.fillStyle = FX_COLORS.shadow;
    for (const [dx, dy] of [...AROUND, [0, 0] as const]) ctx.fillText(text, x + dx * s, y + dy * s + shadow * s);
  }
  if (outline !== 'none') {
    ctx.fillStyle = outline;
    for (const [dx, dy] of AROUND) ctx.fillText(text, x + dx * s, y + dy * s);
  }
  ctx.fillStyle = o.color ?? FX_COLORS.ink;
  ctx.fillText(text, x, y);
  const width = ctx.measureText(text).width;
  ctx.restore();
  return width;
}

/** A line one font pixel thick, outlined. */
function rule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, s: number, color: string, alpha: number): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  x = snap(x, s);
  y = snap(y, s);
  w = snap(w, s);
  ctx.fillStyle = FX_COLORS.outline;
  ctx.fillRect(x - s, y - s, w + 2 * s, 3 * s);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, s);
  ctx.restore();
}

/** «Level 3!» over the hero; false once it is over. */
export function levelCard(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, px: number): boolean {
  const k = step(TIMELINES.level, t);
  if (k.a > 0) fxText(ctx, text, x, y + k.dy * 3 * px, px, { scale: 3, color: FX_COLORS.gold, alpha: k.a });
  return t < TIMELINES.level.dur;
}

/** A boss's name on a band across the screen, its epithet under it, between two rules. */
export function bossCard(ctx: CanvasRenderingContext2D, name: string, sub: string, cy: number, width: number, t: number, px: number): boolean {
  const k = step(TIMELINES.boss, t);
  const h = 112 * px;
  if (k.band > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = k.band;
    ctx.fillStyle = FX_COLORS.band;
    ctx.fillRect(0, snap(cy - h / 2, 2 * px), width, h);
    ctx.restore();
  }
  const half = Math.round(width * 0.4 * k.rule);
  if (half > 0) {
    rule(ctx, width / 2 - half, cy - h / 2 + 6 * px, half * 2, 2 * px, FX_COLORS.line, k.band);
    rule(ctx, width / 2 - half, cy + h / 2 - 8 * px, half * 2, 2 * px, FX_COLORS.line, k.band);
  }
  // A long name (the Dwarf King's in Russian) steps down a size rather than leave the screen.
  if (k.name > 0) {
    const scale = fits(ctx, name, width * 0.92, px, [4, 3, 2]);
    fxText(ctx, name, width / 2, cy + 8 * px, px, { scale, color: FX_COLORS.boss, alpha: k.name });
  }
  if (k.sub > 0) fxText(ctx, sub, width / 2, cy + 36 * px, px, { scale: 1.5, color: FX_COLORS.ink, alpha: k.sub, shadow: 0 });
  return t < TIMELINES.boss.dur;
}

/** The largest of `scales` at which `text` fits in `width`. */
function fits(ctx: CanvasRenderingContext2D, text: string, width: number, px: number, scales: readonly number[]): number {
  ctx.save();
  for (const scale of scales) {
    ctx.font = `${Math.round(FONTS.ui.em * scale * px)}px "${FONTS.ui.family}"`;
    if (ctx.measureText(text).width <= width) {
      ctx.restore();
      return scale;
    }
  }
  ctx.restore();
  return scales[scales.length - 1]!;
}

/** «Boss slain»: white for a frame, then gold, with rules growing at its sides. */
export function slainCard(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, px: number): boolean {
  const k = step(TIMELINES.slain, t);
  if (k.a <= 0) return t < TIMELINES.slain.dur;
  const w = fxText(ctx, text, x, y, px, { scale: 3, color: k.flash ? '#ffffff' : FX_COLORS.gold, alpha: k.a });
  const len = Math.round(48 * px * k.rule);
  if (len > 0) {
    rule(ctx, x - w / 2 - 12 * px - len, y - 15 * px, len, 3 * px, FX_COLORS.goldDeep, k.a);
    rule(ctx, x + w / 2 + 12 * px, y - 15 * px, len, 3 * px, FX_COLORS.goldDeep, k.a);
  }
  return t < TIMELINES.slain.dur;
}

/**
 * A number over a character: `x` the middle of its sprite, `y` its top.
 * 'big' is a blow of a quarter of its health or more; words rise the same way.
 */
export function floatNumber(
  ctx: CanvasRenderingContext2D, text: string, kind: 'damage' | 'heal' | 'big' | 'word', color: string, x: number, y: number, t: number, px: number,
): boolean {
  const k = step(TIMELINES.number, t);
  const scale = kind === 'big' ? 3 : 2;
  if (k.a > 0) {
    fxText(ctx, text, x, y - 2 * scale * px + k.dy * scale * px, px, {
      font: 'small', scale, alpha: k.a, shadow: 0,
      color: kind === 'heal' ? FX_COLORS.heal : kind === 'word' ? color : FX_COLORS.damage,
    });
  }
  return t < TIMELINES.number.dur;
}
