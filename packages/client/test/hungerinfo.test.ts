import { act, addHero, createItem, createWorld, floorAt, type Hero, heroById, HUNGRY, itemDef, type ItemKind, levelAt, STARVING, type World } from '@pd/core';
import { describe, expect, it, vi } from 'vitest';

// The texts want a browser's language: Russian is the one the owner reads.
vi.stubGlobal('location', { search: '?lang=ru', href: 'http://x/' });
vi.stubGlobal('navigator', { language: 'ru', languages: ['ru'], userAgent: 'x' });
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
const { foodIn, foodTurns, hungerReport, mealBonus, STARVING_HIT_CHANCE, wasteIfEaten } = await import('../src/hungerinfo');
const { hungerLines } = await import('../src/infotext');
const { WORDS } = await import('../src/i18n-info');

/*
 * The hunger card tells turns, and the turns are what the rules do: each figure is checked against the world run forward,
 * turn by turn, with the same hero (a warrior, a rogue, a ring of satiety).
 */

function setup(heroClass: 'warrior' | 'rogue' | 'mage' = 'warrior', seed = 5): { world: World; hero: Hero } {
  const world = createWorld(seed);
  for (let depth = 1; depth <= 2; depth++) {
    const floor = floorAt(world, depth);
    floor.mobs = [];
    floor.respawn = 1e9;
  }
  levelAt(world, 1);
  addHero(world, { id: 'p', name: 'P', heroClass });
  return { world, hero: heroById(world, 'p')! };
}

/** Waits until `done` is true, and says how many turns it took (at most `limit`). */
function turnsUntil(world: World, hero: Hero, done: (hero: Hero) => boolean, limit = 800): number {
  for (let turns = 0; turns <= limit; turns++) {
    if (done(hero)) return turns;
    act(world, 'p', { type: 'wait' });
  }
  throw new Error('never');
}

function ring(level: number, known = true): ReturnType<typeof createItem> {
  const item = createItem('ring.satiety', 1, level);
  if (!known) item.levelUnknown = true;
  return item;
}

describe('the turns before hungry and before starving', () => {
  const starts: Array<[number, number]> = [[0, 0], [37, 4], [120, 7], [259, 9], [259.5, 0]];
  for (const heroClass of ['warrior', 'rogue'] as const) {
    it(`are the turns the world takes to get there, for a ${heroClass}`, () => {
      for (const [hunger, hungerTime] of starts) {
        const { world, hero } = setup(heroClass);
        Object.assign(hero, { hunger, hungerTime });
        const report = hungerReport(world, hero);
        const toHungry = report.untilHungry!;
        const toStarving = report.untilStarving!;
        expect(turnsUntil(world, hero, (h) => h.hunger >= HUNGRY), `${heroClass} ${hunger}/${hungerTime} to hungry`).toBe(toHungry);
        expect(turnsUntil(world, hero, (h) => h.hunger >= STARVING) + toHungry, `${heroClass} ${hunger}/${hungerTime} to starving`).toBe(toStarving);
      }
    });
  }

  it('count the ring of satiety worn and known, up and down', () => {
    for (const level of [1, 2, 3, -2]) {
      const { world, hero } = setup('warrior', 6);
      world.known.push('ring.satiety');
      hero.rings = [ring(level)];
      hero.hunger = 20;
      const report = hungerReport(world, hero);
      expect(report.satiety).toBe(level);
      expect(turnsUntil(world, hero, (h) => h.hunger >= HUNGRY), `ring ${level}`).toBe(report.untilHungry);
    }
  });

  it('say never for a ring so good that hunger does not rise', () => {
    const { world, hero } = setup();
    world.known.push('ring.satiety');
    hero.rings = [ring(10)];
    const report = hungerReport(world, hero);
    expect(report.untilHungry).toBeNull();
    expect(report.untilStarving).toBeNull();
    for (let i = 0; i < 60; i++) act(world, 'p', { type: 'wait' });
    expect(hero.hunger).toBe(0);
  });

  it('leave out a ring that is not known through and through: its kind or level would show in the figures', () => {
    const { world, hero } = setup();
    const bare = hungerReport(world, hero);
    // Kind not known (the party has not learned it): left out, and the card says so.
    hero.rings = [ring(3)];
    expect(hungerReport(world, hero)).toMatchObject({ untilHungry: bare.untilHungry, satiety: 0, hiddenRing: true });
    // Kind known, level not: the same.
    world.known.push('ring.satiety');
    hero.rings = [ring(3, false)];
    expect(hungerReport(world, hero)).toMatchObject({ untilHungry: bare.untilHungry, satiety: 0, hiddenRing: true });
    // Another kind of ring, unknown: the card cannot tell which, and does not change.
    hero.rings = [createItem('ring.haste', 1, 2)];
    expect(hungerReport(world, hero)).toMatchObject({ untilHungry: bare.untilHungry, hiddenRing: true });
    // Known through and through: counted.
    hero.rings = [ring(3)];
    expect(hungerReport(world, hero)).toMatchObject({ satiety: 3, hiddenRing: false });
  });

  it('give the rate of hunger: one a turn, a rogue one in 1.2', () => {
    const { world, hero } = setup();
    expect(hungerReport(world, hero)).toMatchObject({ step: 10, growth: 10, perTurn: 1, rogue: false });
    const rogue = setup('rogue');
    expect(hungerReport(rogue.world, rogue.hero)).toMatchObject({ step: 12, growth: 10, rogue: true });
    expect(hungerReport(rogue.world, rogue.hero).perTurn).toBeCloseTo(1 / 1.2, 9);
  });

  it('say how often starving costs a hit point: the chance the rules roll', () => {
    expect(STARVING_HIT_CHANCE).toBe(0.3);
    const { world, hero } = setup('warrior', 9);
    Object.assign(hero, { hunger: STARVING, hp: 100000, ht: 100000 });
    const turns = 6000;
    for (let i = 0; i < turns; i++) act(world, 'p', { type: 'wait' });
    const lost = 100000 - hero.hp;
    // Every ten turns one roll at 3 in 10: about 180 in 6000 turns, one in 33.
    const every = turns / lost;
    expect(every).toBeGreaterThan(hungerReport(world, hero).starveEvery * 0.75);
    expect(every).toBeLessThan(hungerReport(world, hero).starveEvery * 1.3);
  });
});

describe('the food in the pack', () => {
  it('counts each meal at the energy the core gives it, in turns of the hunger rate', () => {
    const { world, hero } = setup();
    hero.items = [createItem('food.ration', 2), createItem('food.pasty'), createItem('food.meat', 3), createItem('potion.healing')];
    expect(foodIn(hero).map((l) => [l.kind, l.qty, l.energy])).toEqual([['food.ration', 2, 260], ['food.pasty', 1, 360], ['food.meat', 3, 100]]);
    expect(foodTurns(world, hero)).toEqual({ energy: 2 * 260 + 360 + 300, turns: 1180 });
    // A rogue is hungry more slowly, so the same food lasts longer.
    const rogue = setup('rogue');
    rogue.hero.items = [createItem('food.ration', 2)];
    expect(foodTurns(rogue.world, rogue.hero).turns).toBe(Math.floor(520 * 1.2));
    hero.items = [];
    expect(foodIn(hero)).toEqual([]);
  });

  it('takes away from a starving hero what the pack says: a ration, 260 of the 360', () => {
    const { world, hero } = setup();
    hero.items = [createItem('food.ration'), createItem('food.pasty')];
    hero.hunger = STARVING;
    expect(foodTurns(world, hero).energy).toBe(260 + 360);
    act(world, 'p', { type: 'use', item: 0 });
    expect(STARVING - hero.hunger).toBe(260);
  });
});

describe('what a meal eaten now wastes', () => {
  const meals: ItemKind[] = ['food.ration', 'food.pasty', 'food.meat', 'food.steak', 'food.overpriced'];
  it('is the energy beyond the hunger, as the rules take it away', () => {
    for (const kind of meals) {
      for (const hunger of [0, 40, 100, 160, 259, 260, 300, 359, 360]) {
        const { world, hero } = setup('warrior', 8);
        hero.items = [createItem(kind)];
        hero.hunger = hunger;
        const predicted = wasteIfEaten(hero, hero.items[0]!);
        act(world, 'p', { type: 'use', item: 0 });
        const taken = hunger - hero.hunger;
        expect(predicted, `${kind} at ${hunger}`).toBe(itemDef(kind).energy! - taken);
        expect(predicted).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is nothing for what is not food, and a warrior or a mage is told what the meal does besides', () => {
    const { hero } = setup();
    expect(wasteIfEaten(hero, createItem('potion.healing'))).toBe(0);
    const ration = createItem('food.ration');
    hero.hp = hero.ht;
    expect(mealBonus(hero, ration)).toBeNull();
    hero.hp = 1;
    expect(mealBonus(hero, ration)).toBe('heal');
    const mage = setup('mage');
    const wand = createItem('wand.magicMissile');
    wand.charges = 0;
    mage.hero.items = [wand];
    expect(mealBonus(mage.hero, ration)).toBe('charge');
    wand.charges = 99;
    expect(mealBonus(mage.hero, ration)).toBeNull();
  });
});

describe('the card’s words', () => {
  it('state the turns the figures say, in both languages, with the thresholds named', () => {
    const { world, hero } = setup();
    hero.items = [createItem('food.ration')];
    hero.hunger = 100;
    const report = hungerReport(world, hero);
    for (const lang of ['ru', 'en'] as const) {
      const F = WORDS[lang].hunger;
      const fed = F.fedLine(report.untilHungry, report.untilStarving);
      expect(fed).toContain(String(report.untilHungry));
      expect(fed).toContain(String(report.untilStarving));
      expect(F.hungryLine(55)).toContain('55');
      expect(F.thresholds(HUNGRY, STARVING)).toContain('260');
      expect(F.thresholds(HUNGRY, STARVING)).toContain('360');
      expect(F.food(1180)).toContain('1180');
      expect(F.waste(40)).toContain('40');
      expect(F.meaning.starving(33)).toContain('33');
      expect(F.rogue(1.2)).toContain(lang === 'ru' ? '1,2' : '1.2');
      expect(F.ring(2, 0.8)).toContain(lang === 'ru' ? '0,8' : '0.8');
    }
    const lines = hungerLines(world, hero);
    expect(lines.turns).toContain(String(report.untilHungry));
    expect(lines.items[0]).toContain('260');
    // Hungry, starving: the card says which, and what starving means.
    hero.hunger = HUNGRY;
    expect(hungerLines(world, hero).turns).toContain('Голоден');
    hero.hunger = STARVING;
    expect(hungerLines(world, hero).turns).toBe('Истощён');
    expect(hungerLines(world, hero).meaning).toContain('не восстанавливается');
  });

  it('have the same shape in both languages', () => {
    const shape = (value: unknown): unknown =>
      typeof value === 'function' ? 'fn' : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)])) : typeof value;
    expect(shape(WORDS.ru)).toEqual(shape(WORDS.en));
  });
});
