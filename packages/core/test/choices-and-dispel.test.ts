import { describe, expect, it } from 'vitest';
import {
  act, type Action, addHero, balanceTargets, canEnter, charAt, createItem, createMob, createWorld, floorAt, type Hero, heroById, type ItemKind,
  kitTargets, levelAt, NEIGHBOURS8, type World,
} from '../src/index';
import { pacify } from './helpers';

/*
 * What the original asks the player (WndBag's selectors: the item a known scroll is read on, the armour a kit is applied to, the
 * weapon a weightstone balances), never choosing for them; and Invisibility.dispel, which gives an invisible hero away only
 * when an enemy is in sight (melee blows, wands, the warrior's leap and scrolls; not throwing or drinking).
 */

function setup(heroClass: 'warrior' | 'mage' = 'warrior'): { world: World; hero: Hero } {
  const world = pacify(createWorld(8));
  const hero = addHero(world, { id: 'p', name: 'P', heroClass });
  Object.assign(hero, { hp: 300, ht: 300 });
  return { world, hero };
}

/** A sleeping rat in the hero's sight (asleep, it is still an enemy in sight), by the hero. */
function rat(world: World, hero: Hero): void {
  const level = levelAt(world, 1);
  const floor = floorAt(world, 1);
  const pos = NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, 1, c))!;
  const mob = createMob('#rat', 'rat', pos, 'sleeping', floor.now);
  Object.assign(mob, { hp: 100000, ht: 100000 });
  floor.mobs.push(mob);
}

const slot = (hero: Hero, kind: ItemKind): number => hero.items.findIndex((item) => item.kind === kind);

describe('a known scroll read on an item the player did not choose', () => {
  for (const kind of ['scroll.upgrade', 'scroll.enchantment', 'scroll.identify'] as const) {
    it(`is refused for ${kind}: the choice is always the player's, and the scroll stays in the pack`, () => {
      const { world, hero } = setup();
      hero.items.unshift(createItem(kind, 2));
      hero.items.push(createItem('potion.frost'));
      world.known = world.known.filter((k) => k !== 'potion.frost');
      world.known.push(kind);
      const before = JSON.stringify([hero.weapon, hero.armor, hero.items]);
      expect(act(world, 'p', { type: 'use', item: 0 })).toEqual({ ok: false, reason: 'choose an item first' });
      expect(JSON.stringify([hero.weapon, hero.armor, hero.items])).toBe(before);
      expect(hero.pendingScroll).toBeUndefined();
    });
  }
});

describe('the armour kit', () => {
  function kit(): { world: World; hero: Hero } {
    const { world, hero } = setup();
    hero.armor = { ...createItem('armor.mail', 1, 2), glyph: 'bounce' };
    hero.items = [createItem('kit.armor'), createItem('weapon.sword'), { ...createItem('armor.scale', 1, 1), cursed: true }];
    return { world, hero };
  }

  it('offers every armour held, the worn one too, and not the weapons', () => {
    const { hero } = kit();
    expect(kitTargets(hero)).toEqual(['armor', 2]);
  });

  it('is applied to the armour chosen: the one in the pack becomes class armour and the one worn stays as it is', () => {
    const { world, hero } = kit();
    const time = hero.time;
    expect(act(world, 'p', { type: 'use', item: 0, on: 2 }).ok).toBe(true);
    expect(hero.armor).toMatchObject({ kind: 'armor.mail', level: 2 });
    expect(hero.items.map((item) => item.kind)).toEqual(['weapon.sword', 'armor.warrior']);
    expect(hero.items[1]).toMatchObject({ base: 'armor.scale', level: 1, cursed: true });
    expect(hero.time).toBe(time + 2);
  });

  it('is applied to the armour worn when that is chosen', () => {
    const { world, hero } = kit();
    expect(act(world, 'p', { type: 'use', item: 0, on: 'armor' }).ok).toBe(true);
    expect(hero.armor).toMatchObject({ kind: 'armor.warrior', base: 'armor.mail', level: 2, glyph: 'bounce' });
    expect(slot(hero, 'armor.scale')).toBe(1);
  });

  it('is never applied without a choice, to what is no armour, or to class armour', () => {
    const { world, hero } = kit();
    hero.items.push(createItem('armor.warrior'));
    const before = JSON.stringify(hero);
    expect(act(world, 'p', { type: 'use', item: 0 })).toEqual({ ok: false, reason: 'choose an item first' });
    expect(act(world, 'p', { type: 'use', item: 0, on: 1 })).toEqual({ ok: false, reason: 'a class armour cannot be made of that' });
    expect(act(world, 'p', { type: 'use', item: 0, on: 'weapon' })).toEqual({ ok: false, reason: 'a class armour cannot be made of that' });
    expect(act(world, 'p', { type: 'use', item: 0, on: 3 })).toEqual({ ok: false, reason: 'a class armour cannot be made of that' });
    expect(act(world, 'p', { type: 'use', item: 0, on: 40 })).toEqual({ ok: false, reason: 'no such item' });
    expect(JSON.stringify(hero)).toBe(before);
  });
});

describe('the weightstone', () => {
  it('offers the melee weapons held, the one in hand too, and not the pickaxe or the armour', () => {
    const { hero } = setup();
    hero.items = [createItem('weightstone'), createItem('weapon.mace'), createItem('weapon.pickaxe'), createItem('armor.scale')];
    expect(balanceTargets(hero)).toEqual(['weapon', 1]);
  });

  it('balances the weapon chosen, in the pack or in hand, and refuses the pickaxe', () => {
    const { world, hero } = setup();
    hero.items = [createItem('weightstone', 3), createItem('weapon.mace'), createItem('weapon.pickaxe')];
    expect(act(world, 'p', { type: 'balance', item: 0, weapon: 1, imbue: 'speed' }).ok).toBe(true);
    expect(hero.items[1]).toMatchObject({ imbue: 'speed' });
    expect(hero.weapon!.imbue).toBeUndefined();
    expect(act(world, 'p', { type: 'balance', item: 0, imbue: 'accuracy' }).ok).toBe(true);
    expect(hero.weapon).toMatchObject({ imbue: 'accuracy' });
    expect(act(world, 'p', { type: 'balance', item: 0, weapon: 2, imbue: 'speed' })).toEqual({ ok: false, reason: 'choose a melee weapon' });
  });
});

describe('Invisibility.dispel', () => {
  /** A hero invisible for a while, and the same with an enemy asleep in sight. */
  const ready = (enemy: boolean, heroClass: 'warrior' | 'mage' = 'warrior'): { world: World; hero: Hero } => {
    const made = setup(heroClass);
    made.hero.invisible = 15;
    if (enemy) rat(made.world, made.hero);
    return made;
  };
  const scrolls: ItemKind[] = [
    'scroll.mapping', 'scroll.teleportation', 'scroll.recharging', 'scroll.removeCurse', 'scroll.lullaby', 'scroll.terror', 'scroll.challenge',
    'scroll.mirrorImage', 'scroll.psionicBlast',
  ];

  for (const kind of scrolls) {
    it(`is called by reading ${kind}: the invisibility ends with an enemy in sight, and lasts without`, () => {
      for (const enemy of [false, true]) {
        const { world, hero } = ready(enemy);
        hero.items.unshift(createItem(kind));
        expect(act(world, 'p', { type: 'use', item: 0 }).ok).toBe(true);
        if (enemy) expect(hero.invisible, kind).toBe(0);
        else expect(hero.invisible, kind).toBeGreaterThan(0);
      }
    });
  }

  it('is called by the scroll of wipe-out (the sleeping rat is no longer there to see)', () => {
    const { world, hero } = ready(true);
    hero.items.unshift(createItem('wipeOut'));
    expect(act(world, 'p', { type: 'use', item: 0 }).ok).toBe(true);
    expect(hero.invisible).toBe(0);
    const calm = ready(false);
    calm.hero.items.unshift(createItem('wipeOut'));
    act(calm.world, 'p', { type: 'use', item: 0 });
    expect(calm.hero.invisible).toBeGreaterThan(0);
  });

  for (const kind of ['scroll.upgrade', 'scroll.enchantment'] as const) {
    it(`is called when ${kind} is read on the item chosen, not by reading it and not by giving it up`, () => {
      // Known: asked first, so it is the choice that reads.
      const known = ready(true);
      known.world.known.push(kind);
      known.hero.items.unshift(createItem(kind, 2));
      expect(act(known.world, 'p', { type: 'use', item: 0, on: 'armor' }).ok).toBe(true);
      expect(known.hero.invisible).toBe(0);
      // Unknown: the read learns it and waits; only the item chosen reads it.
      const world = ready(true);
      world.hero.items.unshift(createItem(kind, 2));
      expect(act(world.world, 'p', { type: 'use', item: 0 }).ok).toBe(true);
      expect(world.hero.invisible).toBeGreaterThan(0);
      expect(act(world.world, 'p', { type: 'scrollTarget', on: 'armor' }).ok).toBe(true);
      expect(world.hero.invisible).toBe(0);
      // Given up, it never read.
      const given = ready(true);
      given.hero.items.unshift(createItem(kind, 2));
      act(given.world, 'p', { type: 'use', item: 0 });
      expect(act(given.world, 'p', { type: 'scrollCancel' }).ok).toBe(true);
      expect(given.hero.invisible).toBeGreaterThan(0);
    });
  }

  it('is not called by drinking or by throwing, with an enemy in sight', () => {
    const { world, hero } = ready(true, 'mage');
    hero.items = [createItem('potion.healing'), createItem('missile.dart', 3), createItem('wand.magicMissile')];
    const mob = floorAt(world, 1).mobs[0]!;
    expect(act(world, 'p', { type: 'use', item: 0 }).ok).toBe(true);
    expect(hero.invisible).toBeGreaterThan(0);
    expect(act(world, 'p', { type: 'throw', item: 0, target: mob.pos }).ok).toBe(true);
    expect(hero.invisible).toBeGreaterThan(0);
  });

  it('is called by a wand that fires, with an enemy in sight only', () => {
    for (const enemy of [false, true]) {
      const { world, hero } = ready(enemy, 'mage');
      const target = hero.pos + 1;
      const wand = slotWand(hero);
      expect(act(world, 'p', { type: 'zap', item: wand, target }).ok).toBe(true);
      if (enemy) expect(hero.invisible).toBe(0);
      else expect(hero.invisible).toBeGreaterThan(0);
    }
  });

  it('is called by a blow in melee', () => {
    const { world, hero } = ready(true);
    const mob = floorAt(world, 1).mobs[0]!;
    hero.attackSkill = 100000;
    expect(act(world, 'p', { type: 'attack', target: mob.id }).ok).toBe(true);
    expect(hero.invisible).toBe(0);
  });

  it("is called by the warrior's leap, with an enemy in sight only", () => {
    for (const enemy of [false, true]) {
      const { world, hero } = ready(enemy);
      hero.armor = { ...createItem('armor.warrior') };
      const level = levelAt(world, 1);
      const to = NEIGHBOURS8.map((n) => hero.pos + n * 2).find((c) => canEnter(level, c) && !charAt(world, 1, c))!;
      const result = act(world, 'p', { type: 'special', target: to } as Action);
      expect(result.ok).toBe(true);
      if (enemy) expect(hero.invisible).toBe(0);
      else expect(hero.invisible).toBeGreaterThan(0);
    }
  });
});

function slotWand(hero: Hero): number {
  return hero.items.findIndex((item) => item.kind.startsWith('wand.'));
}
