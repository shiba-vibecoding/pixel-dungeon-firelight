import { describe, expect, it } from 'vitest';
import {
  act, type Action, addHero, canEnter, charAt, createItem, createMob, createWorld, fingerprint, floorAt, type Hero, heroArmor, heroById, kitTargets, levelAt,
  NEIGHBOURS8, scrollTargets, type World,
} from '../src/index';
import { pacify } from './helpers';

/*
 * EquipableItem.cast: every item has AC_THROW, and a worn weapon, armour or ring is thrown too: it comes off first (hero.spend(time2equip),
 * and a cursed one will not), then it flies as any item does (a turn). Armour takes two turns to take off (Armor.time2equip = 2 / speed).
 * Plant.Seed: its default action is THROW, and a seed takes root where it lands; AC_PLANT does it at the hero's feet.
 */

const CURSED = { ok: false, reason: 'it is cursed: you cannot take it off' };

function solo(): { world: World; hero: Hero; cell: number } {
  const world = pacify(createWorld(5));
  const hero = addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  hero.items = [];
  const level = levelAt(world, 1);
  const cell = NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, 1, c))!;
  return { world, hero, cell };
}

const lyingAt = (world: World, cell: number) => floorAt(world, 1).heaps.find((h) => h.pos === cell)?.items ?? [];

describe('throwing what is worn', () => {
  it('a weapon in hand comes off and flies; the turn is the unequipping and the throw', () => {
    const { world, hero, cell } = solo();
    const sword = hero.weapon!;
    const time = hero.time;
    const done = act(world, 'p', { type: 'throw', item: 'weapon', target: cell });
    expect(done.ok && done.effects.some((e) => e.type === 'thrown' && e.item === sword.kind)).toBe(true);
    expect(hero.weapon).toBeNull();
    expect(hero.items).not.toContain(sword);
    expect(lyingAt(world, cell)).toContain(sword);
    expect(hero.time).toBe(time + 2);
  });

  it('armour comes off and flies; taking it off takes two turns', () => {
    const { world, hero, cell } = solo();
    const armour = hero.armor!;
    expect(heroArmor(hero)).toBeGreaterThan(0);
    const time = hero.time;
    expect(act(world, 'p', { type: 'throw', item: 'armor', target: cell }).ok).toBe(true);
    expect(hero.armor).toBeNull();
    expect(lyingAt(world, cell)).toContain(armour);
    expect(heroArmor(hero)).toBe(0);
    expect(hero.time).toBe(time + 2 + 1);
  });

  it('a heavy armour that slows its wearer takes longer to take off', () => {
    const { world, hero, cell } = solo();
    hero.armor = createItem('armor.plate');
    hero.str = 10;
    const time = hero.time;
    expect(act(world, 'p', { type: 'throw', item: 'armor', target: cell }).ok).toBe(true);
    // 2 / speed, with the armour still on: plate asks 17 strength, the hero has 10, so 1.3 ^ -7 of the pace.
    expect(hero.time - time).toBeCloseTo(2 / Math.pow(1.3, -7) + 1, 3);
  });

  it('a ring comes off, either of the two, and flies; the other stays on', () => {
    const { world, hero, cell } = solo();
    hero.items = [createItem('ring.haste'), createItem('ring.accuracy')];
    expect(act(world, 'p', { type: 'equip', item: 0 }).ok).toBe(true);
    expect(act(world, 'p', { type: 'equip', item: 0 }).ok).toBe(true);
    expect(hero.rings).toHaveLength(2);
    const [first, second] = hero.rings;
    const time = hero.time;
    expect(act(world, 'p', { type: 'throw', item: 'ring0', target: cell }).ok).toBe(true);
    expect(hero.rings).toEqual([second]);
    expect(lyingAt(world, cell)).toContain(first);
    expect(hero.time).toBe(time + 2);
    expect(act(world, 'p', { type: 'throw', item: 'ring1', target: cell })).toEqual({ ok: false, reason: 'no such item' });
    expect(act(world, 'p', { type: 'throw', item: 'ring0', target: cell }).ok).toBe(true);
    expect(hero.rings).toHaveLength(0);
  });

  it('the second ring is thrown by its own name', () => {
    const { world, hero, cell } = solo();
    hero.items = [createItem('ring.haste'), createItem('ring.accuracy')];
    act(world, 'p', { type: 'equip', item: 0 });
    act(world, 'p', { type: 'equip', item: 0 });
    const [first, second] = hero.rings;
    expect(act(world, 'p', { type: 'throw', item: 'ring1', target: cell }).ok).toBe(true);
    expect(hero.rings).toEqual([first]);
    expect(lyingAt(world, cell)).toContain(second);
  });

  it('a cursed one will not come off, so it is not thrown, and nothing changes', () => {
    for (const [slot, worn] of [['weapon', 'weapon.mace'], ['armor', 'armor.mail']] as const) {
      const { world, hero, cell } = solo();
      hero[slot] = { ...createItem(worn, 1, -1), cursed: true };
      const before = fingerprint(world);
      expect(act(world, 'p', { type: 'throw', item: slot, target: cell })).toEqual(CURSED);
      expect(fingerprint(world)).toBe(before);
    }
    const { world, hero, cell } = solo();
    hero.rings = [{ ...createItem('ring.haste', 1, -1), cursed: true }];
    expect(act(world, 'p', { type: 'throw', item: 'ring0', target: cell })).toEqual(CURSED);
    expect(hero.rings).toHaveLength(1);
  });

  it('refuses what is not worn, a bad target and junk', () => {
    const { world, hero, cell } = solo();
    expect(act(world, 'p', { type: 'throw', item: 'ring0', target: cell })).toEqual({ ok: false, reason: 'no such item' });
    expect(act(world, 'p', { type: 'throw', item: 'weapon', target: hero.pos })).toEqual({ ok: false, reason: 'bad target' });
    expect(act(world, 'p', { type: 'throw', item: 'helmet' as never, target: cell }).ok).toBe(false);
    hero.weapon = null;
    expect(act(world, 'p', { type: 'throw', item: 'weapon', target: cell })).toEqual({ ok: false, reason: 'no such item' });
    expect(hero.armor).not.toBeNull();
  });

  it('pack items throw as ever', () => {
    const { world, hero, cell } = solo();
    hero.items = [createItem('weapon.dagger')];
    expect(act(world, 'p', { type: 'throw', item: 0, target: cell }).ok).toBe(true);
    expect(hero.items).toHaveLength(0);
    expect(hero.weapon).not.toBeNull();
  });

  it('a replay of the same actions on a copy of the start ends in the same world', () => {
    const { world: start, cell } = solo();
    const log: Action[] = [
      { type: 'throw', item: 'armor', target: cell },
      { type: 'wait' },
      { type: 'throw', item: 'weapon', target: cell },
      { type: 'wait' },
    ];
    const run = (world: World): void => {
      for (const action of log) expect(act(world, 'p', action).ok).toBe(true);
    };
    const a = structuredClone(start);
    const b = structuredClone(start);
    run(a);
    run(b);
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(heroById(a, 'p')!.armor).toBeNull();
  });
});

describe('taking the armour off', () => {
  it('puts it in the pack, takes two turns, and leaves the hero unarmoured', () => {
    const { world, hero } = solo();
    const armour = hero.armor!;
    const time = hero.time;
    expect(act(world, 'p', { type: 'unequip', slot: 'armor' }).ok).toBe(true);
    expect(hero.armor).toBeNull();
    expect(hero.items).toContain(armour);
    expect(hero.time).toBe(time + 2);
    expect(act(world, 'p', { type: 'unequip', slot: 'armor' })).toEqual({ ok: false, reason: 'you wear no armour' });
    // And it goes on again.
    expect(act(world, 'p', { type: 'equip', item: hero.items.indexOf(armour) }).ok).toBe(true);
    expect(hero.armor).toBe(armour);
  });

  it('is refused for cursed armour, and falls at the feet when the pack is full', () => {
    const { world, hero } = solo();
    hero.armor = { ...createItem('armor.mail', 1, -1), cursed: true };
    expect(act(world, 'p', { type: 'unequip', slot: 'armor' })).toEqual(CURSED);
    const plain = createItem('armor.leather');
    hero.armor = plain;
    while (hero.items.length < 20) hero.items.push(createItem('weapon.dagger', 1, 0));
    expect(act(world, 'p', { type: 'unequip', slot: 'armor' }).ok).toBe(true);
    expect(lyingAt(world, hero.pos)).toContain(plain);
  });

  it('keeps the weapon as the default and refuses a bad slot', () => {
    const { world, hero } = solo();
    expect(act(world, 'p', { type: 'unequip', slot: 'ring0' as never }).ok).toBe(false);
    expect(act(world, 'p', { type: 'unequip' }).ok).toBe(true);
    expect(hero.weapon).toBeNull();
  });

  it('nothing is offered for the armour that is not there', () => {
    const { world, hero } = solo();
    hero.items = [createItem('armor.leather')];
    act(world, 'p', { type: 'unequip', slot: 'armor' });
    expect(scrollTargets(world, hero, 'scroll.upgrade')).not.toContain('armor');
    expect(kitTargets(hero)).toEqual([0, 1]);
    expect(act(world, 'p', { type: 'use', item: 0, target: 'armor' }).ok).toBe(false);
  });

  it('a hero with no armour gets no protection, and the world goes on', () => {
    const { world, hero } = solo();
    act(world, 'p', { type: 'unequip', slot: 'armor' });
    expect(heroArmor(hero)).toBe(0);
    for (let i = 0; i < 5; i++) expect(act(world, 'p', { type: 'wait' }).ok).toBe(true);
  });
});

describe('seeds', () => {
  it('a thrown seed takes root where it lands, replacing a plant there, for a turn', () => {
    const { world, hero, cell } = solo();
    hero.items = [createItem('seed.sungrass', 2), createItem('seed.icecap')];
    const time = hero.time;
    const first = act(world, 'p', { type: 'throw', item: 0, target: cell });
    expect(first.ok && first.effects.some((e) => e.type === 'planted' && e.pos === cell && e.kind === 'sungrass')).toBe(true);
    expect(hero.time).toBe(time + 1);
    expect(hero.items[0]!.qty).toBe(1);
    expect(act(world, 'p', { type: 'throw', item: 1, target: cell }).ok).toBe(true);
    expect(floorAt(world, 1).plants?.filter((p) => p.pos === cell)).toEqual([{ pos: cell, kind: 'icecap' }]);
    expect(lyingAt(world, cell)).toHaveLength(0);
  });

  it('is stopped like any throw: by a creature in the way', () => {
    const { world, hero, cell } = solo();
    const beyond = cell + (cell - hero.pos);
    if (!canEnter(levelAt(world, 1), beyond)) return;
    floorAt(world, 1).mobs.push(createMob('#rat', 'rat', cell, 'hunting', floorAt(world, 1).now));
    hero.items = [createItem('seed.firebloom')];
    const done = act(world, 'p', { type: 'throw', item: 0, target: beyond });
    expect(done.ok && done.effects.some((e) => e.type === 'planted' && e.pos === cell)).toBe(true);
  });

  it('can be planted at the hero\'s feet (AC_PLANT): one seed, a turn', () => {
    const { world, hero } = solo();
    hero.items = [createItem('seed.sungrass', 2)];
    const time = hero.time;
    const done = act(world, 'p', { type: 'use', item: 0 });
    expect(done.ok && done.effects.some((e) => e.type === 'planted' && e.pos === hero.pos)).toBe(true);
    expect(hero.items[0]!.qty).toBe(1);
    expect(hero.time).toBe(time + 1);
    expect(floorAt(world, 1).plants?.some((p) => p.pos === hero.pos && p.kind === 'sungrass')).toBe(true);
    act(world, 'p', { type: 'use', item: 0 });
    expect(hero.items).toHaveLength(0);
  });
});
