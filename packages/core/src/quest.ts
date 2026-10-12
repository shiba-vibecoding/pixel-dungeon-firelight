import { createMob, type Hero, type Mob } from './actors';
import { randomRespawnCell } from './ai';
import { type Ctx, dropItem } from './floor';
import { collect } from './inventory';
import { createItem, type Item, itemDef, ItemGenerator } from './items';
import type { Level } from './level/generate';
import { adjacent } from './level/geometry';
import type { Rng } from './rng';
import type { World } from './world';

/*
 * The sad ghost of the sewers (Ghost, the dried rose quest): once per run a
 * ghost haunts one of depths 2-4 and asks for its rose, which one of that
 * level's monsters carries. Bringing it back earns the choice of a fine
 * weapon or armour. The original's other two variants (the fetid rat and the
 * curse) are not ported yet.
 */

export interface GhostQuest {
  depth: number;
  given: boolean;
  /** A monster has dropped the rose. */
  dropped: boolean;
  /** Kills left before the rose is sure to drop. */
  killsLeft: number;
  done: boolean;
  weapon: Item;
  armor: Item;
}

export type GhostLine = 'intro' | 'remind' | 'reward' | 'farewell';

const SEWER_MONSTERS = new Set(['rat', 'gnoll', 'crab']);

/** Ghost.Quest.spawn: the deeper the sewer level, the likelier the ghost, until it has appeared. */
export function spawnGhost(world: World, level: Level, mobs: Mob[], rng: Rng): void {
  if (world.quest || level.depth < 2 || level.depth > 4 || rng.int(5 - level.depth) !== 0) return;
  const pos = randomRespawnCell(rng, world, level, (cell) => !mobs.some((mob) => mob.pos === cell));
  if (pos === -1) return;
  mobs.push(createMob(`#${++world.nextId}`, 'ghost', pos, 'passive', 0));

  // The reward: the best of four weapons (no thrown ones) and of four armours.
  const generator = new ItemGenerator(rng, level.depth);
  let weapon: Item | null = null;
  for (let i = 0; i < 4; i++) {
    let another = generator.of('weapon');
    while (itemDef(another.kind).category !== 'weapon') another = generator.of('weapon');
    if (!weapon || another.level > weapon.level) weapon = another;
  }
  let armor = generator.of('armor');
  for (let i = 0; i < 3; i++) {
    const another = generator.of('armor');
    if (another.level > armor.level) armor = another;
  }
  world.quest = { depth: level.depth, given: false, dropped: false, killsLeft: 8, done: false, weapon: weapon!, armor };
}

/** Ghost.Quest.processSewersKill: one of the level's monsters carries the rose. */
export function questKill(ctx: Ctx, mob: Mob): void {
  const quest = ctx.world.quest;
  if (!quest || !quest.given || quest.dropped || quest.depth !== ctx.depth || !SEWER_MONSTERS.has(mob.kind)) return;
  if (ctx.rng.int(quest.killsLeft) === 0) {
    dropItem(ctx.floor, mob.pos, createItem('quest.rose'));
    quest.dropped = true;
  } else {
    quest.killsLeft--;
  }
}

const roseOf = (hero: Hero): number => hero.items.findIndex((item) => item.kind === 'quest.rose');

/** Talking to the ghost: the quest, a reminder, or the reward on offer. */
export function talkToGhost(ctx: Ctx, hero: Hero): void {
  const quest = ctx.world.quest;
  if (!quest || quest.done) return;
  let line: GhostLine;
  if (!quest.given) {
    quest.given = true;
    line = 'intro';
  } else {
    line = roseOf(hero) >= 0 ? 'reward' : 'remind';
  }
  ctx.effects.push({ type: 'ghost', hero: hero.id, line });
}

export function rewardProblem(world: World, hero: Hero, choice: unknown): string | null {
  const quest = world.quest;
  if (!quest || quest.done || roseOf(hero) < 0) return 'nothing to give';
  if (choice !== 'weapon' && choice !== 'armor') return 'bad choice';
  const ghost = world.floors[hero.depth]?.mobs.find((mob) => mob.kind === 'ghost');
  return ghost && adjacent(ghost.pos, hero.pos) ? null : 'the ghost is not here';
}

/** The rose for a reward; the ghost finds peace and fades away. */
export function rewardFromGhost(ctx: Ctx, hero: Hero, choice: 'weapon' | 'armor'): void {
  const quest = ctx.world.quest!;
  hero.items.splice(roseOf(hero), 1);
  const item = quest[choice];
  if (!collect(hero, item)) dropItem(ctx.floor, hero.pos, item);
  ctx.effects.push({ type: 'pickedUp', hero: hero.id, item });
  quest.done = true;
  ctx.floor.mobs = ctx.floor.mobs.filter((mob) => mob.kind !== 'ghost');
  ctx.effects.push({ type: 'ghost', hero: hero.id, line: 'farewell' });
}
