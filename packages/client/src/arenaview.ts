import { ARENA_RADIUS, ARENA_STANDS, insideArena, type Level, LENGTH, NEIGHBOURS4, ringDistance, T, WIDTH } from '@pd/core';
import { audio } from './audio';
import { quality } from './quality';
import { levelRegion } from './sprites';
import { TILE } from './view';
import { drawFrame, type Frame, frameAt, sheet } from './worldsheets';

/*
 * The arena of waves dressed with Claude Design's arena sheets (assets/world/arena0..4,
 * docs/design/system/migration.md «Атлас арены»): sand on the floor, banners on the
 * wall, four gates that rise when a wave comes and drop when it is beaten, braziers on
 * the diagonals with their light, and the crowd in the stands, which roars after a wave.
 * All of it is drawn over the baked tiles and under what lies about (render.ts `under`).
 */

/** How long the crowd cheers after a wave, and how often one of them jumps up at rest. */
const CHEER_MS = 2000;
const CHEER_FRAME_MS = 160;
/** The gate's frames rising (the sheet's own ms) and dropping (a little quicker, per the design). */
const GATE_DOWN_MS = 70;

/** The braziers' fire, by tier: green in the sewers, lilac in the halls, warm elsewhere. */
const FIRE = ['120, 255, 130', '255, 150, 60', '255, 160, 70', '255, 175, 90', '200, 120, 255'] as const;

const hash = (n: number): number => ((n * 2654435761) >>> 0) / 4294967296;

interface Layout {
  level: Level;
  /** Each floor cell's sand frame (-1: not sand). */
  sand: Int8Array;
  /** Wall cells facing the floor that carry a banner. */
  banners: number[];
  /** The stands' cells. */
  crowd: number[];
  /** What is drawn bright whatever the party sees: the wall and the stands (the crowd has its own torches). */
  lit: boolean[];
}

export class ArenaView {
  private layout: Layout | null = null;
  /** Each gate: open or shut, and since when (its animation runs from then). */
  private readonly gates = new Map<number, { open: boolean; start: number }>();
  private cheerAt = -Infinity;

  /** The stands roar: after a wave. */
  cheer(now: number): void {
    this.cheerAt = now;
    audio.play('crowd', 1, 0.7);
  }

  private plan(level: Level): Layout {
    if (this.layout?.level === level) return this.layout;
    this.gates.clear();
    const sand = new Int8Array(LENGTH).fill(-1);
    const crowd: number[] = [];
    const wall: number[] = [];
    const lit = new Array<boolean>(LENGTH).fill(false);
    const gates = new Set(level.ring?.gates ?? []);
    const braziers = new Set(level.ring?.braziers ?? []);
    for (let cell = 0; cell < LENGTH; cell++) {
      const d = ringDistance(cell);
      const terrain = level.map[cell]!;
      if (d <= ARENA_RADIUS) {
        // Sand where the floor is plain; now and then blood or scratches (about one cell in 25).
        if (terrain === T.EMPTY || terrain === T.EMPTY_DECO || braziers.has(cell)) {
          const roll = hash(cell * 31 + 7);
          sand[cell] = roll < 0.02 ? 3 : roll < 0.04 ? 4 : terrain === T.EMPTY_DECO ? 4 : Math.floor(hash(cell) * 3);
        }
      } else if (d === ARENA_RADIUS + 1) {
        lit[cell] = true;
        if (!gates.has(cell) && NEIGHBOURS4.some((n) => insideArena(cell + n) && level.map[cell + n] !== T.WALL)) wall.push(cell);
      } else if (d <= ARENA_RADIUS + 1 + ARENA_STANDS) {
        lit[cell] = true;
        if (terrain === T.WALL_DECO) crowd.push(cell);
      }
    }
    // A banner on every fifth cell of the wall that faces the floor, going round it.
    const middle = level.ring?.dais ?? 0;
    const angle = (cell: number): number => Math.atan2(Math.trunc(cell / WIDTH) - Math.trunc(middle / WIDTH), (cell % WIDTH) - (middle % WIDTH));
    wall.sort((a, b) => angle(a) - angle(b));
    const banners = wall.filter((_, i) => i % 5 === 2);
    this.layout = { level, sand, banners, crowd, lit };
    return this.layout;
  }

  /** The cells shown bright whatever is in sight: what the party sees, and the wall and stands around the pit. */
  shown(level: Level, visible: readonly boolean[]): boolean[] {
    const { lit } = this.plan(level);
    return visible.map((seen, cell) => seen || lit[cell]!);
  }

  /** The braziers' light, in their fire's colour. */
  lights(level: Level, visible: readonly boolean[], now: number): Array<{ x: number; y: number; radius: number; color: string; strength: number }> {
    const color = FIRE[levelRegion(level)];
    return (level.ring?.braziers ?? []).filter((cell) => visible[cell]).map((cell) => {
      const flicker = quality.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(now / 80 + cell) * Math.sin(now / 27 + cell * 3);
      return { x: (cell % WIDTH) * TILE + 8, y: Math.trunc(cell / WIDTH) * TILE + 6, radius: TILE * 1.5 * 2, color, strength: 0.3 * flicker };
    });
  }

  /** Over the floor and walls, under what lies about. */
  draw(ctx: CanvasRenderingContext2D, level: Level, explored: readonly boolean[], now: number, resting: boolean): void {
    const s = sheet(`arena${levelRegion(level)}`);
    if (!s || !level.ring) return;
    const layout = this.plan(level);
    const still = quality.reducedMotion;
    const at = (cell: number): [number, number] => [(cell % WIDTH) * TILE, Math.trunc(cell / WIDTH) * TILE];
    const { sand: sandFrames, gate, brazier, banner, crowd } = s.anims as Record<string, readonly Frame[] | undefined>;

    if (sandFrames) {
      for (let cell = 0; cell < LENGTH; cell++) {
        const frame = layout.sand[cell]!;
        if (frame < 0 || !explored[cell]) continue;
        const [x, y] = at(cell);
        drawFrame(ctx, s, sandFrames[frame] ?? sandFrames[0]!, x, y);
      }
    }
    if (brazier) {
      for (const cell of level.ring.braziers) {
        const [x, y] = at(cell);
        drawFrame(ctx, s, frameAt(brazier, still ? 0 : now + hash(cell) * 900, true), x, y);
      }
    }
    if (banner) {
      for (const cell of layout.banners) {
        const [x, y] = at(cell);
        drawFrame(ctx, s, frameAt(banner, still ? 0 : now + hash(cell) * 1200, true), x, y);
      }
    }
    if (gate) {
      for (const cell of level.ring.gates) {
        // The gate stands open while its cell is open ground, shut while it is locked.
        const open = level.map[cell] !== T.LOCKED_DOOR;
        let state = this.gates.get(cell);
        if (!state) {
          state = { open, start: -Infinity };
          this.gates.set(cell, state);
        } else if (state.open !== open) {
          state.open = open;
          state.start = now;
        }
        const t = still ? Infinity : now - state.start;
        const frame = open ? frameAt(gate, t) : frameAt([...gate].reverse(), t, false, undefined, GATE_DOWN_MS);
        const [x, y] = at(cell);
        drawFrame(ctx, s, frame, x, y);
      }
    }
    if (crowd && crowd.length >= 3) {
      const cheering = now - this.cheerAt < CHEER_MS && !still;
      for (const cell of layout.crowd) {
        const [x, y] = at(cell);
        let frame = crowd[0]!;
        if (cheering) {
          // 1, 2, 1, 2…, neighbours out of step.
          const beat = Math.floor((now - this.cheerAt) / CHEER_FRAME_MS) + ((cell % WIDTH) + Math.trunc(cell / WIDTH));
          frame = crowd[1 + (beat % 2)]!;
        } else if (resting && !still && hash(cell * 7 + Math.floor(now / 700)) < 0.015) {
          // At rest, now and then someone stands up.
          frame = crowd[1]!;
        }
        drawFrame(ctx, s, frame, x, y);
      }
    }
  }

  /** The gates have started to move: their sound (the original's own samples). */
  gatesMoved(open: boolean, where: number): void {
    const x = (where % WIDTH) * TILE + TILE / 2;
    const y = Math.trunc(where / WIDTH) * TILE + TILE / 2;
    if (open) audio.play('unlock', 0.7, 0.8, { x, y });
    else audio.play('rocks', 1.2, 0.5, { x, y });
  }
}
