import { HeapType, type LevelBuilder } from './builder';
import { HALLS_STYLE } from './halls';
import { HEIGHT, LENGTH, WIDTH } from './geometry';
import { patch, type RegionStyle } from './regular';
import { Room, RoomType } from './room';
import { T } from './terrain';

/*
 * Depth 25: Yog-Dzewa's hall (HallsBossLevel) - five tall chambers side by
 * side, the stairs walled in at the middle. The first step off the stairs
 * breaks the walls, and the stairs with them: Yog-Dzewa awakens somewhere in
 * the dark with its two fists. The way down opens when it falls.
 *
 * Depth 26 (LastLevel): a small hall, a moat of water around it, and the
 * Amulet of Yendor on a pedestal between two statues.
 */

const ROOM_LEFT = WIDTH / 2 - 1;
const ROOM_RIGHT = WIDTH / 2 + 1;
const ROOM_TOP = HEIGHT / 2 - 1;
const ROOM_BOTTOM = HEIGHT / 2 + 1;

export const HALLS_BOSS_STYLE: RegionStyle = { ...HALLS_STYLE, decorate: decorateBossLevel };

export function buildHallsBossLevel(level: LevelBuilder): boolean {
  const { rng, map } = level;
  for (let i = 0; i < 5; i++) {
    const top = rng.intRange(2, ROOM_TOP - 1);
    const bottom = rng.intRange(ROOM_BOTTOM + 1, 22);
    level.fill(2 + i * 4, top, 4, bottom - top + 1, T.EMPTY);
    if (i === 2) level.exit = i * 4 + 3 + (top - 1) * WIDTH;
    for (let j = 0; j < 4; j++) {
      if (rng.int(2) === 0) {
        const y = rng.intRange(top + 1, bottom - 1);
        map[i * 4 + j + y * WIDTH] = T.WALL_DECO;
      }
    }
  }
  map[level.exit] = T.LOCKED_EXIT;

  level.fill(ROOM_LEFT - 1, ROOM_TOP - 1, ROOM_RIGHT - ROOM_LEFT + 3, ROOM_BOTTOM - ROOM_TOP + 3, T.WALL);
  level.fill(ROOM_LEFT, ROOM_TOP, ROOM_RIGHT - ROOM_LEFT + 1, ROOM_BOTTOM - ROOM_TOP + 1, T.EMPTY);
  level.entrance = rng.intBetween(ROOM_LEFT + 1, ROOM_RIGHT - 1) + rng.intBetween(ROOM_TOP + 1, ROOM_BOTTOM - 1) * WIDTH;
  map[level.entrance] = T.ENTRANCE;

  const water = patch(level, 0.45, 6);
  for (let i = 0; i < LENGTH; i++) {
    if (map[i] === T.EMPTY && water[i]) map[i] = T.WATER;
  }

  const room = new Room();
  room.set(ROOM_LEFT - 1, ROOM_TOP - 1, ROOM_RIGHT + 1, ROOM_BOTTOM + 1);
  room.type = RoomType.ENTRANCE;
  level.rooms = [room];
  // Remembered so the walls can be broken: any cell will do as the "door".
  level.arenaDoor = level.entrance;
  return true;
}

function decorateBossLevel(level: LevelBuilder): void {
  const { map, rng } = level;
  for (let i = 0; i < LENGTH; i++) {
    if (map[i] === T.EMPTY && rng.int(10) === 0) map[i] = T.EMPTY_DECO;
  }
}

/** HallsBossLevel.doMagic: the walls of the stairs room, and the stairs, burn away. */
export function breakStairsRoom(map: number[]): number[] {
  const cells: number[] = [];
  for (let x = ROOM_LEFT - 1; x <= ROOM_RIGHT + 1; x++) {
    cells.push((ROOM_TOP - 1) * WIDTH + x, (ROOM_BOTTOM + 1) * WIDTH + x);
  }
  for (let y = ROOM_TOP; y < ROOM_BOTTOM + 1; y++) {
    cells.push(y * WIDTH + ROOM_LEFT - 1, y * WIDTH + ROOM_RIGHT + 1);
  }
  for (const cell of cells) map[cell] = T.EMPTY_SP;
  return cells;
}

const SIZE = 7;

export const LAST_STYLE: RegionStyle = { ...HALLS_STYLE, decorate: decorateLastLevel };

export function buildLastLevel(level: LevelBuilder): boolean {
  const { map } = level;
  level.fill(1, 1, SIZE, SIZE, T.WATER);
  level.fill(2, 2, SIZE - 2, SIZE - 2, T.EMPTY);
  level.fill(Math.trunc(SIZE / 2), Math.trunc(SIZE / 2), 3, 3, T.EMPTY_SP);
  level.entrance = SIZE * WIDTH + Math.trunc(SIZE / 2) + 1;
  map[level.entrance] = T.ENTRANCE;
  level.exit = level.entrance - WIDTH * SIZE;
  map[level.exit] = T.LOCKED_EXIT;
  const pedestal = (Math.trunc(SIZE / 2) + 1) * (WIDTH + 1);
  map[pedestal] = T.PEDESTAL;
  map[pedestal - 1] = T.STATUE_SP;
  map[pedestal + 1] = T.STATUE_SP;
  level.dropItem(pedestal, HeapType.HEAP, { roll: 'kind', kind: 'quest.amulet' });
  const room = new Room();
  room.set(1, 1, SIZE + 1, SIZE + 1);
  room.type = RoomType.ENTRANCE;
  level.rooms = [room];
  return true;
}

function decorateLastLevel(level: LevelBuilder): void {
  const { map, rng } = level;
  for (let i = 0; i < LENGTH; i++) {
    if (map[i] === T.EMPTY && rng.int(10) === 0) map[i] = T.EMPTY_DECO;
  }
}
