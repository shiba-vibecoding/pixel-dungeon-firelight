import { createMob, type Hero, type Mob } from './actors';
import { randomRespawnCell } from './ai';
import { type Ctx, dropItem } from './floor';
import { collect } from './inventory';
import { createItem, type Item, type ItemKind } from './items';
import type { Level } from './level/generate';
import { adjacent, cellX, cellY, WIDTH } from './level/geometry';
import { RoomType } from './level/room';
import { F, hasFlag, T } from './level/terrain';
import type { Rng } from './rng';
import type { World } from './world';

/*
 * The old wandmaker of the prison (Wandmaker): once per run he waits by the
 * entrance of one of depths 7-9, lost on his way to some corpse dust. Fetch
 * it from a pile of bones on his level and he gives one of two wands: a
 * battle wand or a useful one. The original's other errand, a rotberry seed,
 * waits for plants to be ported.
 */

export interface WandQuest {
  depth: number;
  given: boolean;
  done: boolean;
  battle: Item;
  utility: Item;
}

export type WandmakerLine = 'intro' | 'remind' | 'reward' | 'farewell';

const BATTLE_WANDS: readonly ItemKind[] = ['wand.avalanche', 'wand.disintegration', 'wand.firebolt', 'wand.lightning', 'wand.poison'];
const UTILITY_WANDS: readonly ItemKind[] = ['wand.amok', 'wand.blink', 'wand.regrowth', 'wand.slowness', 'wand.teleportation'];

/** Wand.random, then upgraded once more: a wand worth the trouble. */
function rewardWand(rng: Rng, kinds: readonly ItemKind[]): Item {
  let level = 1;
  if (rng.float() < 0.5) {
    level++;
    if (rng.float() < 0.15) level++;
  }
  return createItem(rng.oneOf(kinds), 1, level);
}

/** Wandmaker.Quest.spawn: the deeper the prison level, the likelier, until he has appeared. */
export function spawnWandmaker(world: World, level: Level, mobs: Mob[], rng: Rng): void {
  if (world.wandQuest || level.depth < 7 || level.depth > 9 || rng.int(10 - level.depth) !== 0) return;
  const room = level.rooms.find((r) => r.type === RoomType.ENTRANCE);
  if (!room) return;
  let pos = -1;
  for (let attempt = 0; attempt < 100 && pos === -1; attempt++) {
    const cell = rng.intBetween(room.left + 1, room.right) + rng.intBetween(room.top + 1, room.bottom) * WIDTH;
    const terrain = level.map[cell]!;
    if (cell !== level.entrance && terrain !== T.SIGN && hasFlag(terrain, F.PASSABLE) && !mobs.some((m) => m.pos === cell)) pos = cell;
  }
  if (pos === -1) return;
  mobs.push(createMob(`#${++world.nextId}`, 'wandmaker', pos, 'passive', 0));
  world.wandQuest = {
    depth: level.depth, given: false, done: false,
    battle: rewardWand(rng, BATTLE_WANDS), utility: rewardWand(rng, UTILITY_WANDS),
  };
}

const dustOf = (hero: Hero): number => hero.items.findIndex((item) => item.kind === 'quest.dust');

/** Wandmaker.Quest.placeItem: the dust lies in a pile of bones, out of sight if there is one. */
function placeDust(ctx: Ctx, hero: Hero): void {
  const bones = ctx.floor.heaps.filter((heap) => heap.kind === 'skeleton');
  const unseen = bones.filter((heap) => Math.max(Math.abs(cellX(heap.pos) - cellX(hero.pos)), Math.abs(cellY(heap.pos) - cellY(hero.pos))) > 8);
  const pile = ctx.rng.element(unseen.length > 0 ? unseen : bones);
  if (pile) {
    pile.items.push(createItem('quest.dust'));
    return;
  }
  const pos = randomRespawnCell(ctx.rng, ctx.world, ctx.level, (cell) => !ctx.floor.heaps.some((h) => h.pos === cell));
  if (pos === -1) return;
  ctx.floor.heaps.push({ pos, kind: 'skeleton', items: [createItem('quest.dust')] });
}

/** Talking to the wandmaker: the errand, a reminder, or the wands on offer. */
export function talkToWandmaker(ctx: Ctx, hero: Hero): void {
  const quest = ctx.world.wandQuest;
  if (!quest || quest.done) return;
  let line: WandmakerLine;
  if (!quest.given) {
    quest.given = true;
    placeDust(ctx, hero);
    line = 'intro';
  } else {
    line = dustOf(hero) >= 0 ? 'reward' : 'remind';
  }
  ctx.effects.push({ type: 'wandmaker', hero: hero.id, line });
}

export function wandRewardProblem(world: World, hero: Hero, choice: unknown): string | null {
  const quest = world.wandQuest;
  if (!quest || quest.done || dustOf(hero) < 0) return 'nothing to give';
  if (choice !== 'battle' && choice !== 'utility') return 'bad choice';
  const wandmaker = world.floors[hero.depth]?.mobs.find((mob) => mob.kind === 'wandmaker');
  return wandmaker && adjacent(wandmaker.pos, hero.pos) ? null : 'the wandmaker is not here';
}

/** The dust for a wand; the wandmaker wishes the hero luck and is gone. */
export function wandFromWandmaker(ctx: Ctx, hero: Hero, choice: 'battle' | 'utility'): void {
  const quest = ctx.world.wandQuest!;
  hero.items.splice(dustOf(hero), 1);
  const wand = quest[choice];
  if (!ctx.world.known.includes(wand.kind)) ctx.world.known.push(wand.kind);
  if (!collect(hero, wand)) dropItem(ctx.floor, hero.pos, wand);
  ctx.effects.push({ type: 'pickedUp', hero: hero.id, item: wand });
  quest.done = true;
  ctx.floor.mobs = ctx.floor.mobs.filter((mob) => mob.kind !== 'wandmaker');
  ctx.effects.push({ type: 'wandmaker', hero: hero.id, line: 'farewell' });
}
