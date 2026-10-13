import { describe, expect, it } from 'vitest';
import { act, addHero, charAt, createItem, createMob, createWorld, floorAt, heroById, levelAt, NEIGHBOURS8, T } from '../src/index';
import { pacify } from './helpers';

/** A hero with a clear line of three cells in some direction; that direction. */
function setup() {
  const world = pacify(createWorld(9));
  const hero = addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  const level = levelAt(world, 1);
  // Somewhere with three cells of bare floor in a row ahead: nothing there to stop a throw short.
  const clear = (from: number, n: number): boolean => [0, 1, 2, 3].every((k) => level.map[from + k * n] === T.EMPTY && (k === 0 || !charAt(world, 1, from + k * n)));
  const from = level.map.findIndex((_, cell) => NEIGHBOURS8.some((n) => clear(cell, n)));
  hero.pos = from;
  const d = NEIGHBOURS8.find((n) => clear(from, n))!;
  return { world, hero, d };
}

const heapAt = (world: ReturnType<typeof setup>['world'], pos: number) => floorAt(world, 1).heaps.find((h) => h.pos === pos);

describe('throwing anything (Item.AC_THROW)', () => {
  it('a ration flies where it is aimed and lands there; a stack lets go of one', () => {
    const { world, hero, d } = setup();
    const ration = hero.items.findIndex((i) => i.kind === 'food.ration');
    hero.items[ration]!.qty = 2;
    const target = hero.pos + 3 * d;
    expect(act(world, 'p', { type: 'throw', item: ration, target }).ok).toBe(true);
    expect(heapAt(world, target)?.items[0]?.kind).toBe('food.ration');
    expect(heroById(world, 'p')!.items.find((i) => i.kind === 'food.ration')?.qty).toBe(1);
  });

  it('a sword thrown at a monster falls at its feet, and hurts nobody', () => {
    const { world, hero, d } = setup();
    hero.items.push(createItem('weapon.sword'));
    const rat = createMob('r', 'rat', hero.pos + 2 * d, 'sleeping', 1);
    floorAt(world, 1).mobs.push(rat);
    const hp = rat.hp;
    expect(act(world, 'p', { type: 'throw', item: hero.items.length - 1, target: hero.pos + 3 * d }).ok).toBe(true);
    expect(heapAt(world, rat.pos)?.items[0]?.kind).toBe('weapon.sword');
    expect(rat.hp).toBe(hp);
    expect(hero.items.some((i) => i.kind === 'weapon.sword')).toBe(false);
  });

  it('a bag is not thrown', () => {
    const { world, hero, d } = setup();
    hero.items.push(createItem('bag.seeds'));
    expect(act(world, 'p', { type: 'throw', item: hero.items.length - 1, target: hero.pos + d }).ok).toBe(false);
  });
});
