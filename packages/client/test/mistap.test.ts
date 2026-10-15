import { beforeEach, describe, expect, it } from 'vitest';
import { addHero, createWorld, exploredCells, findPath, floorAt, heroById, levelAt, LENGTH, T } from '@pd/core';
import { firstDanger, gasCells, gasKindAt, stepDanger } from '../src/mistap';
import { forgetSight } from '../src/sight';

/** A new run, the hero at the stairs, and a cell beside them to put things on. */
function setup() {
  const world = createWorld(11);
  addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  const hero = heroById(world, 'p')!;
  const level = levelAt(world, hero.depth);
  floorAt(world, hero.depth);
  const beside = [-1, 1, -32, 32].map((d) => hero.pos + d).find((c) => level.map[c] === T.EMPTY) ?? hero.pos + 1;
  return { world, hero, level, beside };
}

beforeEach(() => forgetSight());

describe('mis-tap protection: what a step would be', () => {
  it('a known trap is no danger to ask about: the owner likes stepping on them', () => {
    const { world, hero, level, beside } = setup();
    exploredCells(world, hero.depth)[beside] = true;
    for (const trap of [T.FIRE_TRAP, T.TOXIC_TRAP, T.PARALYTIC_TRAP, T.POISON_TRAP, T.ALARM_TRAP, T.LIGHTNING_TRAP, T.GRIPPING_TRAP, T.SUMMONING_TRAP]) {
      level.map[beside] = trap;
      expect(stepDanger(world, hero, beside), String(trap)).toBeNull();
      expect(firstDanger(world, hero, [hero.pos, beside]), String(trap)).toBeNull();
    }
  });

  it('a trap on the way is no cloud, and a floating hero still fears a cloud', () => {
    const { world, hero, level, beside } = setup();
    level.map[beside] = T.TOXIC_TRAP;
    exploredCells(world, hero.depth)[beside] = true;
    expect(stepDanger(world, hero, beside)).toBeNull();
    hero.levitating = 5;
    // Floating does not keep a cloud out of the lungs.
    floorAt(world, hero.depth).gas = { paralytic: [[beside, 40]] };
    forgetSight();
    expect(stepDanger(world, hero, beside)).toBe('gas');
  });

  it('a cloud in sight is a danger, unless the hero is in one already or immune', () => {
    const { world, hero, beside } = setup();
    const floor = floorAt(world, hero.depth);
    floor.gas = { toxic: [[beside, 300]] };
    expect(gasCells(world, hero.depth).has(beside)).toBe(true);
    expect(gasKindAt(floor, beside)).toBe('toxic');
    expect(stepDanger(world, hero, beside)).toBe('gas');
    floor.gas = { paralytic: [[beside, 50]] };
    expect(stepDanger(world, hero, beside)).toBe('gas');
    // A web only holds: no question.
    floor.gas = { web: [[beside, 5]] };
    expect(stepDanger(world, hero, beside)).toBeNull();
    floor.gas = { toxic: [[beside, 300]] };
    hero.gasImmune = 4;
    expect(stepDanger(world, hero, beside)).toBeNull();
    // Standing in the cloud, a step to another cell of it is the way out.
    hero.gasImmune = 0;
    floor.gas = { toxic: [[beside, 300], [hero.pos, 200]] };
    expect(stepDanger(world, hero, beside)).toBeNull();
  });

  it('finds the first cloud along a walk, and no trap', () => {
    const { world, hero, level, beside } = setup();
    exploredCells(world, hero.depth)[beside] = true;
    level.map[beside] = T.GRIPPING_TRAP;
    expect(firstDanger(world, hero, [hero.pos, beside])).toBeNull();
    floorAt(world, hero.depth).gas = { toxic: [[beside, 300]] };
    forgetSight();
    expect(firstDanger(world, hero, [hero.pos, beside])).toEqual({ index: 1, danger: 'gas' });
    expect(firstDanger(world, hero, [hero.pos])).toBeNull();
  });
});

describe('mis-tap protection: the route of a tap', () => {
  it('keeps to a way round a known trap when one exists, and asks nothing', () => {
    const { world, hero, level } = setup();
    const explored = exploredCells(world, hero.depth);
    explored.fill(true);
    let checked = 0;
    for (let goal = 0; goal < LENGTH && checked < 5; goal++) {
      const way = findPath(level, hero.pos, goal, new Set(), explored);
      if (!way || way.length < 3) continue;
      const first = way.slice(1, -1).find((cell) => level.map[cell] === T.EMPTY);
      if (first === undefined) continue;
      const original = level.map[first]!;
      level.map[first] = T.FIRE_TRAP;
      const round = findPath(level, hero.pos, goal, new Set(), explored);
      level.map[first] = original;
      if (!round) continue;
      expect(round).not.toContain(first);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('goes round a known trap or a cloud in sight when another way exists', () => {
    const { world, hero, level } = setup();
    const explored = exploredCells(world, hero.depth);
    explored.fill(true);
    let checked = 0;
    for (let goal = 0; goal < LENGTH && checked < 5; goal++) {
      const way = findPath(level, hero.pos, goal, new Set(), explored);
      if (!way || way.length < 3) continue;
      const first = way[0]!;
      const round = findPath(level, hero.pos, goal, new Set([first]), explored);
      if (!round) continue;
      expect(round).not.toContain(first);
      checked++;
      // A cloud is a blocked cell of the route: the same way round.
      floorAt(world, hero.depth).gas = { toxic: [[first, 200]] };
      forgetSight();
      const cloud = gasCells(world, hero.depth);
      if (cloud.has(first)) expect(findPath(level, hero.pos, goal, cloud, explored)).toEqual(round);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
