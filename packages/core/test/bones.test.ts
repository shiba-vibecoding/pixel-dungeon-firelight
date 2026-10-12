import { describe, expect, it } from 'vitest';
import { addHero, createItem, createWorld, floorAt, giveBones, heroById, leaveBones } from '../src/index';

describe('bones', () => {
  it('leave a worn thing, or some gold', () => {
    const world = createWorld(11);
    addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
    const hero = heroById(world, 'p')!;
    hero.depth = 4;
    expect(leaveBones(hero, 0, 0)).toMatchObject({ depth: 4, item: { kind: hero.weapon!.kind } });
    hero.gold = 100;
    // No rings: some of the gold instead.
    expect(leaveBones(hero, 2, 0.5)).toEqual({ depth: 4, item: expect.objectContaining({ kind: 'gold', qty: 51 }) });
  });

  it('wait for their depth, and lie there in a skeleton, cursed and worn down', () => {
    const world = createWorld(12);
    addHero(world, { id: 'p', name: 'P', heroClass: 'mage' });
    world.bones = { depth: 3, item: createItem('weapon.longsword', 1, 6) };
    floorAt(world, 2);
    expect(world.bones.placed).toBeUndefined();
    const skeleton = floorAt(world, 3).heaps.find((h) => h.kind === 'skeleton' && h.items.some((i) => i.kind === 'weapon.longsword'));
    expect(world.bones.placed).toBe(true);
    // Bones.get: no higher than (depth - 1) * 3 / 5 + 1.
    expect(skeleton?.items[0]).toMatchObject({ cursed: true, level: 2, levelUnknown: true });
  });

  it('on a depth made already, lie there at once', () => {
    const world = createWorld(13);
    addHero(world, { id: 'p', name: 'P', heroClass: 'rogue' });
    giveBones(world, { depth: 1, item: createItem('gold', 30) });
    expect(world.bones?.placed).toBe(true);
    expect(floorAt(world, 1).heaps.some((h) => h.kind === 'skeleton' && h.items.some((i) => i.kind === 'gold' && i.qty === 30))).toBe(true);
  });
});
