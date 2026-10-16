import { describe, expect, it } from 'vitest';
import { addHero, createItem, createWorld } from '@pd/core';
import { chooseQuickslot, quickItem, quickRef } from '../src/quickslot';

/*
 * QuickSlot.select: the slot holds a class (a stackable) or the item itself, and Belongings.getItem walks what is worn first, then the
 * pack: a stack of darts in the hand shows in the slot and throws from there; the boomerang too.
 */
const huntress = () => {
  const world = createWorld(7);
  const hero = addHero(world, { id: 'p', name: 'P', heroClass: 'huntress' });
  hero.items = [createItem('food.ration')];
  return hero;
};

describe('the quick slots and what is held in the hand', () => {
  it('a stack of darts in the hand is what the slot holds, before one in the pack', () => {
    const hero = huntress();
    chooseQuickslot('missile.dart', 0);
    expect(quickRef(hero, 0)).toBe(-1);
    hero.items.push(createItem('missile.dart', 4));
    expect(quickRef(hero, 0)).toBe(1);
    hero.weapon = createItem('missile.dart', 7);
    expect(quickRef(hero, 0)).toBe('weapon');
    expect(quickItem(hero, 0)).toBe(hero.weapon);
    expect(quickItem(hero, 0)!.qty).toBe(7);
  });

  it('the boomerang in the hand, in either slot', () => {
    const hero = huntress();
    hero.weapon = createItem('missile.boomerang');
    chooseQuickslot('missile.boomerang', 1);
    expect(quickRef(hero, 1)).toBe('weapon');
    expect(quickItem(hero, 1)).toBe(hero.weapon);
    hero.weapon = null;
    hero.items.push(createItem('missile.boomerang'));
    expect(quickRef(hero, 1)).toBe(hero.items.length - 1);
  });

  it('goes back to the pack once the hand is empty, and to nothing once the last one is gone', () => {
    const hero = huntress();
    chooseQuickslot('missile.shuriken', 0);
    hero.weapon = createItem('missile.shuriken', 2);
    expect(quickRef(hero, 0)).toBe('weapon');
    hero.weapon = null;
    expect(quickItem(hero, 0)).toBeUndefined();
  });
});
