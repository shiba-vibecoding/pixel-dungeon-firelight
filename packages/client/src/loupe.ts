import { adjacent, F, hasAmulet, hasFlag, type Hero, type Item, type Level, type MobKind, T, type World } from '@pd/core';

/*
 * The touch loupe. A finger held still on the map for a quarter of a second raises a magnified bubble of the cells round it, above it
 * so the finger does not hide it, and names what lifting the finger there would do: «Walk · 6 steps», «Attack: crab», «Open», «Pick up»,
 * «Examine». Lifting on the cell does it (a confirmed hold is the confirmation a far route asks for, pathpreview.ts); sliding moves the
 * target; sliding off the map cancels. A quick tap is as ever. With a mouse the same label hangs by the cursor, without the glass.
 *
 * Here, the rules, pure: what a tap on a cell comes to (`describeTap`, which follows main.ts tapCell decision by decision, without doing
 * any of it) and the gesture's small state machine. The glass and the label are loupeui.ts's, the pointers main.ts's (test/loupe.test.ts).
 */

/** A finger held this long without moving raises the loupe (ms). */
export const HOLD_MS = 250;

export type TapKind =
  | 'throw' | 'zap' | 'special' | 'pickup' | 'descend' | 'ascend' | 'search' | 'sealed' | 'attack' | 'approach' | 'open' | 'dig' | 'jump'
  | 'locked' | 'barricade' | 'walk' | 'noway' | 'examine';

export interface Tapped {
  kind: TapKind;
  /** The steps of the way there; 0 for what is done where one stands. */
  steps: number;
  /** The cell the tap really goes to: the floor in front of a wall that was tapped. */
  cell: number;
  mob?: MobKind;
  item?: Item;
}

export interface TapContext {
  world: World;
  me: Hero;
  level: Level;
  visible: readonly boolean[];
  explored: readonly boolean[];
  floating: boolean;
  /** A shot is being aimed: the tap picks its target. */
  aim: 'throw' | 'zap' | 'special' | null;
  /** The floor beside a wall that a tap on it walks to (main.ts wallFront), if any. */
  front(wall: number): number | null;
  /** The way a tap walks to a cell (pathpreview.ts planRoute); empty when there is none. */
  route(cell: number): number[];
}

/** The terrain a tap stands for the floor in front of (main.ts WALL_LIKE). */
const WALL_LIKE: ReadonlySet<number> = new Set([T.WALL, T.WALL_DECO, T.BOOKSHELF, T.STATUE, T.STATUE_SP]);

/**
 * What a tap on `cell` would come to, decided as main.ts tapCell decides it (the same order, the same tests): the thing to be done and the
 * steps it takes. Nothing is done here, and nothing is asked of the player.
 */
export function describeTap(c: TapContext, cell: number): Tapped {
  const { world, me, level, visible, explored } = c;
  if (c.aim) return { kind: c.aim, steps: 0, cell };
  const floor = world.floors[me.depth];
  const heapHere = (pos: number) => floor?.heaps.find((h) => h.pos === pos && h.kind !== 'hidden');
  if (cell === me.pos) {
    if (heapHere(me.pos)) return { kind: 'pickup', steps: 0, cell, ...(heapHere(me.pos)!.kind === 'heap' ? { item: heapHere(me.pos)!.items[0]! } : {}) };
    if (me.pos === level.exit) return { kind: 'descend', steps: 0, cell };
    if (me.pos === level.entrance && (me.depth > 1 || hasAmulet(me))) return { kind: 'ascend', steps: 0, cell };
    if (me.pos === level.entrance && me.depth === 1 && level.map[me.pos] === T.ENTRANCE) return { kind: 'sealed', steps: 0, cell };
    return { kind: 'search', steps: 0, cell };
  }
  const mob = floor?.mobs.find((m) => m.pos === cell);
  if (mob && visible[cell]) {
    return { kind: mob.state === 'passive' ? 'approach' : 'attack', steps: Math.max(0, c.route(cell).length - 1), cell, mob: mob.kind };
  }
  if (!explored[cell]) return { kind: 'examine', steps: 0, cell };
  const box = floor?.heaps.find((h) => h.pos === cell && h.kind !== 'heap' && h.kind !== 'forSale' && h.kind !== 'hidden');
  if (box) {
    if (adjacent(me.pos, cell)) return { kind: 'open', steps: 0, cell };
    const way = c.route(cell);
    if (way.length > 1) return { kind: 'open', steps: way.length - 1, cell };
  }
  const pickaxe = me.weapon?.kind === 'weapon.pickaxe' || me.items.some((i) => i.kind === 'weapon.pickaxe');
  if (level.map[cell] === T.WALL_DECO && adjacent(me.pos, cell) && pickaxe && me.depth >= 11 && me.depth <= 15) return { kind: 'dig', steps: 0, cell };
  if (hasFlag(level.map[cell]!, F.PIT) && !c.floating) return adjacent(me.pos, cell) ? { kind: 'jump', steps: 0, cell } : { kind: 'examine', steps: 0, cell };
  if (level.map[cell] === T.LOCKED_DOOR && !me.items.some((i) => i.kind === 'key.iron' && i.depth === me.depth)) return { kind: 'locked', steps: 0, cell };
  if (level.map[cell] === T.LOCKED_EXIT && !me.items.some((i) => i.kind === 'key.skeleton' && i.depth === me.depth)) return { kind: 'locked', steps: 0, cell };
  if (level.map[cell] === T.BARRICADE) return { kind: 'barricade', steps: 0, cell };
  let target = cell;
  if (WALL_LIKE.has(level.map[cell]!)) {
    const front = c.front(cell);
    if (front === null) return { kind: 'examine', steps: 0, cell };
    if (front === me.pos) return { kind: 'examine', steps: 0, cell };
    target = front;
  }
  const route = c.route(target);
  if (route.length === 0) return { kind: 'noway', steps: 0, cell: target };
  const heap = heapHere(target);
  if (heap && heap.kind === 'heap') return { kind: 'pickup', steps: route.length, cell: target, item: heap.items[0]! };
  if (target === level.exit) return { kind: 'descend', steps: route.length, cell: target };
  if (target === level.entrance && (me.depth > 1 || hasAmulet(me))) return { kind: 'ascend', steps: route.length, cell: target };
  return { kind: 'walk', steps: route.length, cell: target };
}

/** Whether lifting the finger on this does something (the rest only says why not, or opens the examine window). */
export const actionable = (kind: TapKind): boolean => kind !== 'examine' && kind !== 'noway' && kind !== 'locked' && kind !== 'barricade' && kind !== 'sealed';

/** What the loupe's gesture is, from a finger coming down to its lifting. */
export type Lift = 'act' | 'cancel' | 'none';

/**
 * One finger's hold on the map. `down` starts the clock; once `HOLD_MS` have passed with the finger still (`fire`, called by the timer)
 * the loupe is up and the finger's moves retarget it; lifting does the action unless the finger is off the map. Another finger, a
 * cancelled pointer, a window opening cancel it.
 */
export class LoupeGesture {
  active = false;
  id = -1;
  /** The cell under the finger (-1: none) and whether the finger is off the map (over the HUD, or out of it). */
  cell = -1;
  outside = false;
  /** The cell the finger was last over inside the map (-1 if it went off): what lifting acts on; kept after the gesture ends, until the next one. */
  lastCell = -1;
  private pending = false;

  /** A finger came down. Another one while the first is held cancels it. */
  down(id: number): void {
    if (this.pending || this.active) {
      this.cancel();
      return;
    }
    this.id = id;
    this.pending = true;
    this.lastCell = -1;
  }

  /** The timer: the loupe comes up if the same finger is still down and has not been used for anything else. Returns whether it did. */
  fire(id: number, stillTapping: boolean): boolean {
    if (!this.pending || this.id !== id || !stillTapping) return false;
    this.pending = false;
    this.active = true;
    return true;
  }

  /** The finger moved while the loupe is up: the target follows it. */
  move(id: number, cell: number, outside: boolean): void {
    if (!this.active || id !== this.id) return;
    this.cell = cell;
    this.outside = outside;
    this.lastCell = outside ? -1 : cell;
  }

  /** The finger went up: do the action, drop it, or nothing (it was not a hold). */
  up(id: number): Lift {
    if (id !== this.id) return 'none';
    const was = this.active;
    const lift: Lift = !was ? 'none' : !this.outside && this.cell >= 0 ? 'act' : 'cancel';
    this.cancel();
    return lift;
  }

  cancel(): void {
    this.active = false;
    this.pending = false;
    this.id = -1;
    this.cell = -1;
    this.outside = false;
  }
}

const KEY = 'pd-loupe';

/** The setting: on unless the player turned it off (the glass for a finger, the label for a mouse). */
export const loupeSetting = {
  on: ((): boolean => {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch {
      return true;
    }
  })(),
  set(on: boolean): void {
    this.on = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // For this session only.
    }
  },
};
