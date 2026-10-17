import { addHero, createItem, createWorld, floorAt, type Hero, heroById, levelAt } from '@pd/core';
import { describe, expect, it } from 'vitest';
import { auraOf } from '../src/growth';
import { AuraCache, hasAura } from '../src/growthcache';

function hero(): Hero {
  const world = createWorld(5);
  floorAt(world, 1).mobs = [];
  levelAt(world, 1);
  addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  return heroById(world, 'p')!;
}

describe('the hero\'s aura is worked out only when his gear changes', () => {
  it('answers from memory while nothing moves, and agrees with auraOf', () => {
    const h = hero();
    const cache = new AuraCache();
    const first = cache.get(h);
    expect(first).toEqual(auraOf(h));
    expect(hasAura(first)).toBe(false);
    for (let i = 0; i < 100; i++) expect(cache.get(h)).toBe(first);
    expect(cache.looks).toBe(1);
  });

  it('looks again when a thing is upgraded in place, enchanted, or its level becomes known', () => {
    const h = hero();
    const cache = new AuraCache();
    cache.get(h);
    h.weapon!.level = 1;
    delete h.weapon!.levelUnknown;
    expect(cache.get(h).weapon).toBe(1);
    h.weapon!.level = 4;
    expect(cache.get(h).weapon).toBe(2);
    h.weapon!.enchant = 'fire';
    expect(cache.get(h).enchant).toBe('fire');
    h.weapon!.level = 10;
    expect(cache.get(h).weapon).toBe(4);
    expect(cache.looks).toBe(5);
    cache.get(h);
    expect(cache.looks).toBe(5);
  });

  it('shows nothing of a level that is still hidden, and the curse only once it shows', () => {
    const h = hero();
    const cache = new AuraCache();
    h.weapon!.level = 7;
    h.weapon!.levelUnknown = true;
    expect(cache.get(h).weapon).toBe(0);
    delete h.weapon!.levelUnknown;
    expect(cache.get(h).weapon).toBe(3);
    const ring = createItem('ring.haste');
    ring.level = -2;
    ring.cursed = true;
    h.rings.push(ring);
    expect(cache.get(h)).toEqual(auraOf(h));
    ring.curseUnknown = true;
    const hidden = cache.get(h);
    expect(hidden).toEqual(auraOf(h));
    delete ring.curseUnknown;
    expect(cache.get(h)).toEqual(auraOf(h));
    expect(cache.get(h).cursed).toBe(true);
    expect(hidden.cursed).toBe(false);
  });

  it('follows a new weapon, a changed armour glyph and another hero', () => {
    const h = hero();
    const cache = new AuraCache();
    cache.get(h);
    h.weapon = { ...h.weapon!, level: 3 };
    delete h.weapon.levelUnknown;
    expect(cache.get(h).weapon).toBe(2);
    h.armor = { ...h.armor!, level: 6, glyph: 'bounce' };
    delete h.armor.levelUnknown;
    const a = cache.get(h);
    expect(a.armor).toBe(3);
    expect(a.glyph).toBe('bounce');
    const other = { ...h, id: 'q', weapon: null, armor: null } as unknown as Hero;
    expect(cache.get(other)).toEqual(auraOf(other));
    expect(cache.get(other).weapon).toBe(0);
  });
});
