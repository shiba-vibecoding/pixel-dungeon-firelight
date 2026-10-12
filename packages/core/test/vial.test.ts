import { describe, expect, it } from 'vitest';
import { act, addHero, createItem, createMob, createWorld, floorAt, heroById, levelAt, NEIGHBOURS8, canEnter, charAt } from '../src/index';
import { pacify } from './helpers';

describe('the dew vial', () => {
  it('turns up in the first three depths of every run', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const world = createWorld(seed);
      for (let d = 1; d <= 3; d++) levelAt(world, d);
      const vials = [1, 2, 3].flatMap((d) => floorAt(world, d).heaps.flatMap((h) => h.items.filter((i) => i.kind === 'vial')));
      expect(vials, `seed ${seed}`).toHaveLength(1);
    }
  });

  it('keeps dew while its bearer is unhurt, and gives it back as health', () => {
    const world = pacify(createWorld(4));
    addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
    const hero = heroById(world, 'p')!;
    hero.items = [createItem('vial')];
    expect(act(world, 'p', { type: 'use', item: 0 })).toEqual({ ok: false, reason: 'your dew vial is empty' });
    floorAt(world, 1).heaps.push({ pos: hero.pos, kind: 'heap', items: [createItem('dew', 5)] });
    act(world, 'p', { type: 'pickup' });
    expect(hero.items[0]!.volume).toBe(5);
    hero.hp = 1;
    expect(act(world, 'p', { type: 'use', item: 0 }).ok).toBe(true);
    // Half full: (5 ^ log10(20)) / 20 of the health, rounded up.
    expect(hero.hp).toBe(1 + Math.ceil((5 ** Math.log10(20) / 20) * 20));
    expect(hero.items[0]!.volume).toBe(0);
  });

  it('full, it is emptied to save its bearer from a deadly blow', () => {
    const world = pacify(createWorld(4));
    addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
    const hero = heroById(world, 'p')!;
    hero.items = [{ ...createItem('vial'), volume: 10 }];
    hero.hp = 1;
    const level = levelAt(world, 1);
    const cell = NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, 1, c))!;
    const brute = createMob('#b', 'brute', cell, 'hunting', floorAt(world, 1).now);
    Object.assign(brute, { enemy: 'p', enemySeen: true, target: hero.pos });
    floorAt(world, 1).mobs.push(brute);
    for (let i = 0; i < 20 && hero.items[0]!.volume; i++) act(world, 'p', { type: 'wait' });
    expect(hero.items[0]!.volume).toBe(0);
    expect(hero.hp).toBeGreaterThan(0);
  });
});
