import { WIDTH } from '@pd/core';
import { quality } from './quality';
import { TILE } from './view';
import { drawFrame, frameAt, sheet } from './worldsheets';

/*
 * The map answering a tap (feedback.png): the cell aimed at is framed —
 * gold corners closing in for a walk, red for an attack — and stays framed
 * while the hero goes there; the way ahead is dotted, each dot going out as
 * the hero passes it; a cell that cannot be reached gets a red cross.
 */

/** Where a dot was passed, to shrink it away. */
interface Passed {
  cell: number;
  start: number;
}

const INTRO = [0, 1, 2] as const;
const PULSE = [0, 1, 2, 1] as const;
const DOT_OUT_MS = 180;

export class Feedback {
  /** The cell aimed at (or the monster chased, followed as it moves), and when. */
  private target: { cell: number; mob?: string; attack: boolean; start: number } | null = null;
  private nope: { cell: number; start: number } | null = null;
  /** The target an aim from a quick slot has marked (QuickSlotButton.crossM): the slot tapped again fires at it. */
  private marked: string | null = null;
  private passed: Passed[] = [];
  /** The dots last drawn: only a dot of the way goes out when stepped on. */
  private dotted = new Set<number>();

  aim(cell: number, attack: boolean, now: number, mob?: string): void {
    this.target = { cell, attack, start: now, ...(mob ? { mob } : {}) };
    this.nope = null;
  }

  refuse(cell: number, now: number): void {
    this.nope = { cell, start: now };
    this.target = null;
  }

  clear(): void {
    this.target = null;
  }

  /**
   * The route shown before it is walked (pathpreview.ts): small gold markers on the floor, a light running along them to the target, and
   * the target's frame closing in and pulsing. Nothing is allocated here: the path is the preview's own array.
   */
  drawPlan(ctx: CanvasRenderingContext2D, path: readonly number[], cell: number, since: number, now: number): void {
    if (cell < 0) return;
    const still = quality.reducedMotion;
    const t = now - since;
    for (let i = 0; i < path.length - 1; i++) {
      const at = path[i]!;
      const x = (at % WIDTH) * TILE + 5;
      const y = Math.trunc(at / WIDTH) * TILE + 5;
      // A wave of light travels from the hero to the target, and the markers appear one after another at first.
      const wave = still ? 1 : 0.8 + 0.2 * Math.sin(t / 150 - i * 0.8);
      const shown = still ? 1 : Math.min(1, Math.max(0, (t - i * 18) / 90));
      if (shown <= 0) continue;
      ctx.globalAlpha = shown * 0.95;
      ctx.fillStyle = '#1a0a06';
      ctx.fillRect(x, y, 6, 6);
      ctx.globalAlpha = shown * wave;
      ctx.fillStyle = '#fff0b0';
      ctx.fillRect(x + 1, y + 1, 4, 4);
    }
    ctx.globalAlpha = 1;
    const s = sheet('feedback');
    const frames = s?.anims['target-move'];
    if (s && frames) {
      const each = frames[0]!.ms;
      const frame = still
        ? frames[2]!
        : t < each * INTRO.length ? frameAt(frames, t, false, INTRO) : frameAt(frames, t - each * INTRO.length, true, PULSE);
      drawFrame(ctx, s, frame, (cell % WIDTH) * TILE, Math.trunc(cell / WIDTH) * TILE);
    }
  }

  /** The monster the aim is marked on (or none), set on every frame. */
  mark(mob: string | null): void {
    this.marked = mob;
  }

  /** The hero has stepped on a dot of the way. */
  stepped(cell: number, now: number): void {
    if (this.dotted.has(cell)) this.passed.push({ cell, start: now });
  }

  /**
   * Over the floor, under the characters. `path` is the way still to walk, `mobAt` where a chased
   * monster is now (the frame follows it), `done` whether the hero has got there.
   */
  draw(ctx: CanvasRenderingContext2D, path: readonly number[], mobAt: (id: string) => number | undefined, done: boolean, now: number): void {
    const s = sheet('feedback');
    if (!s) return;
    const xy = (cell: number): [number, number] => [(cell % WIDTH) * TILE, Math.trunc(cell / WIDTH) * TILE];

    // The way ahead, dot by dot; the passed ones shrink away.
    const dots = s.anims['path-dots'];
    if (dots) {
      this.dotted = new Set(path);
      for (const cell of path.slice(0, -1)) {
        const [x, y] = xy(cell);
        drawFrame(ctx, s, dots[1]!, x + 6, y + 6);
      }
      this.passed = this.passed.filter((p) => now - p.start < DOT_OUT_MS * 3);
      for (const p of this.passed) {
        const step = Math.floor((now - p.start) / DOT_OUT_MS);
        const [x, y] = xy(p.cell);
        if (step < 2) drawFrame(ctx, s, dots[step + 1]!, x + 6, y + 6);
      }
    }

    if (this.target) {
      const cell = this.target.mob ? mobAt(this.target.mob) ?? this.target.cell : this.target.cell;
      // Got there, or the blow has been struck: the frame goes (after a moment, so it is seen).
      if (done && now - this.target.start > 260) {
        this.target = null;
      } else {
        const frames = s.anims[this.target.attack ? 'target-attack' : 'target-move'];
        if (frames) {
          const t = now - this.target.start;
          const each = frames[0]!.ms;
          // Closing in once, then pulsing while the hero is on the way.
          const frame = quality.reducedMotion
            ? frames[2]!
            : t < each * INTRO.length ? frameAt(frames, t, false, INTRO) : frameAt(frames, t - each * INTRO.length, true, PULSE);
          const [x, y] = xy(cell);
          drawFrame(ctx, s, frame, x, y);
        }
      }
    }

    // The marked target: the attack frame, pulsing as long as the aim lasts.
    const markedAt = this.marked ? mobAt(this.marked) : undefined;
    if (markedAt !== undefined) {
      const frames = s.anims['target-attack'];
      if (frames) {
        const frame = quality.reducedMotion ? frames[2]! : frameAt(frames, now, true, PULSE);
        const [x, y] = xy(markedAt);
        drawFrame(ctx, s, frame, x, y);
      }
    }

    if (this.nope) {
      const frames = s.anims.nope;
      const t = now - this.nope.start;
      const life = frames ? frames.reduce((sum, f) => sum + f.ms, 0) : 0;
      if (!frames || t > life) {
        this.nope = null;
      } else {
        const [x, y] = xy(this.nope.cell);
        ctx.globalAlpha = Math.min(1, (life - t) / 120);
        drawFrame(ctx, s, frameAt(frames, t), x, y);
        ctx.globalAlpha = 1;
      }
    }
  }
}
