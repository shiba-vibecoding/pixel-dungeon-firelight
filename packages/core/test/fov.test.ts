import { describe, expect, it } from 'vitest';
import {
  act, addHero, castShadow, cell, createWorld, exploredCells, findPath, heroById, LENGTH, levelAt, T, visibleCells,
  WIDTH,
} from '../src/index';

describe('field of view', () => {
  it('sees a full circle of radius 8 in the open and nothing beyond', () => {
    const center = cell(16, 16);
    const fov = castShadow(center, () => false);
    expect(fov[center]).toBe(true);
    expect(fov[cell(16 + 8, 16)]).toBe(true);
    expect(fov[cell(16, 16 - 8)]).toBe(true);
    expect(fov[cell(16 + 9, 16)]).toBe(false);
    expect(fov[cell(16 + 7, 16 + 7)]).toBe(false); // outside the rounded circle
    expect(fov[cell(16 + 5, 16 + 5)]).toBe(true);
  });

  it('cannot see through a wall but sees the wall itself', () => {
    const viewer = cell(10, 10);
    const wallX = 12;
    const fov = castShadow(viewer, (c) => c % WIDTH === wallX);
    expect(fov[cell(wallX, 10)]).toBe(true);
    expect(fov[cell(wallX + 1, 10)]).toBe(false);
    expect(fov[cell(wallX + 3, 10)]).toBe(false);
  });

  it('is limited to the requested distance', () => {
    const fov = castShadow(cell(16, 16), () => false, 3);
    expect(fov[cell(19, 16)]).toBe(true);
    expect(fov[cell(20, 16)]).toBe(false);
    expect(fov.filter(Boolean).length).toBeLessThan(LENGTH);
  });
});

describe('shared exploration and doors', () => {
  it('explores around the heroes and keeps explored cells', () => {
    const world = createWorld(31337);
    const hero = addHero(world, { id: 'a', name: 'A', heroClass: 'rogue' });
    const explored = exploredCells(world, 1);
    expect(explored[hero.pos]).toBe(true);
    const before = explored.filter(Boolean).length;
    const level = levelAt(world, 1);
    for (const step of findPath(level, hero.pos, level.exit)!) {
      act(world, 'a', { type: 'move', to: step });
    }
    const after = exploredCells(world, 1).filter(Boolean).length;
    expect(after).toBeGreaterThan(before);
    // Everything currently visible is also explored.
    const visible = visibleCells(world, 1);
    visible.forEach((seen, i) => {
      if (seen) expect(exploredCells(world, 1)[i]).toBe(true);
    });
  });

  it('opens a door while a hero stands in it and closes it afterwards', () => {
    for (let seed = 1; seed < 40; seed++) {
      const world = createWorld(seed);
      addHero(world, { id: 'a', name: 'A', heroClass: 'warrior' });
      const level = levelAt(world, 1);
      const hero = heroById(world, 'a')!;
      const path = findPath(level, hero.pos, level.exit)!;
      const doorIndex = path.findIndex((c) => level.map[c] === T.DOOR);
      if (doorIndex < 0 || doorIndex === path.length - 1) continue;
      const door = path[doorIndex]!;
      for (const step of path.slice(0, doorIndex + 1)) act(world, 'a', { type: 'move', to: step });
      expect(level.map[door]).toBe(T.OPEN_DOOR);
      act(world, 'a', { type: 'move', to: path[doorIndex + 1]! });
      expect(level.map[door]).toBe(T.DOOR);
      return;
    }
    throw new Error('no seed with a door on the path');
  });

  it('plans paths only through explored cells when asked to', () => {
    const world = createWorld(31337);
    const hero = addHero(world, { id: 'a', name: 'A', heroClass: 'rogue' });
    const level = levelAt(world, 1);
    const known = exploredCells(world, 1);
    if (!known[level.exit]) {
      expect(findPath(level, hero.pos, level.exit, new Set(), known)).toBeNull();
    }
    expect(findPath(level, hero.pos, level.exit)).not.toBeNull();
  });
});
