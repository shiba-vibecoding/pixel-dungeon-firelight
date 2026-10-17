import {
  act, addHero, buyPrice, createItem, createWorld, type Effect, floorAt, type Hero, heroArmor, heroById, isShopkeeper, itemPrice, LAST_SHOP_DEPTH,
  levelAt, NEIGHBOURS8, Rng, STARVING, T, trapAt, type World, WIDTH,
} from '@pd/core';
import { describe, expect, it } from 'vitest';
import type { Ctx } from '../../core/src/floor';
import { evolveGas } from '../../core/src/gas';
import { triggerTrap } from '../../core/src/traps';
import { GUIDE_EN } from '../src/i18n-guide';
import { keysHeld, KEYS, priceHere, restInfo, searchInfo, SHOP_DEPTHS, shopInfo, trapInfo, WELLS } from '../src/mechinfo';

/*
 * The «How it works» cards state numbers; each is checked against the core run for real: the world is made, the hero put at a depth,
 * and the trap sprung, the turns waited, the step taken. A rule changed in the core breaks the figure here.
 */

function setup(heroClass: 'warrior' | 'rogue' | 'mage' = 'warrior', seed = 5): { world: World; hero: Hero } {
  const world = createWorld(seed);
  levelAt(world, 1);
  floorAt(world, 1).mobs = [];
  floorAt(world, 1).respawn = 1e9;
  addHero(world, { id: 'p', name: 'P', heroClass });
  return { world, hero: heroById(world, 'p')! };
}

const PLAIN: number[] = [T.EMPTY, T.EMPTY_SP, T.EMPTY_DECO];

/**
 * The hero stands at `depth` (made if need be, its monsters gone) on a cell with a block of plain floor around it: `reach` cells every way
 * (the walls are knocked out where the room is smaller). Returns the cell.
 */
function stand(world: World, hero: Hero, depth: number, reach = 1): number {
  const level = levelAt(world, depth);
  const floor = floorAt(world, depth);
  floor.mobs = [];
  floor.respawn = 1e9;
  const open = (cell: number): boolean => PLAIN.includes(level.map[cell]!);
  const margin = reach + 2;
  let spot = -1;
  for (let cell = margin * WIDTH + margin; cell < level.map.length - margin * WIDTH - margin && spot < 0; cell++) {
    if (open(cell) && NEIGHBOURS8.every((n) => open(cell + n)) && !floor.heaps.some((heap) => Math.abs(heap.pos - cell) < 3)) spot = cell;
  }
  expect(spot, `a room at depth ${depth}`).toBeGreaterThan(0);
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) level.map[spot + dy * WIDTH + dx] = T.EMPTY;
  hero.depth = depth;
  hero.pos = spot;
  hero.time = floor.now;
  return spot;
}

const ctxOf = (world: World, hero: Hero, effects: Effect[] = []): Ctx => {
  const floor = floorAt(world, hero.depth);
  return { world, depth: hero.depth, level: levelAt(world, hero.depth), floor, rng: new Rng(floor.rng), effects };
};

const hurts = (effects: Effect[], hero: Hero): number[] =>
  effects.flatMap((e) => (e.type === 'hurt' && e.who === hero.id ? [e.damage] : []));

function ring(kind: 'ring.mending' | 'ring.detection' | 'ring.haggler' | 'ring.accuracy', level: number, known = true): ReturnType<typeof createItem> {
  const item = createItem(kind, 1, level);
  if (!known) item.levelUnknown = true;
  return item;
}

/** Waits for `done`, saying how many turns it took. */
function waitUntil(world: World, hero: Hero, done: () => boolean, limit = 600): number {
  for (let turns = 0; turns <= limit; turns++) {
    if (done()) return turns;
    act(world, hero.id, { type: 'wait' });
  }
  throw new Error('never');
}

/* ---------- Rest ---------- */

describe('rest', () => {
  it('turns for a hit point and to full health are the turns the world takes, whatever the start', () => {
    for (const [missing, regen] of [[1, 0], [4, 3], [10, 7], [3, 9]] as const) {
      const { world, hero } = setup();
      hero.hp = hero.ht - missing;
      hero.regen = regen;
      const report = restInfo(world, hero);
      expect(report).toMatchObject({ delay: 10, missing, starving: false });
      expect(waitUntil(world, hero, () => hero.hp >= hero.ht), `${missing} missing, regen ${regen}`).toBe(report.turnsToFull);
    }
    const { world, hero } = setup();
    expect(restInfo(world, hero).turnsToFull).toBe(0);
  });

  it('count the ring of mending that is known, up and down', () => {
    for (const level of [1, 2, 5, -2]) {
      const { world, hero } = setup();
      world.known.push('ring.mending');
      hero.rings = [ring('ring.mending', level)];
      hero.hp = hero.ht - 8;
      const report = restInfo(world, hero);
      expect(report.mending).toBe(level);
      expect(report.delay).toBeCloseTo(10 / 1.2 ** level, 9);
      expect(waitUntil(world, hero, () => hero.hp >= hero.ht), `ring ${level}`).toBe(report.turnsToFull);
    }
  });

  it('say nothing heals a starving hero, and none does', () => {
    const { world, hero } = setup();
    Object.assign(hero, { hunger: STARVING, hp: 5, ht: 20 });
    expect(restInfo(world, hero)).toMatchObject({ starving: true, turnsToFull: null });
    for (let i = 0; i < 60; i++) {
      const before = hero.hp;
      act(world, 'p', { type: 'wait' });
      expect(hero.hp).toBeLessThanOrEqual(before);
    }
  });

  it('leave out a ring of mending that is not known through and through, and show it once it is', () => {
    const bare = setup();
    bare.hero.hp = bare.hero.ht - 6;
    const plain = restInfo(bare.world, bare.hero);
    const worn = (known: 'both' | 'kind' | 'level' | 'neither'): { world: World; hero: Hero } => {
      const w = setup();
      w.hero.hp = w.hero.ht - 6;
      w.hero.rings = [ring('ring.mending', 4, known === 'both' || known === 'level')];
      if (known === 'both' || known === 'kind') w.world.known.push('ring.mending');
      return w;
    };
    const { hiddenRing: _, ...bareFigures } = plain;
    for (const known of ['kind', 'level', 'neither'] as const) {
      const w = worn(known);
      const { hiddenRing, ...figures } = restInfo(w.world, w.hero);
      expect(hiddenRing, known).toBe(true);
      expect(figures, known).toEqual(bareFigures);
    }
    // Another kind of ring, equally hidden: the card is the same, down to the flag.
    const other = setup();
    other.hero.hp = other.hero.ht - 6;
    other.hero.rings = [ring('ring.accuracy', 2, false)];
    const hiddenMending = worn('neither');
    expect(restInfo(other.world, other.hero)).toEqual(restInfo(hiddenMending.world, hiddenMending.hero));
    const known = worn('both');
    expect(restInfo(known.world, known.hero)).toMatchObject({ mending: 4, hiddenRing: false });
    expect(restInfo(known.world, known.hero).turnsToFull).toBeLessThan(plain.turnsToFull!);
  });
});

/* ---------- Search ---------- */

describe('search', () => {
  /** A step to and fro between two cells, a hidden trap beside both at `off` cells (north of the first); how many steps found it. */
  function stepsFinding(world: World, hero: Hero, off: number, steps: number): number {
    const level = levelAt(world, hero.depth);
    const a = hero.pos;
    const b = a + 1;
    const hidden = a - off * WIDTH;
    let found = 0;
    for (let i = 0; i < steps; i++) {
      level.map[hidden] = T.SECRET_TOXIC_TRAP;
      hero.hunger = 0;
      hero.hp = hero.ht;
      act(world, hero.id, { type: 'move', to: hero.pos === a ? b : a });
      if (level.map[hidden] !== T.SECRET_TOXIC_TRAP) found++;
    }
    return found;
  }

  it('the chance a step notices is the core’s awareness, for a warrior and a rogue, up to level 9 and no further', () => {
    for (const [heroClass, lvl] of [['warrior', 1], ['warrior', 9], ['rogue', 4], ['rogue', 12]] as const) {
      const { world, hero } = setup(heroClass);
      hero.lvl = lvl;
      stand(world, hero, 1, 3);
      const report = searchInfo(world, hero);
      const steps = 1500;
      const found = stepsFinding(world, hero, 1, steps);
      const sigma = Math.sqrt(steps * report.chance * (1 - report.chance)) / steps;
      expect(Math.abs(found / steps - report.chance), `${heroClass} ${lvl}`).toBeLessThan(5 * sigma);
      expect(report.rogue).toBe(heroClass === 'rogue');
    }
  });

  it('stops growing at level 9: the cap is the level where the next one changes nothing', () => {
    const { world, hero } = setup();
    const at = (lvl: number): number => searchInfo(world, { ...hero, lvl }).chance;
    const { capLevel } = searchInfo(world, hero);
    expect(at(capLevel + 1)).toBe(at(capLevel));
    expect(at(capLevel + 7)).toBe(at(capLevel));
    expect(at(capLevel - 1)).toBeLessThan(at(capLevel));
    expect(searchInfo(world, hero).chanceAtCap).toBe(at(capLevel));
    // The mock’s figures: a warrior 10 % → 41 %, a rogue 15 % → 56 %.
    expect(Math.round(at(1) * 100)).toBe(10);
    expect(Math.round(at(capLevel) * 100)).toBe(41);
    const rogue = setup('rogue');
    expect([1, capLevel].map((lvl) => Math.round(searchInfo(rogue.world, { ...rogue.hero, lvl }).chance * 100))).toEqual([15, 56]);
  });

  it('a deliberate search finds all in view within its radius, two cells, and a known ring of detection widens it (or narrows it)', () => {
    for (const bonus of [0, 1, 2, -1]) {
      const { world, hero } = setup();
      world.known.push('ring.detection');
      if (bonus !== 0) hero.rings = [ring('ring.detection', bonus)];
      const spot = stand(world, hero, 1, 4);
      const level = levelAt(world, 1);
      const report = searchInfo(world, hero);
      expect(report.radius).toBe(Math.max(0, 2 + bonus));
      expect(report.stepRadius).toBe(Math.max(0, 1 + bonus));
      for (let off = 1; off <= 4; off++) {
        level.map[spot + off] = T.SECRET_TOXIC_TRAP;
        act(world, 'p', { type: 'search' });
        expect(level.map[spot + off] !== T.SECRET_TOXIC_TRAP, `ring ${bonus}, ${off} cells away`).toBe(off <= report.radius);
        level.map[spot + off] = T.EMPTY;
      }
    }
  });

  it('a step reaches the next cell without the ring, and two with ring +1', () => {
    const none = setup();
    stand(none.world, none.hero, 1, 4);
    expect(searchInfo(none.world, none.hero).stepRadius).toBe(1);
    // Two cells off: out of reach of a step.
    expect(stepsFinding(none.world, none.hero, 2, 300)).toBe(0);
    const ringed = setup();
    ringed.world.known.push('ring.detection');
    ringed.hero.rings = [ring('ring.detection', 1)];
    stand(ringed.world, ringed.hero, 1, 4);
    expect(searchInfo(ringed.world, ringed.hero).stepRadius).toBe(2);
    expect(stepsFinding(ringed.world, ringed.hero, 2, 300)).toBeGreaterThan(30);
  });

  it('takes 2 turns, or 4 when it turns something up and the roll says so, as often as the formula says', () => {
    const { world, hero } = setup();
    const spot = stand(world, hero, 1, 3);
    const level = levelAt(world, 1);
    const report = searchInfo(world, hero);
    const spent = (hidden: boolean): number => {
      level.map[spot + 1] = hidden ? T.SECRET_TOXIC_TRAP : T.EMPTY;
      hero.hunger = 0;
      hero.hp = hero.ht;
      const before = hero.time;
      act(world, 'p', { type: 'search' });
      return hero.time - before;
    };
    for (let i = 0; i < 20; i++) expect(spent(false)).toBe(report.turns);
    const runs = 1500;
    let slow = 0;
    for (let i = 0; i < runs; i++) {
      const time = spent(true);
      expect([report.turns, report.turnsIfSlow]).toContain(time);
      if (time === report.turnsIfSlow) slow++;
    }
    const sigma = Math.sqrt(runs * report.slowIfFound * (1 - report.slowIfFound)) / runs;
    expect(Math.abs(slow / runs - report.slowIfFound)).toBeLessThan(5 * sigma);
  });

  it('leave out a ring of detection that is not known through and through, and show it once it is', () => {
    const make = (known: 'both' | 'kind' | 'level' | 'neither' | 'none'): { world: World; hero: Hero } => {
      const w = setup();
      if (known !== 'none') w.hero.rings = [ring('ring.detection', 2, known === 'both' || known === 'level')];
      if (known === 'both' || known === 'kind') w.world.known.push('ring.detection');
      return w;
    };
    const { hiddenRing: _, ...bare } = searchInfo(make('none').world, make('none').hero);
    for (const known of ['kind', 'level', 'neither'] as const) {
      const w = make(known);
      const { hiddenRing, ...figures } = searchInfo(w.world, w.hero);
      expect(hiddenRing, known).toBe(true);
      expect(figures, known).toEqual(bare);
    }
    const other = setup();
    other.hero.rings = [ring('ring.accuracy', 1, false)];
    const hidden = make('neither');
    expect(searchInfo(other.world, other.hero)).toEqual(searchInfo(hidden.world, hidden.hero));
    const known = make('both');
    expect(searchInfo(known.world, known.hero)).toMatchObject({ radius: 4, stepRadius: 3, detection: 2, hiddenRing: false });
  });
});

/* ---------- Traps ---------- */

describe('traps', () => {
  const byKind = (world: World, hero: Hero, kind: string) => trapInfo(world, hero).find((t) => t.kind === kind)!;

  it('are the eight of PD 1.9.2a, each its tile, its kind to the core and its own colour as the guide’s legend has it', () => {
    const { world, hero } = setup();
    const traps = trapInfo(world, hero);
    expect(traps.map((t) => t.kind).sort()).toEqual(['alarm', 'fire', 'gripping', 'lightning', 'paralytic', 'poison', 'summoning', 'toxic']);
    expect(new Set(traps.map((t) => t.tile)).size).toBe(8);
    expect(new Set(traps.map((t) => t.colour)).size).toBe(8);
    const word: Record<string, string> = {
      toxic: 'toxic', fire: 'fire', paralytic: 'paralytic', poison: 'poison', alarm: 'alarm', lightning: 'lightning', gripping: 'gripping', summoning: 'summoning',
    };
    for (const trap of traps) {
      expect(trapAt(trap.tile), trap.kind).toBe(trap.kind);
      const row = GUIDE_EN.trapColours.find(([colour]) => colour === trap.colour);
      expect(row, trap.colour).toBeDefined();
      expect(row![1].startsWith(word[trap.kind]!), `${trap.colour}: ${row![1]}`).toBe(true);
    }
  });

  it('toxic gas: the cloud let out is 300 + 20 a depth and a breath hurts as the core says, from the hero’s health', () => {
    const { world, hero } = setup();
    for (const depth of [2, 7, 12]) {
      const strength = 5 + 5 * depth;
      // Health that makes a breath 3 or 4 (half and half), exactly 3, and one that is nothing special.
      for (const [ht, whole] of [[120 + 20 - strength, false], [120 - strength, true], [61, false]] as const) {
        hero.ht = ht;
        hero.hp = ht;
        const spot = stand(world, hero, depth);
        const level = levelAt(world, depth);
        const floor = floorAt(world, depth);
        const info = byKind(world, hero, 'toxic');
        expect(info.volume).toBe(300 + 20 * depth);
        const seen = new Set<number>();
        for (let round = 0; round < 8; round++) {
          delete floor.gas;
          delete floor.gasAt;
          level.map[spot] = T.TOXIC_TRAP;
          const effects: Effect[] = [];
          const ctx = ctxOf(world, hero, effects);
          triggerTrap(ctx, hero, spot);
          expect((floor.gas!.toxic ?? []).reduce((sum, [, volume]) => sum + volume, 0), `volume at ${depth}`).toBe(info.volume);
          effects.length = 0;
          for (let i = 0; i < 40; i++) {
            hero.hp = hero.ht;
            evolveGas(ctx);
          }
          for (const damage of hurts(effects, hero)) seen.add(damage);
        }
        const { min, max } = info.breath!;
        expect(seen.size, `breaths at ${depth}, ${ht} health`).toBeGreaterThan(0);
        for (const damage of seen) expect(damage >= min && damage <= max, `${damage} in ${min}..${max} (${depth}, ${ht})`).toBe(true);
        // When the span is more than one, both ends happen; when the health makes it exact, one.
        if (whole) expect([min, max, [...seen]]).toEqual([3, 3, [3]]);
        else if (ht !== 61) expect([...seen].sort()).toEqual([3, 4]);
      }
    }
  });

  it('paralytic gas: the cloud is 80 + 5 a depth, and whoever breathes it is held 5 turns after the breath', () => {
    const { world, hero } = setup();
    for (const depth of [2, 7, 12]) {
      const spot = stand(world, hero, depth);
      const floor = floorAt(world, depth);
      const info = byKind(world, hero, 'paralytic');
      delete floor.gas;
      delete floor.gasAt;
      levelAt(world, depth).map[spot] = T.PARALYTIC_TRAP;
      hero.paralysed = 0;
      const ctx = ctxOf(world, hero);
      triggerTrap(ctx, hero, spot);
      expect((floor.gas!.paralytic ?? []).reduce((sum, [, volume]) => sum + volume, 0)).toBe(info.volume);
      expect(info.volume).toBe(80 + 5 * depth);
      evolveGas(ctx);
      expect(hero.paralysed, `depth ${depth}`).toBe(info.paralysis);
    }
  });

  it('fire: eight turns burning, a point to the depth’s top a turn', () => {
    const { world, hero } = setup();
    hero.ht = hero.hp = 200;
    for (const depth of [2, 4, 8, 12, 17]) {
      const spot = stand(world, hero, depth);
      const info = byKind(world, hero, 'fire').burning!;
      const level = levelAt(world, depth);
      const seen: number[] = [];
      for (let i = 0; i < 70; i++) {
        hero.hp = hero.ht;
        hero.hunger = 0;
        hero.burning = 0;
        level.map[spot] = T.FIRE_TRAP;
        const effects: Effect[] = [];
        triggerTrap(ctxOf(world, hero), hero, spot);
        expect(hero.burning, 'burns').toBe(info.turns);
        let turns = 0;
        while (hero.burning > 0 && turns < 30) {
          const result = act(world, 'p', { type: 'wait' });
          if (!result.ok) throw new Error(result.reason);
          effects.push(...result.effects);
          turns++;
        }
        const damages = hurts(effects, hero);
        expect(damages, `depth ${depth}`).toHaveLength(info.turns);
        expect(turns).toBe(info.turns);
        seen.push(...damages);
      }
      expect(Math.min(...seen), `depth ${depth}`).toBe(info.perTurn.min);
      expect(Math.max(...seen), `depth ${depth}`).toBe(info.perTurn.max);
    }
  });

  it('poison dart: 4 + depth / 2 turns, a point each', () => {
    const { world, hero } = setup();
    for (const depth of [2, 7, 12, 21]) {
      const spot = stand(world, hero, depth);
      const info = byKind(world, hero, 'poison').poison!;
      hero.poison = 0;
      hero.hp = hero.ht = 60;
      levelAt(world, depth).map[spot] = T.POISON_TRAP;
      triggerTrap(ctxOf(world, hero), hero, spot);
      expect(hero.poison, `depth ${depth}`).toBe(info.turns);
      const effects: Effect[] = [];
      let turns = 0;
      while (hero.poison > 0 && turns < 40) {
        const result = act(world, 'p', { type: 'wait' });
        if (!result.ok) throw new Error(result.reason);
        effects.push(...result.effects);
        turns++;
      }
      expect(turns).toBe(info.turns);
      expect(hurts(effects, hero)).toEqual(Array(info.turns).fill(1));
    }
  });

  it('lightning: a third to two thirds of the health the hero has now', () => {
    const { world, hero } = setup();
    const spot = stand(world, hero, 3);
    const level = levelAt(world, 3);
    hero.ht = 100;
    for (const hp of [3, 4, 5, 9, 20, 61]) {
      hero.hp = hp;
      const { min, max } = byKind(world, hero, 'lightning').bolt!;
      const seen: number[] = [];
      for (let i = 0; i < 400; i++) {
        hero.hp = hp;
        level.map[spot] = T.LIGHTNING_TRAP;
        triggerTrap(ctxOf(world, hero), hero, spot);
        seen.push(hp - hero.hp);
      }
      expect([Math.min(...seen), Math.max(...seen)], `${hp} health`).toEqual([min, max]);
    }
  });

  it('gripping: depth + 3 less up to half the armour, the armour as the player knows it', () => {
    const { world, hero } = setup();
    for (const depth of [2, 12]) {
      const spot = stand(world, hero, depth);
      const level = levelAt(world, depth);
      hero.ht = hero.hp = 100;
      const run = (): { damage: { min: number; max: number }; armour: number; seen: number[] } => {
        const grip = byKind(world, hero, 'gripping').grip!;
        const seen: number[] = [];
        for (let i = 0; i < 300; i++) {
          hero.hp = hero.ht;
          level.map[spot] = T.GRIPPING_TRAP;
          triggerTrap(ctxOf(world, hero), hero, spot);
          seen.push(hero.ht - hero.hp);
        }
        return { ...grip, seen };
      };
      for (const armor of [null, createItem('armor.cloth'), createItem('armor.plate'), createItem('armor.plate', 1, 3)]) {
        hero.armor = armor;
        const { damage, armour, seen } = run();
        expect(damage.max).toBe(depth + 3);
        expect([Math.min(...seen), Math.max(...seen)], `depth ${depth}, ${armor?.kind} ${armor?.level}`).toEqual([damage.min, damage.max]);
        expect(armour).toBe(heroArmor(hero));
      }
      // The armour’s level hidden: counted as a plain one of its kind; known, it counts.
      const worn = createItem('armor.plate', 1, 3);
      worn.levelUnknown = true;
      hero.armor = worn;
      const plain = createItem('armor.plate');
      const hiddenFigures = byKind(world, hero, 'gripping').grip;
      hero.armor = plain;
      expect(hiddenFigures).toEqual(byKind(world, hero, 'gripping').grip);
      worn.levelUnknown = false;
      hero.armor = worn;
      expect(byKind(world, hero, 'gripping').grip!.armour).toBeGreaterThan(hiddenFigures!.armour);
    }
  });

  it('summoning: one monster, a second half the time, a third half of those', () => {
    const { world, hero } = setup();
    const spot = stand(world, hero, 3, 2);
    const level = levelAt(world, 3);
    const floor = floorAt(world, 3);
    const odds = byKind(world, hero, 'summoning').summon!;
    expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const tally = [0, 0, 0];
    const runs = 600;
    for (let i = 0; i < runs; i++) {
      floor.mobs = [];
      level.map[spot] = T.SUMMONING_TRAP;
      triggerTrap(ctxOf(world, hero), hero, spot);
      expect(floor.mobs.length).toBeGreaterThanOrEqual(1);
      expect(floor.mobs.length).toBeLessThanOrEqual(3);
      tally[floor.mobs.length - 1]!++;
    }
    odds.forEach((p, i) => expect(Math.abs(tally[i]! / runs - p), `${i + 1} monsters`).toBeLessThan(0.04));
  });

  it('are the same at the depth the hero is on: only the depth, the health and the armour move them', () => {
    const { world, hero } = setup();
    stand(world, hero, 5);
    const five = trapInfo(world, hero);
    stand(world, hero, 6);
    const six = trapInfo(world, hero);
    expect(six.find((t) => t.kind === 'toxic')!.volume).toBe(five.find((t) => t.kind === 'toxic')!.volume! + 20);
    expect(six.find((t) => t.kind === 'alarm')).toEqual(five.find((t) => t.kind === 'alarm'));
  });
});

/* ---------- Wells ---------- */

describe('wells', () => {
  /** A hero beside a well of `water` in a cleared room; returns the well’s cell. */
  function beside(water: 'health' | 'awareness' | 'transmutation'): { world: World; hero: Hero; cell: number } {
    const { world, hero } = setup();
    const spot = stand(world, hero, 1, 3);
    const level = levelAt(world, 1);
    const cell = spot + 1;
    level.map[cell] = T.WELL;
    level.wells = [{ pos: cell, water }];
    return { world, hero, cell };
  }

  it('lists three kinds, each used the way the core has it', () => {
    expect(WELLS.map((w) => [w.water, w.how])).toEqual([['health', 'step'], ['awareness', 'step'], ['transmutation', 'drop']]);
  });

  it('health: a step heals, cures and feeds, and the well runs dry', () => {
    const { world, hero, cell } = beside('health');
    Object.assign(hero, { hp: 1, poison: 6, hunger: 200 });
    act(world, 'p', { type: 'move', to: cell });
    expect([hero.hp, hero.poison, hero.hunger]).toEqual([hero.ht, 0, 0]);
    expect(levelAt(world, 1).map[cell]).toBe(T.EMPTY_WELL);
    expect(WELLS[0]!.does).toEqual(['heal', 'cure', 'feed']);
  });

  it('awareness: a step shows the secrets of the level and makes the ring worn known', () => {
    const { world, hero, cell } = beside('awareness');
    const level = levelAt(world, 1);
    level.map[cell + WIDTH * 5] = T.SECRET_TOXIC_TRAP;
    hero.rings = [ring('ring.accuracy', 2, false)];
    const result = act(world, 'p', { type: 'move', to: cell });
    expect(result.ok && result.effects).toContainEqual({ type: 'well', hero: 'p', water: 'awareness' });
    expect(level.map[cell + WIDTH * 5]).toBe(T.TOXIC_TRAP);
    expect(hero.rings[0]!.levelUnknown).toBeFalsy();
    expect(WELLS[1]!.does).toEqual(['identify', 'map']);
  });

  it('transmutation: a step does nothing, a thing dropped in is changed and the well runs dry', () => {
    const { world, hero, cell } = beside('transmutation');
    const level = levelAt(world, 1);
    hero.items = [createItem('potion.healing')];
    act(world, 'p', { type: 'move', to: cell });
    expect(level.map[cell]).toBe(T.WELL);
    expect(level.wells).toHaveLength(1);
    act(world, 'p', { type: 'drop', item: 0 });
    expect(level.map[cell]).toBe(T.EMPTY_WELL);
    expect(level.wells).toHaveLength(0);
    expect(WELLS[2]!.does).toEqual(['transmute']);
  });
});

/* ---------- Shops ---------- */

describe('shops', () => {
  it('ask five times the value times (depth / 5 + 1), whole-number division, down to the depth', () => {
    const { world, hero } = setup();
    const scroll = createItem('scroll.upgrade');
    for (let depth = 1; depth <= 24; depth++) {
      hero.depth = depth;
      const report = shopInfo(world, hero);
      expect(buyPrice(scroll, depth, true), `depth ${depth}`).toBe(itemPrice(scroll, true) * report.multiplier);
      expect(priceHere(world, hero, scroll)).toBe(buyPrice(scroll, depth, world.known.includes(scroll.kind)));
    }
    expect(shopInfo(world, { ...hero, depth: 12 }).multiplier).toBe(15);
  });

  it('keep shop on the depths 6, 11, 16 and the last, and nowhere else up to 16', () => {
    const { world } = setup();
    for (let depth = 1; depth <= 16; depth++) {
      expect(floorAt(world, depth).mobs.some(isShopkeeper), `depth ${depth}`).toBe(SHOP_DEPTHS.includes(depth));
    }
    expect(SHOP_DEPTHS).toContain(LAST_SHOP_DEPTH);
  });

  it('charge what the card says in a real shop, buying and selling, and a known ring of haggler halves it', () => {
    for (const haggler of [false, true]) {
      const { world, hero } = setup('warrior', 8);
      const floor = floorAt(world, 6);
      const keeper = floor.mobs.find(isShopkeeper)!;
      const wares = floor.heaps.filter((heap) => heap.kind === 'forSale');
      expect(wares.length).toBeGreaterThan(0);
      hero.depth = 6;
      hero.gold = 100000;
      if (haggler) {
        hero.rings = [ring('ring.haggler', 1)];
        world.known.push('ring.haggler');
      }
      expect(shopInfo(world, hero)).toMatchObject({ multiplier: 10, haggle: haggler });
      for (const heap of wares.slice(0, 4)) {
        hero.pos = heap.pos;
        const asked = priceHere(world, hero, heap.items[0]!);
        const result = act(world, 'p', { type: 'buy' });
        expect(result.ok && result.effects.find((e) => e.type === 'bought')).toMatchObject({ price: asked });
      }
      // Selling: the item’s own value, not marked up.
      hero.pos = [-WIDTH, WIDTH, -1, 1, 1 - WIDTH, 1 + WIDTH, -1 - WIDTH, -1 + WIDTH].map((n) => keeper.pos + n).find((cell) => PLAIN.includes(levelAt(world, 6).map[cell]!))!;
      hero.items = [createItem('scroll.upgrade')];
      const sold = act(world, 'p', { type: 'sell', item: 0 });
      expect(sold.ok && sold.effects.find((e) => e.type === 'sold')).toMatchObject({ price: itemPrice(createItem('scroll.upgrade'), world.known.includes('scroll.upgrade')) });
      expect(shopInfo(world, hero).sellMultiplier).toBe(1);
    }
  });

  it('leave out a ring of haggler that is not known through and through', () => {
    const { world, hero } = setup();
    hero.depth = 6;
    const scroll = createItem('scroll.upgrade');
    const bare = priceHere(world, hero, scroll);
    hero.rings = [ring('ring.haggler', 1, false)];
    const hidden = shopInfo(world, hero);
    expect(hidden).toMatchObject({ multiplier: 10, haggle: false, hiddenRing: true });
    expect(priceHere(world, hero, scroll)).toBe(bare);
    world.known.push('ring.haggler');
    hero.rings = [ring('ring.haggler', 1)];
    expect(priceHere(world, hero, scroll)).toBe(Math.trunc(bare / 2));
  });
});

/* ---------- Keys ---------- */

describe('keys', () => {
  function keyed(): { world: World; hero: Hero; spot: number } {
    const { world, hero } = setup();
    const spot = stand(world, hero, 1, 2);
    return { world, hero, spot };
  }

  it('iron: opens the locked door of its depth and is used up; of another depth it does not open', () => {
    const { world, hero, spot } = keyed();
    const level = levelAt(world, 1);
    level.map[spot + 1] = T.LOCKED_DOOR;
    expect(KEYS.find((k) => k.kind === 'key.iron')).toMatchObject({ opens: 'door', tile: T.LOCKED_DOOR });
    hero.items = [{ ...createItem('key.iron'), depth: 2 }];
    expect(keysHeld(hero)).toEqual([{ kind: 'key.iron', depth: 2, here: false }]);
    expect(act(world, 'p', { type: 'move', to: spot + 1 }).ok).toBe(false);
    hero.items = [{ ...createItem('key.iron'), depth: 1 }];
    expect(keysHeld(hero)).toEqual([{ kind: 'key.iron', depth: 1, here: true }]);
    expect(act(world, 'p', { type: 'move', to: spot + 1 }).ok).toBe(true);
    // The door is unlocked (the step through opens it).
    expect([T.DOOR, T.OPEN_DOOR]).toContain(level.map[spot + 1]);
    expect(hero.items).toHaveLength(0);
  });

  it('golden: opens a locked chest of its depth and is used up', () => {
    const { world, hero, spot } = keyed();
    const floor = floorAt(world, 1);
    expect(KEYS.find((k) => k.kind === 'key.golden')).toMatchObject({ opens: 'chest' });
    floor.heaps.push({ pos: spot, kind: 'lockedChest', items: [createItem('ring.accuracy')] });
    hero.items = [{ ...createItem('key.golden'), depth: 2 }];
    expect(act(world, 'p', { type: 'pickup' })).toEqual({ ok: false, reason: 'the chest is locked' });
    hero.items = [{ ...createItem('key.golden'), depth: 1 }];
    expect(act(world, 'p', { type: 'pickup' }).ok).toBe(true);
    expect(hero.items.map((item) => item.kind)).toEqual(['ring.accuracy']);
  });

  it('skeleton: opens the way down on a boss’s level and is used up', () => {
    const { world, hero, spot } = keyed();
    const level = levelAt(world, 1);
    expect(KEYS.find((k) => k.kind === 'key.skeleton')).toMatchObject({ opens: 'exit', tile: T.LOCKED_EXIT });
    level.map[spot + 1] = T.LOCKED_EXIT;
    hero.items = [{ ...createItem('key.skeleton'), depth: 2 }];
    expect(act(world, 'p', { type: 'move', to: spot + 1 }).ok).toBe(false);
    hero.items = [{ ...createItem('key.skeleton'), depth: 1 }];
    expect(act(world, 'p', { type: 'move', to: spot + 1 }).ok).toBe(true);
    expect(level.map[spot + 1]).toBe(T.UNLOCKED_EXIT);
    expect(hero.items).toHaveLength(0);
  });
});
