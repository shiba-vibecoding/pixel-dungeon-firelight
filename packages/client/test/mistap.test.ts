import { beforeEach, describe, expect, it } from 'vitest';
import { addHero, createWorld, exploredCells, findPath, floorAt, heroById, levelAt, LENGTH, T } from '@pd/core';
import { firstDanger, gasCells, gasKindAt, knownTrap, stepDanger } from '../src/mistap';
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
  it('a known trap is a danger, a hidden or spent one is not', () => {
    const { world, hero, level, beside } = setup();
    exploredCells(world, hero.depth)[beside] = true;
    level.map[beside] = T.SECRET_FIRE_TRAP;
    expect(stepDanger(world, hero, level, beside)).toBeNull();
    level.map[beside] = T.FIRE_TRAP;
    expect(stepDanger(world, hero, level, beside)).toBe('trap');
    expect(knownTrap(world, hero, level, beside)).toBe('fire');
    level.map[beside] = T.INACTIVE_TRAP;
    expect(stepDanger(world, hero, level, beside)).toBeNull();
  });

  it('a trap not seen yet is no danger, and one floated over is none either', () => {
    const { world, hero, level, beside } = setup();
    level.map[beside] = T.TOXIC_TRAP;
    exploredCells(world, hero.depth)[beside] = false;
    expect(stepDanger(world, hero, level, beside)).toBeNull();
    exploredCells(world, hero.depth)[beside] = true;
    expect(stepDanger(world, hero, level, beside)).toBe('trap');
    hero.levitating = 5;
    expect(stepDanger(world, hero, level, beside)).toBeNull();
    // Floating does not keep a cloud out of the lungs.
    floorAt(world, hero.depth).gas = { paralytic: [[beside, 40]] };
    forgetSight();
    expect(stepDanger(world, hero, level, beside)).toBe('gas');
  });

  it('a cloud in sight is a danger, unless the hero is in one already or immune', () => {
    const { world, hero, level, beside } = setup();
    const floor = floorAt(world, hero.depth);
    floor.gas = { toxic: [[beside, 300]] };
    expect(gasCells(world, hero.depth).has(beside)).toBe(true);
    expect(gasKindAt(floor, beside)).toBe('toxic');
    expect(stepDanger(world, hero, level, beside)).toBe('gas');
    floor.gas = { paralytic: [[beside, 50]] };
    expect(stepDanger(world, hero, level, beside)).toBe('gas');
    // A web only holds: no question.
    floor.gas = { web: [[beside, 5]] };
    expect(stepDanger(world, hero, level, beside)).toBeNull();
    floor.gas = { toxic: [[beside, 300]] };
    hero.gasImmune = 4;
    expect(stepDanger(world, hero, level, beside)).toBeNull();
    // Standing in the cloud, a step to another cell of it is the way out.
    hero.gasImmune = 0;
    floor.gas = { toxic: [[beside, 300], [hero.pos, 200]] };
    expect(stepDanger(world, hero, level, beside)).toBeNull();
  });

  it('finds the first danger along a walk', () => {
    const { world, hero, level, beside } = setup();
    exploredCells(world, hero.depth)[beside] = true;
    level.map[beside] = T.GRIPPING_TRAP;
    expect(firstDanger(world, hero, level, [hero.pos, beside])).toEqual({ index: 1, danger: 'trap' });
    expect(firstDanger(world, hero, level, [hero.pos])).toBeNull();
  });
});

describe('mis-tap protection: the route of a tap', () => {
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
