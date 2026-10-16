import { describe, expect, it } from 'vitest';
import {
  act, type Action, addHero, canEnter, charAt, createItem, createMob, createWorld, fingerprint, floorAt, type Hero, type HeroClass, heroAttackDelay,
  heroSpeed, heroWeapon, levelAt, NEIGHBOURS8, T, type World,
} from '../src/index';
import { pacify } from './helpers';

/*
 * 1.9.2a's own timing: KindOfWeapon.doEquip (the old weapon's doUnequip(collect) then spendAndNext(1)), Armor.doEquip (the old armour's
 * time2equip = 2 / speed, then the new one's), Ring.doEquip (a ring asked off, then put on), EquipableItem.doDrop (doUnequip, then the
 * drop), and what MissileWeapon allows a huntress and a rogue: to hold the thrown ones in hand.
 */

function solo(heroClass: HeroClass = 'warrior', seed = 5): { world: World; hero: Hero; cell: number } {
  const world = pacify(createWorld(seed));
  const hero = addHero(world, { id: 'p', name: 'P', heroClass });
  hero.items = [];
  const level = levelAt(world, 1);
  const cell = NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, 1, c))!;
  return { world, hero, cell };
}

const ok = (world: World, action: Action): void => {
  const result = act(world, 'p', action);
  expect(result.ok, JSON.stringify(result)).toBe(true);
};
const lyingAt = (world: World, cell: number) => floorAt(world, 1).heaps.find((h) => h.pos === cell)?.items ?? [];

describe('equipping takes the time 1.9.2a gives it', () => {
  it('a weapon: a turn to put it away and one to take the other up; bare-handed, one', () => {
    const { world, hero } = solo();
    hero.items = [createItem('weapon.sword'), createItem('weapon.mace')];
    let time = hero.time;
    ok(world, { type: 'equip', item: 0 });
    expect(hero.time - time).toBe(2);
    expect(hero.items.at(-1)!.kind).toBe('weapon.shortSword');
    ok(world, { type: 'unequip' });
    time = hero.time;
    ok(world, { type: 'equip', item: 0 });
    expect(hero.time - time).toBe(1);
  });

  it('armour: two turns over the speed to take the old off, two to put the new on', () => {
    const { world, hero } = solo();
    hero.items = [createItem('armor.leather')];
    const time = hero.time;
    const first = 2 / heroSpeed(hero);
    ok(world, { type: 'equip', item: 0 });
    expect(hero.time - time).toBeCloseTo(first + 2 / heroSpeed(hero), 6);
    expect(hero.time - time).toBe(4);
    expect(hero.items.at(-1)!.kind).toBe('armor.cloth');
  });

  it('armour too heavy to carry well takes longer both ways, each as the armour then worn weighs', () => {
    const { world, hero } = solo();
    hero.str = 10;
    hero.items = [createItem('armor.plate')];
    const light = 2 / heroSpeed(hero);
    const time = hero.time;
    ok(world, { type: 'equip', item: 0 });
    const heavy = 2 / heroSpeed(hero);
    expect(heavy).toBeGreaterThan(light);
    expect(hero.time - time).toBeCloseTo(light + heavy, 6);
    // And off again: at the heavy armour's pace.
    const off = hero.time;
    ok(world, { type: 'unequip', slot: 'armor' });
    expect(hero.time - off).toBeCloseTo(heavy, 6);
    // Bare, only the new one's time.
    const bare = hero.time;
    ok(world, { type: 'equip', item: hero.items.length - 1 });
    expect(hero.time - bare).toBeCloseTo(heavy, 6);
  });

  it('a ring: a turn into a free place; with both full, one comes off first and the new takes its place', () => {
    const { world, hero } = solo();
    hero.items = [createItem('ring.haste'), createItem('ring.accuracy'), createItem('ring.mending')];
    let time = hero.time;
    ok(world, { type: 'equip', item: 0 });
    expect(hero.time - time).toBe(1);
    ok(world, { type: 'equip', item: 0 });
    // The third must say which ring comes off.
    expect(act(world, 'p', { type: 'equip', item: 0 })).toEqual({ ok: false, reason: 'choose the ring to take off' });
    expect(act(world, 'p', { type: 'equip', item: 0, replace: 2 as never }).ok).toBe(false);
    const [first, second] = hero.rings;
    time = hero.time;
    ok(world, { type: 'equip', item: 0, replace: 1 });
    expect(hero.time - time).toBe(2);
    expect(hero.rings.map((r) => r.kind)).toEqual([first!.kind, 'ring.mending']);
    expect(hero.items.at(-1)).toBe(second);
  });

  it('refuses to take off a cursed ring, whichever is cursed, and the other may go', () => {
    const { world, hero } = solo();
    hero.rings = [{ ...createItem('ring.haste', 1, -1), cursed: true }, createItem('ring.accuracy')];
    hero.items = [createItem('ring.mending')];
    const before = fingerprint(world);
    expect(act(world, 'p', { type: 'equip', item: 0, replace: 0 })).toEqual({ ok: false, reason: 'it is cursed: you cannot take it off' });
    expect(fingerprint(world)).toBe(before);
    ok(world, { type: 'equip', item: 0, replace: 1 });
    expect(hero.rings.map((r) => r.kind)).toEqual(['ring.haste', 'ring.mending']);
  });

  it('the old one comes to the end of the pack, and onto a stack of its kind', () => {
    const { world, hero } = solo('huntress');
    hero.weapon = createItem('missile.dart', 3);
    hero.items = [createItem('weapon.sword'), createItem('missile.dart', 4), createItem('food.ration')];
    ok(world, { type: 'equip', item: 0 });
    expect(hero.items.map((i) => [i.kind, i.qty])).toEqual([['missile.dart', 7], ['food.ration', 1]]);
  });

  it('taking a ring off with a full pack drops it at the feet, as a weapon does', () => {
    const { world, hero } = solo();
    hero.rings = [createItem('ring.haste')];
    while (hero.items.length < 20) hero.items.push(createItem('weapon.dagger', 1, 0));
    const ring = hero.rings[0]!;
    ok(world, { type: 'remove', ring: 0 });
    expect(hero.rings).toHaveLength(0);
    expect(lyingAt(world, hero.pos)).toContain(ring);
  });
});

describe('dropping what is worn', () => {
  it('takes it off first: the turn of that, and the drop', () => {
    const { world, hero } = solo();
    const sword = hero.weapon!;
    const armour = hero.armor!;
    let time = hero.time;
    ok(world, { type: 'drop', item: 'weapon' });
    expect(hero.time - time).toBe(2);
    expect(hero.weapon).toBeNull();
    time = hero.time;
    ok(world, { type: 'drop', item: 'armor' });
    expect(hero.time - time).toBe(3);
    expect(hero.armor).toBeNull();
    expect(lyingAt(world, hero.pos)).toEqual(expect.arrayContaining([sword, armour]));
  });

  it('a ring, either of two', () => {
    const { world, hero } = solo();
    hero.rings = [createItem('ring.haste'), createItem('ring.accuracy')];
    const [, second] = hero.rings;
    ok(world, { type: 'drop', item: 'ring1' });
    expect(hero.rings.map((r) => r.kind)).toEqual(['ring.haste']);
    expect(lyingAt(world, hero.pos)).toContain(second);
  });

  it('a cursed one stays, and nothing changes; junk is refused', () => {
    const { world, hero } = solo();
    hero.weapon = { ...createItem('weapon.mace', 1, -1), cursed: true };
    const before = fingerprint(world);
    expect(act(world, 'p', { type: 'drop', item: 'weapon' })).toEqual({ ok: false, reason: 'it is cursed: you cannot take it off' });
    expect(fingerprint(world)).toBe(before);
    expect(act(world, 'p', { type: 'drop', item: 'ring0' })).toEqual({ ok: false, reason: 'no such item' });
    expect(act(world, 'p', { type: 'drop', item: 'hat' as never }).ok).toBe(false);
  });
});

describe('plants take root as Level.plant has them', () => {
  const seedAt = (world: World, hero: Hero, cell: number, kind: 'seed.sungrass' | 'seed.icecap' = 'seed.sungrass'): void => {
    hero.items = [createItem(kind)];
    ok(world, { type: 'throw', item: 0, target: cell });
  };

  it('changes no terrain: bare floor, tall grass and the rest stay as they are', () => {
    const { world, hero, cell } = solo();
    const level = levelAt(world, 1);
    for (const terrain of [T.EMPTY, T.HIGH_GRASS, T.EMBERS, T.EMPTY_DECO, T.GRASS]) {
      level.map[cell] = terrain;
      seedAt(world, hero, cell);
      expect(level.map[cell]).toBe(terrain);
    }
  });

  it('a plant planted over another withers it; a warden sometimes gets a seed or a dewdrop from that', () => {
    const { world, hero, cell } = solo();
    hero.subclass = 'warden';
    let gifts = 0;
    for (let i = 0; i < 80; i++) {
      seedAt(world, hero, cell, i % 2 === 0 ? 'seed.sungrass' : 'seed.icecap');
      gifts = lyingAt(world, cell).length;
    }
    expect(floorAt(world, 1).plants?.filter((p) => p.pos === cell)).toHaveLength(1);
    expect(gifts).toBeGreaterThan(0);
    // Anyone else gets nothing.
    const other = solo('mage', 6);
    for (let i = 0; i < 40; i++) seedAt(other.world, other.hero, other.cell, i % 2 === 0 ? 'seed.sungrass' : 'seed.icecap');
    expect(lyingAt(other.world, other.cell)).toHaveLength(0);
  });
});

describe('thrown weapons in the hand', () => {
  it('only a huntress and a rogue may take them up', () => {
    for (const [heroClass, allowed] of [['huntress', true], ['rogue', true], ['warrior', false], ['mage', false]] as const) {
      const { world, hero } = solo(heroClass);
      hero.items = [createItem('missile.dart', 5), createItem('missile.boomerang')];
      expect(act(world, 'p', { type: 'equip', item: 0 }).ok).toBe(allowed);
      expect(act(world, 'p', { type: 'equip', item: allowed ? 0 : 1 }).ok).toBe(allowed);
    }
  });

  it('the whole stack goes into the hand, and a huntress is deft with it (two points off its strength)', () => {
    const { world, hero } = solo('huntress');
    hero.items = [createItem('missile.dart', 5)];
    ok(world, { type: 'equip', item: 0 });
    expect(hero.weapon).toMatchObject({ kind: 'missile.dart', qty: 5 });
    // (The dagger she had in hand is in the pack now, and the darts are not.)
    expect(hero.items.map((i) => i.kind)).toEqual(['weapon.dagger']);
    expect(heroWeapon(hero)).toMatchObject({ min: 1, max: 4, str: 8, accuracy: 1, delay: 1 });
    const rogue = solo('rogue');
    rogue.hero.weapon = createItem('missile.shuriken', 3);
    expect(heroWeapon(rogue.hero)).toMatchObject({ min: 2, max: 6, str: 13, delay: 0.5 });
    expect(heroAttackDelay(rogue.hero)).toBeCloseTo(0.5 * 1.2 ** (13 - rogue.hero.str), 5);
  });

  it('a blow that lands uses one up; the last one is let go of, and that takes a turn more', () => {
    const { world, hero, cell } = solo('huntress');
    hero.weapon = createItem('missile.dart', 2);
    const rat = createMob('#rat', 'rat', cell, 'hunting', floorAt(world, 1).now);
    rat.hp = rat.ht = 500;
    floorAt(world, 1).mobs.push(rat);
    const steps: Array<{ qty: number | null; dt: number }> = [];
    for (let i = 0; i < 200 && hero.weapon; i++) {
      const before = hero.time;
      const qty = hero.weapon.qty;
      ok(world, { type: 'attack', target: rat.id });
      if (!hero.weapon || hero.weapon.qty !== qty) steps.push({ qty: hero.weapon ? hero.weapon.qty : null, dt: hero.time - before });
      // Keep the rat from killing the hero in the meantime.
      hero.hp = hero.ht;
    }
    expect(steps).toEqual([{ qty: 1, dt: 1 }, { qty: null, dt: 2 }]);
    expect(hero.weapon).toBeNull();
    expect(hero.items.some((i) => i.kind === 'missile.dart')).toBe(false);
  });

  it('the boomerang is not used up by a blow', () => {
    const { world, hero, cell } = solo('huntress');
    hero.weapon = createItem('missile.boomerang');
    const rat = createMob('#rat', 'rat', cell, 'hunting', floorAt(world, 1).now);
    rat.hp = rat.ht = 500;
    floorAt(world, 1).mobs.push(rat);
    for (let i = 0; i < 30; i++) {
      ok(world, { type: 'attack', target: rat.id });
      hero.hp = hero.ht;
    }
    expect(hero.weapon?.kind).toBe('missile.boomerang');
  });

  it('a dart thrown from a stack in the hand leaves the rest there; the last one is taken off for the throw', () => {
    const { world, hero, cell } = solo('rogue');
    hero.weapon = createItem('missile.dart', 2);
    let time = hero.time;
    ok(world, { type: 'throw', item: 'weapon', target: cell });
    expect(hero.weapon).toMatchObject({ kind: 'missile.dart', qty: 1 });
    expect(hero.time - time).toBe(1);
    time = hero.time;
    ok(world, { type: 'throw', item: 'weapon', target: cell });
    expect(hero.weapon).toBeNull();
    expect(hero.time - time).toBe(2);
  });

  it('a boomerang thrown from the hand comes back into it, the unequipping given back', () => {
    const { world, hero, cell } = solo('huntress');
    hero.weapon = createItem('missile.boomerang');
    const boomerang = hero.weapon;
    const time = hero.time;
    const done = act(world, 'p', { type: 'throw', item: 'weapon', target: cell });
    expect(done.ok && done.effects.some((e) => e.type === 'thrown')).toBe(true);
    expect(hero.weapon).toBe(boomerang);
    expect(hero.items).not.toContain(boomerang);
    expect(hero.time - time).toBe(1);
    // And the same on replay.
    const a = solo('huntress');
    a.hero.weapon = createItem('missile.boomerang');
    const b = structuredClone(a.world);
    ok(a.world, { type: 'throw', item: 'weapon', target: a.cell });
    expect(act(b, 'p', { type: 'throw', item: 'weapon', target: a.cell }).ok).toBe(true);
    expect(fingerprint(b)).toBe(fingerprint(a.world));
  });
});
