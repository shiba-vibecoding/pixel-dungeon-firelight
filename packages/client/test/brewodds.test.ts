import { act, addHero, createItem, createWorld, floorAt, type Hero, heroById, ItemGenerator, type ItemKind, levelAt, Rng, T, type World } from '@pd/core';
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('location', { search: '?lang=ru', href: 'http://x/' });
vi.stubGlobal('navigator', { language: 'ru', languages: ['ru'], userAgent: 'x' });
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
const { brewOdds, POTION_OF_SEED, SEEDS_TO_BREW, seedsIn, seedsInPot } = await import('../src/brewodds');
const { percent, potLines, seedList } = await import('../src/infotext');
const { t } = await import('../src/i18n');
const { GUIDE_EN } = await import('../src/i18n-guide');

/*
 * The pot's odds are the core's formula, and the seeds' potions and the three seeds are the core's: checked by brewing in the world.
 */

const SEEDS = Object.keys(POTION_OF_SEED) as ItemKind[];

/** A hero on an alchemy pot, nothing else about. */
function setup(seed = 3): { world: World; hero: Hero; clear(): void } {
  const world = createWorld(seed);
  floorAt(world, 1).mobs = [];
  floorAt(world, 1).respawn = 1e9;
  addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  const hero = heroById(world, 'p')!;
  levelAt(world, 1).map[hero.pos] = T.ALCHEMY;
  return { world, hero, clear: () => { floorAt(world, 1).heaps = floorAt(world, 1).heaps.filter((h) => h.pos !== hero.pos); } };
}

/** Drops each stack in turn on the pot, and says what came out of the last (undefined if nothing brewed). */
function brewOnce(kit: ReturnType<typeof setup>, stacks: Array<[ItemKind, number]>): ItemKind | undefined {
  kit.clear();
  Object.assign(kit.hero, { hunger: 0, hp: 1e6, ht: 1e6 });
  let brewed = false;
  for (const [kind, qty] of stacks) {
    kit.hero.items = [createItem(kind, qty)];
    const result = act(kit.world, 'p', { type: 'drop', item: 0 });
    if (!result.ok) throw new Error(result.reason);
    brewed = result.effects.some((e) => e.type === 'brewed');
  }
  if (!brewed) return undefined;
  const heap = floorAt(kit.world, 1).heaps.find((h) => h.pos === kit.hero.pos)!;
  expect(heap.items).toHaveLength(1);
  return heap.items[0]!.kind;
}

describe('the odds, by the formula', () => {
  it('give one in N to a random potion and the rest to the seeds’ own, by their numbers', () => {
    const three = brewOdds([{ kind: 'seed.firebloom', qty: 3 }]);
    expect(three.enough).toBe(true);
    expect(three.random).toBeCloseTo(1 / 3, 12);
    expect(three.own).toEqual([{ seed: 'seed.firebloom', potion: 'potion.liquidFlame', chance: expect.closeTo(2 / 3, 12) }]);
    const mix = brewOdds([{ kind: 'seed.firebloom', qty: 3 }, { kind: 'seed.icecap', qty: 1 }]);
    // Four seeds: 1 in 4 random; the other three quarters split three to one.
    expect(mix.random).toBeCloseTo(0.25, 12);
    expect(mix.own.map((o) => [o.potion, o.chance])).toEqual([['potion.liquidFlame', expect.closeTo(0.5625, 12)], ['potion.frost', expect.closeTo(0.1875, 12)]]);
    for (const odds of [three, mix, brewOdds([{ kind: 'seed.sungrass', qty: 2 }, { kind: 'seed.earthroot', qty: 2 }, { kind: 'seed.fadeleaf', qty: 5 }])]) {
      expect(odds.random + odds.own.reduce((sum, o) => sum + o.chance, 0)).toBeCloseTo(1, 12);
    }
  });

  it('count a kind lying in two stacks as one, and a stack of none as nothing', () => {
    expect(brewOdds([{ kind: 'seed.icecap', qty: 1 }, { kind: 'seed.icecap', qty: 2 }, { kind: 'seed.firebloom', qty: 0 }])).toEqual(brewOdds([{ kind: 'seed.icecap', qty: 3 }]));
    expect(brewOdds([])).toMatchObject({ count: 0, enough: false, own: [] });
  });

  it('are the 3 seeds of the core and the guide’s list of seeds and potions', () => {
    expect(SEEDS_TO_BREW).toBe(3);
    const guide = GUIDE_EN.entries.find((e) => e.id === 'alchemy')!.text;
    const names: Record<string, string> = {
      'potion.liquidFlame': 'Liquid Flame', 'potion.frost': 'Frost', 'potion.toxicGas': 'Toxic Gas', 'potion.invisibility': 'Invisibility',
      'potion.healing': 'Healing', 'potion.paralyticGas': 'Paralytic Gas', 'potion.mindVision': 'Mind Vision', 'potion.strength': 'Strength',
    };
    const plants: Record<string, string> = {
      'seed.firebloom': 'Firebloom', 'seed.icecap': 'Icecap', 'seed.sorrowmoss': 'Sorrowmoss', 'seed.dreamweed': 'Dreamweed',
      'seed.sungrass': 'Sungrass', 'seed.earthroot': 'Earthroot', 'seed.fadeleaf': 'Fadeleaf', 'seed.rotberry': 'Rotberry',
    };
    for (const [seed, potion] of Object.entries(POTION_OF_SEED)) expect(guide, seed).toMatch(new RegExp(`${plants[seed]}( brews)? ${names[potion!]}`));
    expect(Object.keys(POTION_OF_SEED)).toHaveLength(8);
  });
});

describe('what the pot does', () => {
  it('brews from three seeds and not from two, and the seeds’ own potion is what a heap of one kind gives', () => {
    const kit = setup();
    expect(brewOnce(kit, [['seed.icecap', 2]])).toBeUndefined();
    expect(brewOnce(kit, [['seed.icecap', 1], ['seed.icecap', 1], ['seed.icecap', 1]])).toBeDefined();
    for (const seed of SEEDS) {
      const counts = new Map<ItemKind, number>();
      for (let i = 0; i < 30; i++) {
        // 120 seeds: one time in 120 a random potion.
        const potion = brewOnce(kit, [[seed, 120]])!;
        counts.set(potion, (counts.get(potion) ?? 0) + 1);
      }
      expect(counts.get(POTION_OF_SEED[seed]!) ?? 0, `${seed} ${JSON.stringify([...counts])}`).toBeGreaterThanOrEqual(27);
    }
  });

  it('brews the potions at the chances the odds state', () => {
    const kit = setup(4);
    const depth = 1;
    const trials = 1800;
    // The random potion is whatever the generator makes at that depth.
    const generator = new ItemGenerator(Rng.seeded(77), depth);
    const random = new Map<ItemKind, number>();
    for (let i = 0; i < 6000; i++) {
      const kind = generator.of('potion').kind;
      random.set(kind, (random.get(kind) ?? 0) + 1);
    }
    const share = (kind: ItemKind): number => (random.get(kind) ?? 0) / 6000;
    for (const stacks of [
      [['seed.firebloom', 2], ['seed.icecap', 1]],
      [['seed.sungrass', 2], ['seed.earthroot', 2]],
    ] as Array<Array<[ItemKind, number]>>) {
      const odds = brewOdds(stacks.map(([kind, qty]) => ({ kind, qty })));
      const seen = new Map<ItemKind, number>();
      for (let i = 0; i < trials; i++) {
        const potion = brewOnce(kit, stacks)!;
        seen.set(potion, (seen.get(potion) ?? 0) + 1);
      }
      for (const own of odds.own) {
        const expected = own.chance + odds.random * share(own.potion);
        expect((seen.get(own.potion) ?? 0) / trials, `${own.potion} of ${JSON.stringify(stacks)}`).toBeGreaterThan(expected - 0.055);
        expect((seen.get(own.potion) ?? 0) / trials, `${own.potion} of ${JSON.stringify(stacks)}`).toBeLessThan(expected + 0.055);
      }
    }
  });
});

describe('what lies in the pack and in the pot', () => {
  it('counts the seeds in the pack by kind, and those lying in a pot, with anything else that spoils it', () => {
    const { world, hero } = setup();
    hero.items = [createItem('seed.icecap', 2), createItem('food.ration'), createItem('seed.icecap', 1), createItem('seed.firebloom')];
    expect(seedsIn(hero)).toEqual([{ kind: 'seed.icecap', qty: 3 }, { kind: 'seed.firebloom', qty: 1 }]);
    expect(seedsInPot(world, hero, hero.pos)).toEqual({ seeds: [], spoiled: false });
    hero.items = [createItem('seed.icecap', 2)];
    act(world, 'p', { type: 'drop', item: 0 });
    expect(seedsInPot(world, hero, hero.pos)).toEqual({ seeds: [{ kind: 'seed.icecap', qty: 2 }], spoiled: false });
    hero.items = [createItem('food.ration')];
    act(world, 'p', { type: 'drop', item: 0 });
    expect(seedsInPot(world, hero, hero.pos).spoiled).toBe(true);
  });
});

describe('the words of the odds give no potion away', () => {
  const colours = t.colors as readonly string[];
  it('name a potion only once the party knows it, and by its seed until then, never by its colour', () => {
    const odds = brewOdds([{ kind: 'seed.firebloom', qty: 2 }, { kind: 'seed.icecap', qty: 1 }]);
    const a = createWorld(1);
    const b = createWorld(2);
    // Different worlds, different colours for the same potions; the words are the same.
    expect(a.run.labels['potion.liquidFlame']).not.toBe(b.run.labels['potion.liquidFlame']);
    const lines = potLines(a, odds);
    expect(potLines(b, odds)).toEqual(lines);
    const text = lines.map((l) => l.label).join('|');
    for (const colour of colours) expect(text.toLowerCase(), colour).not.toContain(colour.toLowerCase());
    expect(lines.map((l) => l.known)).toEqual([false, false, true]);
    expect(lines[0]!.label).toContain(t.items['seed.firebloom']);
    // Known: named.
    a.known.push('potion.liquidFlame');
    expect(potLines(a, odds)[0]).toMatchObject({ label: t.items['potion.liquidFlame'].charAt(0).toUpperCase() + t.items['potion.liquidFlame'].slice(1), known: true });
    expect(potLines(a, odds)[1]!.known).toBe(false);
  });

  it('show the chances as «~44%» and the faintest as «<1%»', () => {
    expect(percent(0.4444)).toBe('~44%');
    expect(percent(0.001)).toBe('<1%');
    expect(seedList([{ kind: 'seed.firebloom', qty: 2 }, { kind: 'seed.icecap', qty: 0 }, { kind: 'seed.icecap', qty: 1 }])).toContain('×2');
  });
});
