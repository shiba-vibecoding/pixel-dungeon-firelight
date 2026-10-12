import { describe, expect, it } from 'vitest';
import {
  act, addHero, canEnter, charAt, createItem, createMob, createWorld, floorAt, heroById, isStackable, ItemGenerator, type ItemKind,
  levelAt, missileStats, type Mob, Rng, T, WIDTH, type World,
} from '../src/index';
import { pacify } from './helpers';

/** A hero with a handful of one thrown weapon, and a tough rat two cells away along an open line. */
function range(kind: ItemKind): { world: World; rat: Mob } {
  for (let seed = 1; seed <= 40; seed++) {
    const world = pacify(createWorld(seed));
    addHero(world, { id: 'p', name: 'P', heroClass: 'huntress' });
    const hero = heroById(world, 'p')!;
    Object.assign(hero, { str: 20, attackSkill: 100000 });
    hero.items = [createItem(kind, 5)];
    const map = levelAt(world, 1);
    for (const dir of [1, -1, WIDTH, -WIDTH]) {
      const line = [1, 2].map((k) => hero.pos + dir * k);
      if (!line.every((c) => canEnter(map, c) && map.map[c] !== T.DOOR && !charAt(world, 1, c))) continue;
      const rat = createMob('#rat', 'rat', line[1]!, 'hunting', floorAt(world, 1).now);
      Object.assign(rat, { enemy: 'p', target: hero.pos, hp: 100000, ht: 100000 });
      floorAt(world, 1).mobs.push(rat);
      return { world, rat };
    }
  }
  throw new Error('no open line');
}

describe('thrown weapons', () => {
  it('come in handfuls, and stack', () => {
    const generator = new ItemGenerator(Rng.seeded(2), 3);
    const kinds = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const item = generator.of('weapon');
      if (!item.kind.startsWith('missile.')) continue;
      kinds.add(item.kind);
      expect(item.qty).toBeGreaterThanOrEqual(2);
      expect(isStackable(item.kind)).toBe(true);
    }
    for (const kind of ['missile.javelin', 'missile.shuriken', 'missile.tomahawk', 'missile.curare', 'missile.incendiary']) {
      expect(kinds).toContain(kind);
    }
    expect(missileStats(createItem('missile.tomahawk'))).toMatchObject({ min: 4, max: 20, str: 17 });
  });

  it('curare paralyses, a javelin cripples, a tomahawk makes it bleed, an incendiary dart sets it alight', () => {
    const effects: Array<[ItemKind, (rat: Mob) => boolean]> = [
      ['missile.curare', (rat) => (rat.paralysed ?? 0) > 0],
      ['missile.javelin', (rat) => (rat.crippled ?? 0) > 0],
      ['missile.tomahawk', (rat) => (rat.bleeding ?? 0) > 0 || rat.hp < 100000],
      ['missile.incendiary', (rat) => (rat.burning ?? 0) > 0 || rat.hp < 100000],
    ];
    for (const [kind, check] of effects) {
      const { world, rat } = range(kind);
      expect(act(world, 'p', { type: 'throw', item: 0, target: rat.pos }).ok).toBe(true);
      expect(check(rat), kind).toBe(true);
    }
  });

  it('shuriken fly twice as fast', () => {
    const { world, rat } = range('missile.shuriken');
    const hero = heroById(world, 'p')!;
    const before = hero.time;
    act(world, 'p', { type: 'throw', item: 0, target: rat.pos });
    expect(hero.time - before).toBeCloseTo(0.5);
  });
});
