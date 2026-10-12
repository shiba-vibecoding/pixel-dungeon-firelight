import { describe, expect, it } from 'vitest';
import {
  act, addHero, canEnter, charAt, createItem, createMob, createWorld, floorAt, heroAttackSkill, heroById, heroStealth,
  type ItemKind, ITEMS, itemDef, itemSprite, levelAt, NEIGHBOURS8, type World,
} from '../src/index';
import { pacify } from './helpers';

function solo(heroClass: 'warrior' | 'rogue' = 'warrior'): World {
  const world = pacify(createWorld(17));
  addHero(world, { id: 'p', name: 'P', heroClass });
  heroById(world, 'p')!.items = [];
  return world;
}

describe('rings', () => {
  it('go by their gem until known; the rogue sets out wearing a ring of shadows', () => {
    const rings = (Object.keys(ITEMS) as ItemKind[]).filter((k) => itemDef(k).category === 'ring');
    expect(rings).toHaveLength(11);
    const labels = createWorld(5).run.labels;
    expect(new Set(rings.map((k) => itemSprite(createItem(k), labels))).size).toBe(11);

    const world = solo('rogue');
    const rogue = heroById(world, 'p')!;
    expect(rogue.rings).toEqual([{ kind: 'ring.shadows', qty: 1, level: 1 }]);
    expect(world.known).toContain('ring.shadows');
    expect(heroStealth(rogue)).toBe(1);
  });

  it('two can be worn; a third takes the place of the first, and one can be taken off', () => {
    const world = solo();
    const hero = heroById(world, 'p')!;
    hero.items = [createItem('ring.accuracy', 1, 2), createItem('ring.haste', 1, 1), createItem('ring.mending', 1, 1)];
    const before = heroAttackSkill(hero);
    act(world, 'p', { type: 'equip', item: 0 });
    expect(heroAttackSkill(hero)).toBe(Math.trunc(before * Math.fround(1.4 ** 2)));
    act(world, 'p', { type: 'equip', item: 0 });
    act(world, 'p', { type: 'equip', item: 0 });
    expect(hero.rings.map((r) => r.kind)).toEqual(['ring.haste', 'ring.mending']);
    expect(hero.items.map((r) => r.kind)).toEqual(['ring.accuracy']);
    act(world, 'p', { type: 'remove', ring: 0 });
    expect(hero.rings.map((r) => r.kind)).toEqual(['ring.mending']);
    expect(hero.items).toHaveLength(2);
  });

  it('a ring worn long enough tells what it is', () => {
    const world = solo();
    const hero = heroById(world, 'p')!;
    hero.items = [createItem('ring.satiety', 1, 1)];
    act(world, 'p', { type: 'equip', item: 0 });
    expect(world.known).not.toContain('ring.satiety');
    for (let i = 0; i < 210; i++) act(world, 'p', { type: 'wait' });
    expect(world.known).toContain('ring.satiety');
  });

  it('haste makes everything quicker', () => {
    const world = solo();
    const hero = heroById(world, 'p')!;
    hero.rings = [createItem('ring.haste', 1, 3)];
    const before = hero.time;
    act(world, 'p', { type: 'wait' });
    expect(hero.time - before).toBeCloseTo(1.1 ** -3);
  });

  it('thorns turn some of a blow back on the attacker', () => {
    const world = solo();
    const hero = heroById(world, 'p')!;
    Object.assign(hero, { ht: 1000, hp: 1000, defenseSkill: 0 });
    hero.rings = [createItem('ring.thorns', 1, 1)];
    const level = levelAt(world, 1);
    const pos = NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, 1, c))!;
    const rat = createMob('#rat', 'rat', pos, 'hunting', floorAt(world, 1).now);
    Object.assign(rat, { enemy: 'p', target: hero.pos, enemySeen: true, ht: 1000, hp: 1000 });
    floorAt(world, 1).mobs.push(rat);
    for (let i = 0; i < 30; i++) act(world, 'p', { type: 'wait' });
    expect(rat.hp).toBeLessThan(1000);
  });
});
