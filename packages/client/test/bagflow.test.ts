import { describe, expect, it } from 'vitest';
import { act, type Action, addHero, createItem, createWorld, heroById, type Hero, type ItemKind, type World } from '@pd/core';
import { adjacentFoes, backpackMustClose, gearDrops, keepsOpen, mustClose, newlyAdjacent, type Place, resolveDrop, SNAP_BACK_MS, useKeepsOpen } from '../src/bagflow';

const use = (kind: ItemKind, known = true): boolean => keepsOpen({ type: 'use', item: 0 }, { kind, known });

describe('the backpack after an action', () => {
  it('stays open for putting on, taking off and balancing', () => {
    expect(keepsOpen({ type: 'equip', item: 2 })).toBe(true);
    expect(keepsOpen({ type: 'unequip' })).toBe(true);
    expect(keepsOpen({ type: 'remove', ring: 1 })).toBe(true);
    expect(keepsOpen({ type: 'balance', item: 1, imbue: 'speed' })).toBe(true);
  });

  it('stays open for scrolls that only change the pack, once they are known', () => {
    for (const kind of ['scroll.upgrade', 'scroll.identify', 'scroll.enchantment', 'scroll.removeCurse'] as const) {
      expect(use(kind)).toBe(true);
      // An unknown scroll may be any scroll: the dungeon answers.
      expect(use(kind, false)).toBe(false);
    }
  });

  it('stays open for food and for potions that only change the hero', () => {
    expect(use('food.ration')).toBe(true);
    for (const kind of ['potion.healing', 'potion.strength', 'potion.might', 'potion.experience'] as const) {
      expect(use(kind)).toBe(true);
      expect(use(kind, false)).toBe(false);
    }
  });

  it('closes for scrolls and potions with a say in the world or the view', () => {
    for (const kind of [
      'scroll.teleportation', 'scroll.mapping', 'scroll.challenge', 'scroll.terror', 'scroll.lullaby', 'scroll.psionicBlast',
      'scroll.mirrorImage', 'scroll.recharging',
      'potion.mindVision', 'potion.levitation', 'potion.liquidFlame', 'potion.toxicGas', 'potion.paralyticGas', 'potion.frost',
      'potion.purity', 'potion.invisibility',
    ] as const) {
      expect(use(kind)).toBe(false);
      expect(useKeepsOpen(kind, true)).toBe(false);
    }
  });

  it('closes for throwing, zapping, dropping and the rest', () => {
    const closing: Action[] = [
      { type: 'throw', item: 0, target: 5 },
      { type: 'zap', item: 0, target: 5 },
      { type: 'drop', item: 0 },
      { type: 'mine' },
      { type: 'beacon', item: 0, mode: 'set' },
    ];
    for (const action of closing) expect(keepsOpen(action, { kind: 'potion.healing', known: true })).toBe(false);
    // A use with nothing known about the item is not guessed at.
    expect(keepsOpen({ type: 'use', item: 0 })).toBe(false);
  });
});

describe('the backpack closing by itself', () => {
  it('closes when the hero is gone or the game is over', () => {
    expect(mustClose({ alive: false, over: false, before: new Set(), now: [] })).toBe(true);
    expect(mustClose({ alive: true, over: true, before: new Set(), now: [] })).toBe(true);
    expect(mustClose({ alive: true, over: false, before: new Set(), now: [] })).toBe(false);
  });

  it('closes when a foe has come next to the hero, not for one that was already there', () => {
    expect(newlyAdjacent(new Set(), ['a'])).toBe(true);
    expect(newlyAdjacent(new Set(['a']), ['a'])).toBe(false);
    expect(newlyAdjacent(new Set(['a']), ['a', 'b'])).toBe(true);
    expect(newlyAdjacent(new Set(['a']), [])).toBe(false);
    expect(mustClose({ alive: true, over: false, before: new Set(['a']), now: ['a', 'b'] })).toBe(true);
  });

  it('counts only awake hostile monsters next to the hero', () => {
    // Cells are y * WIDTH + x; 1 is beside 0, and far is not.
    const mob = (id: string, pos: number, extra: object = {}) => ({ id, pos, hp: 5, state: 'hunting', ...extra });
    const world = {
      over: false,
      floors: {
        1: {
          mobs: [
            mob('near', 1),
            mob('far', 400),
            mob('asleep', 1, { state: 'sleeping' }),
            mob('shopkeeper', 1, { state: 'passive' }),
            mob('twin', 1, { image: { owner: 'me', attack: 1, damage: 1 } }),
            mob('dead', 1, { hp: 0 }),
          ],
        },
      },
    } as unknown as World;
    const hero = { id: 'me', depth: 1, pos: 0, hp: 20, ht: 20 } as unknown as Hero;
    expect(adjacentFoes(world, hero)).toEqual(['near']);
    expect(backpackMustClose(world, hero, new Set())).toBe(true);
    expect(backpackMustClose(world, hero, new Set(['near']))).toBe(false);
  });
});

describe('letting go of a dragged item', () => {
  const places = new Map<string, Action>([
    ['weapon', { type: 'equip', item: 3 }],
    ['away', { type: 'drop', item: 3 }],
  ]);

  it('does what the place takes', () => {
    expect(resolveDrop(places, 'weapon')).toEqual({ type: 'do', value: { type: 'equip', item: 3 }, place: 'weapon' });
  });

  it('sends it back to its slot on a place that does not take it, on nothing, or outside', () => {
    expect(resolveDrop(places, 'armor')).toEqual({ type: 'snap' });
    expect(resolveDrop(places, 'pack')).toEqual({ type: 'snap' });
    expect(resolveDrop(places, undefined)).toEqual({ type: 'snap' });
    expect(resolveDrop(new Map(), 'weapon')).toEqual({ type: 'snap' });
  });

  it('flies back quickly', () => {
    expect(SNAP_BACK_MS).toBeGreaterThanOrEqual(120);
    expect(SNAP_BACK_MS).toBeLessThanOrEqual(260);
  });
});

describe('dragging gear', () => {
  const kit = () => {
    const world = createWorld(6);
    const hero = addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
    hero.items = [createItem('armor.leather'), createItem('ring.haste'), createItem('ring.accuracy'), createItem('weapon.mace'), createItem('potion.healing')];
    return { world, hero };
  };

  it('every worn thing goes back into the pack by the action that takes it off, on the empty part and on every pack slot', () => {
    const { world, hero } = kit();
    act(world, 'p', { type: 'equip', item: 1 });
    act(world, 'p', { type: 'equip', item: 1 });
    expect(hero.rings).toHaveLength(2);
    const cases: Array<[Place, Action]> = [
      [{ worn: 'weapon' }, { type: 'unequip' }],
      [{ worn: 'armor' }, { type: 'unequip', slot: 'armor' }],
      [{ ring: 0 }, { type: 'remove', ring: 0 }],
      [{ ring: 1 }, { type: 'remove', ring: 1 }],
    ];
    for (const [from, action] of cases) {
      const item = ('ring' in from ? hero.rings[from.ring] : 'worn' in from ? (from.worn === 'weapon' ? hero.weapon : hero.armor) : undefined)!;
      const drops = gearDrops(hero, from, item);
      expect(drops.get('pack')).toEqual(action);
      hero.items.forEach((_, i) => expect(drops.get(String(i))).toEqual(action));
      expect(drops.has('away')).toBe(false);
      // And the core takes it: the item is off, back in the pack.
      const copy = structuredClone(world);
      expect(act(copy, 'p', action).ok).toBe(true);
      expect(heroById(copy, 'p')!.items.some((held) => held.kind === item.kind)).toBe(true);
    }
  });

  it('a weapon, armour or ring from the pack goes onto its own place, and nowhere else', () => {
    const { world, hero } = kit();
    const kinds: Array<[number, string[]]> = [[0, ['armor']], [1, ['ring0', 'ring1']], [3, ['weapon']], [4, []]];
    for (const [index, places] of kinds) {
      const drops = gearDrops(hero, { index }, hero.items[index]!);
      expect([...drops.keys()].sort()).toEqual([...places].sort());
      for (const action of drops.values()) {
        expect(action).toEqual({ type: 'equip', item: index });
        expect(act(structuredClone(world), 'p', action).ok).toBe(true);
      }
    }
  });

  it('taking off, armour included, keeps the backpack open', () => {
    expect(keepsOpen({ type: 'unequip', slot: 'armor' })).toBe(true);
  });
});
