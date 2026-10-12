import { createMob, GOO_PUMPED, type Hero, heroStealth, type Mob, type MobState, MOBS, rollMob } from './actors';
import { attack } from './combat';
import { castShadow, terrainBlocksSight } from './fov';
import { charAt, type Ctx, enterCell, heroesOn, isPassable, isWater, leaveCell } from './floor';
import { isBossDepth } from './level/builder';
import type { Level, RoomInfo } from './level/generate';
import { adjacent, cellX, cellY, distance, LENGTH, NEIGHBOURS8, WIDTH } from './level/geometry';
import { RoomType } from './level/room';
import { F, hasFlag, T } from './level/terrain';
import { mobConditions } from './traps';
import type { Rng } from './rng';
import type { World } from './world';

/*
 * Monster behaviour, ported from Mob: sleeping monsters may notice a hero in
 * sight, wandering ones roam between rooms, hunting ones chase their enemy and
 * attack when adjacent. With several heroes, a monster keeps after the one it
 * chose while it can see them, otherwise turns to the nearest hero in sight.
 */

const TICK = 1;
const TIME_TO_WAKE_UP = 1;
export const TIME_TO_RESPAWN = 50;

function spend(mob: Mob, time: number): void {
  mob.time += time;
}

function chooseEnemy(ctx: Ctx, mob: Mob, fov: boolean[]): Hero | undefined {
  // Invisible heroes cannot be picked out.
  const heroes = heroesOn(ctx.world, ctx.depth).filter((hero) => hero.invisible <= 0);
  const current = heroes.find((hero) => hero.id === mob.enemy);
  if (current && fov[current.pos]) return current;

  let chosen: Hero | undefined;
  for (const hero of heroes) {
    if (fov[hero.pos] && (!chosen || distance(mob.pos, hero.pos) < distance(mob.pos, chosen.pos))) {
      chosen = hero;
    }
  }
  chosen ??= current;
  if (!chosen) {
    for (const hero of heroes) {
      if (!chosen || distance(mob.pos, hero.pos) < distance(mob.pos, chosen.pos)) chosen = hero;
    }
  }
  mob.enemy = chosen?.id ?? null;
  return chosen;
}

export function mobAct(ctx: Ctx, mob: Mob): void {
  // Poisoned or paralysed by a trap's gas.
  if (mobConditions(ctx, mob)) {
    spend(mob, TICK);
    return;
  }
  // Goo mends itself in the murky water of its lair.
  if (mob.kind === 'goo' && isWater(ctx.level.map[mob.pos]!) && mob.hp < mob.ht) mob.hp++;

  const fov = castShadow(mob.pos, terrainBlocksSight(ctx.level.map));
  const justAlerted = mob.alerted;
  mob.alerted = false;
  const enemy = chooseEnemy(ctx, mob, fov);
  const enemyInFov = enemy !== undefined && fov[enemy.pos]!;

  switch (mob.state) {
    case 'sleeping':
      if (enemyInFov && ctx.rng.int(distance(mob.pos, enemy.pos) + heroStealth(enemy)) === 0) {
        notice(ctx, mob, enemy, 'hunting');
        spend(mob, TIME_TO_WAKE_UP);
      } else {
        mob.enemySeen = false;
        spend(mob, TICK);
      }
      return;

    case 'wandering':
      if (enemyInFov && (justAlerted || ctx.rng.int(Math.trunc(distance(mob.pos, enemy.pos) / 2) + heroStealth(enemy)) === 0)) {
        // Spotting someone costs no time: it starts hunting on this very turn.
        notice(ctx, mob, enemy, 'hunting');
        return;
      }
      mob.enemySeen = false;
      if (mob.target !== -1 && getCloser(ctx, mob, mob.target, fov)) {
        spend(mob, 1 / MOBS[mob.kind].speed);
      } else {
        mob.target = randomDestination(ctx.rng, ctx.level);
        spend(mob, TICK);
      }
      return;

    case 'hunting':
      mob.enemySeen = enemyInFov;
      if (enemyInFov && canAttack(mob, enemy)) {
        doAttack(ctx, mob, enemy);
        return;
      }
      if (enemyInFov) mob.target = enemy.pos;
      if (mob.target !== -1 && getCloser(ctx, mob, mob.target, fov)) {
        spend(mob, 1 / MOBS[mob.kind].speed);
      } else {
        // Lost the trail.
        spend(mob, TICK);
        mob.state = 'wandering';
        mob.target = randomDestination(ctx.rng, ctx.level);
      }
      return;
  }
}

function notice(ctx: Ctx, mob: Mob, enemy: Hero, state: MobState): void {
  mob.enemySeen = true;
  mob.state = state;
  mob.target = enemy.pos;
  ctx.effects.push({ type: 'noticed', depth: ctx.depth, mob: mob.id });
  if (mob.kind === 'goo') ctx.effects.push({ type: 'yell', depth: ctx.depth, mob: mob.id, line: 'notice' });
}

function canAttack(mob: Mob, enemy: Hero): boolean {
  return mob.pumped ? distance(mob.pos, enemy.pos) <= 2 : adjacent(mob.pos, enemy.pos);
}

function doAttack(ctx: Ctx, mob: Mob, enemy: Hero): void {
  if (mob.kind !== 'goo') {
    attack(ctx, mob, enemy);
    spend(mob, TICK);
    return;
  }
  // Goo (Goo.doAttack): sometimes pumps itself up, then strikes hard, leaping
  // at an enemy two cells away.
  if (mob.pumped) {
    if (adjacent(mob.pos, enemy.pos)) {
      attack(ctx, mob, enemy, { attack: GOO_PUMPED.attack, damage: GOO_PUMPED.damage });
    } else {
      const trace = ballistica(ctx, mob.pos, enemy.pos);
      if (trace.at(-1) !== enemy.pos) {
        // No clear leap: it deflates and acts again at once.
        mob.pumped = false;
        return;
      }
      moveMob(ctx, mob, trace.at(-2)!);
      attack(ctx, mob, enemy, { attack: GOO_PUMPED.jumpAttack, damage: GOO_PUMPED.damage });
    }
    mob.pumped = false;
    spend(mob, TICK);
  } else if (ctx.rng.int(3) > 0) {
    attack(ctx, mob, enemy);
    spend(mob, TICK);
  } else {
    mob.pumped = true;
    spend(mob, GOO_PUMPED.delay);
    ctx.effects.push({ type: 'pumped', depth: ctx.depth, mob: mob.id });
  }
}

/**
 * Ballistica.cast: the cells a straight line from `from` passes on its way to
 * `to`, ending at the first character or sight-blocking cell, or before a wall.
 */
function ballistica(ctx: Ctx, from: number, to: number): number[] {
  const { world, depth, level } = ctx;
  let dx = cellX(to) - cellX(from);
  let dy = cellY(to) - cellY(from);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  dx = Math.abs(dx);
  dy = Math.abs(dy);
  const [stepA, stepB, dA, dB] = dx > dy ? [stepX, stepY * WIDTH, dx, dy] : [stepY * WIDTH, stepX, dy, dx];

  const trace = [from];
  let cell = from;
  let err = Math.trunc(dA / 2);
  while (cell !== to) {
    cell += stepA;
    err += dB;
    if (err >= dA) {
      err -= dA;
      cell += stepB;
    }
    trace.push(cell);
    const terrain = level.map[cell]!;
    if (!hasFlag(terrain, F.PASSABLE) && !hasFlag(terrain, F.AVOID)) {
      trace.pop();
      return trace;
    }
    if (hasFlag(terrain, F.LOS_BLOCKING) || charAt(world, depth, cell)) return trace;
  }
  return trace;
}

function getCloser(ctx: Ctx, mob: Mob, target: number, fov: boolean[]): boolean {
  if (mob.kind === 'goo') mob.pumped = false;
  const step = findStep(ctx, mob.pos, target, fov);
  if (step === -1) return false;
  moveMob(ctx, mob, step);
  return true;
}

function moveMob(ctx: Ctx, mob: Mob, to: number): void {
  const from = mob.pos;
  mob.pos = to;
  leaveCell(ctx.world, ctx.level, ctx.depth, from);
  enterCell(ctx.level, to);
  // Once Goo stirs, its lair floods behind the heroes: no way back up.
  if (mob.kind === 'goo' && ctx.level.map[ctx.level.entrance] === T.ENTRANCE) {
    ctx.level.map[ctx.level.entrance] = T.WATER_TILES;
  }
}

/** Dungeon.findPath: the next step, treating characters the mover can see as obstacles. */
function findStep(ctx: Ctx, from: number, to: number, fov: boolean[]): number {
  const { world, depth, level } = ctx;
  if (adjacent(from, to)) {
    return !charAt(world, depth, to) && isPassable(level, to) ? to : -1;
  }
  return getStep(from, to, (cell) => isPassable(level, cell) && !(fov[cell] && charAt(world, depth, cell)));
}

/** Neighbour order of PathFinder.getStep, which decides between equally short steps. */
const STEP_ORDER = [-1, +1, -WIDTH, +WIDTH, -WIDTH - 1, -WIDTH + 1, +WIDTH - 1, +WIDTH + 1];

/** PathFinder.getStep: the neighbour of `from` closest to `to`, or -1 if unreachable. */
export function getStep(from: number, to: number, passable: (cell: number) => boolean): number {
  if (from === to) return -1;
  const dist = new Int32Array(LENGTH).fill(LENGTH);
  dist[to] = 0;
  const queue = [to];
  let found = false;
  for (let head = 0; head < queue.length && !found; head++) {
    const cell = queue[head]!;
    const next = dist[cell]! + 1;
    for (const n of NEIGHBOURS8) {
      const neighbour = cell + n;
      if (neighbour < 0 || neighbour >= LENGTH || !adjacent(cell, neighbour) || dist[neighbour]! <= next) continue;
      if (neighbour === from) {
        dist[neighbour] = next;
        found = true;
        break;
      }
      if (passable(neighbour)) {
        dist[neighbour] = next;
        queue.push(neighbour);
      }
    }
  }
  if (!found) return -1;

  let best = -1;
  let bestDist = dist[from]!;
  for (const n of STEP_ORDER) {
    const step = from + n;
    if (step >= 0 && step < LENGTH && adjacent(from, step) && dist[step]! < bestDist) {
      best = step;
      bestDist = dist[step]!;
    }
  }
  return best;
}

/** A random cell inside a room, as Room.random(). */
function randomCellIn(rng: Rng, room: RoomInfo): number {
  return rng.intBetween(room.left + 1, room.right) + rng.intBetween(room.top + 1, room.bottom) * WIDTH;
}

/** RegularLevel.randomDestination: somewhere to wander to. */
function randomDestination(rng: Rng, level: Level): number {
  for (let attempt = 0; attempt < 100; attempt++) {
    const room = rng.element(level.rooms);
    if (!room) break;
    const cell = randomCellIn(rng, room);
    if (isPassable(level, cell)) return cell;
  }
  return randomCell(rng, (cell) => isPassable(level, cell));
}

/** Uniformly random cell satisfying `ok`, by reservoir sampling as in Level. */
function randomCell(rng: Rng, ok: (cell: number) => boolean): number {
  let result = -1;
  let candidates = 0;
  for (let cell = 0; cell < LENGTH; cell++) {
    if (ok(cell) && rng.int(++candidates) === 0) result = cell;
  }
  return result;
}

/** RegularLevel.randomRespawnCell: a free cell in a standard room, out of sight. */
export function randomRespawnCell(rng: Rng, world: World, level: Level, hidden: (cell: number) => boolean): number {
  const free = (cell: number): boolean =>
    cell >= 0 && cell < LENGTH && hidden(cell) && isPassable(level, cell) && !charAt(world, level.depth, cell);
  for (let count = 0; count < 10; count++) {
    let room: RoomInfo | undefined;
    for (let i = 0; i < 10 && !room; i++) {
      const candidate = rng.element(level.rooms);
      if (candidate?.type === RoomType.STANDARD) room = candidate;
    }
    if (!room) continue;
    const cell = randomCellIn(rng, room);
    if (free(cell)) return cell;
  }
  return randomCell(rng, free);
}

const nMobs = (rng: Rng, depth: number): number => 2 + (depth % 5) + rng.int(3);

const nextMobId = (world: World): string => `#${++world.nextId}`;

/** The monsters a new level starts with, asleep in its rooms. */
export function populate(world: World, level: Level, rng: Rng): Mob[] {
  if (isBossDepth(level.depth)) {
    const arena = level.rooms.find((room) => room.type === RoomType.BOSS_EXIT)!;
    return [createMob(nextMobId(world), rollMob(rng, level.depth), randomCellIn(rng, arena), 'sleeping', 0)];
  }
  const mobs: Mob[] = [];
  const count = nMobs(rng, level.depth);
  // Not yet registered in world.floors, so placement checks this list itself.
  const hidden = (cell: number): boolean => !mobs.some((mob) => mob.pos === cell);
  for (let i = 0; i < count; i++) {
    const kind = rollMob(rng, level.depth);
    const pos = randomRespawnCell(rng, world, level, hidden);
    if (pos === -1) break;
    mobs.push(createMob(nextMobId(world), kind, pos, 'sleeping', 0));
  }
  return mobs;
}

/** Level.respawner: tops the depth up with a wandering monster now and then. */
export function respawn(ctx: Ctx): void {
  const { world, depth, level, floor, rng } = ctx;
  if (floor.mobs.length < nMobs(rng, depth)) {
    const kind = rollMob(rng, depth);
    const seen = heroesOn(world, depth).map((hero) => castShadow(hero.pos, terrainBlocksSight(level.map)));
    const pos = randomRespawnCell(rng, world, level, (cell) => !seen.some((fov) => fov[cell]));
    if (pos !== -1) {
      floor.mobs.push(createMob(nextMobId(world), kind, pos, 'wandering', floor.now));
    }
  }
  floor.respawn += TIME_TO_RESPAWN;
}
