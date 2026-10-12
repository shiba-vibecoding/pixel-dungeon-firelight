import type { Rng } from '../rng';
import { cell, LENGTH, WIDTH, type Point, type Rect } from './geometry';
import { type Room, RoomType } from './room';
import { T } from './terrain';

export enum Feeling {
  NONE,
  CHASM,
  WATER,
  GRASS,
}

export enum HeapType {
  HEAP,
  FOR_SALE,
  CHEST,
  LOCKED_CHEST,
  CRYSTAL_CHEST,
  TOMB,
  SKELETON,
  MIMIC,
  HIDDEN,
}

/*
 * Layout generation only records *what* should appear where. Items and mobs
 * are rolled later from their own random streams, so changing item tables
 * never reshapes a dungeon and every seed keeps its layout.
 */
export type ItemSpec =
  | { roll: 'random' }
  | { roll: 'gold' }
  /** A few loose coins (Gold(Random.IntRange(1, 3))). */
  | { roll: 'coins' }
  /** From one of the categories, keeping the best of `tries` rolls by upgrade level. */
  | { roll: 'category'; categories: ReadonlyArray<'weapon' | 'armor' | 'potion' | 'scroll' | 'food' | 'gold'>; tries: number }
  /** The iron key to this level's locked room. */
  | { roll: 'key' }
  /** A potion of liquid flame, to burn the way into a storage room. */
  | { roll: 'liquidFlame' };

export type WellWater = 'health' | 'awareness';

export interface ItemSpawn {
  pos: number;
  heap: HeapType;
  item: ItemSpec;
}

export const isBossDepth = (depth: number): boolean => depth % 5 === 0 && depth > 0 && depth <= 25;
export const isShopDepth = (depth: number): boolean => depth === 6 || depth === 11 || depth === 16;

/** Mutable state of one level while it is being generated. */
export class LevelBuilder {
  readonly map = new Array<number>(LENGTH).fill(T.WALL);
  rooms: Room[] = [];
  roomEntrance: Room | null = null;
  roomExit: Room | null = null;
  entrance = -1;
  exit = -1;
  secretDoors = 0;
  pitRoomNeeded = false;
  weakFloorCreated = false;
  /** Special rooms placed on this level, in placement order. */
  readonly usedSpecials: RoomType[] = [];
  readonly items: ItemSpawn[] = [];
  /** Items to drop anywhere on the level (Level.itemsToSpawn), such as keys. */
  readonly toSpawn: ItemSpec[] = [];
  /** Magic wells and their water. */
  readonly wells: Array<{ pos: number; water: WellWater }> = [];

  constructor(
    readonly rng: Rng,
    readonly depth: number,
    readonly feeling: Feeling,
    /** Special room kinds still available, in this run's preference order. */
    readonly specials: RoomType[],
  ) {
    if (feeling === Feeling.CHASM) {
      this.map.fill(T.CHASM);
    }
  }

  get bossLevel(): boolean {
    return isBossDepth(this.depth);
  }

  tunnelTile(): number {
    return this.feeling === Feeling.CHASM ? T.EMPTY_SP : T.EMPTY;
  }

  set(pos: number, value: number): void {
    this.map[pos] = value;
  }

  setXY(x: number, y: number, value: number): void {
    this.map[cell(x, y)] = value;
  }

  fill(x: number, y: number, w: number, h: number, value: number): void {
    for (let row = y; row < y + h; row++) {
      const start = row * WIDTH + x;
      this.map.fill(value, start, start + w);
    }
  }

  /** Fills a rect including its walls, shrunk by `m` on every side. */
  fillRect(rect: Rect, value: number, m = 0): void {
    this.fill(rect.left + m, rect.top + m, rect.width() + 1 - m * 2, rect.height() + 1 - m * 2, value);
  }

  /** Walks `n` cells into the room from a door, painting each one. */
  drawInside(room: Room, from: Point, n: number, value: number): Point {
    const step = { x: 0, y: 0 };
    if (from.x === room.left) {
      step.x = 1;
    } else if (from.x === room.right) {
      step.x = -1;
    } else if (from.y === room.top) {
      step.y = 1;
    } else if (from.y === room.bottom) {
      step.y = -1;
    }
    const p = { x: from.x + step.x, y: from.y + step.y };
    for (let i = 0; i < n; i++) {
      if (value !== -1) {
        this.setXY(p.x, p.y, value);
      }
      p.x += step.x;
      p.y += step.y;
    }
    return p;
  }

  dropItem(pos: number, heap: HeapType, item: ItemSpec): void {
    this.items.push({ pos, heap, item });
  }

  isSpecial(type: RoomType): boolean {
    return SPECIAL_SET.has(type);
  }
}

const SPECIAL_SET: ReadonlySet<RoomType> = new Set([
  RoomType.MAGIC_WELL, RoomType.WEAK_FLOOR, RoomType.ARMORY, RoomType.CRYPT, RoomType.POOL,
  RoomType.GARDEN, RoomType.LIBRARY, RoomType.TREASURY, RoomType.TRAPS, RoomType.STORAGE,
  RoomType.STATUE, RoomType.LABORATORY, RoomType.VAULT, RoomType.ALTAR,
]);
