import { describe, expect, it } from 'vitest';
import {
  act, addHero, arenaScore, buyPrice, canEnter, challengeMultiplier, CHALLENGES, charAt, createItem, createMob, createWorld, DARKNESS,
  DARKNESS_VIEW_DISTANCE, dailyRules, deepestDepth, dungeonScore, floorAt, type Hero, heroById, HUNGRY, ItemGenerator, itemDef, ITEMS, type ItemKind,
  layBones, leaveBones, levelAt, MAX_VIEW_DISTANCE, mobStats, NEIGHBOURS8, NO_HEALING, NO_HERBALISM, NO_SCROLLS, Rng, runOutcome, STARVING, SWARM_INTELLIGENCE, T,
  trapAt, type TrapKind, type World, isShopkeeper,
} from '@pd/core';
import { GUIDE_EN } from '../src/i18n-guide';
import { GUIDE_RU } from '../src/i18n-guide.ru';
import { SAFETY_EN } from '../src/i18n-safety';
import { SAFETY_RU } from '../src/i18n-safety.ru';

/*
 * The guide's texts (i18n-guide.ts, .ru.ts) state rules and numbers; this checks that the two languages have the
 * same shape, and that what is stated is what the core does.
 */

const both = [['en', GUIDE_EN], ['ru', GUIDE_RU]] as const;
const text = (guide: typeof GUIDE_EN, id: string): string => guide.entries.find((e) => e.id === id)!.text;
/** The number as the language writes it: Russian has a decimal comma. */
const num = (lang: 'en' | 'ru', n: string): string => (lang === 'ru' ? n.replace('.', ',') : n);

/** A world with a lone warrior, the monsters gone. */
function setup(seed = 5) {
  const world = createWorld(seed);
  for (let depth = 1; depth <= 4; depth++) {
    const floor = floorAt(world, depth);
    floor.mobs = [];
    floor.respawn = 1e9;
  }
  addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  const hero = heroById(world, 'p')!;
  const level = levelAt(world, 1);
  return { world, hero, level, floor: floorAt(world, 1) };
}

/** A hero standing next to a cell that can be walked onto: the hero is put beside it. */
function beside(world: World, hero: Hero): { from: number; to: number } {
  const level = levelAt(world, hero.depth);
  for (let to = 0; to < level.map.length; to++) {
    if (level.map[to] !== T.EMPTY || charAt(world, hero.depth, to)) continue;
    const from = NEIGHBOURS8.map((n) => to + n).find((c) => canEnter(level, c) && level.map[c] === T.EMPTY && !charAt(world, hero.depth, c));
    if (from !== undefined) return { from, to };
  }
  throw new Error('no two cells side by side');
}

describe('the guide texts', () => {
  it('have the same shape in both languages and no empty string', () => {
    const shape = (value: unknown): unknown =>
      Array.isArray(value) ? value.map(shape) : typeof value === 'function' ? 'fn' : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]).map(([k, v]) => [k, k === 'id' ? 'id' : v])) : typeof value;
    expect(shape(GUIDE_RU)).toEqual(shape(GUIDE_EN));
    expect(Object.keys(GUIDE_RU)).toEqual(Object.keys(GUIDE_EN));
    expect(GUIDE_RU.entries.map((e) => e.id)).toEqual(GUIDE_EN.entries.map((e) => e.id));
    expect(GUIDE_RU.trapColours).toHaveLength(GUIDE_EN.trapColours.length);
    for (const [lang, guide] of both) {
      const strings: string[] = [guide.tab, guide.intro, guide.count(13, 2), guide.trapColourTitle, guide.trapColourText, guide.trapColourNote];
      for (const [colour, means] of guide.trapColours) strings.push(colour, means);
      for (const entry of guide.entries) strings.push(entry.id, entry.title, entry.text);
      for (const s of strings) expect(s.trim().length, `${lang}: ${s}`).toBeGreaterThan(0);
      expect(guide.count(13, 2)).toContain('13');
      expect(guide.count(13, 2)).toContain('2');
    }
  });

  it('have unique entry ids, the planned ones in the planned order', () => {
    const ids = GUIDE_EN.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 10)).toEqual(['hunger', 'ankh', 'curses', 'uncurse', 'haggler', 'mimics', 'well', 'seeds', 'score', 'challenges']);
    expect(ids.length).toBeLessThanOrEqual(13);
    for (const [, guide] of both) for (const entry of guide.entries) expect(entry.text.split(/[.!?]\s/).length, entry.id).toBeLessThanOrEqual(9);
  });
});

describe('the trap colours', () => {
  // PD 1.9 draws every trap as the same plate of studs, the studs coloured by kind (the tiles' trap row, ids 17 to 39):
  // alarm red, fire orange, paralytic gas yellow, toxic gas green, lightning teal, poison violet, summoning white,
  // gripping grey, and black once it has gone off. The legend's rows run in the order red ... black.
  const COLOURS = ['red', 'orange', 'yellow', 'green', 'teal', 'violet', 'white', 'grey', 'black'];
  const COLOUR_OF: Record<TrapKind, string> = {
    alarm: 'red', fire: 'orange', paralytic: 'yellow', toxic: 'green', lightning: 'teal', poison: 'violet', summoning: 'white', gripping: 'grey',
  };

  it('classify every trap the core has by its colour, in both languages', () => {
    const kinds = new Set<TrapKind>();
    for (const terrain of Object.values(T)) {
      const kind = trapAt(terrain);
      if (kind) kinds.add(kind);
    }
    expect([...kinds].sort()).toEqual(Object.keys(COLOUR_OF).sort());
    for (const [lang, guide, safety] of [['en', GUIDE_EN, SAFETY_EN], ['ru', GUIDE_RU, SAFETY_RU]] as const) {
      expect(guide.trapColours, lang).toHaveLength(COLOURS.length);
      for (const kind of kinds) {
        const name = safety.trap[kind][0].toLowerCase();
        const rows = guide.trapColours.flatMap(([, means], i) => (means.toLowerCase().includes(name) ? [COLOURS[i]!] : []));
        expect(rows, `${lang}: ${name}`).toEqual([COLOUR_OF[kind]]);
      }
      // The black row names no trap: a trap that has gone off is harmless.
      const black = guide.trapColours[8]![1].toLowerCase();
      for (const kind of kinds) expect(black.includes(safety.trap[kind][0].toLowerCase())).toBe(false);
    }
  });

  it('are the colours of the plates in the tiles sheet', () => {
    // The trap tiles' terrain ids, as the tiles sheets lay them out (tiles0..4.png: 16 tiles to a row, the id is the index).
    expect(T.TOXIC_TRAP).toBe(17);
    expect(T.FIRE_TRAP).toBe(19);
    expect(T.PARALYTIC_TRAP).toBe(21);
    expect(T.INACTIVE_TRAP).toBe(23);
    expect(T.POISON_TRAP).toBe(27);
    expect(T.ALARM_TRAP).toBe(30);
    expect(T.LIGHTNING_TRAP).toBe(32);
    expect(T.GRIPPING_TRAP).toBe(37);
    expect(T.SUMMONING_TRAP).toBe(39);
  });
});

describe('hunger', () => {
  it('is hungry at 260 and starving at 360, and food takes away what the guide says', () => {
    expect([HUNGRY, STARVING]).toEqual([260, 360]);
    const energy = (kind: ItemKind): number | undefined => itemDef(kind).energy;
    expect(energy('food.ration')).toBe(260);
    expect(energy('food.pasty')).toBe(360);
    for (const kind of ['food.meat', 'food.steak', 'food.carpaccio', 'food.overpriced'] as const) expect(energy(kind), kind).toBe(100);
    for (const [lang, guide] of both) {
      const hunger = text(guide, 'hunger');
      for (const n of ['260', '360', '100']) expect(hunger, lang).toContain(n);
      expect(hunger, lang).toContain(num(lang, '1.2'));
    }
  });

  it('rises one a turn, a rogue’s one in 1.2 turns, and starving stops healing', () => {
    const { world, hero } = setup();
    for (let i = 0; i < 100; i++) act(world, 'p', { type: 'wait' });
    expect(hero.hunger).toBe(100);
    const rogue = setup(6);
    addHero(rogue.world, { id: 'r', name: 'R', heroClass: 'rogue' });
    const r = heroById(rogue.world, 'r')!;
    r.pos = rogue.hero.pos;
    for (let i = 0; i < 120; i++) act(rogue.world, 'r', { type: 'wait' });
    expect(r.hunger).toBe(100);
    const starving = setup(7);
    starving.hero.hunger = STARVING;
    starving.hero.hp = 3;
    for (let i = 0; i < 60 && starving.hero.hp > 0; i++) act(starving.world, 'p', { type: 'wait' });
    expect(starving.hero.hp).toBeLessThanOrEqual(3);
  });

  it('every floor but the boss floors holds one more ration or pasty', () => {
    const world = createWorld(11);
    for (let depth = 1; depth <= 5; depth++) {
      levelAt(world, depth);
      const food = floorAt(world, depth).heaps.flatMap((h) => h.items).filter((i) => itemDef(i.kind).category === 'food').length;
      if (depth < 5) expect(food, `depth ${depth}`).toBeGreaterThanOrEqual(1);
      else expect(food, 'a boss floor').toBe(0);
    }
  });
});

describe('the ankh', () => {
  it('raises the hero at the entrance, whole, and takes the pack, the gold, the progress and itself', () => {
    const { world, hero, level } = setup();
    hero.items = [createItem('ankh'), createItem('potion.healing'), createItem('key.iron')];
    hero.gold = 120;
    hero.exp = 3;
    hero.lvl = 2;
    hero.hp = 1;
    hero.poison = 50;
    const weapon = hero.weapon;
    hero.pos = beside(world, hero).from;
    expect(hero.pos).not.toBe(level.entrance);
    act(world, 'p', { type: 'wait' });
    expect(hero.hp).toBe(hero.ht);
    expect(hero.poison).toBe(0);
    expect(hero.pos).toBe(level.entrance);
    expect(hero.gold).toBe(0);
    expect(hero.exp).toBe(0);
    expect(hero.lvl).toBe(2);
    expect(hero.weapon).toBe(weapon);
    expect(hero.items.map((i) => i.kind)).toEqual(['key.iron']);
    for (const [, guide] of both) expect(text(guide, 'ankh')).toContain('500');
  });

  it('is sold in the shops, at the price the guide gives', () => {
    expect(itemDef('ankh').category).toBe('ankh');
    const ankh = createItem('ankh');
    expect([6, 11, 16, 21].map((depth) => buyPrice(ankh, depth, true))).toEqual([500, 750, 1000, 1250]);
    for (const [lang, guide] of both) for (const n of ['500', '750', '1000']) expect(text(guide, 'ankh'), lang).toContain(n);
  });
});

describe('shops', () => {
  it('pay full value, ask 5 × value × (depth ÷ 5 + 1), and a Ring of Haggler halves it', () => {
    const ration = createItem('food.ration');
    expect([6, 11, 16, 21].map((depth) => buyPrice(ration, depth, true))).toEqual([100, 150, 200, 250]);
    expect([6, 11, 16, 21].map((depth) => buyPrice(ration, depth, true, true))).toEqual([50, 75, 100, 125]);
    for (const [lang, guide] of both) {
      const shops = text(guide, 'haggler');
      for (const n of ['×10', '×15', '×20', '×25']) expect(shops, lang).toContain(n);
    }
  });

  it('stock what the guide lists', () => {
    const world = createWorld(3);
    for (let depth = 1; depth <= 6; depth++) levelAt(world, depth);
    const wares = floorAt(world, 6).heaps.filter((h) => h.kind === 'forSale').flatMap((h) => h.items.map((i) => i.kind));
    for (const kind of ['potion.healing', 'scroll.removeCurse', 'scroll.identify', 'scroll.mapping', 'ankh'] as const) expect(wares, kind).toContain(kind);
    expect(wares.filter((kind) => kind === 'food.overpriced')).toHaveLength(2);
    expect(floorAt(world, 6).mobs.some(isShopkeeper)).toBe(true);
  });

  it('lets a thief carry the ring, and nothing else drops it', () => {
    expect(itemDef('ring.haggler').category).toBe('ring');
    const generator = new ItemGenerator(Rng.seeded(1), 5);
    for (let i = 0; i < 300; i++) expect(generator.of('ring').kind).not.toBe('ring.haggler');
  });
});

describe('curses', () => {
  it('mark about a fifth of the weapons and armour and three rings in ten, never wands', () => {
    const generator = new ItemGenerator(Rng.seeded(99), 5);
    const share = (category: 'armor' | 'ring' | 'wand', n: number): number => {
      let cursed = 0;
      for (let i = 0; i < n; i++) if (generator.of(category).cursed) cursed++;
      return cursed / n;
    };
    expect(share('armor', 4000)).toBeGreaterThan(0.17);
    expect(share('armor', 4000)).toBeLessThan(0.23);
    expect(share('ring', 4000)).toBeGreaterThan(0.27);
    expect(share('ring', 4000)).toBeLessThan(0.33);
    expect(share('wand', 1000)).toBe(0);
    const weapons = (): number => {
      let cursed = 0;
      let melee = 0;
      for (let i = 0; i < 6000; i++) {
        const item = generator.of('weapon');
        if (itemDef(item.kind).category === 'weapon' && !item.kind.startsWith('missile.')) {
          melee++;
          if (item.cursed) cursed++;
        }
      }
      return cursed / melee;
    };
    expect(weapons()).toBeGreaterThan(0.17);
    expect(weapons()).toBeLessThan(0.23);
  });

  it('bind what is put on: a cursed weapon, armour or ring will not come off', () => {
    const { world, hero } = setup();
    hero.items = [{ ...createItem('weapon.sword'), cursed: true, curseUnknown: true }, { ...createItem('ring.power', 1, -1), cursed: true }];
    expect(act(world, 'p', { type: 'equip', item: 0 }).ok).toBe(true);
    expect(hero.weapon!.kind).toBe('weapon.sword');
    expect(act(world, 'p', { type: 'unequip' })).toEqual({ ok: false, reason: 'it is cursed: you cannot take it off' });
    expect(act(world, 'p', { type: 'equip', item: hero.items.findIndex((i) => i.kind === 'ring.power') }).ok).toBe(true);
    const ring = hero.rings.findIndex((r) => r.kind === 'ring.power');
    expect(ring).toBeGreaterThanOrEqual(0);
    expect(act(world, 'p', { type: 'remove', ring })).toEqual({ ok: false, reason: 'it is cursed: you cannot take it off' });
  });

  it('are lifted by Remove Curse (all, and weakness), and by Upgrade and Enchantment on the one item', () => {
    const { world, hero } = setup(8);
    const curse = (kind: ItemKind): ReturnType<typeof createItem> => ({ ...createItem(kind, 1, -1), cursed: true });
    hero.weapon = curse('weapon.sword');
    hero.items = [curse('armor.mail'), createItem('scroll.removeCurse')];
    hero.weakened = 20;
    expect(act(world, 'p', { type: 'use', item: 1 }).ok).toBe(true);
    expect(hero.weapon.cursed).toBeFalsy();
    expect(hero.items[0]!.cursed).toBeFalsy();
    expect(hero.weakened).toBe(0);
    // The one item a scroll is read on.
    for (const [scroll, level] of [['scroll.upgrade', 0], ['scroll.enchantment', -1]] as const) {
      hero.items = [curse('armor.mail'), curse('armor.leather'), createItem(scroll)];
      if (!world.known.includes(scroll)) world.known.push(scroll);
      expect(act(world, 'p', { type: 'use', item: 2, on: 0 }).ok, scroll).toBe(true);
      expect(hero.items[0]!.cursed, scroll).toBeFalsy();
      expect(hero.items[0]!.level, scroll).toBe(level);
      expect(hero.items[1]!.cursed, scroll).toBe(true);
    }
  });

  it('come back with a fallen hero’s bones', () => {
    const { hero, level, floor } = setup(9);
    layBones(leaveBones(hero, 0, 0), level, floor, Rng.seeded(1));
    const skeleton = floor.heaps.find((h) => h.kind === 'skeleton');
    expect(skeleton?.items[0]?.cursed).toBe(true);
  });
});

describe('mimics', () => {
  it('are none on depth 1, and about a fifth of the chests of the ordinary rooms below', () => {
    let first = 0;
    let chests = 0;
    let mimics = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const world = createWorld(seed * 13);
      for (const depth of [1, 2, 3]) {
        levelAt(world, depth);
        for (const heap of floorAt(world, depth).heaps) {
          if (depth === 1 && heap.kind === 'mimic') first++;
          if (depth > 1 && heap.kind === 'chest') chests++;
          if (depth > 1 && heap.kind === 'mimic') mimics++;
        }
      }
    }
    expect(first).toBe(0);
    // The treasuries' and vaults' chests are among the chests counted here, so the share comes out a little under a fifth.
    expect(mimics / (chests + mimics)).toBeGreaterThan(0.07);
    expect(mimics / (chests + mimics)).toBeLessThan(0.32);
  });

  it('spring when opened, with (3 + depth) × 4 health and the chest’s treasure', () => {
    const { world, hero, floor } = setup(10);
    const { from, to } = beside(world, hero);
    hero.pos = from;
    floor.heaps.push({ pos: to, kind: 'mimic', items: [createItem('potion.healing')] });
    const result = act(world, 'p', { type: 'open', cell: to });
    expect(result.ok && result.effects.some((e) => e.type === 'mimic')).toBe(true);
    const mimic = floor.mobs.find((m) => m.kind === 'mimic')!;
    expect(mimic.ht).toBe((3 + 1) * 4);
    expect(mimic.loot?.[0]?.kind).toBe('potion.healing');
    expect(mobStats({ ...mimic, level: 5 }).ht).toBe(32);
    for (const [, guide] of both) expect(text(guide, 'mimics')).toContain('32');
  });
});

describe('magic wells', () => {
  it('hide the dew vial on one of the first three depths', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const world = createWorld(seed);
      for (const depth of [1, 2, 3]) levelAt(world, depth);
      const vials = [1, 2, 3].flatMap((d) => floorAt(world, d).heaps.flatMap((h) => h.items.filter((i) => i.kind === 'vial')));
      expect(vials, `seed ${seed}`).toHaveLength(1);
    }
  });

  /** A well of `water` on a cell next to the hero. */
  function well(water: 'health' | 'awareness' | 'transmutation') {
    const s = setup(12);
    const { from, to } = beside(s.world, s.hero);
    s.hero.pos = from;
    s.level.map[to] = T.WELL;
    s.level.wells.push({ pos: to, water });
    return { ...s, to };
  }

  it('the Well of Health heals fully, cures and feeds, once', () => {
    const { world, hero, level, to } = well('health');
    Object.assign(hero, { hp: 1, poison: 9, burning: 4, weakened: 5, crippled: 5, hunger: 300 });
    expect(act(world, 'p', { type: 'move', to }).ok).toBe(true);
    expect(hero).toMatchObject({ hp: hero.ht, poison: 0, burning: 0, weakened: 0, crippled: 0, hunger: 0 });
    expect(level.wells).toHaveLength(0);
  });

  it('the Well of Awareness opens the map and what is worn, and identifies a dropped item', () => {
    const { world, hero, level, to } = well('awareness');
    const hidden = level.map.findIndex((terrain) => terrain === T.SECRET_DOOR);
    expect(act(world, 'p', { type: 'move', to }).ok).toBe(true);
    if (hidden >= 0) expect(level.map[hidden]).not.toBe(T.SECRET_DOOR);
    expect(hero.weapon!.levelUnknown).toBeFalsy();
    const dropped = well('awareness');
    dropped.hero.pos = dropped.to;
    dropped.hero.items = [{ ...createItem('weapon.sword'), levelUnknown: true, curseUnknown: true }];
    expect(act(dropped.world, 'p', { type: 'drop', item: 0 }).ok).toBe(true);
    const heap = floorAt(dropped.world, 1).heaps.find((h) => h.pos === dropped.to)!;
    expect(heap.items[0]!.levelUnknown).toBeFalsy();
    expect(dropped.level.wells).toHaveLength(0);
  });

  it('the Well of Transmutation turns a dropped item into another of its kind, keeping the level, and does nothing to the hero', () => {
    const { world, hero, level, to } = well('transmutation');
    act(world, 'p', { type: 'move', to });
    expect(hero.hp).toBe(hero.ht);
    expect(level.wells).toHaveLength(1);
    hero.items = [createItem('scroll.upgrade', 1), createItem('potion.strength', 1)];
    const drop = act(world, 'p', { type: 'drop', item: 0 });
    expect(drop.ok).toBe(true);
    expect(floorAt(world, 1).heaps.find((h) => h.pos === to)!.items[0]!.kind).toBe('scroll.enchantment');
    expect(level.wells).toHaveLength(0);
  });

  it('the dew vial: 10 drops at most, a full vial heals everything, and a Well of Health fills it', () => {
    for (const [volume, share] of [[10, 1], [5, 0.4], [1, 0.05]] as const) {
      const { world, hero } = setup(13);
      hero.items = [{ ...createItem('vial'), volume }];
      hero.ht = 100;
      hero.hp = 1;
      expect(act(world, 'p', { type: 'use', item: 0 }).ok).toBe(true);
      const healed = hero.hp - 1;
      expect(healed, `volume ${volume}`).toBeGreaterThanOrEqual(Math.min(99, Math.floor(share * 100) - 1));
      expect(healed, `volume ${volume}`).toBeLessThanOrEqual(Math.min(99, Math.ceil(share * 100) + 2));
    }
    const { world, hero, level, to } = well('health');
    hero.pos = to;
    hero.items = [{ ...createItem('vial'), volume: 2 }];
    level.map[to] = T.WELL;
    expect(act(world, 'p', { type: 'drop', item: 0 }).ok).toBe(true);
    expect(floorAt(world, 1).heaps.find((h) => h.pos === to)!.items[0]!.volume).toBe(10);
    for (const [lang, guide] of both) {
      const vial = text(guide, 'vial');
      expect(vial, lang).toContain('10');
      expect(vial, lang).toContain('40');
    }
  });

  it('a dewdrop heals 1 + (depth − 1) ÷ 5, one more for the huntress; unhurt, it goes into the vial', () => {
    const { world, hero, floor } = setup(14);
    hero.ht = 20;
    hero.hp = 5;
    floor.heaps.push({ pos: hero.pos, kind: 'heap', items: [createItem('dew')] });
    act(world, 'p', { type: 'pickup' });
    expect(hero.hp).toBe(6);
    hero.hp = hero.ht;
    hero.items = [createItem('vial')];
    floor.heaps.push({ pos: hero.pos, kind: 'heap', items: [createItem('dew', 3)] });
    act(world, 'p', { type: 'pickup' });
    expect(hero.items[0]!.volume).toBe(3);
  });
});

describe('seeds and herbs', () => {
  it('tall grass drops a seed one time in 18 and a dewdrop one in 6', () => {
    const { world, hero, level, floor } = setup(15);
    const { from, to } = beside(world, hero);
    let seeds = 0;
    let dews = 0;
    const trials = 2400;
    for (let i = 0; i < trials; i++) {
      hero.pos = from;
      hero.hp = hero.ht;
      level.map[to] = T.HIGH_GRASS;
      act(world, 'p', { type: 'move', to });
      for (const heap of floor.heaps.filter((h) => h.pos === to)) {
        for (const item of heap.items) {
          if (item.kind === 'dew') dews++;
          else if (itemDef(item.kind).category === 'seed') seeds++;
        }
      }
      floor.heaps = floor.heaps.filter((h) => h.pos !== to);
    }
    expect(seeds / trials).toBeGreaterThan(1 / 18 - 0.02);
    expect(seeds / trials).toBeLessThan(1 / 18 + 0.02);
    expect(dews / trials).toBeGreaterThan(1 / 6 - 0.03);
    expect(dews / trials).toBeLessThan(1 / 6 + 0.03);
  });

  it('each plant does what the guide says when stepped on', () => {
    const stepOn = (kind: 'icecap' | 'sorrowmoss' | 'rotberry' | 'dreamweed' | 'earthroot' | 'sungrass' | 'fadeleaf'): { hero: Hero; world: World } => {
      const { world, hero, floor } = setup(16);
      const { from, to } = beside(world, hero);
      hero.pos = from;
      (floor.plants ??= []).push({ pos: to, kind });
      expect(act(world, 'p', { type: 'move', to }).ok).toBe(true);
      return { hero, world };
    };
    // A step takes a turn; frozen for 5 more.
    const frozen = setup(16);
    const spot = beside(frozen.world, frozen.hero);
    frozen.hero.pos = spot.from;
    (frozen.floor.plants ??= []).push({ pos: spot.to, kind: 'icecap' });
    const start = frozen.hero.time;
    act(frozen.world, 'p', { type: 'move', to: spot.to });
    expect(frozen.hero.time - start).toBe(1 + 5);
    expect(stepOn('sorrowmoss').hero.poison).toBe(4);
    expect(stepOn('rotberry').hero.rooted).toBe(3);
    expect(stepOn('dreamweed').hero.dizzy).toBeGreaterThan(0);
    const bark = stepOn('earthroot').hero;
    expect(bark.earthroot?.level).toBe(bark.ht);
    const grass = stepOn('sungrass');
    grass.hero.hp = 1;
    grass.hero.ht = 100;
    for (let i = 0; i < 5; i++) act(grass.world, 'p', { type: 'wait' });
    expect(grass.hero.hp).toBe(1 + 10);
    const spotFade = setup(16);
    const fade = beside(spotFade.world, spotFade.hero);
    spotFade.hero.pos = fade.from;
    (spotFade.floor.plants ??= []).push({ pos: fade.to, kind: 'fadeleaf' });
    act(spotFade.world, 'p', { type: 'move', to: fade.to });
    expect(spotFade.hero.pos).not.toBe(fade.to);
    for (const [lang, guide] of both) for (const n of ['18', '6', '5', '3']) expect(text(guide, 'seeds'), lang).toContain(n);
  });

  it('three or more seeds brew the potion each is good for (or, one time in N, a random one)', () => {
    const potions: Record<string, ItemKind> = {
      'seed.firebloom': 'potion.liquidFlame', 'seed.icecap': 'potion.frost', 'seed.sorrowmoss': 'potion.toxicGas',
      'seed.dreamweed': 'potion.invisibility', 'seed.sungrass': 'potion.healing', 'seed.earthroot': 'potion.paralyticGas',
      'seed.fadeleaf': 'potion.mindVision', 'seed.rotberry': 'potion.strength',
    };
    for (const [seed, potion] of Object.entries(potions)) {
      let right = 0;
      const trials = 45;
      for (let i = 0; i < trials; i++) {
        const { world, hero, level, floor } = setup(100 + i);
        level.map[hero.pos] = T.ALCHEMY;
        hero.items = [createItem(seed as ItemKind, 3)];
        const result = act(world, 'p', { type: 'drop', item: 0 });
        expect(result.ok && result.effects.some((e) => e.type === 'brewed'), seed).toBe(true);
        const brewed = floor.heaps.find((h) => h.pos === hero.pos)!;
        expect(brewed.items).toHaveLength(1);
        if (brewed.items[0]!.kind === potion) right++;
      }
      // Two in three are the seed's own potion; a random one is that potion now and then too.
      expect(right / trials, seed).toBeGreaterThan(0.5);
    }
    // Two seeds are not enough, and anything else in the pot brews nothing.
    const two = setup(17);
    two.level.map[two.hero.pos] = T.ALCHEMY;
    two.hero.items = [createItem('seed.icecap', 2)];
    const result = act(two.world, 'p', { type: 'drop', item: 0 });
    expect(result.ok && result.effects.some((e) => e.type === 'brewed')).toBe(false);
    expect(text(GUIDE_EN, 'alchemy')).toContain('1 in N');
    expect(text(GUIDE_RU, 'alchemy')).toContain('1 к N');
  }, 60_000);
});

describe('the score', () => {
  it('is gold plus level × deepest depth × 100, doubled by a win, and times the challenges', () => {
    expect(dungeonScore(500, 8, 6, false)).toBe(500 + 8 * 6 * 100);
    expect(dungeonScore(500, 8, 6, true)).toBe(2 * (500 + 8 * 6 * 100));
    const { world, hero } = setup(18);
    hero.lvl = 5;
    hero.stats = { gold: 321, food: 0, brewed: 0, piranhas: 0 };
    hero.gold = 7;
    const deepest = deepestDepth(world);
    expect(deepest).toBeGreaterThanOrEqual(2);
    const base = 321 + 5 * deepest * 100;
    expect(runOutcome(world, hero).score).toBe(base);
    world.challenges = 1 | 32;
    expect(runOutcome(world, hero).score).toBe(Math.round(base * 1.5));
    world.victory = true;
    expect(runOutcome(world, hero).score).toBe(Math.round(2 * base * 1.5));
  });

  it('does not count the gold a sale brings', () => {
    const world = createWorld(3);
    for (let depth = 1; depth <= 6; depth++) levelAt(world, depth);
    for (let depth = 1; depth <= 6; depth++) floorAt(world, depth).mobs = depth === 6 ? floorAt(world, 6).mobs.filter(isShopkeeper) : [];
    addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
    const hero = heroById(world, 'p')!;
    const keeper = floorAt(world, 6).mobs.find(isShopkeeper)!;
    const level = levelAt(world, 6);
    const cell = NEIGHBOURS8.map((n) => keeper.pos + n).find((c) => canEnter(level, c) && !charAt(world, 6, c))!;
    Object.assign(hero, { depth: 6, pos: cell, time: floorAt(world, 6).now, gold: 0, stats: { gold: 0, food: 0, brewed: 0, piranhas: 0 } });
    hero.items = [createItem('potion.healing')];
    const before = runOutcome(world, hero).gold;
    const result = act(world, 'p', { type: 'sell', item: 0 });
    expect(result.ok).toBe(true);
    expect(hero.gold).toBeGreaterThan(0);
    expect(runOutcome(world, hero).gold).toBe(before);
  });

  it('gives the Wave arena 100 a wave, 5 a kill and 10 a level', () => {
    const { world, hero } = setup(19);
    hero.kills = 7;
    hero.lvl = 4;
    world.arena = { wave: 3, phase: 'rest', kills: 7 } as never;
    expect(arenaScore(world, 'p')).toBe(3 * 100 + 7 * 5 + 4 * 10);
    for (const [lang, guide] of both) {
      const score = text(guide, 'score');
      for (const n of ['100', '5', '10', num(lang, '1.25'), num(lang, '2.75')]) expect(score, lang).toContain(n);
    }
  });
});

describe('the challenges', () => {
  const NAMES = {
    en: ['On diet', 'Faith is my armor', 'Pharmacophobia', 'Barren land', 'Swarm intelligence', 'Into darkness', 'Forbidden runes'],
    ru: ['На диете', 'Вера — мой доспех', 'Фармакофобия', 'Бесплодная земля', 'Разум роя', 'Во тьму', 'Запретные руны'],
  };

  it('are seven, each adds a quarter to the score, ×2.75 for all', () => {
    expect(CHALLENGES.map((c) => c.id)).toEqual(['noFood', 'noArmor', 'noHealing', 'noHerbalism', 'swarm', 'darkness', 'noScrolls']);
    const all = CHALLENGES.reduce((mask, c) => mask | c.mask, 0);
    expect([0, 1, 3, 7, all].map(challengeMultiplier)).toEqual([1, 1.25, 1.5, 1.75, 2.75]);
    for (const [lang, guide] of both) {
      const challenges = text(guide, 'challenges');
      expect(challenges, lang).toContain(num(lang, '3'));
      for (const name of NAMES[lang]) expect(challenges, `${lang}: ${name}`).toContain(name);
      expect(text(guide, 'score'), lang).toContain(num(lang, '2.75'));
    }
  });

  it('see 3 cells in the dark instead of 8', () => {
    expect([DARKNESS_VIEW_DISTANCE, MAX_VIEW_DISTANCE]).toEqual([3, 8]);
    for (const [lang, guide] of both) {
      const challenges = text(guide, 'challenges');
      expect(challenges, lang).toContain('3');
      expect(challenges, lang).toContain('8');
    }
  });

  it('take away what they say: food, armour, healing, the seed pouch and all scrolls but Upgrade become gold', () => {
    const drop = (challenge: number, item: ReturnType<typeof createItem>): ItemKind => {
      const { world, hero, floor } = setup(20);
      world.challenges = challenge;
      hero.items = [item];
      act(world, 'p', { type: 'drop', item: 0 });
      return floor.heaps.find((h) => h.pos === hero.pos)!.items[0]!.kind;
    };
    expect(drop(1, createItem('food.pasty'))).toBe('gold');
    expect(drop(2, createItem('armor.mail'))).toBe('gold');
    expect(drop(4, createItem('potion.healing'))).toBe('gold');
    expect(drop(8, createItem('bag.seeds'))).toBe('gold');
    expect(drop(64, createItem('scroll.removeCurse'))).toBe('gold');
    expect(drop(64, createItem('scroll.upgrade'))).toBe('scroll.upgrade');
    expect(drop(0, createItem('food.pasty'))).toBe('food.pasty');
  });

  it('are turned on one at a time by the daily dungeon, from the start', () => {
    const hardships = new Set([DARKNESS, SWARM_INTELLIGENCE, NO_HERBALISM, NO_SCROLLS, NO_HEALING]);
    for (let day = 1; day <= 40; day++) {
      const { challenge } = dailyRules(`2026-10-${String(day).padStart(2, '0')}`);
      expect(hardships.has(challenge)).toBe(true);
    }
  });
});

describe('searching', () => {
  it('finds every hidden trap in sight within 2 cells, and not beyond', () => {
    const { world, hero, level } = setup(21);
    const row = (from: number, n: number): boolean => [0, 1, 2, 3, 4].every((k) => level.map[from + k * n] === T.EMPTY && !charAt(world, 1, from + k * n));
    const from = level.map.findIndex((_, cell) => NEIGHBOURS8.some((n) => row(cell, n)));
    const d = NEIGHBOURS8.find((n) => row(from, n))!;
    hero.pos = from;
    level.map[from + 2 * d] = T.SECRET_TOXIC_TRAP;
    level.map[from + 4 * d] = T.SECRET_FIRE_TRAP;
    expect(act(world, 'p', { type: 'search' }).ok).toBe(true);
    expect(level.map[from + 2 * d]).toBe(T.TOXIC_TRAP);
    expect(level.map[from + 4 * d]).toBe(T.SECRET_FIRE_TRAP);
    for (const [lang, guide] of both) expect(text(guide, 'search'), lang).toContain('2');
  });
});

describe('the Amulet', () => {
  it('is on depth 26, won by calling it a day or by carrying it out, and either wins the run', () => {
    const { world, hero, floor } = setup(22);
    floor.heaps.push({ pos: hero.pos, kind: 'heap', items: [createItem('quest.amulet')] });
    act(world, 'p', { type: 'pickup' });
    expect(act(world, 'p', { type: 'endGame' }).ok).toBe(true);
    expect(world).toMatchObject({ over: true, victory: true });
    for (const [lang, guide] of both) expect(text(guide, 'score'), lang).toContain('26');
    expect(ITEMS['quest.amulet']).toBeDefined();
  });
});
