import { mobAct, populate, respawn, TIME_TO_RESPAWN } from './ai';
import { awareness, createHero, type Hero, heroAttackDelay, isAlive, type Mob, type PlayerInfo } from './actors';
import { attack, hurt } from './combat';
import {
  canEnter, charAt, type Ctx, type Effect, enterCell, type Floor, freeCellNear, heroesOn, isWater, leaveCell,
} from './floor';
import { isBossDepth } from './level/builder';
import { castShadow, terrainBlocksSight } from './fov';
import { generateLevel, type Level } from './level/generate';
import { adjacent, cellX, cellY, HEIGHT, LENGTH, NEIGHBOURS8, WIDTH } from './level/geometry';
import { discover, F, hasFlag, T } from './level/terrain';
import { deriveSeed, Rng, seedRng, Stream } from './rng';
import { createRun, type RunState } from './run';

/*
 * The shared game world. Every change goes through act(), so a server can run
 * the authoritative copy while clients replay the same calls.
 *
 * Time works as in the original's Actor queue, with one clock per depth:
 * whoever is due next acts. A player's action is stored as the hero's intent
 * and performed when that hero's turn comes; monsters act on their own. When
 * the hero who is due has no intent but a companion on the same depth is
 * waiting, a hero with no awake monster in sight simply rests, so exploring
 * never stalls. A hero in danger does hold the others up; the server decides
 * how long to wait for them (see blockers()).
 */

export type Action =
  | { type: 'move'; to: number }
  | { type: 'attack'; target: string }
  | { type: 'descend' }
  | { type: 'ascend' }
  | { type: 'wait' }
  | { type: 'search' };

export type ActionResult = { ok: true; effects: Effect[] } | { ok: false; reason: string };

export interface World {
  run: RunState;
  /** Generated levels by depth; depths are always generated in order. */
  levels: Record<number, Level>;
  /** The live state of every generated depth. */
  floors: Record<number, Floor>;
  heroes: Hero[];
  /** Cells the party has seen, per depth; shared by all heroes. */
  explored: Record<number, boolean[]>;
  /** Accepted actions so far. */
  turn: number;
  /** Last monster id handed out. */
  nextId: number;
  /** The run has ended: every hero has fallen, or the party won. */
  over: boolean;
  /** Goo is slain and a hero took the stairs out of its lair. */
  victory: boolean;
}

/** The last depth of the port so far: Goo's lair. Leaving it wins the run. */
export const DEEPEST_AVAILABLE = 5;
const TIME_TO_REST = 1;
const TIME_TO_SEARCH = 2;
/** How far a deliberate search reaches; the original only checked adjacent cells. */
const SEARCH_RADIUS = 2;
const REGENERATION_DELAY = 10;

export function createWorld(seed: number): World {
  return {
    run: createRun(seed), levels: {}, floors: {}, heroes: [], explored: {}, turn: 0, nextId: 0, over: false, victory: false,
  };
}

/** Starts a new run in place for the same party. */
export function restartWorld(world: World, seed: number): void {
  const party = world.heroes.map(({ id, name, heroClass }) => ({ id, name, heroClass }));
  Object.assign(world, createWorld(seed));
  for (const player of party) addHero(world, player);
}

export function levelAt(world: World, depth: number): Level {
  for (let d = 1; d <= depth; d++) {
    if (!world.levels[d]) {
      const level = generateLevel(world.run, d);
      world.levels[d] = level;
      world.floors[d] = {
        mobs: populate(world, level, Rng.seeded(deriveSeed(world.run.seed, Stream.MOBS, d))),
        rng: seedRng(deriveSeed(world.run.seed, Stream.PLAY, d)),
        now: 0,
        respawn: isBossDepth(d) ? -1 : TIME_TO_RESPAWN,
      };
    }
  }
  return world.levels[depth]!;
}

export function floorAt(world: World, depth: number): Floor {
  levelAt(world, depth);
  return world.floors[depth]!;
}

export function addHero(world: World, player: PlayerInfo): Hero {
  const level = levelAt(world, 1);
  const hero = createHero(player, 1, freeCellNear(world, level, 1, level.entrance), floorAt(world, 1).now);
  world.heroes.push(hero);
  observe(world, hero);
  return hero;
}

/** Adds a hero once; joining again (e.g. after a reconnect) keeps the existing one. */
export function joinHero(world: World, player: PlayerInfo): Hero {
  return heroById(world, player.id) ?? addHero(world, player);
}

export function heroById(world: World, id: string): Hero | undefined {
  return world.heroes.find((hero) => hero.id === id);
}

export function mobById(world: World, depth: number, id: string): Mob | undefined {
  return world.floors[depth]?.mobs.find((mob) => mob.id === id);
}

export { canEnter };

/** Field of view of one hero. */
export function heroView(world: World, hero: Hero): boolean[] {
  return castShadow(hero.pos, terrainBlocksSight(levelAt(world, hero.depth).map));
}

/** Everything the party currently sees on a depth. */
export function visibleCells(world: World, depth: number): boolean[] {
  const visible = new Array<boolean>(LENGTH).fill(false);
  for (const hero of heroesOn(world, depth)) {
    heroView(world, hero).forEach((seen, i) => {
      if (seen) visible[i] = true;
    });
  }
  return visible;
}

export function exploredCells(world: World, depth: number): boolean[] {
  return (world.explored[depth] ??= new Array<boolean>(LENGTH).fill(false));
}

/** Adds what a hero sees to the party's shared map. */
function observe(world: World, hero: Hero): void {
  const explored = exploredCells(world, hero.depth);
  heroView(world, hero).forEach((seen, i) => {
    if (seen) explored[i] = true;
  });
}

/** True when no awake monster is in the hero's sight. */
export function isSafe(world: World, hero: Hero): boolean {
  const fov = heroView(world, hero);
  return !floorAt(world, hero.depth).mobs.some((mob) => mob.state !== 'sleeping' && fov[mob.pos]);
}

/** Why an action is impossible right now, or null if it is fine. */
function problemWith(world: World, hero: Hero, action: Action): string | null {
  if (world.over) return 'the run is over';
  if (!isAlive(hero)) return 'you are dead';
  const level = levelAt(world, hero.depth);
  switch (action.type) {
    case 'wait':
    case 'search':
      return null;
    case 'move':
      if (!canEnter(level, action.to) || !adjacent(hero.pos, action.to)) return 'cannot move there';
      return charAt(world, hero.depth, action.to) ? 'cell is occupied' : null;
    case 'attack': {
      const mob = mobById(world, hero.depth, action.target);
      if (!mob) return 'no such enemy';
      return adjacent(hero.pos, mob.pos) ? null : 'too far away';
    }
    case 'descend':
      return hero.pos === level.exit ? null : 'not on the stairs';
    case 'ascend':
      if (hero.pos !== level.entrance) return 'not on the stairs';
      if (level.map[hero.pos] !== T.ENTRANCE) return 'the way up is flooded';
      return hero.depth <= 1 ? 'the way up is sealed' : null;
    default:
      return 'unknown action';
  }
}

/** Queues a player's action and lets the world run until someone must decide. */
export function act(world: World, heroId: string, action: Action): ActionResult {
  const hero = heroById(world, heroId);
  if (!hero) {
    return { ok: false, reason: 'unknown hero' };
  }
  const problem = problemWith(world, hero, action);
  if (problem) {
    return { ok: false, reason: problem };
  }
  hero.intent = action;
  const effects: Effect[] = [];
  settle(world, effects);
  world.turn++;
  return { ok: true, effects };
}

/* Scheduling */

type Turn = { kind: 'hero'; hero: Hero } | { kind: 'mob'; mob: Mob } | { kind: 'respawn' };

/** Who is due next on a depth; nothing happens on a depth without living heroes. */
function nextTurn(world: World, depth: number): Turn | undefined {
  const heroes = heroesOn(world, depth);
  if (heroes.length === 0) return undefined;
  const floor = floorAt(world, depth);
  // Ties go to heroes, then monsters, in a fixed order.
  let turn: Turn = { kind: 'hero', hero: heroes[0]! };
  let time = heroes[0]!.time;
  for (const hero of heroes) {
    if (hero.time < time) [turn, time] = [{ kind: 'hero', hero }, hero.time];
  }
  for (const mob of floor.mobs) {
    if (mob.time < time) [turn, time] = [{ kind: 'mob', mob }, mob.time];
  }
  if (floor.respawn >= 0 && floor.respawn < time) turn = { kind: 'respawn' };
  return turn;
}

function companionWaiting(world: World, hero: Hero): boolean {
  return world.heroes.some((other) => other !== hero && other.depth === hero.depth && isAlive(other) && other.intent);
}

/** Heroes everyone else on their depth is waiting for. */
export function blockers(world: World): string[] {
  const depths = new Set(world.heroes.filter(isAlive).map((hero) => hero.depth));
  const result: string[] = [];
  for (const depth of [...depths].sort((a, b) => a - b)) {
    const turn = nextTurn(world, depth);
    if (turn?.kind === 'hero' && !turn.hero.intent && companionWaiting(world, turn.hero)) {
      result.push(turn.hero.id);
    }
  }
  return result;
}

/** Runs every occupied depth until each waits for a player's decision. */
function settle(world: World, effects: Effect[]): void {
  for (let pass = 0; pass < 8; pass++) {
    const where = (): string => world.heroes.map((hero) => `${hero.depth}:${hero.hp > 0}`).join();
    const before = where();
    const depths = [...new Set(world.heroes.filter(isAlive).map((hero) => hero.depth))].sort((a, b) => a - b);
    for (const depth of depths) advance(world, depth, effects);
    // Someone changed depth: the depth they arrived on may now be able to move.
    if (where() === before) return;
  }
}

function advance(world: World, depth: number, effects: Effect[]): void {
  const floor = floorAt(world, depth);
  const ctx: Ctx = { world, depth, level: levelAt(world, depth), floor, rng: new Rng(floor.rng), effects };

  for (let guard = 0; guard < 100_000; guard++) {
    const turn = world.over ? undefined : nextTurn(world, depth);
    if (!turn) return;

    if (turn.kind === 'mob') {
      floor.now = Math.max(floor.now, turn.mob.time);
      mobAct(ctx, turn.mob);
      continue;
    }
    if (turn.kind === 'respawn') {
      floor.now = Math.max(floor.now, floor.respawn);
      respawn(ctx);
      continue;
    }

    const hero = turn.hero;
    floor.now = Math.max(floor.now, hero.time);
    if (hero.intent) {
      const action = hero.intent;
      hero.intent = null;
      const problem = problemWith(world, hero, action);
      if (problem) {
        effects.push({ type: 'interrupted', hero: hero.id, reason: problem });
      } else {
        perform(ctx, hero, action);
      }
      continue;
    }
    if (companionWaiting(world, hero) && isSafe(world, hero)) {
      spend(ctx, hero, TIME_TO_REST);
      continue;
    }
    return;
  }
}

function spend(ctx: Ctx, hero: Hero, time: number): void {
  hero.time += time;
  hero.regen += time;
  while (hero.regen >= REGENERATION_DELAY) {
    hero.regen -= REGENERATION_DELAY;
    if (isAlive(hero) && hero.hp < hero.ht) hero.hp++;
  }
  // Caustic ooze burns every turn until washed off in water.
  if (hero.ooze >= 0) {
    hero.ooze += time;
    while (hero.ooze >= 1 && isAlive(hero)) {
      hero.ooze -= 1;
      ctx.effects.push({ type: 'hurt', depth: hero.depth, who: hero.id, damage: 1 });
      hurt(ctx, hero, 1, null);
    }
    if (isWater(ctx.level.map[hero.pos]!) || !isAlive(hero)) hero.ooze = -1;
  }
}

function perform(ctx: Ctx, hero: Hero, action: Action): void {
  const { world, level } = ctx;
  switch (action.type) {
    case 'wait':
      spend(ctx, hero, TIME_TO_REST);
      break;

    case 'search': {
      const found = search(ctx, hero, true);
      const skill = awareness(hero);
      ctx.effects.push({ type: 'searched', hero: hero.id });
      spend(ctx, hero, found && ctx.rng.float() >= 2 * skill - skill * skill ? TIME_TO_SEARCH * 2 : TIME_TO_SEARCH);
      break;
    }

    case 'move': {
      const from = hero.pos;
      hero.pos = action.to;
      leaveCell(world, level, hero.depth, from);
      enterCell(level, hero.pos);
      spend(ctx, hero, 1);
      search(ctx, hero, false);
      break;
    }

    case 'attack':
      attack(ctx, hero, mobById(world, hero.depth, action.target)!);
      spend(ctx, hero, heroAttackDelay(hero));
      break;

    case 'descend':
      if (hero.depth >= DEEPEST_AVAILABLE) {
        // Out of Goo's lair: the sewers are conquered.
        world.victory = true;
        world.over = true;
        for (const other of world.heroes) other.intent = null;
        ctx.effects.push({ type: 'victory', hero: hero.id });
        return;
      }
      changeDepth(world, hero, hero.depth + 1, 'entrance');
      reviveFallen(world, hero.depth, ctx.effects);
      break;

    case 'ascend':
      changeDepth(world, hero, hero.depth - 1, 'exit');
      break;
  }
  if (isAlive(hero)) observe(world, hero);
}

/**
 * Hero.search: hidden doors and traps around the hero may be noticed in
 * passing after every step, and are always found by a deliberate search.
 */
function search(ctx: Ctx, hero: Hero, intentional: boolean): boolean {
  const radius = intentional ? SEARCH_RADIUS : 1;
  const fov = heroView(ctx.world, hero);
  const chance = awareness(hero);
  const cx = cellX(hero.pos);
  const cy = cellY(hero.pos);
  let found = false;
  for (let y = Math.max(cy - radius, 0); y <= Math.min(cy + radius, HEIGHT - 1); y++) {
    for (let x = Math.max(cx - radius, 0); x <= Math.min(cx + radius, WIDTH - 1); x++) {
      const p = x + y * WIDTH;
      if (fov[p] && hasFlag(ctx.level.map[p]!, F.SECRET) && (intentional || ctx.rng.float() < chance)) {
        ctx.level.map[p] = discover(ctx.level.map[p]!);
        exploredCells(ctx.world, hero.depth)[p] = true;
        ctx.effects.push({ type: 'discovered', depth: hero.depth, cell: p });
        found = true;
      }
    }
  }
  return found;
}

function changeDepth(world: World, hero: Hero, depth: number, arrival: 'entrance' | 'exit'): void {
  const fromLevel = levelAt(world, hero.depth);
  const fromDepth = hero.depth;
  const from = hero.pos;
  const level = levelAt(world, depth);
  hero.depth = depth;
  leaveCell(world, fromLevel, fromDepth, from);
  place(world, hero, level, arrival === 'entrance' ? level.entrance : level.exit);
}

function place(world: World, hero: Hero, level: Level, near: number): void {
  hero.pos = freeCellNear(world, level, hero.depth, near);
  hero.time = floorAt(world, hero.depth).now;
  enterCell(level, hero.pos);
  observe(world, hero);
}

/** Fallen heroes get back up at the stairs whenever a companion goes deeper. */
function reviveFallen(world: World, depth: number, effects: Effect[]): void {
  const level = levelAt(world, depth);
  for (const fallen of world.heroes) {
    if (isAlive(fallen)) continue;
    fallen.hp = Math.max(1, Math.floor(fallen.ht / 2));
    fallen.depth = depth;
    fallen.intent = null;
    fallen.regen = 0;
    place(world, fallen, level, level.entrance);
    effects.push({ type: 'revived', hero: fallen.id });
  }
}

/**
 * Shortest walkable path (excluding `from`), or null; used by clients for
 * tap-to-move. With `known`, the path only crosses explored cells, so tapping
 * never reveals the layout of unexplored areas.
 */
export function findPath(
  level: Level,
  from: number,
  to: number,
  blocked: ReadonlySet<number> = new Set(),
  known?: readonly boolean[],
): number[] | null {
  if (known && !known[to]) return null;
  if (from === to) return [];
  const previous = new Map<number, number>([[from, -1]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head]!;
    for (const n of NEIGHBOURS8) {
      const next = cell + n;
      if (next < 0 || next >= LENGTH || previous.has(next) || !adjacent(cell, next)) continue;
      if (!canEnter(level, next) || (blocked.has(next) && next !== to)) continue;
      if (known && !known[next]) continue;
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
