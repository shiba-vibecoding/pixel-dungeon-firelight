import { describe, expect, it } from 'vitest';
import {
  act, addHero, canEnter, charAt, createMob, createWorld, F, floorAt, hasFlag, heroById, isSafe, levelAt, NEIGHBOURS8, WIDTH, type World,
} from '../src/index';
import { pacify } from './helpers';

/** Alice and Bob side by side on the first depth, nothing awake about. */
function party(): { world: World; a: number; b: number } {
  const world = pacify(createWorld(5));
  addHero(world, { id: 'alice', name: 'Alice', heroClass: 'warrior' });
  addHero(world, { id: 'bob', name: 'Bob', heroClass: 'mage' });
  const level = levelAt(world, 1);
  const open = (cell: number): boolean => canEnter(level, cell) && hasFlag(level.map[cell]!, F.PASSABLE) && !charAt(world, 1, cell);
  const alice = heroById(world, 'alice')!;
  const bob = heroById(world, 'bob')!;
  const b = NEIGHBOURS8.map((n) => alice.pos + n).find((cell) => cell !== bob.pos && open(cell) && Math.abs(cell - alice.pos) === 1)!;
  bob.pos = b;
  return { world, a: alice.pos, b };
}

describe('co-op', () => {
  it('lets companions step past each other', () => {
    const { world, a, b } = party();
    const result = act(world, 'alice', { type: 'move', to: b });
    expect(result.ok).toBe(true);
    expect(heroById(world, 'alice')!.pos).toBe(b);
    expect(heroById(world, 'bob')!.pos).toBe(a);
  });

  it('does not push aside a companion held fast', () => {
    const { world, b } = party();
    heroById(world, 'bob')!.rooted = 5;
    expect(act(world, 'alice', { type: 'move', to: b })).toEqual({ ok: false, reason: 'cell is occupied' });
  });

  it('holds the party only for a hero a monster is after', () => {
    const { world } = party();
    const alice = heroById(world, 'alice')!;
    const bob = heroById(world, 'bob')!;
    const level = levelAt(world, 1);
    // A rat after Bob, a few cells off, in sight of both.
    const far = [3, 4, 5].flatMap((d) => [bob.pos + d, bob.pos - d, bob.pos + d * WIDTH, bob.pos - d * WIDTH])
      .find((cell) => canEnter(level, cell) && !charAt(world, 1, cell) && Math.max(Math.abs((cell % WIDTH) - (alice.pos % WIDTH)), Math.abs(Math.trunc(cell / WIDTH) - Math.trunc(alice.pos / WIDTH))) > 2);
    expect(far).toBeDefined();
    const rat = createMob('#200', 'rat', far!, 'hunting', 0);
    rat.enemy = 'bob';
    floorAt(world, 1).mobs.push(rat);
    // Whether either sees it depends on the walls; whoever is not hunted is safe regardless.
    expect(isSafe(world, alice)).toBe(true);
    rat.enemy = 'alice';
    expect(isSafe(world, bob)).toBe(true);
  });
});
