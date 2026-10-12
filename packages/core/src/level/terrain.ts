/*
 * Terrain ids and their physical properties. Ids match the original game's
 * tile atlas (tiles0..4.png), so the original art can be reused unchanged.
 */

export const T = {
  CHASM: 0,
  EMPTY: 1,
  GRASS: 2,
  EMPTY_WELL: 3,
  WALL: 4,
  DOOR: 5,
  OPEN_DOOR: 6,
  ENTRANCE: 7,
  EXIT: 8,
  EMBERS: 9,
  LOCKED_DOOR: 10,
  PEDESTAL: 11,
  WALL_DECO: 12,
  BARRICADE: 13,
  EMPTY_SP: 14,
  HIGH_GRASS: 15,
  SECRET_DOOR: 16,
  TOXIC_TRAP: 17,
  SECRET_TOXIC_TRAP: 18,
  FIRE_TRAP: 19,
  SECRET_FIRE_TRAP: 20,
  PARALYTIC_TRAP: 21,
  SECRET_PARALYTIC_TRAP: 22,
  INACTIVE_TRAP: 23,
  EMPTY_DECO: 24,
  LOCKED_EXIT: 25,
  UNLOCKED_EXIT: 26,
  POISON_TRAP: 27,
  SECRET_POISON_TRAP: 28,
  SIGN: 29,
  ALARM_TRAP: 30,
  SECRET_ALARM_TRAP: 31,
  LIGHTNING_TRAP: 32,
  SECRET_LIGHTNING_TRAP: 33,
  WELL: 34,
  STATUE: 35,
  STATUE_SP: 36,
  GRIPPING_TRAP: 37,
  SECRET_GRIPPING_TRAP: 38,
  SUMMONING_TRAP: 39,
  SECRET_SUMMONING_TRAP: 40,
  BOOKSHELF: 41,
  ALCHEMY: 42,
  CHASM_FLOOR: 43,
  CHASM_FLOOR_SP: 44,
  CHASM_WALL: 45,
  CHASM_WATER: 46,
  /** 16 stitched variants, WATER_TILES + (bitmask of unstitchable sides). */
  WATER_TILES: 48,
  WATER: 63,
} as const;

export const F = {
  PASSABLE: 0x01,
  LOS_BLOCKING: 0x02,
  FLAMABLE: 0x04,
  SECRET: 0x08,
  SOLID: 0x10,
  AVOID: 0x20,
  LIQUID: 0x40,
  PIT: 0x80,
  UNSTITCHABLE: 0x100,
} as const;

export const terrainFlags: readonly number[] = (() => {
  const f = new Array<number>(256).fill(0);
  f[T.CHASM] = F.AVOID | F.PIT | F.UNSTITCHABLE;
  f[T.EMPTY] = F.PASSABLE;
  f[T.GRASS] = F.PASSABLE | F.FLAMABLE;
  f[T.EMPTY_WELL] = F.PASSABLE;
  f[T.WATER] = F.PASSABLE | F.LIQUID | F.UNSTITCHABLE;
  f[T.WALL] = F.LOS_BLOCKING | F.SOLID | F.UNSTITCHABLE;
  f[T.DOOR] = F.PASSABLE | F.LOS_BLOCKING | F.FLAMABLE | F.SOLID | F.UNSTITCHABLE;
  f[T.OPEN_DOOR] = F.PASSABLE | F.FLAMABLE | F.UNSTITCHABLE;
  f[T.ENTRANCE] = F.PASSABLE;
  f[T.EXIT] = F.PASSABLE;
  f[T.EMBERS] = F.PASSABLE;
  f[T.LOCKED_DOOR] = F.LOS_BLOCKING | F.SOLID | F.UNSTITCHABLE;
  f[T.PEDESTAL] = F.PASSABLE | F.UNSTITCHABLE;
  f[T.WALL_DECO] = f[T.WALL]!;
  f[T.BARRICADE] = F.FLAMABLE | F.SOLID | F.LOS_BLOCKING;
  f[T.EMPTY_SP] = f[T.EMPTY]! | F.UNSTITCHABLE;
  f[T.HIGH_GRASS] = F.PASSABLE | F.LOS_BLOCKING | F.FLAMABLE;
  f[T.EMPTY_DECO] = f[T.EMPTY]!;
  f[T.LOCKED_EXIT] = F.SOLID;
  f[T.UNLOCKED_EXIT] = F.PASSABLE;
  f[T.SIGN] = F.PASSABLE | F.FLAMABLE;
  f[T.WELL] = F.AVOID;
  f[T.STATUE] = F.SOLID;
  f[T.STATUE_SP] = f[T.STATUE]! | F.UNSTITCHABLE;
  f[T.BOOKSHELF] = f[T.BARRICADE]! | F.UNSTITCHABLE;
  f[T.ALCHEMY] = F.PASSABLE;

  f[T.CHASM_WALL] = f[T.CHASM]!;
  f[T.CHASM_FLOOR] = f[T.CHASM]!;
  f[T.CHASM_FLOOR_SP] = f[T.CHASM]!;
  f[T.CHASM_WATER] = f[T.CHASM]!;

  f[T.SECRET_DOOR] = f[T.WALL]! | F.SECRET | F.UNSTITCHABLE;
  for (const [visible, hidden] of [
    [T.TOXIC_TRAP, T.SECRET_TOXIC_TRAP],
    [T.FIRE_TRAP, T.SECRET_FIRE_TRAP],
    [T.PARALYTIC_TRAP, T.SECRET_PARALYTIC_TRAP],
    [T.POISON_TRAP, T.SECRET_POISON_TRAP],
    [T.ALARM_TRAP, T.SECRET_ALARM_TRAP],
    [T.LIGHTNING_TRAP, T.SECRET_LIGHTNING_TRAP],
    [T.GRIPPING_TRAP, T.SECRET_GRIPPING_TRAP],
    [T.SUMMONING_TRAP, T.SECRET_SUMMONING_TRAP],
  ] as const) {
    f[visible] = F.AVOID;
    f[hidden] = f[T.EMPTY]! | F.SECRET;
  }
  f[T.INACTIVE_TRAP] = f[T.EMPTY]!;

  for (let i = T.WATER_TILES; i < T.WATER_TILES + 16; i++) {
    f[i] = f[T.WATER]!;
  }
  return f;
})();

export function hasFlag(terrain: number, flag: number): boolean {
  return (terrainFlags[terrain]! & flag) !== 0;
}

/** The visible form of a secret door or trap once it has been found. */
export function discover(terrain: number): number {
  switch (terrain) {
    case T.SECRET_DOOR:
      return T.DOOR;
    case T.SECRET_FIRE_TRAP:
      return T.FIRE_TRAP;
    case T.SECRET_PARALYTIC_TRAP:
      return T.PARALYTIC_TRAP;
    case T.SECRET_TOXIC_TRAP:
      return T.TOXIC_TRAP;
    case T.SECRET_POISON_TRAP:
      return T.POISON_TRAP;
    case T.SECRET_ALARM_TRAP:
      return T.ALARM_TRAP;
    case T.SECRET_LIGHTNING_TRAP:
      return T.LIGHTNING_TRAP;
    case T.SECRET_GRIPPING_TRAP:
      return T.GRIPPING_TRAP;
    case T.SECRET_SUMMONING_TRAP:
      return T.SUMMONING_TRAP;
    default:
      return terrain;
  }
}
