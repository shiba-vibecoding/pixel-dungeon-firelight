import { describe, expect, it } from 'vitest';
import {
  act, addHero, canEnter, charAt, createItem, createMob, createWorld, floorAt, heroById, levelAt, NEIGHBOURS8,
} from '../src/index';
import { pacify } from './helpers';

describe("Lloyd's beacon", () => {
  it('takes its bearer back where it was set, even from another depth, and is cleared', () => {
    const world = pacify(createWorld(8));
    addHero(world, { id: 'p', name: 'P', heroClass: 'mage' });
    const hero = heroById(world, 'p')!;
    hero.items = [createItem('beacon')];
    expect(act(world, 'p', { type: 'beacon', item: 0, mode: 'return' })).toEqual({ ok: false, reason: 'the beacon is not set' });
    const spot = hero.pos;
    expect(act(world, 'p', { type: 'beacon', item: 0, mode: 'set' }).ok).toBe(true);
    expect(hero.items[0]!.returnTo).toEqual({ depth: 1, pos: spot });

    hero.pos = levelAt(world, 1).exit;
    expect(act(world, 'p', { type: 'descend' }).ok).toBe(true);
    expect(hero.depth).toBe(2);
    expect(act(world, 'p', { type: 'beacon', item: 0, mode: 'return' }).ok).toBe(true);
    expect([hero.depth, hero.pos]).toEqual([1, spot]);
    expect(hero.items[0]!.returnTo).toBeUndefined();
  });

  it('will not work with a monster right next to the bearer', () => {
    const world = pacify(createWorld(8));
    addHero(world, { id: 'p', name: 'P', heroClass: 'mage' });
    const hero = heroById(world, 'p')!;
    hero.items = [createItem('beacon')];
    const level = levelAt(world, 1);
    const beside = NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, 1, c))!;
    floorAt(world, 1).mobs.push(createMob('#rat', 'rat', beside, 'sleeping', 0));
    expect(act(world, 'p', { type: 'beacon', item: 0, mode: 'set' })).toEqual({
      ok: false, reason: 'creatures nearby prevent the beacon from working',
    });
  });
});
