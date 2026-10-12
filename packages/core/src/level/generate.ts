import { deriveSeed, Rng, Stream } from '../rng';
import { type RunState, useSpecial } from '../run';
import { Feeling, isBossDepth, type ItemSpawn, LevelBuilder } from './builder';
import { stitchTerrain } from './flags';
import { PAINTERS } from './painters';
import { buildRegularLevel } from './regular';
import { RoomType } from './room';
import { SEWER_STYLE } from './sewer';

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
  secretDoors: number;
}

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
  if (depth < 1 || depth > 4) {
    throw new Error(`Depth ${depth} is not generated yet; the port currently covers the sewers (1-4)`);
  }

  const rng = Rng.seeded(deriveSeed(run.seed, Stream.LAYOUT, depth));
  const feeling = rollFeeling(rng, depth);
  const pitNeeded = depth > 1 && run.weakFloorCreated;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Each attempt starts clean: a failed one leaves no rooms, items or
    // rotated specials behind (the original kept some of them).
    const specials = run.specials.filter(
      (type) => PAINTERS.has(type) && !(type === RoomType.WEAK_FLOOR && isBossDepth(depth + 1)),
    );
    const level = new LevelBuilder(rng, depth, feeling, specials);
    level.pitRoomNeeded = pitNeeded;
    if (!buildRegularLevel(level, SEWER_STYLE)) {
      continue;
    }

    SEWER_STYLE.decorate(level);
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
      secretDoors: level.secretDoors,
    };
  }
  throw new Error(`Unable to generate depth ${depth} after ${MAX_ATTEMPTS} attempts`);
}
