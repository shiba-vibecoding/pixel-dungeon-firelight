import { Feeling, HeapType, isBossDepth, type LevelBuilder } from './builder';
import { cell, type Point } from './geometry';
import { DoorType, type Room, RoomType } from './room';
import { T } from './terrain';

/* Room painters: each one turns a room rectangle into terrain. */

export type Painter = (level: LevelBuilder, room: Room) => void;

function setDoors(room: Room, type: DoorType): void {
  for (const door of room.doors()) {
    door.set(type);
  }
}

function paintEntrance(level: LevelBuilder, room: Room): void {
  level.fillRect(room, T.WALL);
  level.fillRect(room, T.EMPTY, 1);
  setDoors(room, DoorType.REGULAR);
  level.entrance = room.random(level.rng, 1);
  level.set(level.entrance, T.ENTRANCE);
}

function paintExit(level: LevelBuilder, room: Room): void {
  level.fillRect(room, T.WALL);
  level.fillRect(room, T.EMPTY, 1);
  setDoors(room, DoorType.REGULAR);
  level.exit = room.random(level.rng, 1);
  level.set(level.exit, T.EXIT);
}

/** The boss arena: its exit is locked into the middle of the top wall. */
function paintBossExit(level: LevelBuilder, room: Room): void {
  level.fillRect(room, T.WALL);
  level.fillRect(room, T.EMPTY, 1);
  setDoors(room, DoorType.REGULAR);
  level.exit = cell(Math.trunc((room.left + room.right) / 2), room.top);
  level.set(level.exit, T.LOCKED_EXIT);
}

/* --- Standard rooms, occasionally decorated with one of several themes --- */

function paintStandard(level: LevelBuilder, room: Room): void {
  const { rng } = level;
  level.fillRect(room, T.WALL);
  setDoors(room, DoorType.REGULAR);

  if (!level.bossLevel && rng.int(5) === 0) {
    const w = room.width();
    const h = room.height();
    // A theme whose conditions fail falls through to the next one, exactly
    // like the switch fall-through of the original.
    let variant = rng.int(6);
    for (; variant <= 5; variant++) {
      if (variant === 0) {
        if (level.feeling !== Feeling.GRASS) {
          if (Math.min(w, h) >= 4 && Math.max(w, h) >= 6) {
            return paintGraveyard(level, room);
          }
          break;
        }
      } else if (variant === 1) {
        if (level.depth > 1) {
          return paintBurned(level, room);
        }
        break;
      } else if (variant === 2) {
        if (Math.max(w, h) >= 4) {
          return paintStriped(level, room);
        }
        break;
      } else if (variant === 3) {
        if (w >= 6 && h >= 6) {
          return paintStudy(level, room);
        }
        break;
      } else if (variant === 4) {
        if (level.feeling !== Feeling.WATER) {
          if (room.connected.size === 2 && w >= 4 && h >= 4) {
            return paintBridge(level, room);
          }
          break;
        }
      } else {
        if (!level.bossLevel && !isBossDepth(level.depth + 1) && Math.min(w, h) >= 5) {
          return paintFissure(level, room);
        }
        break;
      }
    }
  }
  level.fillRect(room, T.EMPTY, 1);
}

function paintBurned(level: LevelBuilder, room: Room): void {
  for (let y = room.top + 1; y < room.bottom; y++) {
    for (let x = room.left + 1; x < room.right; x++) {
      let t: number = T.EMBERS;
      switch (level.rng.int(5)) {
        case 0:
          t = T.EMPTY;
          break;
        case 1:
          t = T.FIRE_TRAP;
          break;
        case 2:
          t = T.SECRET_FIRE_TRAP;
          break;
        case 3:
          t = T.INACTIVE_TRAP;
          break;
      }
      level.setXY(x, y, t);
    }
  }
}

function paintGraveyard(level: LevelBuilder, room: Room): void {
  const { rng } = level;
  level.fill(room.left + 1, room.top + 1, room.width() - 1, room.height() - 1, T.GRASS);
  const w = room.width() - 1;
  const h = room.height() - 1;
  const nGraves = Math.trunc(Math.max(w, h) / 2);
  const index = rng.int(nGraves);
  const shift = rng.int(2);
  for (let i = 0; i < nGraves; i++) {
    const pos =
      w > h
        ? room.left + 1 + shift + i * 2 + cell(0, room.top + 2 + rng.int(h - 2))
        : room.left + 2 + rng.int(w - 2) + cell(0, room.top + 1 + shift + i * 2);
    // One grave holds a random item, the others hold gold.
    level.dropItem(pos, HeapType.TOMB, i === index ? { roll: 'random' } : { roll: 'gold' });
  }
}

function paintStriped(level: LevelBuilder, room: Room): void {
  level.fill(room.left + 1, room.top + 1, room.width() - 1, room.height() - 1, T.EMPTY_SP);
  if (room.width() > room.height()) {
    for (let x = room.left + 2; x < room.right; x += 2) {
      level.fill(x, room.top + 1, 1, room.height() - 1, T.HIGH_GRASS);
    }
  } else {
    for (let y = room.top + 2; y < room.bottom; y += 2) {
      level.fill(room.left + 1, y, room.width() - 1, 1, T.HIGH_GRASS);
    }
  }
}

function paintStudy(level: LevelBuilder, room: Room): void {
  level.fill(room.left + 1, room.top + 1, room.width() - 1, room.height() - 1, T.BOOKSHELF);
  level.fill(room.left + 2, room.top + 2, room.width() - 3, room.height() - 3, T.EMPTY_SP);
  for (const door of room.doors()) {
    if (door.x === room.left) {
      level.setXY(door.x + 1, door.y, T.EMPTY);
    } else if (door.x === room.right) {
      level.setXY(door.x - 1, door.y, T.EMPTY);
    } else if (door.y === room.top) {
      level.setXY(door.x, door.y + 1, T.EMPTY);
    } else if (door.y === room.bottom) {
      level.setXY(door.x, door.y - 1, T.EMPTY);
    }
  }
  const c = room.center(level.rng);
  level.setXY(c.x, c.y, T.PEDESTAL);
}

function paintBridge(level: LevelBuilder, room: Room): void {
  const { rng } = level;
  const chasm = !level.bossLevel && !isBossDepth(level.depth + 1) && rng.int(3) === 0;
  level.fill(room.left + 1, room.top + 1, room.width() - 1, room.height() - 1, chasm ? T.CHASM : T.WATER);

  // Bridges are only painted into rooms with exactly two doors.
  const doors = room.doors();
  const door1: Point = doors[0]!;
  const door2: Point = doors[1]!;
  if ((door1.x === room.left && door2.x === room.right) || (door1.x === room.right && door2.x === room.left)) {
    const s = Math.trunc(room.width() / 2);
    level.drawInside(room, door1, s, T.EMPTY_SP);
    level.drawInside(room, door2, s, T.EMPTY_SP);
    level.fill(room.center(rng).x, Math.min(door1.y, door2.y), 1, Math.abs(door1.y - door2.y) + 1, T.EMPTY_SP);
  } else if ((door1.y === room.top && door2.y === room.bottom) || (door1.y === room.bottom && door2.y === room.top)) {
    const s = Math.trunc(room.height() / 2);
    level.drawInside(room, door1, s, T.EMPTY_SP);
    level.drawInside(room, door2, s, T.EMPTY_SP);
    level.fill(Math.min(door1.x, door2.x), room.center(rng).y, Math.abs(door1.x - door2.x) + 1, 1, T.EMPTY_SP);
  } else if (door1.x === door2.x) {
    level.fill(
      door1.x === room.left ? room.left + 1 : room.right - 1,
      Math.min(door1.y, door2.y), 1, Math.abs(door1.y - door2.y) + 1, T.EMPTY_SP,
    );
  } else if (door1.y === door2.y) {
    level.fill(
      Math.min(door1.x, door2.x), door1.y === room.top ? room.top + 1 : room.bottom - 1,
      Math.abs(door1.x - door2.x) + 1, 1, T.EMPTY_SP,
    );
  } else if (door1.y === room.top || door1.y === room.bottom) {
    level.drawInside(room, door1, Math.abs(door1.y - door2.y), T.EMPTY_SP);
    level.drawInside(room, door2, Math.abs(door1.x - door2.x), T.EMPTY_SP);
  } else if (door1.x === room.left || door1.x === room.right) {
    level.drawInside(room, door1, Math.abs(door1.x - door2.x), T.EMPTY_SP);
    level.drawInside(room, door2, Math.abs(door1.y - door2.y), T.EMPTY_SP);
  }
}

function paintFissure(level: LevelBuilder, room: Room): void {
  level.fill(room.left + 1, room.top + 1, room.width() - 1, room.height() - 1, T.EMPTY);
  for (let y = room.top + 2; y < room.bottom - 1; y++) {
    for (let x = room.left + 2; x < room.right - 1; x++) {
      const v = Math.min(y - room.top, room.bottom - y);
      const h = Math.min(x - room.left, room.right - x);
      if (Math.min(v, h) > 2 || level.rng.int(2) === 0) {
        level.setXY(x, y, T.CHASM);
      }
    }
  }
}

/* --- Corridors: tunnels through a room's middle, passages along its rim --- */

function paintTunnel(level: LevelBuilder, room: Room): void {
  const floor = level.tunnelTile();
  const c = room.center(level.rng);
  const horizontal = room.width() > room.height() || (room.width() === room.height() && level.rng.int(2) === 0);

  if (horizontal) {
    let from = room.right - 1;
    let to = room.left + 1;
    for (const door of room.doors()) {
      const step = door.y < c.y ? 1 : -1;
      if (door.x === room.left) {
        from = room.left + 1;
        for (let y = door.y; y !== c.y; y += step) level.setXY(from, y, floor);
      } else if (door.x === room.right) {
        to = room.right - 1;
        for (let y = door.y; y !== c.y; y += step) level.setXY(to, y, floor);
      } else {
        from = Math.min(from, door.x);
        to = Math.max(to, door.x);
        for (let y = door.y + step; y !== c.y; y += step) level.setXY(door.x, y, floor);
      }
    }
    for (let x = from; x <= to; x++) level.setXY(x, c.y, floor);
  } else {
    let from = room.bottom - 1;
    let to = room.top + 1;
    for (const door of room.doors()) {
      const step = door.x < c.x ? 1 : -1;
      if (door.y === room.top) {
        from = room.top + 1;
        for (let x = door.x; x !== c.x; x += step) level.setXY(x, from, floor);
      } else if (door.y === room.bottom) {
        to = room.bottom - 1;
        for (let x = door.x; x !== c.x; x += step) level.setXY(x, to, floor);
      } else {
        from = Math.min(from, door.y);
        to = Math.max(to, door.y);
        for (let x = door.x + step; x !== c.x; x += step) level.setXY(x, door.y, floor);
      }
    }
    for (let y = from; y <= to; y++) level.setXY(c.x, y, floor);
  }
  setDoors(room, DoorType.TUNNEL);
}

function paintPassage(level: LevelBuilder, room: Room): void {
  const w = room.width() - 2;
  const h = room.height() - 2;
  const perimeter = w * 2 + h * 2;
  const floor = level.tunnelTile();

  // Positions along the inner rim, clockwise from the top-left corner.
  const toRim = (p: Point): number => {
    if (p.y === room.top) return p.x - room.left - 1;
    if (p.x === room.right) return p.y - room.top - 1 + w;
    if (p.y === room.bottom) return room.right - p.x - 1 + w + h;
    return p.y === room.top + 1 ? 0 : room.bottom - p.y - 1 + w * 2 + h;
  };
  const fromRim = (p: number): number => {
    if (p < w) return cell(room.left + 1 + p, room.top + 1);
    if (p < w + h) return cell(room.right - 1, room.top + 1 + (p - w));
    if (p < w * 2 + h) return cell(room.right - 1 - (p - (w + h)), room.bottom - 1);
    return cell(room.left + 1, room.bottom - 1 - (p - (w * 2 + h)));
  };

  const joints = room.doors().map(toRim).sort((a, b) => a - b);
  const n = joints.length;
  // Leave out the longest gap between doors; walk the rest of the rim.
  let start = 0;
  let maxGap = joints[0]! + perimeter - joints[n - 1]!;
  for (let i = 1; i < n; i++) {
    const gap = joints[i]! - joints[i - 1]!;
    if (gap > maxGap) {
      maxGap = gap;
      start = i;
    }
  }
  const end = joints[(start + n - 1) % n]!;
  let p = joints[start]!;
  do {
    level.set(fromRim(p), floor);
    p = (p + 1) % perimeter;
  } while (p !== end);
  level.set(fromRim(p), floor);

  setDoors(room, DoorType.TUNNEL);
}

export const PAINTERS: ReadonlyMap<RoomType, Painter> = new Map<RoomType, Painter>([
  [RoomType.STANDARD, paintStandard],
  [RoomType.ENTRANCE, paintEntrance],
  [RoomType.EXIT, paintExit],
  [RoomType.BOSS_EXIT, paintBossExit],
  [RoomType.TUNNEL, paintTunnel],
  [RoomType.PASSAGE, paintPassage],
]);
