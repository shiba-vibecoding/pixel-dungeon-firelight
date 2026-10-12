import { describe, expect, it } from 'vitest';
import { createRun } from '../src/run';
import { generateLevel, LENGTH, NEIGHBOURS8, T, WIDTH } from '../src/index';
import { breakStairsRoom } from '../src/level/halls-boss';

/** Whether the exit can be reached from the entrance through anything that is not solid rock. */
function connected(map: readonly number[], from: number, to: number): boolean {
  const seen = new Uint8Array(LENGTH);
  const queue = [from];
  seen[from] = 1;
  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (cell === to) return true;
    for (const n of NEIGHBOURS8) {
      const next = cell + n;
      if (next < 0 || next >= LENGTH || seen[next]) continue;
      if (Math.abs((next % WIDTH) - (cell % WIDTH)) > 1) continue;
      const terrain = map[next]!;
      if (terrain === T.WALL || terrain === T.WALL_DECO) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return false;
}

describe('boss levels', () => {
  it('always join their stairs to the way down, whatever the grid is', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const run = createRun(seed);
      for (const depth of [5, 10, 15, 20, 25]) {
        const level = generateLevel(run, depth);
        const map = [...level.map];
        // Yog-Dzewa's hall: the first step off the stairs breaks the walls around them.
        if (depth === 25) breakStairsRoom(map);
        expect(connected(map, level.entrance, level.exit), `seed ${seed}, depth ${depth}`).toBe(true);
      }
    }
  });
});
