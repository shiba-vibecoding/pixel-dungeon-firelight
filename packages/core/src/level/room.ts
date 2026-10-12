import type { Rng } from '../rng';
import { cell, cellX, cellY, Rect, type Point } from './geometry';

export enum RoomType {
  NULL,
  STANDARD,
  ENTRANCE,
  EXIT,
  BOSS_EXIT,
  TUNNEL,
  PASSAGE,
  SHOP,
  BLACKSMITH,
  TREASURY,
  ARMORY,
  LIBRARY,
  LABORATORY,
  VAULT,
  TRAPS,
  STORAGE,
  MAGIC_WELL,
  GARDEN,
  CRYPT,
  STATUE,
  POOL,
  RAT_KING,
  WEAK_FLOOR,
  PIT,
  ALTAR,
}

/** Special room kinds in their canonical order; each run shuffles a copy. */
export const SPECIALS: readonly RoomType[] = [
  RoomType.MAGIC_WELL, RoomType.WEAK_FLOOR, RoomType.ARMORY, RoomType.CRYPT, RoomType.POOL,
  RoomType.GARDEN, RoomType.LIBRARY, RoomType.TREASURY, RoomType.TRAPS, RoomType.STORAGE,
  RoomType.STATUE, RoomType.LABORATORY, RoomType.VAULT, RoomType.ALTAR,
];

/** Ordered: a door keeps the strongest type any adjacent painter asks for. */
export enum DoorType {
  EMPTY,
  TUNNEL,
  REGULAR,
  UNLOCKED,
  HIDDEN,
  BARRICADE,
  LOCKED,
}

export class Door implements Point {
  type = DoorType.EMPTY;

  constructor(
    public x: number,
    public y: number,
  ) {}

  set(type: DoorType): void {
    if (type > this.type) {
      this.type = type;
    }
  }
}

export class Room extends Rect {
  type = RoomType.NULL;
  /** Rooms sharing a wall of length >= 3, in insertion order. */
  readonly neighbours: Room[] = [];
  /** Connected rooms; the door is placed once both rooms are painted. */
  readonly connected = new Map<Room, Door | null>();
  distance = 0;
  price = 1;

  /** A random cell strictly inside the room, `m` cells away from the walls. */
  random(rng: Rng, m = 0): number {
    const x = rng.intBetween(this.left + 1 + m, this.right - m);
    const y = rng.intBetween(this.top + 1 + m, this.bottom - m);
    return cell(x, y);
  }

  addNeighbour(other: Room): void {
    const i = this.intersect(other);
    if ((i.width() === 0 && i.height() >= 3) || (i.height() === 0 && i.width() >= 3)) {
      this.neighbours.push(other);
      other.neighbours.push(this);
    }
  }

  connect(room: Room): void {
    if (!this.connected.has(room)) {
      this.connected.set(room, null);
      room.connected.set(this, null);
    }
  }

  doors(): Door[] {
    const result: Door[] = [];
    for (const door of this.connected.values()) {
      if (door) {
        result.push(door);
      }
    }
    return result;
  }

  inside(pos: number): boolean {
    const x = cellX(pos);
    const y = cellY(pos);
    return x > this.left && y > this.top && x < this.right && y < this.bottom;
  }

  center(rng: Rng): Point {
    return {
      x: Math.trunc((this.left + this.right) / 2) + ((this.right - this.left) & 1 ? rng.int(2) : 0),
      y: Math.trunc((this.top + this.bottom) / 2) + ((this.bottom - this.top) & 1 ? rng.int(2) : 0),
    };
  }
}

/* Room graph search: distance from a focus room, then the cheapest path. */

export function buildDistanceMap(rooms: readonly Room[], focus: Room): void {
  for (const room of rooms) {
    room.distance = Number.MAX_SAFE_INTEGER;
  }
  const queue: Room[] = [focus];
  focus.distance = 0;
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]!;
    for (const edge of node.neighbours) {
      if (edge.distance > node.distance + node.price) {
        edge.distance = node.distance + node.price;
        queue.push(edge);
      }
    }
  }
}

export function buildPath(from: Room, to: Room): Room[] | null {
  const path: Room[] = [];
  let room = from;
  while (room !== to) {
    let min = room.distance;
    let next: Room | null = null;
    for (const edge of room.neighbours) {
      if (edge.distance < min) {
        min = edge.distance;
        next = edge;
      }
    }
    if (!next) {
      return null;
    }
    path.push(next);
    room = next;
  }
  return path;
}
