import {
  createMob, GOO_PUMPED, type Hero, heroDefenseSkill, heroStealth, type Mob, type MobState, MOBS, rollMob,
} from './actors';
import { attack, hurt } from './combat';
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
  // The sad ghost drifts about the level at half speed, never after anyone.
  if (mob.state === 'passive') {
    const fov = castShadow(mob.pos, terrainBlocksSight(ctx.level.map));
    if (mob.target !== -1 && mob.target !== mob.pos && getCloser(ctx, mob, mob.target, fov)) {
      spend(mob, 1 / MOBS[mob.kind].speed);
    } else {
      mob.target = randomDestination(ctx.rng, ctx.level);
      spend(mob, TICK);
    }
    return;
  }
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
      if (enemyInFov && canAttack(ctx, mob, enemy)) {
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

    case 'fleeing': {
      // Mob.Fleeing: away from the enemy, or from where it was last seen.
      mob.enemySeen = enemyInFov;
      if (enemyInFov) mob.target = enemy.pos;
      const fled = mob.target === -1 ? 'cornered' : getFurther(ctx, mob, mob.target);
      if (fled === 'moved') {
        spend(mob, 1 / MOBS[mob.kind].speed);
      } else {
        spend(mob, TICK);
        if (fled === 'cornered') {
          // Thief.Fleeing.nowhereToRun: cornered, it turns on its pursuer.
          mob.state = 'hunting';
          ctx.effects.push({ type: 'cornered', depth: ctx.depth, mob: mob.id });
        }
      }
      return;
    }
  }
}

/**
 * PathFinder.getStepBack, simplified: the neighbouring cell furthest from
 * the threat, if it gains any distance; 'safe' when the threat cannot reach
 * the mob at all.
 */
function getFurther(ctx: Ctx, mob: Mob, threat: number): 'moved' | 'safe' | 'cornered' {
  const { world, depth, level } = ctx;
  const dist = new Int32Array(LENGTH).fill(-1);
  dist[threat] = 0;
  const queue = [threat];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!;
    for (const n of NEIGHBOURS8) {
      const next = c + n;
      if (next < 0 || next >= LENGTH || dist[next]! >= 0 || !adjacent(c, next) || !isPassable(level, next)) continue;
      dist[next] = dist[c]! + 1;
      queue.push(next);
    }
  }
  if (dist[mob.pos]! < 0) return 'safe';
  let best = -1;
  let bestDist = dist[mob.pos]!;
  for (const n of STEP_ORDER) {
    const step = mob.pos + n;
    if (step < 0 || step >= LENGTH || !adjacent(mob.pos, step) || charAt(world, depth, step)) continue;
    if (dist[step]! > bestDist) {
      best = step;
      bestDist = dist[step]!;
    }
  }
  if (best === -1) return 'cornered';
  moveMob(ctx, mob, best);
  return 'moved';
}

function notice(ctx: Ctx, mob: Mob, enemy: Hero, state: MobState): void {
  mob.enemySeen = true;
  mob.state = state;
  mob.target = enemy.pos;
  ctx.effects.push({ type: 'noticed', depth: ctx.depth, mob: mob.id });
  if (mob.kind === 'goo' || mob.kind === 'tengu') {
    ctx.effects.push({ type: 'yell', depth: ctx.depth, mob: mob.id, kind: mob.kind, line: 'notice', hero: enemy.id });
  }
}

function canAttack(ctx: Ctx, mob: Mob, enemy: Hero): boolean {
  // Shamans cast lightning and Tengu throws shuriken at anyone in a clear line.
  if (mob.kind === 'shaman' || mob.kind === 'tengu') return ballistica(ctx, mob.pos, enemy.pos).at(-1) === enemy.pos;
  return mob.pumped ? distance(mob.pos, enemy.pos) <= 2 : adjacent(mob.pos, enemy.pos);
}

/** Shaman.doAttack from afar: a bolt of lightning, worse for someone standing in water. */
function zapLightning(ctx: Ctx, mob: Mob, enemy: Hero): void {
  spend(mob, TIME_TO_ZAP);
  ctx.effects.push({ type: 'zapped', depth: ctx.depth, from: mob.pos, to: enemy.pos, bolt: 'lightning' });
  // A magic attack: accuracy counts double.
  const hit = ctx.rng.floatMax(MOBS.shaman.attack) * 2 >= ctx.rng.floatMax(heroDefenseSkill(enemy));
  let damage = 0;
  if (hit) {
    damage = ctx.rng.intBetween(2, 12);
    if (isWater(ctx.level.map[enemy.pos]!)) damage = Math.trunc(damage * 1.5);
  }
  ctx.effects.push({ type: 'attack', depth: ctx.depth, attacker: mob.id, target: enemy.id, hit, damage });
  if (hit) hurt(ctx, enemy, damage, mob);
}

const TIME_TO_ZAP = 2;
/** Tengu jumps away after this many blows at close quarters. */
const TENGU_JUMP_DELAY = 5;
/** ItemSpriteSheet.SHURIKEN. */
const SHURIKEN_SPRITE = 15;

/**
 * Tengu.jump: spent traps around flare up as poison traps, and Tengu lands
 * somewhere in sight, never right next to its enemy.
 */
function tenguJump(ctx: Ctx, mob: Mob): void {
  const { world, depth, level, rng } = ctx;
  mob.jumpIn = TENGU_JUMP_DELAY;
  const fov = castShadow(mob.pos, terrainBlocksSight(level.map));
  const enemy = heroesOn(world, depth).find((hero) => hero.id === mob.enemy);
  const pick = (landing: boolean): number =>
    randomCell(rng, (c) =>
      fov[c]! && isPassable(level, c) &&
      (!landing || (!(enemy && adjacent(c, enemy.pos)) && !charAt(world, depth, c))));
  for (let i = 0; i < 4; i++) {
    const trap = pick(false);
    if (trap === -1) break;
    if (level.map[trap] === T.INACTIVE_TRAP) {
      level.map[trap] = T.POISON_TRAP;
      ctx.effects.push({ type: 'discovered', depth, cell: trap });
    }
  }
  const to = pick(true);
  if (to === -1) return;
  const from = mob.pos;
  moveMob(ctx, mob, to);
  ctx.effects.push({ type: 'jumped', depth, mob: mob.id, from, to });
}

function doAttack(ctx: Ctx, mob: Mob, enemy: Hero): void {
  if (mob.kind === 'shaman' && !adjacent(mob.pos, enemy.pos)) {
    zapLightning(ctx, mob, enemy);
    return;
  }
  if (mob.kind === 'tengu') {
    mob.jumpIn = (mob.jumpIn ?? TENGU_JUMP_DELAY) - 1;
    if (mob.jumpIn <= 0 && adjacent(mob.pos, enemy.pos)) {
      tenguJump(ctx, mob);
    } else {
      if (!adjacent(mob.pos, enemy.pos)) {
        ctx.effects.push({ type: 'missile', depth: ctx.depth, from: mob.pos, to: enemy.pos, sprite: SHURIKEN_SPRITE });
      }
      attack(ctx, mob, enemy);
    }
    spend(mob, TICK);
    return;
  }
  if (mob.kind !== 'goo') {
    attack(ctx, mob, enemy);
    spend(mob, MOBS[mob.kind].attackDelay ?? TICK);
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
export function ballistica(ctx: Ctx, from: number, to: number): number[] {
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
  // Tengu does not walk up to anyone it can see: it jumps.
  if (mob.kind === 'tengu' && fov[target]) {
    tenguJump(ctx, mob);
    return true;
  }
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
    // Goo sleeps in its lair; Tengu only appears when someone enters the arena.
    if (level.depth === 10) return [];
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
