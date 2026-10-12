import { adjacent, LENGTH, NEIGHBOURS8, WIDTH } from './level/geometry';
import { generateLevel, type Level } from './level/generate';
import { F, hasFlag, T } from './level/terrain';
import { createRun, type RunState } from './run';

/*
 * The shared game world. Several heroes explore the same run; every change
 * goes through act(), so a server can run the authoritative copy and clients
 * only send intentions.
 */

export type HeroClass = 'warrior' | 'mage' | 'rogue' | 'huntress';

export interface Hero {
  id: string;
  name: string;
  heroClass: HeroClass;
  depth: number;
  pos: number;
}

export interface World {
  run: RunState;
  /** Generated levels by depth; depths are always generated in order. */
  levels: Record<number, Level>;
  heroes: Hero[];
  turn: number;
}

export type Action =
  | { type: 'move'; to: number }
  | { type: 'descend' }
  | { type: 'wait' };

export type ActionResult = { ok: true } | { ok: false; reason: string };

export const DEEPEST_AVAILABLE = 4;

export function createWorld(seed: number): World {
  return { run: createRun(seed), levels: {}, heroes: [], turn: 0 };
}

export function levelAt(world: World, depth: number): Level {
  for (let d = 1; d <= depth; d++) {
    if (!world.levels[d]) {
      world.levels[d] = generateLevel(world.run, d);
    }
  }
  return world.levels[depth]!;
}

export function addHero(world: World, hero: Omit<Hero, 'depth' | 'pos'>): Hero {
  const level = levelAt(world, 1);
  const added: Hero = { ...hero, depth: 1, pos: freeCellNear(world, level, 1, level.entrance) };
  world.heroes.push(added);
  return added;
}

export function heroById(world: World, id: string): Hero | undefined {
  return world.heroes.find((hero) => hero.id === id);
}

/** Cells a hero may step on: open ground, doors and visible traps. */
export function canEnter(level: Level, pos: number): boolean {
  if (pos < 0 || pos >= LENGTH) return false;
  const x = pos % WIDTH;
  if (pos < WIDTH || pos >= LENGTH - WIDTH || x === 0 || x === WIDTH - 1) return false;
  const terrain = level.map[pos]!;
  return hasFlag(terrain, F.PASSABLE) || (hasFlag(terrain, F.AVOID) && !hasFlag(terrain, F.PIT) && terrain !== T.WELL);
}

function occupied(world: World, depth: number, pos: number, except?: Hero): boolean {
  return world.heroes.some((h) => h !== except && h.depth === depth && h.pos === pos);
}

/** The cell itself if free, otherwise the nearest free walkable cell. */
function freeCellNear(world: World, level: Level, depth: number, pos: number): number {
  const seen = new Set([pos]);
  const queue = [pos];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head]!;
    if (canEnter(level, cell) && !occupied(world, depth, cell)) {
      return cell;
    }
    for (const n of NEIGHBOURS8) {
      const next = cell + n;
      if (next >= 0 && next < LENGTH && !seen.has(next) && canEnter(level, next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return pos;
}

export function act(world: World, heroId: string, action: Action): ActionResult {
  const hero = heroById(world, heroId);
  if (!hero) {
    return { ok: false, reason: 'unknown hero' };
  }
  const level = levelAt(world, hero.depth);

  switch (action.type) {
    case 'wait':
      break;

    case 'move': {
      if (!adjacent(hero.pos, action.to) || !canEnter(level, action.to)) {
        return { ok: false, reason: 'cannot move there' };
      }
      if (occupied(world, hero.depth, action.to, hero)) {
        return { ok: false, reason: 'cell is occupied' };
      }
      hero.pos = action.to;
      break;
    }

    case 'descend': {
      if (hero.pos !== level.exit) {
        return { ok: false, reason: 'not on the stairs' };
      }
      if (hero.depth >= DEEPEST_AVAILABLE) {
        return { ok: false, reason: 'deeper levels are not ported yet' };
      }
      const next = levelAt(world, hero.depth + 1);
      hero.depth++;
      hero.pos = freeCellNear(world, next, hero.depth, next.entrance);
      break;
    }
  }
  world.turn++;
  return { ok: true };
}

/** Shortest walkable path (excluding `from`), or null; used by clients for tap-to-move. */
export function findPath(level: Level, from: number, to: number, blocked: ReadonlySet<number> = new Set()): number[] | null {
  if (from === to) return [];
  const previous = new Map<number, number>([[from, -1]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head]!;
    for (const n of NEIGHBOURS8) {
      const next = cell + n;
      if (next < 0 || next >= LENGTH || previous.has(next) || !adjacent(cell, next)) continue;
      if (!canEnter(level, next) || (blocked.has(next) && next !== to)) continue;
      previous.set(next, cell);
      if (next === to) {
        const path = [to];
        for (let p = cell; p !== from; p = previous.get(p)!) path.unshift(p);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}
