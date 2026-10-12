import { RoomType, SPECIALS } from './level/room';
import { deriveSeed, Rng, Stream } from './rng';

/** Run-wide state that level generation reads and updates, depth by depth. */
export interface RunState {
  seed: number;
  /** Special room kinds in this run's preference order; used kinds move to the back. */
  specials: RoomType[];
  /** The deepest generated level has a weak floor, so the next one needs a pit room. */
  weakFloorCreated: boolean;
}

export function createRun(seed: number): RunState {
  const rng = Rng.seeded(deriveSeed(seed, Stream.RUN));
  const specials = [...SPECIALS];
  rng.shuffle(specials);
  return { seed, specials, weakFloorCreated: false };
}

/** Moves a used special room kind to the back, making repeats less likely. */
export function useSpecial(run: RunState, type: RoomType): void {
  const index = run.specials.indexOf(type);
  if (index >= 0) {
    run.specials.splice(index, 1);
    run.specials.push(type);
  }
}
