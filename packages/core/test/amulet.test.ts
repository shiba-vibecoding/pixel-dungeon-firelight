import { describe, expect, it } from 'vitest';
import { act, addHero, createItem, createWorld, floorAt, heroById, levelAt, type Effect, type World } from '../src/index';
import { pacify } from './helpers';

/** A lone warrior on the first depth's way up, with the Amulet of Yendor at their feet. */
function withAmulet(): World {
  const world = pacify(createWorld(7));
  addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  const hero = heroById(world, 'p')!;
  hero.pos = levelAt(world, 1).entrance;
  floorAt(world, 1).heaps.push({ pos: hero.pos, kind: 'heap', items: [createItem('quest.amulet')] });
  return world;
}

const effects = (result: ReturnType<typeof act>): Effect[] => (result.ok ? result.effects : []);

describe('the Amulet of Yendor', () => {
  it('does not end the run when taken, but asks once', () => {
    const world = withAmulet();
    const taken = effects(act(world, 'p', { type: 'pickup' }));
    expect(taken).toContainEqual({ type: 'amulet', hero: 'p', first: true });
    expect(world).toMatchObject({ over: false, victory: false, amuletTaken: true });
  });

  it('ends the run as won on «Let\'s call it a day»', () => {
    const world = withAmulet();
    act(world, 'p', { type: 'pickup' });
    const end = effects(act(world, 'p', { type: 'endGame' }));
    expect(end).toContainEqual({ type: 'victory', hero: 'p', ending: 'amulet' });
    expect(world).toMatchObject({ over: true, victory: true, ending: 'amulet' });
  });

  it('carried up the first depth\'s stairs, wins the happy end', () => {
    const world = withAmulet();
    act(world, 'p', { type: 'pickup' });
    const out = effects(act(world, 'p', { type: 'ascend' }));
    expect(out).toContainEqual({ type: 'victory', hero: 'p', ending: 'surface' });
    expect(world).toMatchObject({ over: true, victory: true, ending: 'surface' });
  });

  it('without it, the way up stays sealed and the end cannot be called', () => {
    const world = withAmulet();
    expect(act(world, 'p', { type: 'ascend' })).toEqual({ ok: false, reason: 'the way up is sealed' });
    expect(act(world, 'p', { type: 'endGame' })).toEqual({ ok: false, reason: 'no amulet' });
  });
});
