import { beforeEach, describe, expect, it } from 'vitest';
import { addHero, createItem, createWorld, heroById, type Item, levelAt, type Mob, passable, visibleCells } from '@pd/core';
import { drinkRisk, enchantLossChance, equipRisk, hasMagic, targetEffect } from '../src/riskyuse';
import { forgetSight } from '../src/sight';

function setup() {
  const world = createWorld(23);
  addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  return { world, hero: heroById(world, 'p')! };
}

beforeEach(() => forgetSight());

describe('confirming risky use', () => {
  it('putting on a weapon, armour or ring of unknown curse is a gamble; a known one is not', () => {
    const sword = createItem('weapon.sword');
    sword.curseUnknown = true;
    expect(equipRisk(sword)).toBe(true);
    delete sword.curseUnknown;
    expect(equipRisk(sword)).toBe(false);
    const ring = createItem('ring.haste');
    ring.curseUnknown = true;
    expect(equipRisk(ring)).toBe(true);
    const mail = createItem('armor.mail');
    mail.curseUnknown = true;
    expect(equipRisk(mail)).toBe(true);
    // Food, scrolls and the rest carry no curse to ask about.
    expect(equipRisk(createItem('food.ration'))).toBe(false);
    expect(equipRisk(createItem('scroll.upgrade'))).toBe(false);
  });

  it('an unknown potion is a gamble only with an enemy in sight', () => {
    const { world, hero } = setup();
    const potion = createItem('potion.toxicGas');
    world.known = world.known.filter((kind) => kind !== potion.kind);
    // Nobody about: free to try.
    const floor = world.floors[hero.depth]!;
    const mobs = floor.mobs;
    floor.mobs = [];
    expect(drinkRisk(world, hero, potion)).toBe(false);
    // An awake monster in plain sight.
    const walkable = passable(levelAt(world, hero.depth).map);
    const seen = visibleCells(world, hero.depth);
    const cell = seen.findIndex((s, c) => s && walkable[c] && c !== hero.pos);
    const mob = { ...mobs.find((m) => m.hp > 0)!, pos: cell, state: 'hunting', ally: false } as Mob;
    floor.mobs = [mob];
    forgetSight();
    expect(drinkRisk(world, hero, potion)).toBe(true);
    // A known kind is no gamble.
    world.known.push(potion.kind);
    expect(drinkRisk(world, hero, potion)).toBe(false);
    // And a scroll is not a potion.
    expect(drinkRisk(world, hero, createItem('scroll.upgrade'))).toBe(false);
  });

  it('only the upgrade and the enchantment scrolls ask what they will do to the item', () => {
    expect(targetEffect('scroll.upgrade')).toBe('upgrade');
    expect(targetEffect('scroll.enchantment')).toBe('enchant');
    expect(targetEffect('scroll.identify')).toBeUndefined();
    expect(targetEffect('scroll.removeCurse')).toBeUndefined();
  });

  it('the upgrade drives the magic out with Random.Int(level) > 0: (level - 1) / level', () => {
    const blade: Item = { ...createItem('weapon.sword'), enchant: 'fire' };
    const chance = (level: number): number => enchantLossChance({ ...blade, level });
    expect([0, 1, 2, 3, 4, 5, 9].map(chance)).toEqual([0, 0, 50, 67, 75, 80, 89]);
    expect(hasMagic(blade)).toBe(true);
    expect(enchantLossChance({ ...createItem('weapon.sword'), level: 5 })).toBe(0);
    expect(enchantLossChance({ ...createItem('armor.mail'), glyph: 'bounce', level: 3 })).toBe(67);
    // A broken item is only mended.
    expect(enchantLossChance({ ...blade, level: 3, durability: 0 })).toBe(0);
  });
});
