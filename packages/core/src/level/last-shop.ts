import type { LevelBuilder } from './builder';
import { LENGTH } from './geometry';
import { initRooms, paint, paintGrass, paintWater, type RegionStyle } from './regular';
import { buildDistanceMap, buildPath, type Room, RoomType } from './room';
import { T } from './terrain';

/*
 * Depth 21: the last shop (LastShopLevel), between the dwarven city and the
 * demon halls. Laid in the city's tiles, it is a single winding way from the
 * entrance to the exit through passages, with no special rooms, no traps and
 * no monsters. Its biggest room is the ambitious imp's shop once his errand
 * in the city is done (Imp.Quest.isCompleted), an ordinary room otherwise.
 */

export const LAST_SHOP_STYLE: RegionStyle = {
  minRoomSize: 7,
  maxRoomSize: 9,
  // LastShopLevel.water and grass: the feeling makes no difference to them.
  water: () => [0.35, 4],
  grass: () => [0.3, 3],
  // LastShopLevel.build places no traps.
  trapChances: [],
  decorate: decorateLastShop,
};

/** LastShopLevel.build. */
export function buildLastShopLevel(level: LevelBuilder): boolean {
  const { rng } = level;
  if (!initRooms(level, LAST_SHOP_STYLE)) {
    return false;
  }
  const rooms = level.rooms;

  // The entrance in a room of at least 4x4, the exit in one of at least 6x6
  // off the top edge, at least sqrt(rooms) rooms apart.
  const minDistance = Math.trunc(Math.sqrt(rooms.length));
  let retry = 0;
  let roomEntrance: Room;
  let roomExit: Room;
  let distance: number;
  do {
    let innerRetry = 0;
    do {
      if (innerRetry++ > 10) return false;
      roomEntrance = rng.element(rooms)!;
    } while (roomEntrance.width() < 4 || roomEntrance.height() < 4);
    innerRetry = 0;
    do {
      if (innerRetry++ > 10) return false;
      roomExit = rng.element(rooms)!;
    } while (roomExit === roomEntrance || roomExit.width() < 6 || roomExit.height() < 6 || roomExit.top === 0);
    buildDistanceMap(rooms, roomExit);
    const path = buildPath(roomEntrance, roomExit);
    if (!path) return false;
    distance = path.length;
    if (retry++ > 10) return false;
  } while (distance < minDistance);

  roomEntrance.type = RoomType.ENTRANCE;
  roomExit.type = RoomType.EXIT;
  level.roomEntrance = roomEntrance;
  level.roomExit = roomExit;

  // The shortest route raises its rooms' price, and the way actually dug is
  // the next shortest one (Graph.setPrice, then a second Graph.buildPath).
  buildDistanceMap(rooms, roomExit);
  const first = buildPath(roomEntrance, roomExit);
  if (!first) return false;
  for (const node of first) node.price = roomEntrance.distance;
  buildDistanceMap(rooms, roomExit);
  const path = buildPath(roomEntrance, roomExit);
  if (!path) return false;
  let room = roomEntrance;
  for (const next of path) {
    room.connect(next);
    room = next;
  }

  // Every room on the way is a passage; the biggest of them, the shop.
  let roomShop: Room | null = null;
  let shopSquare = 0;
  for (const r of rooms) {
    if (r.type === RoomType.NULL && r.connected.size > 0) {
      r.type = RoomType.PASSAGE;
      if (r.square() > shopSquare) {
        roomShop = r;
        shopSquare = r.square();
      }
    }
  }
  if (!roomShop || shopSquare < 30) {
    return false;
  }
  roomShop.type = level.impQuestDone ? RoomType.SHOP : RoomType.STANDARD;

  paint(level, LAST_SHOP_STYLE);
  paintWater(level, LAST_SHOP_STYLE);
  paintGrass(level, LAST_SHOP_STYLE);
  return true;
}

/**
 * LastShopLevel.decorate: missing tiles here and there in the floor and the
 * walls, no secret doors, and the shop's sign by the entrance once there is a
 * shop.
 */
function decorateLastShop(level: LevelBuilder): void {
  const { map, rng } = level;
  for (let i = 0; i < LENGTH; i++) {
    if (map[i] === T.EMPTY && rng.int(10) === 0) map[i] = T.EMPTY_DECO;
    else if (map[i] === T.WALL && rng.int(8) === 0) map[i] = T.WALL_DECO;
    else if (map[i] === T.SECRET_DOOR) map[i] = T.DOOR;
  }
  level.secretDoors = 0;
  if (level.impQuestDone) {
    const roomEntrance = level.roomEntrance!;
    for (let attempt = 0; attempt < 100; attempt++) {
      const pos = roomEntrance.random(rng);
      if (pos !== level.entrance) {
        map[pos] = T.SIGN;
        return;
      }
    }
  }
}
