import { deriveSeed, Rng, Stream } from '../rng';
import { type RunState, useSpecial } from '../run';
import { Feeling, isBossDepth, type ItemSpawn, type ItemSpec, LevelBuilder, type WellWater } from './builder';
import { stitchTerrain } from './flags';
import { PAINTERS } from './painters';
import { RoomType } from './room';
import { CAVES_STYLE } from './caves';
import { CITY_STYLE } from './city';
import { buildCityBossLevel, CITY_BOSS_STYLE } from './city-boss';
import { buildCavesBossLevel, CAVES_BOSS_STYLE } from './caves-boss';
import { PRISON_STYLE } from './prison';
import { buildPrisonBossLevel, PRISON_BOSS_STYLE } from './prison-boss';
import { buildRegularLevel as buildRegular, type RegionStyle } from './regular';
import { SEWER_STYLE } from './sewer';
import { buildSewerBossLevel, SEWER_BOSS_STYLE } from './sewer-boss';

export interface RoomInfo {
  left: number;
  top: number;
  right: number;
  bottom: number;
  type: RoomType;
}

/** A generated level as plain, serialisable data. */
export interface Level {
  depth: number;
  feeling: Feeling;
  map: number[];
  entrance: number;
  exit: number;
  rooms: RoomInfo[];
  /** Item drops requested by the layout, rolled later from the item stream. */
  items: ItemSpawn[];
  /** Items to drop anywhere on the level, such as the key to a locked room. */
  toSpawn: ItemSpec[];
  /** Magic wells that still hold water. */
  wells: Array<{ pos: number; water: WellWater }>;
  secretDoors: number;
  /** Tengu's level: the door into the arena. */
  arenaDoor?: number;
  /** A shop's level: where the shopkeeper stands. */
  shopkeeper?: number;
}

/** How each depth is laid out: the sewers, Goo's lair, the prison, Tengu's prison, the caves, DM-300's caves. */
function layoutFor(depth: number): { style: RegionStyle; build: (level: LevelBuilder) => boolean } {
  if (depth === 5) return { style: SEWER_BOSS_STYLE, build: buildSewerBossLevel };
  if (depth === 10) return { style: PRISON_BOSS_STYLE, build: buildPrisonBossLevel };
  if (depth === 15) return { style: CAVES_BOSS_STYLE, build: buildCavesBossLevel };
  if (depth === 20) return { style: CITY_BOSS_STYLE, build: buildCityBossLevel };
  const style = depth < 5 ? SEWER_STYLE : depth < 10 ? PRISON_STYLE : depth < 15 ? CAVES_STYLE : CITY_STYLE;
  return { style, build: (level) => buildRegular(level, style) };
}

/** The deepest depth the port can generate. */
export const DEEPEST_LEVEL = 20;

const MAX_ATTEMPTS = 128;

function rollFeeling(rng: Rng, depth: number): Feeling {
  if (depth <= 1 || isBossDepth(depth)) {
    return Feeling.NONE;
  }
  switch (rng.int(10)) {
    case 0:
      return isBossDepth(depth + 1) ? Feeling.NONE : Feeling.CHASM;
    case 1:
      return Feeling.WATER;
    case 2:
      return Feeling.GRASS;
    default:
      return Feeling.NONE;
  }
}

/**
 * Generates the layout of `depth` for a run. Levels must be generated in
 * order of depth, because a weak floor on one level puts a pit room on the
 * next and special rooms rotate through the run.
 */
export function generateLevel(run: RunState, depth: number): Level {
  if (depth < 1 || depth > DEEPEST_LEVEL) {
    throw new Error(`Depth ${depth} is not generated yet; the port covers the sewers and the prison (1-${DEEPEST_LEVEL})`);
  }

  const rng = Rng.seeded(deriveSeed(run.seed, Stream.LAYOUT, depth));
  const feeling = rollFeeling(rng, depth);
  const pitNeeded = depth > 1 && run.weakFloorCreated;
  const boss = isBossDepth(depth);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Each attempt starts clean: a failed one leaves no rooms, items or
    // rotated specials behind (the original kept some of them).
    const specials = boss
      ? []
      : run.specials.filter((type) => PAINTERS.has(type) && !(type === RoomType.WEAK_FLOOR && isBossDepth(depth + 1)));
    const level = new LevelBuilder(rng, depth, feeling, specials);
    level.pitRoomNeeded = pitNeeded && !boss;
    const { style, build } = layoutFor(depth);
    if (!build(level)) {
      continue;
    }

    style.decorate(level);
    stitchTerrain(level.map);

    for (const used of level.usedSpecials) {
      useSpecial(run, used);
    }
    run.weakFloorCreated = level.weakFloorCreated;

    return {
      depth,
      feeling,
      map: level.map,
      entrance: level.entrance,
      exit: level.exit,
      rooms: level.rooms.map(({ left, top, right, bottom, type }) => ({ left, top, right, bottom, type })),
      items: level.items,
      toSpawn: level.toSpawn,
      wells: level.wells,
      secretDoors: level.secretDoors,
      ...(level.arenaDoor >= 0 ? { arenaDoor: level.arenaDoor } : {}),
      ...(level.shopkeeper >= 0 ? { shopkeeper: level.shopkeeper } : {}),
    };
  }
  throw new Error(`Unable to generate depth ${depth} after ${MAX_ATTEMPTS} attempts`);
}
