import { describe, expect, it } from 'vitest';
import {
  act, addHero, canEnter, charAt, createItem, createMob, createWorld, type Effect, floorAt, heroById, type ItemKind,
  ITEMS, itemDef, itemSprite, levelAt, type Mob, T, wandMaxCharges, WIDTH, type World,
} from '../src/index';
import { pacify } from './helpers';

/** A hero with one wand, and a rat three cells away along an open line. */
function range(kind: ItemKind, seed = 1, level = 0): { world: World; rat: Mob; line: number[] } | null {
  const world = pacify(createWorld(seed));
  addHero(world, { id: 'p', name: 'P', heroClass: 'mage' });
  const hero = heroById(world, 'p')!;
  hero.items = [createItem(kind, 1, level)];
  const map = levelAt(world, 1);
  for (const dir of [1, -1, WIDTH, -WIDTH]) {
    const line = [1, 2, 3].map((k) => hero.pos + dir * k);
    if (line.every((c) => canEnter(map, c) && map.map[c] !== T.DOOR && map.map[c] !== T.HIGH_GRASS && !charAt(world, 1, c))) {
      const rat = createMob('#rat', 'rat', line[2]!, 'hunting', floorAt(world, 1).now);
      Object.assign(rat, { enemy: 'p', target: hero.pos });
      floorAt(world, 1).mobs.push(rat);
      return { world, rat, line };
    }
  }
  return null;
}

function zapped(kind: ItemKind, level = 0): { world: World; rat: Mob; line: number[]; effects: Effect[] } {
  for (let seed = 1; seed <= 40; seed++) {
    const setup = range(kind, seed, level);
    if (!setup) continue;
    const result = act(setup.world, 'p', { type: 'zap', item: 0, target: setup.rat.pos });
    expect(result.ok).toBe(true);
    return { ...setup, effects: result.ok ? result.effects : [] };
  }
  throw new Error('no open line');
}

describe('wands', () => {
  it('go by their wood until used, and two charges plus their level', () => {
    const wands = (Object.keys(ITEMS) as ItemKind[]).filter((k) => itemDef(k).category === 'wand' && k !== 'wand.magicMissile');
    expect(wands).toHaveLength(12);
    const labels = createWorld(9).run.labels;
    const sprites = new Set(wands.map((k) => itemSprite(createItem(k), labels)));
    expect(sprites.size).toBe(12);
    expect(wandMaxCharges(createItem('wand.firebolt', 1, 2))).toBe(4);
    expect(createItem('wand.lightning').charges).toBe(2);
  });

  it('using one tells the party what it is', () => {
    const { world, effects } = zapped('wand.poison');
    expect(world.known).toContain('wand.poison');
    expect(effects).toContainEqual({ type: 'identified', hero: 'p', kind: 'wand.poison' });
  });

  it('firebolt burns and sets its target alight', () => {
    const { rat, effects } = zapped('wand.firebolt', 2);
    expect(effects.some((e) => e.type === 'burst' && e.kind === 'fire')).toBe(true);
    expect(rat.hp < rat.ht || (rat.burning ?? 0) > 0).toBe(true);
  });

  it('lightning strikes and leaps to a neighbour', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const setup = range('wand.lightning', seed, 3);
      if (!setup) continue;
      const { world, rat } = setup;
      const level = levelAt(world, 1);
      const beside = [1, -1, WIDTH, -WIDTH].map((n) => rat.pos + n).find((c) => canEnter(level, c) && !charAt(world, 1, c) && !setup.line.includes(c));
      if (beside === undefined) continue;
      const other = createMob('#other', 'rat', beside, 'hunting', floorAt(world, 1).now);
      floorAt(world, 1).mobs.push(other);
      const result = act(world, 'p', { type: 'zap', item: 0, target: rat.pos });
      const arcs = result.ok ? result.effects.filter((e) => e.type === 'zapped' && e.bolt === 'lightning') : [];
      expect(arcs.length).toBeGreaterThanOrEqual(1);
      if (arcs.length < 2) continue;
      expect(rat.hp < rat.ht || !floorAt(world, 1).mobs.includes(rat)).toBe(true);
      expect(other.hp < other.ht || !floorAt(world, 1).mobs.includes(other)).toBe(true);
      return;
    }
    throw new Error('lightning never leapt');
  });

  it('poison and slowness afflict their target', () => {
    expect(zapped('wand.poison', 1).rat.poison).toBeGreaterThan(0);
    const { rat } = zapped('wand.slowness', 1);
    expect(rat.slowed).toBeGreaterThan(0);
  });

  it('teleportation sends the target away; blink carries the hero', () => {
    const { rat, line, effects } = zapped('wand.teleportation');
    expect(rat.pos).not.toBe(line[2]);
    expect(effects.some((e) => e.type === 'jumped')).toBe(true);

    const blink = zapped('wand.blink');
    const hero = heroById(blink.world, 'p')!;
    // Up to the cell before the rat.
    expect(hero.pos).toBe(blink.line[1]);
  });

  it('disintegration pierces everyone in a line', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const setup = range('wand.disintegration', seed, 2);
      if (!setup) continue;
      const { world, rat, line } = setup;
      const front = createMob('#front', 'rat', line[1]!, 'hunting', floorAt(world, 1).now);
      floorAt(world, 1).mobs.push(front);
      act(world, 'p', { type: 'zap', item: 0, target: rat.pos });
      const hurt = (m: Mob): boolean => m.hp < m.ht || !floorAt(world, 1).mobs.includes(m);
      expect(hurt(front) && hurt(rat)).toBe(true);
      return;
    }
    throw new Error('no open line');
  });

  it('avalanche bruises everything around where it strikes', () => {
    const { rat, effects } = zapped('wand.avalanche', 3);
    expect(effects.some((e) => e.type === 'avalanche' && e.cells.includes(rat.pos))).toBe(true);
    expect(effects.some((e) => e.type === 'attack' && e.target === '#rat')).toBe(true);
  });

  it('amok turns a monster on its own kind', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const setup = range('wand.amok', seed, 3);
      if (!setup) continue;
      const { world, rat, line } = setup;
      // Another rat right behind the first, closer to it than the hero.
      const map = levelAt(world, 1);
      const behind = rat.pos + (line[2]! - line[1]!);
      if (!canEnter(map, behind) || charAt(world, 1, behind)) continue;
      const other = createMob('#other', 'rat', behind, 'sleeping', floorAt(world, 1).now);
      Object.assign(other, { ht: 1000, hp: 1000 });
      floorAt(world, 1).mobs.push(other);
      act(world, 'p', { type: 'zap', item: 0, target: rat.pos });
      expect(rat.amok).toBeGreaterThan(0);
      for (let i = 0; i < 4; i++) act(world, 'p', { type: 'wait' });
      expect(other.hp).toBeLessThan(1000);
      return;
    }
    throw new Error('no open line');
  });

  it('reach swaps places with whoever is in the way', () => {
    const { world, rat, line } = zapped('wand.reach', 3);
    const hero = heroById(world, 'p')!;
    expect(hero.pos).toBe(line[2]);
    expect(rat.pos).not.toBe(line[2]);
  });

  it('flock raises a wall of sheep, which fades away', () => {
    const { world, effects } = zapped('wand.flock', 1);
    const sheep = floorAt(world, 1).mobs.filter((m) => m.kind === 'sheep');
    expect(sheep.length).toBe(3);
    expect(effects.some((e) => e.type === 'flock')).toBe(true);
    for (let i = 0; i < 10; i++) act(world, 'p', { type: 'wait' });
    expect(floorAt(world, 1).mobs.some((m) => m.kind === 'sheep')).toBe(false);
  });

  it('regrowth makes grass spring up along the bolt and grow tall where it lands', () => {
    const { world, line } = zapped('wand.regrowth', 0);
    const map = levelAt(world, 1).map;
    expect(map[line[2]!] === T.HIGH_GRASS || map[line[1]!] === T.GRASS || map[line[1]!] === T.HIGH_GRASS).toBe(true);
  });
});
