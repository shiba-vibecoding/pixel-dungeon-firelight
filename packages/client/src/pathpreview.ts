import { findPath, type Level } from '@pd/core';
import { type HeldKey, interruptWalk, type Walking } from './interrupt';

/*
 * The path preview: a tap on a far cell does not send the hero off at once; it draws the route on the floor, and a second tap on the
 * same cell (the target marker stands on it) confirms. A tap elsewhere plans again. When it asks is the player's choice (settings):
 * always, «in a fight and for far ones» (the default: with a hostile in sight, or a way of more than six steps) or never. A single
 * step to a neighbour, a blow at a monster, the keys, the quick slots never ask.
 *
 * Pure rules and a small state machine; the drawing is feedback.ts's, the taps main.ts's (test/pathpreview.test.ts). Client only:
 * the server sees the same single steps as ever.
 */

export type ConfirmMode = 'always' | 'combat' | 'never';

/** Further than this many steps a route is «far» (the default mode confirms it, fight or no fight). */
export const FAR_STEPS = 6;

export const CONFIRM_MODES: readonly ConfirmMode[] = ['always', 'combat', 'never'];

const KEY = 'pd-path-confirm';

/** The setting, kept on this device: «in a fight and for far ones» unless the player chose another. */
export const pathConfirm = {
  mode: ((): ConfirmMode => {
    try {
      const saved = localStorage.getItem(KEY);
      return CONFIRM_MODES.find((mode) => mode === saved) ?? 'combat';
    } catch {
      return 'combat';
    }
  })(),
  set(mode: ConfirmMode): void {
    this.mode = mode;
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      // For this session only.
    }
  },
};

/**
 * Whether a route of `steps` steps asks to be confirmed. A single step (a neighbour) never does, nor does a route that is none.
 * `hostile`: a monster that means harm is in sight.
 */
export function needsConfirm(mode: ConfirmMode, hostile: boolean, steps: number): boolean {
  if (steps < 2) return false;
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  return hostile || steps > FAR_STEPS;
}

export interface RouteOptions {
  /** Cells held by someone (monsters, the party): never walked through. */
  occupied: ReadonlySet<number>;
  /** Clouds of gas in sight: gone round where another way exists. */
  gas: ReadonlySet<number>;
  explored: readonly boolean[];
  floating: boolean;
  /** Cells where loose items lie. */
  heaps: ReadonlySet<number>;
  /** A hostile is in sight: the route leaves the items alone, where it can do so for nothing. */
  combat: boolean;
}

/**
 * The route a tap on `to` walks: round monsters in sight, known traps (findPath) and gas where another way exists. In a fight it also
 * keeps off the cells where items lie when an equally short way exists, so that the hero does not stop to pick something up in the
 * middle of a blow. (A way that is longer is not taken: it costs turns in a fight, and the item is hardly worse than that.)
 * Empty when there is none.
 */
export function planRoute(level: Level, from: number, to: number, o: RouteOptions): number[] {
  const around = new Set([...o.occupied, ...o.gas]);
  const base = findPath(level, from, to, around, o.explored, o.floating) ?? findPath(level, from, to, o.occupied, o.explored, o.floating) ?? [];
  if (!o.combat || base.length < 2 || o.heaps.size === 0) return base;
  const bare = new Set(around);
  for (const heap of o.heaps) if (heap !== to) bare.add(heap);
  const free = findPath(level, from, to, bare, o.explored, o.floating);
  return free && free.length === base.length ? free : base;
}

/** What a tap on a cell comes to: the walk goes at once, or the route is shown and waits for the second tap. */
export type Verdict = 'walk' | 'show';

/**
 * `planned` is the cell whose route is on show (-1: none). A tap that needs no confirming walks; so does a second tap on the cell that is
 * on show (its marker stands on it); any other tap on a far cell shows its own route in place of the one before.
 */
export function verdict(planned: number, cell: number, needs: boolean): Verdict {
  return !needs || cell === planned ? 'walk' : 'show';
}

/** The route shown and waiting for its second tap. */
export class PathPreview {
  /** The target cell (-1: none), the route to it, and where the hero stood (and on which floor) when it was planned. */
  cell = -1;
  path: readonly number[] = [];
  from = -1;
  depth = -1;
  /** When it was shown (for the marker's pulse). */
  since = 0;

  get active(): boolean {
    return this.cell >= 0;
  }

  show(cell: number, path: readonly number[], from: number, depth: number, now: number): void {
    this.cell = cell;
    this.path = path;
    this.from = from;
    this.depth = depth;
    this.since = now;
  }

  clear(): void {
    this.cell = -1;
    this.path = [];
    this.from = -1;
  }

  /** The hero has moved, or changed floor: the route shown was from somewhere else. Returns whether it was dropped. */
  stale(heroPos: number, depth: number): boolean {
    if (this.cell >= 0 && (heroPos !== this.from || depth !== this.depth)) {
      this.clear();
      return true;
    }
    return false;
  }
}

/**
 * A tap on the map while the hero is walking (a route, a chase, a rest, a walk to the stairs or to an item, a key held down) stops all
 * of it at once; what the tap then asks for (a new route, a route to show) is the caller's. A route waiting to be confirmed is not a walk
 * and stays: the second tap on its cell is what confirms it. Returns whether anything was going on.
 */
export function stopForTap(walk: Walking, held: HeldKey): boolean {
  return interruptWalk(walk, held);
}

/** Whether the walk is under way: the steps are sent one at a time, so a finger on the map holds the next one back (main.ts step). */
export function underway(walk: Walking): boolean {
  return walk.queue.length > 0 || walk.chase !== null || walk.stairs !== null || walk.pickup || walk.resting || walk.open !== null;
}
