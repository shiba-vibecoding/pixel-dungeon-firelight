import type { ItemKind } from '../items';
import { Feeling, HeapType, isBossDepth, type ItemSpec, type LevelBuilder } from './builder';
import { cell, type Point } from './geometry';
import { type Door, DoorType, type Room, RoomType } from './room';
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

/* --- Special rooms --- */

/** The one door of a special room (they are all dead ends). */
const entranceOf = (room: Room): Door => room.doors()[0]!;

/** A random empty cell in the room without anything dropped on it yet. */
function freeSpot(level: LevelBuilder, room: Room): number {
  for (let attempt = 0; attempt < 100; attempt++) {
    const pos = room.random(level.rng);
    if (level.map[pos] === T.EMPTY && !level.items.some((spawn) => spawn.pos === pos)) return pos;
  }
  return room.random(level.rng);
}

function lockWithKey(level: LevelBuilder, room: Room): void {
  entranceOf(room).set(DoorType.LOCKED);
  level.toSpawn.push({ roll: 'key' });
}

/** TreasuryPainter: gold under a statue's gaze, in heaps or chests. */
function paintTreasury(level: LevelBuilder, room: Room): void {
  const { rng } = level;
  level.fillRect(room, T.WALL);
  level.fillRect(room, T.EMPTY, 1);
  const c = room.center(rng);
  level.setXY(c.x, c.y, T.STATUE);
  const heap = rng.int(2) === 0 ? HeapType.CHEST : HeapType.HEAP;
  const n = rng.intRange(2, 3);
  for (let i = 0; i < n; i++) level.dropItem(freeSpot(level, room), heap, { roll: 'gold' });
  if (heap === HeapType.HEAP) {
    for (let i = 0; i < 6; i++) level.dropItem(freeSpot(level, room), HeapType.HEAP, { roll: 'coins' });
  }
  lockWithKey(level, room);
}

/** ArmoryPainter: three or four weapons and armour. */
function paintArmory(level: LevelBuilder, room: Room): void {
  const { rng } = level;
  level.fillRect(room, T.WALL);
  level.fillRect(room, T.EMPTY, 1);
  const door = entranceOf(room);
  const side = rng.int(2) === 0;
  const statue =
    door.x === room.left ? { x: room.right - 1, y: side ? room.top + 1 : room.bottom - 1 }
    : door.x === room.right ? { x: room.left + 1, y: side ? room.top + 1 : room.bottom - 1 }
    : door.y === room.top ? { x: side ? room.left + 1 : room.right - 1, y: room.bottom - 1 }
    : { x: side ? room.left + 1 : room.right - 1, y: room.top + 1 };
  level.setXY(statue.x, statue.y, T.STATUE);
  const n = 3 + (rng.int(4) === 0 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    level.dropItem(freeSpot(level, room), HeapType.HEAP, { roll: 'category', categories: ['armor', 'weapon'], tries: 1 });
  }
  lockWithKey(level, room);
}

/** LibraryPainter: bookshelves, statues by the door, a few scrolls. */
function paintLibrary(level: LevelBuilder, room: Room): void {
  const { rng } = level;
  level.fillRect(room, T.WALL);
  level.fillRect(room, T.EMPTY, 1);
  const door = entranceOf(room);
  let a: { x: number; y: number };
  let b: { x: number; y: number };
  if (door.x === room.left) {
    a = { x: room.left + 1, y: door.y - 1 };
    b = { x: room.left + 1, y: door.y + 1 };
    level.fill(room.right - 1, room.top + 1, 1, room.height() - 1, T.BOOKSHELF);
  } else if (door.x === room.right) {
    a = { x: room.right - 1, y: door.y - 1 };
    b = { x: room.right - 1, y: door.y + 1 };
    level.fill(room.left + 1, room.top + 1, 1, room.height() - 1, T.BOOKSHELF);
  } else if (door.y === room.top) {
    a = { x: door.x + 1, y: room.top + 1 };
    b = { x: door.x - 1, y: room.top + 1 };
    level.fill(room.left + 1, room.bottom - 1, room.width() - 1, 1, T.BOOKSHELF);
  } else {
    a = { x: door.x + 1, y: room.bottom - 1 };
    b = { x: door.x - 1, y: room.bottom - 1 };
    level.fill(room.left + 1, room.top + 1, room.width() - 1, 1, T.BOOKSHELF);
  }
  for (const p of [a, b]) {
    if (level.map[cell(p.x, p.y)] === T.EMPTY) level.setXY(p.x, p.y, T.STATUE);
  }
  const n = rng.intRange(2, 3);
  for (let i = 0; i < n; i++) {
    level.dropItem(freeSpot(level, room), HeapType.HEAP, { roll: 'category', categories: ['scroll'], tries: 1 });
  }
  lockWithKey(level, room);
}

/** CryptPainter: a tomb with the best of four armours, watched by statues. */
function paintCrypt(level: LevelBuilder, room: Room): void {
  const { rng } = level;
  level.fillRect(room, T.WALL);
  level.fillRect(room, T.EMPTY, 1);
  const c = room.center(rng);
  let { x: cx, y: cy } = c;
  const door = entranceOf(room);
  lockWithKey(level, room);
  if (door.x === room.left) {
    level.setXY(room.right - 1, room.top + 1, T.STATUE);
    level.setXY(room.right - 1, room.bottom - 1, T.STATUE);
    cx = room.right - 2;
  } else if (door.x === room.right) {
    level.setXY(room.left + 1, room.top + 1, T.STATUE);
    level.setXY(room.left + 1, room.bottom - 1, T.STATUE);
    cx = room.left + 2;
  } else if (door.y === room.top) {
    level.setXY(room.left + 1, room.bottom - 1, T.STATUE);
    level.setXY(room.right - 1, room.bottom - 1, T.STATUE);
    cy = room.bottom - 2;
  } else {
    level.setXY(room.left + 1, room.top + 1, T.STATUE);
    level.setXY(room.right - 1, room.top + 1, T.STATUE);
    cy = room.top + 2;
  }
  level.dropItem(cell(cx, cy), HeapType.TOMB, { roll: 'category', categories: ['armor'], tries: 4 });
}

/**
 * StoragePainter: a store of potions, scrolls, food and gold behind a
 * barricade, and somewhere on the level a potion of liquid flame to burn it.
 */
function paintStorage(level: LevelBuilder, room: Room): void {
  const { rng } = level;
  level.fillRect(room, T.WALL);
  level.fillRect(room, T.EMPTY_SP, 1);
  const n = rng.intRange(3, 4);
  for (let i = 0; i < n; i++) {
    let pos: number;
    do {
      pos = room.random(rng);
    } while (level.map[pos] !== T.EMPTY_SP || level.items.some((spawn) => spawn.pos === pos));
    level.dropItem(pos, HeapType.HEAP, { roll: 'category', categories: [rng.oneOf(['potion', 'scroll', 'food', 'gold'] as const)], tries: 1 });
  }
  entranceOf(room).set(DoorType.BARRICADE);
  level.toSpawn.push({ roll: 'liquidFlame' });
}

/**
 * ShopPainter: the wares laid out along the walls, starting opposite the
 * door, and the shopkeeper among them. Depth 6 sells a quarterstaff or a
 * spear and leather armour, depth 11 a sword or a mace and mail armour;
 * both potions, scrolls and food. The seed pouch, scroll holder,
 * weightstone, scroll of remove curse and ankh of the original are not
 * ported yet.
 */
function paintShop(level: LevelBuilder, room: Room): void {
  const { rng } = level;
  level.fillRect(room, T.WALL);
  level.fillRect(room, T.EMPTY_SP, 1);
  const w = room.width() - 2;
  const h = room.height() - 2;
  const perimeter = w * 2 + h * 2;
  const toRim = (x: number, y: number): number => {
    if (y === room.top) return x - room.left - 1;
    if (x === room.right) return y - room.top - 1 + w;
    if (y === room.bottom) return room.right - x - 1 + w + h;
    return y === room.top + 1 ? 0 : room.bottom - y - 1 + w * 2 + h;
  };
  const fromRim = (p: number): number => {
    if (p < w) return cell(room.left + 1 + p, room.top + 1);
    if (p < w + h) return cell(room.right - 1, room.top + 1 + (p - w));
    if (p < w * 2 + h) return cell(room.right - 1 - (p - (w + h)), room.bottom - 1);
    return cell(room.left + 1, room.bottom - 1 - (p - (w * 2 + h)));
  };

  // Each shop's weapon and armour (ShopPainter.range): depths 6, 11 and 16.
  const pick = <K>(a: K, b: K): K => (rng.int(2) === 0 ? a : b);
  // The last one, on depth 21, has a single piece of the best gear and torches for the dark halls.
  const gear: ItemKind[] =
    level.depth < 11 ? [pick('weapon.quarterstaff', 'weapon.spear'), 'armor.leather']
    : level.depth < 16 ? [pick('weapon.sword', 'weapon.mace'), 'armor.mail']
    : level.depth < 21 ? [pick('weapon.longsword', 'weapon.battleAxe'), 'armor.scale']
    : [rng.oneOf(['weapon.glaive', 'weapon.warHammer', 'armor.plate'] as ItemKind[]), 'torch', 'torch'];
  const wares: ItemSpec[] = [
    ...gear.map((kind): ItemSpec => ({ roll: 'kind', kind })),
    { roll: 'kind', kind: 'potion.healing' },
    { roll: 'category', categories: ['potion'], tries: 1 },
    { roll: 'category', categories: ['potion'], tries: 1 },
    { roll: 'category', categories: ['potion'], tries: 1 },
    { roll: 'kind', kind: 'scroll.identify' },
    { roll: 'kind', kind: 'scroll.mapping' },
    { roll: 'category', categories: ['scroll'], tries: 1 },
    { roll: 'kind', kind: 'food.ration' },
    { roll: 'kind', kind: 'food.ration' },
  ];
  rng.shuffle(wares);
  const door = entranceOf(room);
  let p = toRim(door.x, door.y) + Math.trunc((perimeter - wares.length) / 2);
  const taken = new Set<number>();
  for (const ware of wares) {
    let pos = fromRim(((p % perimeter) + perimeter) % perimeter);
    while (taken.has(pos)) pos = room.random(rng);
    taken.add(pos);
    level.dropItem(pos, HeapType.FOR_SALE, ware);
    p++;
  }
  let keeper: number;
  do {
    keeper = room.random(rng);
  } while (taken.has(keeper));
  level.shopkeeper = keeper;
  for (const d of room.doors()) d.set(DoorType.REGULAR);
}

/** MagicWellPainter: a well of healing or awareness in the middle. */
function paintMagicWell(level: LevelBuilder, room: Room): void {
  const { rng } = level;
  level.fillRect(room, T.WALL);
  level.fillRect(room, T.EMPTY, 1);
  const c = room.center(rng);
  level.setXY(c.x, c.y, T.WELL);
  // The original also has water of transmutation; it is not ported yet.
  const water = rng.oneOf(['awareness', 'health', 'health'] as const);
  level.wells.push({ pos: cell(c.x, c.y), water });
  entranceOf(room).set(DoorType.REGULAR);
}

/** TrapsPainter: a floor of gas traps with a prize at the far end. */
function paintTraps(level: LevelBuilder, room: Room): void {
  const { rng } = level;
  // The original sometimes makes it a chasm crossed by levitation; that is not ported.
  const trap = rng.oneOf([T.TOXIC_TRAP, T.TOXIC_TRAP, T.TOXIC_TRAP, T.PARALYTIC_TRAP, T.PARALYTIC_TRAP, T.SUMMONING_TRAP]);
  level.fillRect(room, T.WALL);
  level.fillRect(room, trap, 1);
  const door = entranceOf(room);
  door.set(DoorType.REGULAR);
  let x: number;
  let y: number;
  if (door.x === room.left) {
    x = room.right - 1;
    y = room.top + Math.trunc(room.height() / 2);
    level.fill(x, room.top + 1, 1, room.height() - 1, T.EMPTY);
  } else if (door.x === room.right) {
    x = room.left + 1;
    y = room.top + Math.trunc(room.height() / 2);
    level.fill(x, room.top + 1, 1, room.height() - 1, T.EMPTY);
  } else if (door.y === room.top) {
    x = room.left + Math.trunc(room.width() / 2);
    y = room.bottom - 1;
    level.fill(room.left + 1, y, room.width() - 1, 1, T.EMPTY);
  } else {
    x = room.left + Math.trunc(room.width() / 2);
    y = room.top + 1;
    level.fill(room.left + 1, y, room.width() - 1, 1, T.EMPTY);
  }
  const prize = { roll: 'category', categories: ['weapon', 'armor'], tries: 4 } as const;
  if (rng.int(3) === 0) {
    level.dropItem(cell(x, y), HeapType.CHEST, prize);
  } else {
    level.setXY(x, y, T.PEDESTAL);
    level.dropItem(cell(x, y), HeapType.HEAP, prize);
  }
}

export const PAINTERS: ReadonlyMap<RoomType, Painter> = new Map<RoomType, Painter>([
  [RoomType.TREASURY, paintTreasury],
  [RoomType.ARMORY, paintArmory],
  [RoomType.LIBRARY, paintLibrary],
  [RoomType.CRYPT, paintCrypt],
  [RoomType.MAGIC_WELL, paintMagicWell],
  [RoomType.TRAPS, paintTraps],
  [RoomType.STORAGE, paintStorage],
  [RoomType.SHOP, paintShop],
  [RoomType.STANDARD, paintStandard],
  [RoomType.ENTRANCE, paintEntrance],
  [RoomType.EXIT, paintExit],
  [RoomType.BOSS_EXIT, paintBossExit],
  [RoomType.TUNNEL, paintTunnel],
  [RoomType.PASSAGE, paintPassage],
]);
