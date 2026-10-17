import {
  act, addHero, awareness, createItem, createWorld, type Effect, floorAt, type Hero, heroById, heroDefenseSkill, itemDef, type ItemKind, ITEMS, levelAt, maxExp, type World,
} from '@pd/core';
import { describe, expect, it } from 'vitest';
import {
  auraOf, catalog, chronicleOf, compare, descent, expPips, heft, knownHero, levelGain, MARK_ORDER, nowLight, passport, segments, shineTier,
  slotMarks, strengthEffects, strengthWanted,
} from '../src/growth';

/*
 * Design part 11: what the player sees of growth is what the rules did. Each figure is checked against the world itself —
 * a potion of experience drunk, a potion of strength drunk, the hero before and after.
 */

function setup(heroClass: 'warrior' | 'rogue' | 'mage' | 'huntress' = 'warrior', seed = 11): { world: World; hero: Hero } {
  const world = createWorld(seed);
  const floor = floorAt(world, 1);
  floor.mobs = [];
  floor.respawn = 1e9;
  levelAt(world, 1);
  addHero(world, { id: 'p', name: 'P', heroClass });
  return { world, hero: heroById(world, 'p')! };
}

function drink(world: World, hero: Hero, kind: 'potion.experience' | 'potion.strength'): Effect[] {
  hero.items.push(createItem(kind));
  const result = act(world, hero.id, { type: 'use', item: hero.items.length - 1 });
  expect(result.ok).toBe(true);
  return result.ok ? result.effects : [];
}

const KINDS_POTION = [
  'potion.healing', 'potion.experience', 'potion.toxicGas', 'potion.paralyticGas', 'potion.liquidFlame', 'potion.levitation', 'potion.strength',
  'potion.mindVision', 'potion.purity', 'potion.invisibility', 'potion.might', 'potion.frost',
] as const;

describe('growth: levels', () => {
  it('shows a level-up as the rules give it: five health, a point of accuracy and of evasion, a sharper eye until level 10', () => {
    const { world, hero } = setup();
    const before = { ht: hero.ht, attack: hero.attackSkill, defense: hero.defenseSkill, lvl: hero.lvl, aware: awareness(hero) };
    const effects = drink(world, hero, 'potion.experience');
    expect(effects.some((e) => e.type === 'levelUp')).toBe(true);
    const gain = levelGain(hero);
    expect(gain.lvl).toBe(before.lvl + 1);
    expect(hero.ht - before.ht).toBe(gain.ht);
    expect(hero.attackSkill - before.attack).toBe(gain.attack);
    expect(hero.defenseSkill - before.defense).toBe(gain.defense);
    expect(gain.awareness![0]).toBeCloseTo(before.aware, 9);
    expect(gain.awareness![1]).toBeCloseTo(awareness(hero), 9);
    expect(levelGain({ ...hero, lvl: 10 }).awareness).toBeNull();      // 1 + min(lvl, 9): level 10 sees no better than 9
    expect(awareness({ ...hero, lvl: 10 })).toBe(awareness({ ...hero, lvl: 9 }));
  });

  it('counts the experience bar in fives: level + 1 pips', () => {
    const { hero } = setup();
    hero.lvl = 4;
    hero.exp = 12;
    const pips = expPips(hero);
    expect(pips.pips * 5).toBe(maxExp(hero));
    expect(pips).toMatchObject({ pips: 5, full: 2 });
    expect(pips.part).toBeCloseTo(0.4, 9);
    expect(pips.share).toBeCloseTo(12 / 25, 9);
  });

  it('leaves a ring still unknown out of the passport\'s sums', () => {
    const { world, hero } = setup();
    const ring = createItem('ring.evasion', 1, 3);
    ring.levelUnknown = true;
    hero.rings = [ring];
    expect(heroDefenseSkill(knownHero(world, hero))).toBe(heroDefenseSkill({ ...hero, rings: [] }));
    delete ring.levelUnknown;
    world.known.push('ring.evasion');
    expect(heroDefenseSkill(knownHero(world, hero))).toBeGreaterThan(heroDefenseSkill({ ...hero, rings: [] }));
  });

  it('says how the hero grew since setting out', () => {
    const { world, hero } = setup('huntress');
    drink(world, hero, 'potion.experience');
    drink(world, hero, 'potion.strength');
    expect(passport(hero, { ht: 15, str: 10 })).toEqual({ lvl: [1, 2], ht: [15, 20], str: [10, 11], attack: [10, 11], defense: [5, 6] });
  });
});

describe('growth: strength', () => {
  it('turns 12 from red to plain when strength reaches 12', () => {
    const { world, hero } = setup('mage');
    const quarterstaff = createItem('weapon.quarterstaff');
    const mace = createItem('weapon.mace');
    hero.items.push(quarterstaff, mace);
    hero.str = 11;
    expect(heft(hero, quarterstaff)!.short).toBe(1);
    drink(world, hero, 'potion.strength');
    expect(hero.str).toBe(12);
    expect(nowLight(hero)).toEqual([quarterstaff]);
    expect(heft(hero, mace)).toEqual({ heft: 'heavy', short: 2 });
  });

  it('gives the penalties of the rules for a thing too heavy, and the bonus of spare strength', () => {
    const { hero } = setup('warrior');
    hero.str = 12;
    const battleAxe = createItem('weapon.battleAxe');          // 16: four short
    const fx = strengthEffects(hero, battleAxe)!;
    expect(fx.short).toBe(4);
    expect(fx.accuracy).toBeCloseTo(1 / 1.5 ** 4, 9);
    expect(fx.delay).toBeCloseTo(1.2 ** 4, 9);
    const dagger = createItem('weapon.dagger');                 // 10: two spare
    expect(strengthEffects(hero, dagger)).toEqual({ short: 0, spare: 2, bonusDamage: 2 });
    const plate = createItem('armor.plate');                    // 17
    const pfx = strengthEffects(hero, plate)!;
    expect(pfx.evasion).toBeCloseTo(1 / 1.5 ** 5, 9);
    expect(pfx.speed).toBeCloseTo(1.3 ** -5, 9);
    const { hero: huntress } = setup('huntress');
    huntress.str = 12;
    expect(strengthEffects(huntress, dagger)!.bonusDamage).toBeUndefined();
    const { hero: rogue } = setup('rogue');
    rogue.str = 12;
    expect(strengthEffects(rogue, createItem('armor.leather'))!.rogueEvasion).toBe(1);
  });

  it('shows the typical strength with «?» while the level is hidden', () => {
    const sword = createItem('weapon.sword', 1, 2);
    sword.levelUnknown = true;
    expect(strengthWanted(sword)).toEqual({ str: 14, known: false });
    delete sword.levelUnknown;
    expect(strengthWanted(sword)).toEqual({ str: 12, known: true });
    expect(strengthWanted(createItem('potion.healing'))).toBeNull();
  });
});

describe('growth: the marks of a slot', () => {
  it('shows a hidden level as «?», a known one signed, and one mark in its order', () => {
    const { world, hero } = setup();
    const sword = createItem('weapon.sword', 1, -2);
    sword.levelUnknown = true;
    sword.curseUnknown = true;
    sword.cursed = true;
    let marks = slotMarks(world, hero, sword, { fresh: true });
    expect(marks.level).toEqual({ text: '?', tone: 'unknown' });
    expect(marks.mark).toBe('new');                  // the curse is not known yet: nothing gives it away
    delete sword.levelUnknown;
    delete sword.curseUnknown;
    marks = slotMarks(world, hero, sword, { fresh: true });
    expect(marks.level).toEqual({ text: '−2', tone: 'down' });
    expect(marks.mark).toBe('cursed');
    expect(marks.marks).toEqual(['cursed', 'new']);
    expect([...marks.marks].sort((a, b) => MARK_ORDER.indexOf(a) - MARK_ORDER.indexOf(b))).toEqual(marks.marks);
    expect(slotMarks(world, hero, createItem('potion.healing', 3)).level).toBeNull();
  });

  it('marks the strength red only when the thing is too heavy', () => {
    const { world, hero } = setup('mage');
    expect(slotMarks(world, hero, createItem('weapon.mace')).strength).toEqual({ text: '14', heft: 'heavy', light: false });
    expect(slotMarks(world, hero, createItem('weapon.dagger')).strength).toEqual({ text: '10', heft: 'fits', light: false });
  });
});

describe('growth: comparing', () => {
  it('sets a weapon against the one in hand, typical figures while unknown', () => {
    const { hero } = setup('warrior');
    const sword = createItem('weapon.sword');
    sword.levelUnknown = true;
    const c = compare(hero, sword)!;
    expect(c.kind).toBe('weapon');
    expect(c.worn).toMatchObject({ known: true, str: 11 });
    expect(c.this).toMatchObject({ known: false, str: 14 });
    expect(c.heavier).toBe(3);
    expect(compare(hero, hero.weapon!)!.worn).toBeNull();
  });
});

describe('growth: the 3D shine', () => {
  it('steps the shine at +1, +3, +6 and +10, and shows nothing of a hidden level', () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10, 14].map((l) => shineTier(createItem('weapon.sword', 1, l)))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    const hidden = createItem('weapon.sword', 1, 7);
    hidden.levelUnknown = true;
    expect(shineTier(hidden)).toBe(0);
  });

  it('shows a known curse and the ring of the floor variant', () => {
    const { hero } = setup('warrior');
    hero.weapon = createItem('weapon.sword', 1, 4);
    hero.weapon.enchant = 'fire';
    hero.armor = createItem('armor.mail', 1, -1);
    hero.armor.cursed = true;
    const aura = auraOf(hero);
    expect(aura).toMatchObject({ weapon: 2, armor: 0, enchant: 'fire', cursed: true, ring: { weapon: 4, armor: 0 } });
    hero.armor.curseUnknown = true;
    expect(auraOf(hero).cursed).toBe(false);
  });
});

describe('growth: knowledge', () => {
  it('lists every potion with its look of the run and what is known', () => {
    const { world } = setup();
    world.known.push('potion.healing');
    const book = catalog(world, 'potion', KINDS_POTION);
    expect((Object.keys(ITEMS) as ItemKind[]).filter((k) => itemDef(k).category === 'potion').sort()).toEqual([...KINDS_POTION].sort());
    expect(book.entries).toHaveLength(12);
    expect(book.known).toBe(world.known.filter((k) => k.startsWith('potion.')).length);   // a warrior sets out knowing strength
    expect(book.entries.find((e) => e.kind === 'potion.healing')).toMatchObject({ known: true });
  });
});

describe('growth: the chronicle', () => {
  it('keeps the moments of the run from the effects the core sends', () => {
    const { world, hero } = setup();
    const at = { depth: 1, turn: 0 };
    const kept = drink(world, hero, 'potion.experience').map((e) => chronicleOf(e, 'p', at, [])).filter(Boolean);
    expect(kept).toEqual([{ kind: 'level', depth: 1, turn: 0, value: 2 }]);
    const sword = createItem('weapon.sword');
    const up = chronicleOf({ type: 'upgraded', hero: 'p', item: sword }, 'p', at, []);
    expect(up!.kind).toBe('firstUpgrade');
    expect(chronicleOf({ type: 'upgraded', hero: 'p', item: sword }, 'p', at, [up!])!.kind).toBe('upgrade');
    expect(chronicleOf({ type: 'upgraded', hero: 'q', item: sword }, 'p', at, [])).toBeNull();
    expect(chronicleOf({ type: 'bossSlain', depth: 5, kind: 'goo' }, 'p', at, [])).toMatchObject({ kind: 'boss', value: 'goo' });
    expect(descent(3, 900, [{ kind: 'depth', depth: 4, turn: 800, value: 4 }])).toBeNull();
    expect(descent(5, 900, [{ kind: 'depth', depth: 4, turn: 800, value: 4 }])).toMatchObject({ kind: 'depth', value: 5 });
  });
});

describe('growth: knowing in segments', () => {
  it('splits a count into at most ten whole segments', () => {
    expect(segments(7, 20)).toEqual({ n: 10, full: 3, per: 2 });
    expect(segments(10, 10)).toEqual({ n: 10, full: 10, per: 1 });
    expect(segments(17, 40)).toEqual({ n: 10, full: 4, per: 4 });
    expect(segments(150, 200)).toEqual({ n: 10, full: 7, per: 20 });
  });
});
