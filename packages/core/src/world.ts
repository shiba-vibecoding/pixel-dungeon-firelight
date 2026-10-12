import { mobAct, populate, respawn, TIME_TO_RESPAWN } from './ai';
import {
  awareness, createHero, createMob, type Hero, heroAttackDelay, heroSpeed, hungerGrowth, hungerStep, HUNGRY, isAlive,
  isStarving, type Mob, type PlayerInfo, ringBonus, STARVING,
} from './actors';
import { attack, CRIPPLE_TURNS, hurt } from './combat';
import {
  canEnter, charAt, type Ctx, dropItem, type Effect, enterCell, exploredCells, type Floor, freeCellNear, heroesOn,
  heroView, isPassable, isWater, leaveCell, observe,
} from './floor';
import { inventoryProblem, isInventoryAction, type InventoryAction, performInventory } from './inventory';
import { createItem, createItems, itemDef, ItemGenerator, type ItemKind, WAND_RECHARGE, wandMaxCharges } from './items';
import { staggerTarget, stepOnPlant, sungrassHeals } from './plants';
import { discoverable } from './level/flags';
import { type GhostQuest, rewardFromGhost, rewardProblem, spawnGhost, talkToGhost } from './quest';
import { trapAt, triggerTrap } from './traps';
import { spawnWandmaker, talkToWandmaker, type WandQuest, wandFromWandmaker, wandRewardProblem } from './wandmaker';
import { isBossDepth } from './level/builder';
import { generateLevel, type Level } from './level/generate';
import { adjacent, cellX, cellY, HEIGHT, LENGTH, NEIGHBOURS8, WIDTH } from './level/geometry';
import { breakStairsRoom } from './level/halls-boss';
import { RoomType } from './level/room';
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
  /** Into the chasm next to the hero, down to the depth below. */
  | { type: 'jump'; to: number }
  | { type: 'wait' }
  | { type: 'search' }
  /** The sad ghost's reward, for its rose. */
  | { type: 'reward'; choice: 'weapon' | 'armor' }
  /** The old wandmaker's reward: a battle wand or a useful one. */
  | { type: 'wandReward'; choice: 'battle' | 'utility' }
  | InventoryAction;

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
  /** Potion and scroll kinds the party has identified; knowledge is shared. */
  known: ItemKind[];
  /** The sad ghost's quest, once the ghost has appeared. */
  quest: GhostQuest | null;
  /** The old wandmaker's errand, once he has appeared. */
  wandQuest: WandQuest | null;
}

/** The last depth of the port so far: Goo's lair. Leaving it wins the run. */
export const DEEPEST_AVAILABLE = 26;
const TIME_TO_REST = 1;
const TIME_TO_SEARCH = 2;
/** How far a deliberate search reaches; the original only checked adjacent cells. */
const SEARCH_RADIUS = 2;
const REGENERATION_DELAY = 10;
/** Sub-stream of a depth's monster stream for the sad ghost. */
const GHOST_STREAM = 1;
const WANDMAKER_STREAM = 2;

export function createWorld(seed: number): World {
  return {
    run: createRun(seed), levels: {}, floors: {}, heroes: [], explored: {}, turn: 0, nextId: 0, over: false, victory: false,
    known: [], quest: null, wandQuest: null,
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
      const mobs = populate(world, level, Rng.seeded(deriveSeed(world.run.seed, Stream.MOBS, d)));
      spawnGhost(world, level, mobs, Rng.seeded(deriveSeed(world.run.seed, Stream.MOBS, d, GHOST_STREAM)));
      spawnWandmaker(world, level, mobs, Rng.seeded(deriveSeed(world.run.seed, Stream.MOBS, d, WANDMAKER_STREAM)));
      world.floors[d] = {
        mobs,
        rng: seedRng(deriveSeed(world.run.seed, Stream.PLAY, d)),
        now: 0,
        plants: [...(level.plants ?? [])],
        // Boss levels and the Amulet's hall never fill up again, and hold only what their layout asks for.
        respawn: isBossDepth(d) || d >= 26 ? -1 : TIME_TO_RESPAWN,
        heaps: createItems(
          world.run, level, Rng.seeded(deriveSeed(world.run.seed, Stream.ITEMS, d)), isBossDepth(d) || d >= 26, world.heroes.length,
        ),
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
  // Heroes know what they set out with.
  for (const item of [...hero.items, ...hero.rings]) {
    if (!world.known.includes(item.kind)) world.known.push(item.kind);
  }
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

export { canEnter, exploredCells, heroView };

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

/** True when no awake monster is in the hero's sight. */
export function isSafe(world: World, hero: Hero): boolean {
  const fov = heroView(world, hero);
  return !floorAt(world, hero.depth).mobs.some((mob) => mob.state !== 'sleeping' && mob.state !== 'passive' && fov[mob.pos]);
}

/** Why an action is impossible right now, or null if it is fine. */
function problemWith(world: World, hero: Hero, action: Action): string | null {
  if (world.over) return 'the run is over';
  if (!isAlive(hero)) return 'you are dead';
  if (isInventoryAction(action)) return inventoryProblem(world, hero, action);
  const level = levelAt(world, hero.depth);
  switch (action.type) {
    case 'wait':
    case 'search':
      return null;
    case 'move':
      if (hero.rooted > 0) return 'you are rooted';
      if (Number.isInteger(action.to) && adjacent(hero.pos, action.to) && level.map[action.to] === T.LOCKED_DOOR) {
        return keyFor(hero) >= 0 ? null : 'the door is locked';
      }
      if (!heroCanEnter(level, hero, action.to) || !adjacent(hero.pos, action.to)) return 'cannot move there';
      return charAt(world, hero.depth, action.to) ? 'cell is occupied' : null;
    case 'attack': {
      const mob = mobById(world, hero.depth, action.target);
      if (!mob) return 'no such enemy';
      // Charmed, the hero cannot bring themselves to strike the charmer.
      if (hero.charmed > 0 && hero.charmedBy === mob.id) return 'you are charmed';
      return adjacent(hero.pos, mob.pos) ? null : 'too far away';
    }
    case 'reward':
      return rewardProblem(world, hero, action.choice);
    case 'wandReward':
      return wandRewardProblem(world, hero, action.choice);
    case 'descend':
      return hero.pos === level.exit ? null : 'not on the stairs';
    case 'jump':
      if (hero.rooted > 0) return 'you are rooted';
      if (!Number.isInteger(action.to) || !adjacent(hero.pos, action.to) || !hasFlag(level.map[action.to]!, F.PIT)) {
        return 'no chasm there';
      }
      // Chasms never open above a boss's level, but should one, it holds.
      return isBossDepth(hero.depth + 1) || hero.depth + 1 >= DEEPEST_AVAILABLE ? 'the chasm has a bottom' : null;
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
    if (hero.paralysed > 0) {
      // Paralysed: the turn passes; whatever the player chose waits.
      spend(ctx, hero, TIME_TO_REST);
      overChasm(ctx, hero);
      continue;
    }
    if (hero.intent) {
      const action = hero.intent;
      hero.intent = null;
      const problem = problemWith(world, hero, action);
      if (problem) {
        effects.push({ type: 'interrupted', hero: hero.id, reason: problem });
      } else {
        perform(ctx, hero, action);
        if (floor.falling) itemsFall(world, depth);
        overChasm(ctx, hero);
      }
      continue;
    }
    if (companionWaiting(world, hero) && isSafe(world, hero)) {
      spend(ctx, hero, TIME_TO_REST);
      overChasm(ctx, hero);
      continue;
    }
    return;
  }
}

function spend(ctx: Ctx, hero: Hero, time: number): void {
  // Slowed, everything takes twice as long (Char.spend); a ring of haste speeds it all up.
  if (hero.slowed > 0) time *= 2;
  const haste = ringBonus(hero, 'ring.haste');
  if (haste !== 0) time *= 1.1 ** -haste;
  hero.time += time;
  hero.regen += time;
  // Regeneration: a ring of mending makes wounds close faster.
  const regenDelay = REGENERATION_DELAY / 1.2 ** ringBonus(hero, 'ring.mending');
  while (hero.regen >= regenDelay) {
    hero.regen -= regenDelay;
    // A starving body does not heal (Regeneration).
    if (isAlive(hero) && hero.hp < hero.ht && !isStarving(hero)) hero.hp++;
  }
  starve(ctx, hero, time);
  wearRings(ctx, hero, time);
  // Caustic ooze burns every turn until washed off in water.
  if (hero.ooze >= 0) {
    hero.ooze += time;
    while (hero.ooze >= 1 && isAlive(hero)) {
      hero.ooze -= 1;
      ctx.effects.push({ type: 'hurt', depth: hero.depth, who: hero.id, damage: 1 });
      hurt(ctx, hero, 1, 'ooze');
    }
    if (isWater(ctx.level.map[hero.pos]!) || !isAlive(hero)) hero.ooze = -1;
  }
  hero.mindVision = Math.max(0, hero.mindVision - time);
  hero.invisible = Math.max(0, hero.invisible - time);
  hero.paralysed = Math.max(0, hero.paralysed - time);
  hero.rooted = Math.max(0, hero.rooted - time);
  hero.slowed = Math.max(0, hero.slowed - time);
  hero.weakened = Math.max(0, hero.weakened - time);
  hero.crippled = Math.max(0, hero.crippled - time);
  hero.light = Math.max(0, hero.light - time);
  hero.charmed = Math.max(0, hero.charmed - time);
  hero.dizzy = Math.max(0, hero.dizzy - time);
  hero.barkskin = Math.max(0, (hero.barkskin ?? 0) - time);
  sungrassHeals(hero, time);
  if (hero.charmed <= 0) hero.charmedBy = null;

  // Wands recharge with time.
  for (const item of hero.items) {
    if (item.charges === undefined) continue;
    const max = wandMaxCharges(item);
    item.recharge = item.charges >= max ? 0 : (item.recharge ?? 0) + time;
    while (item.recharge >= WAND_RECHARGE && item.charges < max) {
      item.recharge -= WAND_RECHARGE;
      item.charges++;
    }
  }

  // Poison and fire hurt once for every whole turn that passes.
  const ticks = (left: number): number => Math.floor(left) - Math.floor(Math.max(0, left - time));
  if (hero.poison > 0) {
    const damage = ticks(hero.poison);
    hero.poison = Math.max(0, hero.poison - time);
    if (damage > 0 && isAlive(hero)) {
      ctx.effects.push({ type: 'hurt', depth: hero.depth, who: hero.id, damage });
      hurt(ctx, hero, damage, 'poison');
    }
  }
  // Armour of viscosity: blows held back are taken now, a point a turn (DeferedDamage).
  if ((hero.deferred ?? 0) > 0) {
    const damage = ticks(hero.deferred!);
    hero.deferred = Math.max(0, hero.deferred! - time);
    if (damage > 0 && isAlive(hero)) {
      ctx.effects.push({ type: 'hurt', depth: hero.depth, who: hero.id, damage });
      hurt(ctx, hero, damage, 'deferred');
    }
  }
  if (hero.blind) hero.blind = Math.max(0, hero.blind - time);
  if (hero.levitating) hero.levitating = Math.max(0, hero.levitating - time);
  if (hero.gasImmune) hero.gasImmune = Math.max(0, hero.gasImmune - time);
  if (hero.burning > 0) {
    if (isWater(ctx.level.map[hero.pos]!)) {
      hero.burning = 0;
    } else {
      for (let i = ticks(hero.burning); i > 0 && isAlive(hero); i--) {
        const damage = ctx.rng.intRange(1, 3 + Math.trunc(hero.depth / 4));
        ctx.effects.push({ type: 'hurt', depth: hero.depth, who: hero.id, damage });
        hurt(ctx, hero, damage, 'burning');
      }
      hero.burning = Math.max(0, hero.burning - time);
    }
  }
}

/**
 * Hunger: it grows a step at a time until the hero is starving, which stops
 * healing and now and then costs a hit point.
 */
function starve(ctx: Ctx, hero: Hero, time: number): void {
  const step = hungerStep(hero);
  hero.hungerTime += time;
  while (hero.hungerTime >= step && isAlive(hero)) {
    hero.hungerTime -= step;
    if (isStarving(hero)) {
      if (ctx.rng.float() < 0.3 && (hero.hp > 1 || hero.paralysed <= 0)) {
        ctx.effects.push({ type: 'hurt', depth: hero.depth, who: hero.id, damage: 1 });
        hurt(ctx, hero, 1, 'hunger');
      }
      continue;
    }
    const before = hero.hunger;
    hero.hunger = Math.min(Math.max(0, before + hungerGrowth(hero)), STARVING);
    if (hero.hunger >= STARVING) ctx.effects.push({ type: 'hunger', hero: hero.id, state: 'starving' });
    else if (hero.hunger >= HUNGRY && before < HUNGRY) ctx.effects.push({ type: 'hunger', hero: hero.id, state: 'hungry' });
  }
}

/** Ring.Ticker: a ring worn long enough tells the party what it is. */
function wearRings(ctx: Ctx, hero: Hero, time: number): void {
  for (const ring of hero.rings) {
    if (ctx.world.known.includes(ring.kind)) continue;
    ring.worn = (ring.worn ?? 0) + time;
    if (ring.worn >= RING_TICKS_TO_KNOW) {
      ctx.world.known.push(ring.kind);
      ctx.effects.push({ type: 'identified', hero: hero.id, kind: ring.kind });
    }
  }
}

const RING_TICKS_TO_KNOW = 200;

function perform(ctx: Ctx, hero: Hero, action: Action): void {
  const { world, level } = ctx;
  if (isInventoryAction(action)) {
    spend(ctx, hero, performInventory(ctx, hero, action));
    if (isAlive(hero)) observe(world, hero);
    return;
  }
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
      if (level.map[action.to] === T.LOCKED_DOOR) {
        // The iron key turns in the lock and stays there.
        hero.items.splice(keyFor(hero), 1);
        level.map[action.to] = T.DOOR;
        ctx.effects.push({ type: 'unlocked', depth: hero.depth, pos: action.to, hero: hero.id });
      }
      // Vertigo: a dizzy hero staggers to some other cell, or into a wall.
      let to = action.to;
      if (hero.dizzy > 0) {
        to = staggerTarget(ctx, hero.pos);
        if (!heroCanEnter(level, hero, to) || charAt(world, hero.depth, to) || level.map[to] === T.LOCKED_DOOR) to = hero.pos;
      }
      const from = hero.pos;
      hero.pos = to;
      leaveCell(world, level, hero.depth, from);
      enterCell(level, hero.pos);
      spend(ctx, hero, 1 / heroSpeed(hero));
      if (hero.pos === from) break;
      // The step is done, then the trap goes off; floating, the hero touches nothing (Char.move).
      const floating = (hero.levitating ?? 0) > 0;
      if (!floating && trapAt(level.map[hero.pos]!)) triggerTrap(ctx, hero, hero.pos);
      if (!floating && level.map[hero.pos] === T.WELL) drinkFromWell(ctx, hero);
      if (!floating) stepOnPlant(ctx, hero, hero.pos);
      if (!floating && level.map[hero.pos] === T.HIGH_GRASS) trample(ctx, hero.pos, hero);
      if (level.arenaDoor !== undefined) {
        if (hero.depth === 15) enterLair(ctx, hero);
        else if (hero.depth === 20) enterThroneHall(ctx, hero);
        else if (hero.depth === 25) awakenYog(ctx, hero);
        else enterArena(ctx, hero);
      }
      search(ctx, hero, false);
      break;
    }

    case 'attack': {
      const mob = mobById(world, hero.depth, action.target)!;
      if (mob.state === 'passive') {
        // Not a fight: a word with the sad ghost, or business with the
        // shopkeeper; it takes no time.
        if (mob.kind === 'shopkeeper') ctx.effects.push({ type: 'shop', hero: hero.id });
        else if (mob.kind === 'wandmaker') talkToWandmaker(ctx, hero);
        else talkToGhost(ctx, hero);
        break;
      }
      attack(ctx, hero, mob);
      // A berserker strikes faster the more foes surround him.
      let delay = heroAttackDelay(hero);
      if (hero.subclass === 'berserker') {
        const around = NEIGHBOURS8.filter((n) => charAt(world, hero.depth, hero.pos + n)).length;
        if (around > 1) delay *= 1 - around / 16;
      }
      spend(ctx, hero, delay);
      break;
    }

    case 'reward':
      rewardFromGhost(ctx, hero, action.choice);
      break;

    case 'wandReward':
      wandFromWandmaker(ctx, hero, action.choice);
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

    case 'jump':
      fall(ctx, hero, action.to);
      return;

    case 'ascend':
      changeDepth(world, hero, hero.depth - 1, 'exit');
      break;
  }
  if (isAlive(hero)) observe(world, hero);
}

/**
 * A boss's door shuts only once every living hero is through it: a companion
 * still upstairs must never find it closed, with no key to open it again.
 */
function wholeParty(world: World, depth: number, through: (pos: number) => boolean): boolean {
  return world.heroes.filter(isAlive).every((hero) => hero.depth === depth && through(hero.pos));
}

/**
 * PrisonBossLevel.press: Tengu appears when the first hero sets foot in the
 * arena, and the door locks once the whole party on the depth is inside.
 */
function enterArena(ctx: Ctx, hero: Hero): void {
  const { level, floor, world, depth, rng } = ctx;
  const arena = level.rooms.find((room) => room.type === RoomType.BOSS_EXIT);
  if (!arena) return;
  const inside = (pos: number): boolean =>
    cellX(pos) > arena.left && cellX(pos) < arena.right && cellY(pos) > arena.top && cellY(pos) < arena.bottom;
  if (!floor.arenaEntered) {
    if (!inside(hero.pos)) return;
    floor.arenaEntered = true;
    let pos = -1;
    for (let attempt = 0; attempt < 200 && pos === -1; attempt++) {
      const cell = rng.intBetween(arena.left + 1, arena.right) + rng.intBetween(arena.top + 1, arena.bottom) * WIDTH;
      if (cell !== hero.pos && isPassable(level, cell) && !charAt(world, depth, cell)) pos = cell;
    }
    if (pos === -1) return;
    const tengu = createMob(`#${++world.nextId}`, 'tengu', pos, 'hunting', floor.now);
    Object.assign(tengu, { enemy: hero.id, target: hero.pos, enemySeen: true });
    floor.mobs.push(tengu);
    enterCell(level, pos);
    ctx.effects.push({ type: 'noticed', depth, mob: tengu.id });
    ctx.effects.push({ type: 'yell', depth, mob: tengu.id, kind: 'tengu', line: 'notice', hero: hero.id });
  }
  const fighting = floor.mobs.some((mob) => mob.kind === 'tengu');
  const door = level.arenaDoor!;
  if (fighting && level.map[door] !== T.LOCKED_DOOR && wholeParty(world, depth, inside)) {
    level.map[door] = T.LOCKED_DOOR;
    ctx.effects.push({ type: 'arena', depth, sealed: true });
  }
}

/**
 * CavesBossLevel.press: DM-300 starts up somewhere out of sight as soon as a
 * hero steps out of the stairs room, and the rock closes its door once the
 * whole party is out in the cave.
 */
function enterLair(ctx: Ctx, hero: Hero): void {
  const { level, floor, world, depth, rng } = ctx;
  const room = level.rooms.find((r) => r.type === RoomType.ENTRANCE);
  if (!room) return;
  const outside = (pos: number): boolean =>
    cellX(pos) < room.left || cellX(pos) > room.right || cellY(pos) < room.top || cellY(pos) > room.bottom;
  if (!floor.arenaEntered) {
    if (!outside(hero.pos)) return;
    floor.arenaEntered = true;
    const seen = heroView(world, hero);
    let pos = -1;
    for (let attempt = 0; attempt < 500 && pos === -1; attempt++) {
      const cell = rng.int(LENGTH);
      if (isPassable(level, cell) && outside(cell) && !seen[cell] && !charAt(world, depth, cell)) pos = cell;
    }
    if (pos === -1) return;
    const dm300 = createMob(`#${++world.nextId}`, 'dm300', pos, 'hunting', floor.now);
    Object.assign(dm300, { enemy: hero.id, target: hero.pos });
    floor.mobs.push(dm300);
    enterCell(level, pos);
    ctx.effects.push({ type: 'yell', depth, mob: dm300.id, kind: 'dm300', line: 'notice', hero: hero.id });
  }
  const fighting = floor.mobs.some((mob) => mob.kind === 'dm300');
  const door = level.arenaDoor!;
  if (fighting && level.map[door] !== T.WALL && wholeParty(world, depth, outside)) {
    level.map[door] = T.WALL;
    ctx.effects.push({ type: 'arena', depth, sealed: true });
  }
}

/**
 * CityBossLevel.press: the King of Dwarves appears in his hall, out of sight
 * if he can, when a hero steps through its door; the door locks once the
 * whole party is in.
 */
function enterThroneHall(ctx: Ctx, hero: Hero): void {
  const { level, floor, world, depth, rng } = ctx;
  const door = level.arenaDoor!;
  const inHall = (pos: number): boolean => cellY(pos) < cellY(door);
  if (!floor.arenaEntered) {
    if (!inHall(hero.pos)) return;
    floor.arenaEntered = true;
    const seen = heroView(world, hero);
    let pos = -1;
    for (let attempt = 0; attempt < 500 && pos === -1; attempt++) {
      const cell = rng.int(LENGTH);
      if (isPassable(level, cell) && inHall(cell) && !charAt(world, depth, cell) && (!seen[cell] || attempt > 20)) pos = cell;
    }
    if (pos === -1) return;
    const king = createMob(`#${++world.nextId}`, 'king', pos, 'hunting', floor.now);
    Object.assign(king, { enemy: hero.id, target: hero.pos, enemySeen: true });
    floor.mobs.push(king);
    enterCell(level, pos);
    ctx.effects.push({ type: 'yell', depth, mob: king.id, kind: 'king', line: 'notice', hero: hero.id });
  }
  const fighting = floor.mobs.some((mob) => mob.kind === 'king');
  if (fighting && level.map[door] !== T.LOCKED_DOOR && wholeParty(world, depth, inHall)) {
    level.map[door] = T.LOCKED_DOOR;
    ctx.effects.push({ type: 'arena', depth, sealed: true });
  }
}

/**
 * HallsBossLevel.press: the first step off the stairs breaks the walls of
 * their room, and the stairs with them; Yog-Dzewa awakens somewhere in the
 * dark, its two fists beside it.
 */
function awakenYog(ctx: Ctx, hero: Hero): void {
  const { level, floor, world, depth, rng } = ctx;
  if (floor.arenaEntered || hero.pos === level.entrance) return;
  floor.arenaEntered = true;
  const broken = breakStairsRoom(level.map);
  level.map[level.entrance] = T.EMPTY_SP;
  for (const cell of [...broken, level.entrance]) ctx.effects.push({ type: 'burnt', depth, pos: cell });
  for (const h of heroesOn(world, depth)) observe(world, h);
  const seen = heroView(world, hero);
  let pos = -1;
  for (let attempt = 0; attempt < 1000 && pos === -1; attempt++) {
    const cell = rng.int(LENGTH);
    if (isPassable(level, cell) && !seen[cell] && !charAt(world, depth, cell)) pos = cell;
  }
  if (pos === -1) return;
  const yog = createMob(`#${++world.nextId}`, 'yog', pos, 'hunting', floor.now);
  Object.assign(yog, { enemy: hero.id, target: hero.pos });
  floor.mobs.push(yog);
  enterCell(level, pos);
  // Yog.spawnFists: the rotting fist and the burning fist, right next to it.
  const around = NEIGHBOURS8.map((n) => pos + n).filter((c) => isPassable(level, c) && !charAt(world, depth, c));
  for (const kind of ['rottingFist', 'burningFist'] as const) {
    if (around.length === 0) break;
    const cell = around.splice(rng.index(around.length), 1)[0]!;
    const fist = createMob(`#${++world.nextId}`, kind, cell, 'wandering', floor.now + 1);
    fist.target = hero.pos;
    floor.mobs.push(fist);
    enterCell(level, cell);
  }
  ctx.effects.push({ type: 'yell', depth, mob: yog.id, kind: 'yog', line: 'notice', hero: hero.id });
}

/** HighGrass.trample: walked through, tall grass is flattened and sometimes sheds a seed or a dewdrop. */
function trample(ctx: Ctx, pos: number, hero?: Hero): void {
  ctx.level.map[pos] = T.GRASS;
  // A warden draws bark from the grass.
  if (hero?.subclass === 'warden') hero.barkskin = Math.max(hero.barkskin, Math.trunc(hero.ht / 3));
  if (ctx.rng.int(18) === 0) dropItem(ctx.floor, pos, new ItemGenerator(ctx.rng, ctx.depth).of('seed'));
  if (ctx.rng.int(6) === 0) dropItem(ctx.floor, pos, createItem('dew'));
}

/** The backpack slot of an iron key for the hero's current depth, or -1. */
function keyFor(hero: Hero): number {
  return hero.items.findIndex((item) => item.kind === 'key.iron' && item.depth === hero.depth);
}

/**
 * WellWater: water of health heals and cures; water of awareness reveals the
 * level and what the hero carries. A well runs dry once drunk from.
 */
function drinkFromWell(ctx: Ctx, hero: Hero): void {
  const { level, world } = ctx;
  const index = level.wells.findIndex((well) => well.pos === hero.pos);
  level.map[hero.pos] = T.EMPTY_WELL;
  if (index < 0) return;
  const { water } = level.wells.splice(index, 1)[0]!;
  if (water === 'health') {
    // WaterOfHealth: healed, cured and fed.
    hero.hp = hero.ht;
    hero.poison = 0;
    hero.burning = 0;
    hero.ooze = -1;
    hero.hunger = 0;
    hero.weakened = 0;
    hero.crippled = 0;
  } else {
    for (const item of hero.items) {
      const category = itemDef(item.kind).category;
      if ((category === 'potion' || category === 'scroll') && !world.known.includes(item.kind)) world.known.push(item.kind);
    }
    const explored = exploredCells(world, hero.depth);
    discoverable(level.map).forEach((open, i) => {
      if (!open) return;
      explored[i] = true;
      if (hasFlag(level.map[i]!, F.SECRET)) level.map[i] = discover(level.map[i]!);
    });
  }
  ctx.effects.push({ type: 'well', hero: hero.id, water });
}

/**
 * Hero.search: hidden doors and traps around the hero may be noticed in
 * passing after every step, and are always found by a deliberate search.
 */
function search(ctx: Ctx, hero: Hero, intentional: boolean): boolean {
  // A ring of detection widens the search.
  const radius = Math.max(0, (intentional ? SEARCH_RADIUS : 1) + ringBonus(hero, 'ring.detection'));
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

/**
 * Chasm.heroFall and heroLand: down through the chasm to the depth below,
 * landing hard and crippled. Under a weak floor lies that depth's pit room.
 */
function fall(ctx: Ctx, hero: Hero, into: number): void {
  const { world, level, effects } = ctx;
  const weakFloor = level.rooms.some((room) => room.type === RoomType.WEAK_FLOOR && within(room, into));
  effects.push({ type: 'fell', hero: hero.id, depth: hero.depth, pos: into });
  const depth = hero.depth + 1;
  const below = levelAt(world, depth);
  const floor = floorAt(world, depth);
  const rng = new Rng(floor.rng);
  leaveCell(world, level, hero.depth, hero.pos);
  hero.depth = depth;
  hero.pos = landingCell(world, depth, rng, weakFloor);
  hero.time = floor.now;
  enterCell(below, hero.pos);
  hero.crippled = Math.max(hero.crippled, CRIPPLE_TURNS);
  const damage = rng.intRange(Math.trunc(hero.ht / 3), Math.trunc(hero.ht / 2));
  effects.push({ type: 'hurt', depth, who: hero.id, damage });
  hurt({ world, depth, level: below, floor, rng, effects }, hero, damage, 'fall');
  if (!isAlive(hero)) return;
  observe(world, hero);
  reviveFallen(world, depth, effects);
}

/** Level.press on a chasm: a hero no longer floating (or blinked onto it) falls through. */
function overChasm(ctx: Ctx, hero: Hero): void {
  if (!isAlive(hero) || hero.depth !== ctx.depth || (hero.levitating ?? 0) > 0) return;
  if (!hasFlag(ctx.level.map[hero.pos]!, F.PIT) || isBossDepth(hero.depth + 1) || hero.depth + 1 >= DEEPEST_AVAILABLE) return;
  fall(ctx, hero, hero.pos);
}

/** Where a hero may step: open ground, doors and visible traps, and chasms too while floating. */
export function heroCanEnter(level: Level, hero: Hero, pos: number): boolean {
  if (canEnter(level, pos)) return true;
  return (hero.levitating ?? 0) > 0 && Number.isInteger(pos) && pos >= 0 && pos < LENGTH && hasFlag(level.map[pos]!, F.PIT) &&
    pos % WIDTH > 0 && pos % WIDTH < WIDTH - 1 && pos >= WIDTH && pos < LENGTH - WIDTH;
}

const within = (room: { left: number; top: number; right: number; bottom: number }, pos: number): boolean =>
  cellX(pos) > room.left && cellX(pos) < room.right && cellY(pos) > room.top && cellY(pos) < room.bottom;

/** Rooms something falling from above may land in; never into a locked one, or a shop. */
const LANDING_ROOMS: ReadonlySet<RoomType> = new Set([
  RoomType.STANDARD, RoomType.TUNNEL, RoomType.PASSAGE, RoomType.ENTRANCE, RoomType.EXIT,
]);

/** Level.randomRespawnCell, or RegularLevel.pitCell for what comes through a weak floor. */
function landingCell(world: World, depth: number, rng: Rng, intoPit: boolean): number {
  const level = levelAt(world, depth);
  const pit = level.rooms.filter((room) => room.type === RoomType.PIT);
  const rooms = intoPit && pit.length > 0 ? pit : level.rooms.filter((room) => LANDING_ROOMS.has(room.type));
  for (let attempt = 0; attempt < 200 && rooms.length > 0; attempt++) {
    const room = rng.element(rooms)!;
    const pos = rng.intBetween(room.left + 1, room.right) + rng.intBetween(room.top + 1, room.bottom) * WIDTH;
    if (isPassable(level, pos) && !charAt(world, depth, pos)) return pos;
  }
  return freeCellNear(world, level, depth, level.entrance);
}

/** Dungeon.dropToChasm: what fell into a chasm turns up somewhere on the depth below. */
function itemsFall(world: World, depth: number): void {
  const items = world.floors[depth]!.falling ?? [];
  delete world.floors[depth]!.falling;
  if (items.length === 0 || isBossDepth(depth + 1) || depth + 1 > DEEPEST_AVAILABLE) return;
  const floor = floorAt(world, depth + 1);
  const rng = new Rng(floor.rng);
  for (const item of items) dropItem(floor, landingCell(world, depth + 1, rng, false), item);
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
    // Back on their feet, rid of whatever ailed them.
    Object.assign(fallen, {
      hp: Math.max(1, Math.floor(fallen.ht / 2)), depth, intent: null, regen: 0, ooze: -1,
      poison: 0, burning: 0, paralysed: 0, rooted: 0, slowed: 0, hunger: 0, weakened: 0, crippled: 0, charmed: 0,
      charmedBy: null, deferred: 0, blind: 0,
    });
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
  /** A floating hero drifts over chasms (and traps). */
  floating = false,
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
      // A locked door may end a path: walking into it unlocks it with a key.
      const lockedGoal = next === to && level.map[next] === T.LOCKED_DOOR;
      const overPit = floating && hasFlag(level.map[next]!, F.PIT) && canEnter(level, next) === false && next % WIDTH > 0 &&
        next % WIDTH < WIDTH - 1 && next >= WIDTH && next < LENGTH - WIDTH;
      if ((!canEnter(level, next) && !lockedGoal && !overPit) || (blocked.has(next) && next !== to)) continue;
      // Walk around visible traps, unless one is where the player wants to go or the hero floats.
      if (next !== to && !floating && hasFlag(level.map[next]!, F.AVOID)) continue;
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
