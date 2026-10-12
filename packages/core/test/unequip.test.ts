import { describe, expect, it } from 'vitest';
import { act, addHero, createItem, createWorld, floorAt, heroById } from '../src/index';
import { pacify } from './helpers';

describe('the weapon in hand', () => {
  it('goes back into the pack, and a cursed one stays put', () => {
    const world = pacify(createWorld(3));
    addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
    const hero = heroById(world, 'p')!;
    const sword = hero.weapon!;
    expect(act(world, 'p', { type: 'unequip' }).ok).toBe(true);
    expect(hero.weapon).toBeNull();
    expect(hero.items).toContain(sword);
    expect(act(world, 'p', { type: 'unequip' })).toEqual({ ok: false, reason: 'nothing in hand' });

    const cursed = createItem('weapon.mace', 1, -1);
    cursed.cursed = true;
    hero.weapon = cursed;
    expect(act(world, 'p', { type: 'unequip' }).ok).toBe(false);
    expect(hero.weapon).toBe(cursed);
  });

  it('falls at the hero\'s feet when the pack is full', () => {
    const world = pacify(createWorld(4));
    addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
    const hero = heroById(world, 'p')!;
    while (hero.items.length < 20) hero.items.push(createItem('weapon.dagger', 1, 0));
    const sword = hero.weapon!;
    expect(act(world, 'p', { type: 'unequip' }).ok).toBe(true);
    expect(floorAt(world, 1).heaps.find((h) => h.pos === hero.pos)?.items).toContain(sword);
  });
});
