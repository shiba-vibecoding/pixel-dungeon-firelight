import {
  act, addHero, createItem, createMob, createWorld, floorAt, type Hero, heroById, isIdentified, type Item, levelAt, levelKnown, NEIGHBOURS8, T, type World,
} from '@pd/core';
import { describe, expect, it } from 'vitest';
import { ARMOR_HITS_TO_KNOW, WAND_USAGES_TO_KNOW, WEAPON_HITS_TO_KNOW } from '../../core/src/ident';
import { familiarity, RING_TURNS_TO_KNOW } from '../src/familiar';

/*
 * The progress shown on an item not yet known is the counter the rules keep, and the thresholds are the rules': each is checked
 * by playing it out in the world (blows struck and taken, wand zaps, turns a ring is worn) until the item becomes known.
 */

function setup(seed = 5): { world: World; hero: Hero; to: number; from: number } {
  const world = createWorld(seed);
  floorAt(world, 1).mobs = [];
  floorAt(world, 1).respawn = 1e9;
  addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  const hero = heroById(world, 'p')!;
  const level = levelAt(world, 1);
  // Two floor cells side by side: the hero on one, whatever is to fight on the other.
  for (let to = 0; to < level.map.length; to++) {
    if (level.map[to] !== T.EMPTY) continue;
    const from = NEIGHBOURS8.map((n) => to + n).find((c) => level.map[c] === T.EMPTY);
    if (from === undefined) continue;
    Object.assign(hero, { pos: from, hp: 1e6, ht: 1e6 });
    return { world, hero, to, from };
  }
  throw new Error('no room');
}

const unknown = (item: Item): Item => Object.assign(item, { levelUnknown: true, curseUnknown: true });

describe('the progress toward knowing a weapon', () => {
  it('is blows struck, and the weapon is known after the core’s number of them', () => {
    const { world, hero, to } = setup();
    const sword = unknown(createItem('weapon.sword'));
    hero.weapon = sword;
    const foe = createMob('m1', 'rat', to, 'hunting', hero.time);
    foe.hp = foe.ht = 1e9;
    floorAt(world, 1).mobs.push(foe);
    expect(familiarity(world, hero, sword)).toEqual({ unit: 'hits', done: 0, of: WEAPON_HITS_TO_KNOW, inUse: true });
    let hits = 0;
    for (let i = 0; i < 400 && !levelKnown(sword); i++) {
      const result = act(world, 'p', { type: 'attack', target: foe.id });
      if (!result.ok) throw new Error(result.reason);
      if (result.effects.some((e) => e.type === 'attack' && e.attacker === 'p' && e.hit)) hits++;
      if (!levelKnown(sword)) expect(familiarity(world, hero, sword)!.done, `after ${hits} blows`).toBe(hits);
    }
    expect(hits).toBe(WEAPON_HITS_TO_KNOW);
    expect(WEAPON_HITS_TO_KNOW).toBe(20);
    expect(familiarity(world, hero, sword)).toBeNull();
  });

  it('is shown for a weapon in the pack too, but not counting until it is in the hand', () => {
    const { world, hero } = setup();
    const axe = unknown(createItem('weapon.mace'));
    hero.items = [axe];
    expect(familiarity(world, hero, axe)).toMatchObject({ done: 0, inUse: false });
  });
});

describe('the progress toward knowing an armour', () => {
  it('is blows taken, and the armour is known after the core’s number of them', () => {
    const { world, hero, to } = setup(7);
    const mail = unknown(createItem('armor.mail'));
    hero.armor = mail;
    const foe = createMob('m1', 'rat', to, 'hunting', hero.time);
    foe.enemy = 'p';
    foe.enemySeen = true;
    floorAt(world, 1).mobs.push(foe);
    expect(familiarity(world, hero, mail)).toEqual({ unit: 'taken', done: 0, of: ARMOR_HITS_TO_KNOW, inUse: true });
    let taken = 0;
    for (let i = 0; i < 2000 && !levelKnown(mail); i++) {
      const result = act(world, 'p', { type: 'wait' });
      if (!result.ok) throw new Error(result.reason);
      taken += result.effects.filter((e) => e.type === 'attack' && e.target === 'p' && e.hit).length;
      if (!levelKnown(mail)) expect(familiarity(world, hero, mail)!.done, `after ${taken} blows taken`).toBe(taken);
    }
    expect(taken).toBe(ARMOR_HITS_TO_KNOW);
    expect(ARMOR_HITS_TO_KNOW).toBe(10);
    expect(familiarity(world, hero, mail)).toBeNull();
  });
});

describe('the progress toward knowing a wand', () => {
  it('is zaps, and the wand is known through and through after the core’s number of them', () => {
    const { world, hero, to } = setup(9);
    const wand = unknown(createItem('wand.magicMissile'));
    wand.chargesUnknown = true;
    hero.items = [wand];
    expect(familiarity(world, hero, wand)).toEqual({ unit: 'zaps', done: 0, of: WAND_USAGES_TO_KNOW, inUse: true });
    let zaps = 0;
    while (!isIdentified(world, wand) && zaps < 100) {
      wand.charges = 3;
      const result = act(world, 'p', { type: 'zap', item: 0, target: to });
      if (!result.ok) throw new Error(result.reason);
      zaps++;
      if (!isIdentified(world, wand)) expect(familiarity(world, hero, wand)!.done, `after ${zaps} zaps`).toBe(zaps);
    }
    expect(zaps).toBe(WAND_USAGES_TO_KNOW);
    expect(WAND_USAGES_TO_KNOW).toBe(40);
    expect(familiarity(world, hero, wand)).toBeNull();
  });
});

describe('the progress toward knowing a ring', () => {
  it('is the turns worn, and the ring is known after the number this copy of the rules’ figure gives', () => {
    const { world, hero } = setup(11);
    const band = unknown(createItem('ring.haste'));
    hero.items = [band];
    expect(familiarity(world, hero, band)).toMatchObject({ unit: 'turns', done: 0, inUse: false });
    expect(act(world, 'p', { type: 'equip', item: 0 }).ok).toBe(true);
    expect(hero.rings).toContain(band);
    let turns = 0;
    while (!isIdentified(world, band) && turns < 1000) {
      const before = hero.time;
      act(world, 'p', { type: 'wait' });
      turns += hero.time - before;
      if (!isIdentified(world, band)) expect(familiarity(world, hero, band)).toMatchObject({ inUse: true, done: Math.floor(band.worn ?? 0) });
    }
    // The wear starts with the turn the ring is put on, a turn of its own.
    expect(Math.round(band.worn ?? 0)).toBeGreaterThanOrEqual(RING_TURNS_TO_KNOW);
    expect(Math.round(band.worn ?? 0)).toBeLessThan(RING_TURNS_TO_KNOW + 2);
    expect(RING_TURNS_TO_KNOW).toBe(200);
    expect(familiarity(world, hero, band)).toBeNull();
  });
});

describe('what the progress is not', () => {
  it('is nothing for what is known, what the hero does not carry, and what hides nothing', () => {
    const { world, hero } = setup();
    const known = createItem('weapon.sword');
    hero.weapon = known;
    expect(familiarity(world, hero, known)).toBeNull();
    const elsewhere = unknown(createItem('weapon.mace'));
    expect(familiarity(world, hero, elsewhere)).toBeNull();
    const potion = createItem('potion.healing');
    hero.items = [potion];
    expect(familiarity(world, hero, potion)).toBeNull();
  });

  it('gives away nothing of the item: the same for a plain thing and a strong one', () => {
    const { world, hero } = setup();
    const plain = unknown(createItem('weapon.sword', 1, 0));
    const strong = unknown(createItem('weapon.sword', 1, 3));
    strong.enchant = 'fire' as never;
    hero.items = [plain, strong];
    plain.familiarity = strong.familiarity = 6;
    expect(familiarity(world, hero, plain)).toEqual(familiarity(world, hero, strong));
    expect(Object.keys(familiarity(world, hero, plain)!).sort()).toEqual(['done', 'inUse', 'of', 'unit']);
  });
});
