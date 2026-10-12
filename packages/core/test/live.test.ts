import { describe, expect, it } from 'vitest';
import {
  act, addHero, canEnter, charAt, createMob, createWorld, exploredCells, findPath, floorAt, heroById, isAlive, levelAt, LIVE_COMBAT_MS, LIVE_TURN_MS,
  liveTick, liveTurnMs, NEIGHBOURS8, WIDTH, type World,
} from '../src/index';
import { pacify } from './helpers';

/** A live world with one hero (or two) on the first depth, nothing awake about. */
function live(players = 1): World {
  const world = pacify(createWorld(5, 0, 'dungeon', true));
  for (let i = 0; i < players; i++) addHero(world, { id: `p${i}`, name: `P${i}`, heroClass: 'warrior' });
  // The party knows the depth (walks go only where it has been).
  world.explored[1] = levelAt(world, 1).map.map(() => true);
  return world;
}

/** A cell the party knows, some steps away along an open path. */
function farCell(world: World, from: number, steps: number): number {
  const level = levelAt(world, 1);
  const known = exploredCells(world, 1);
  for (let cell = 0; cell < level.map.length; cell++) {
    const path = canEnter(level, cell) && !charAt(world, 1, cell) ? findPath(level, from, cell, new Set(), known) : null;
    if (path && path.length === steps) return cell;
  }
  throw new Error('no such cell');
}

describe('live turns', () => {
  it('go on by the clock, and a hero told where to go walks there a step a turn', () => {
    const world = live();
    const hero = heroById(world, 'p0')!;
    const goal = farCell(world, hero.pos, 4);
    expect(act(world, 'p0', { type: 'plan', steps: [{ type: 'go', to: goal }] }).ok).toBe(true);
    // An order takes no time by itself.
    expect(hero.time).toBe(0);
    for (let i = 0; i < 4; i++) liveTick(world);
    expect(hero.pos).toBe(goal);
    expect(hero.plan).toEqual([]);
    // With nothing to do, the hero just waits: the world never stops.
    const time = hero.time;
    liveTick(world);
    expect(hero.time).toBeGreaterThan(time);
  });

  it('never waits on a companion who does nothing', () => {
    const world = live(2);
    const walker = heroById(world, 'p0')!;
    const goal = farCell(world, walker.pos, 3);
    act(world, 'p0', { type: 'plan', steps: [{ type: 'go', to: goal }] });
    for (let i = 0; i < 3; i++) liveTick(world);
    expect(walker.pos).toBe(goal);
  });

  it('hunts a monster down and strikes it until it falls; an idle hero strikes back', () => {
    const world = live();
    const hero = heroById(world, 'p0')!;
    const level = levelAt(world, 1);
    const near = NEIGHBOURS8.map((n) => hero.pos + 2 * n).find((cell) => canEnter(level, cell) && canEnter(level, (cell + hero.pos) / 2) && !charAt(world, 1, cell))!;
    const rat = createMob('r1', 'rat', near, 'hunting', 1);
    rat.enemy = hero.id;
    floorAt(world, 1).mobs.push(rat);
    act(world, 'p0', { type: 'plan', steps: [{ type: 'hunt', target: 'r1' }] });
    for (let i = 0; i < 60 && isAlive(rat); i++) liveTick(world);
    expect(isAlive(rat)).toBe(false);

    // Another rat comes at a hero who has no orders: they hit back without being told.
    const rat2 = createMob('r2', 'rat', NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, 1, c))!, 'hunting', 1);
    rat2.enemy = hero.id;
    floorAt(world, 1).mobs.push(rat2);
    for (let i = 0; i < 60 && isAlive(rat2); i++) liveTick(world);
    expect(isAlive(rat2)).toBe(false);
  });

  it('slows down while someone is in a fight', () => {
    const world = live();
    expect(liveTurnMs(world)).toBe(LIVE_TURN_MS);
    const hero = heroById(world, 'p0')!;
    const level = levelAt(world, 1);
    const cell = NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, 1, c))!;
    const rat = createMob('r3', 'rat', cell, 'hunting', 1);
    rat.enemy = hero.id;
    floorAt(world, 1).mobs.push(rat);
    expect(liveTurnMs(world)).toBe(LIVE_COMBAT_MS);
  });

  it('a key held down walks on until something is in the way, and never fights', () => {
    const world = live();
    const hero = heroById(world, 'p0')!;
    const level = levelAt(world, 1);
    const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => canEnter(level, hero.pos + dx! + dy! * WIDTH))!;
    const start = hero.pos;
    act(world, 'p0', { type: 'plan', steps: [{ type: 'stride', dx: dir[0]!, dy: dir[1]! }] });
    for (let i = 0; i < 40; i++) liveTick(world);
    expect(hero.pos).not.toBe(start);
    // It stopped against a wall (or anything else) rather than stepping through it.
    expect(hero.plan).toEqual([]);
    expect(canEnter(level, hero.pos + dir[0]! + dir[1]! * WIDTH) && !charAt(world, 1, hero.pos + dir[0]! + dir[1]! * WIDTH)).toBe(false);
  });

  it('plays alike from the same orders', () => {
    const run = (): string => {
      const world = live(2);
      const hero = heroById(world, 'p0')!;
      act(world, 'p0', { type: 'plan', steps: [{ type: 'go', to: farCell(world, hero.pos, 6) }] });
      for (let i = 0; i < 30; i++) liveTick(world);
      return JSON.stringify(world);
    };
    expect(run()).toBe(run());
  });

  it('is refused in a world of classic turns', () => {
    const world = pacify(createWorld(5));
    addHero(world, { id: 'p', name: 'P', heroClass: 'mage' });
    expect(act(world, 'p', { type: 'plan', steps: [] })).toEqual({ ok: false, reason: 'not a live world' });
  });
});
