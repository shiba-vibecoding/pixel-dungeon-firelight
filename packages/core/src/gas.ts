import { isAlive } from './actors';
import { hurt } from './combat';
import { type Char, type Ctx, type Floor, heroesOn } from './floor';
import { distance, HEIGHT, LENGTH, WIDTH } from './level/geometry';
import { F, hasFlag } from './level/terrain';
import { immuneTo } from './traps';

/*
 * Clouds of gas (Blob, ToxicGas, ParalyticGas). A cloud is so much gas per
 * cell; every turn it spreads into the open cells around (never through
 * walls or closed doors) and thins out, and whoever stands in it breathes it:
 * toxic gas hurts, paralytic gas paralyses. Kept sparse, as [cell, volume]
 * pairs in cell order, since most of a level has none.
 */

export type GasKind = 'toxic' | 'paralytic';
export const GAS_KINDS: readonly GasKind[] = ['toxic', 'paralytic'];

/** How long paralytic gas holds whoever breathes it, after the last breath. */
const PARALYSIS_TURNS = 5;

export const hasGas = (floor: Floor): boolean => GAS_KINDS.some((kind) => (floor.gas?.[kind]?.length ?? 0) > 0);

/**
 * Blob.seed: so much gas let out at a cell. Let out in a closed doorway (which
 * gas does not pass), it goes to the open cells on either side instead.
 */
export function seedGas(ctx: Ctx, pos: number, kind: GasKind, amount: number): void {
  const floor = ctx.floor;
  const cloud = new Map((floor.gas?.[kind] ?? []).map(([cell, volume]) => [cell, volume]));
  const map = ctx.level.map;
  const open = (cell: number): boolean => cell >= 0 && cell < LENGTH && !hasFlag(map[cell]!, F.SOLID);
  const cells = open(pos) ? [pos] : [-1, 1, -WIDTH, WIDTH].map((n) => pos + n).filter(open);
  if (cells.length === 0) return;
  for (const cell of cells) cloud.set(cell, (cloud.get(cell) ?? 0) + Math.trunc(amount / cells.length));
  (floor.gas ??= {})[kind] = [...cloud].sort((a, b) => a[0] - b[0]);
  // The gas acts on the depth's clock from now on, a turn at a time.
  floor.gasAt ??= floor.now;
}

/** PotionOfPurity.shatter: the air within reach of a cell is cleared of every gas. */
export function clearGas(ctx: Ctx, pos: number, radius: number): boolean {
  let cleared = false;
  for (const kind of GAS_KINDS) {
    const cloud = ctx.floor.gas?.[kind];
    if (!cloud) continue;
    const left = cloud.filter(([cell]) => distance(cell, pos) > radius);
    if (left.length !== cloud.length) cleared = true;
    ctx.floor.gas![kind] = left;
  }
  tidy(ctx.floor);
  return cleared;
}

/** One turn of every cloud on the depth: it spreads and thins (Blob.evolve), then acts on whoever is in it. */
export function evolveGas(ctx: Ctx): void {
  const { level, floor } = ctx;
  const open = level.map.map((terrain) => !hasFlag(terrain, F.SOLID));
  for (const kind of GAS_KINDS) {
    const cloud = floor.gas?.[kind];
    if (!cloud || cloud.length === 0) continue;
    const cur = new Int32Array(LENGTH);
    for (const [cell, volume] of cloud) cur[cell] = volume;
    const next: Array<[number, number]> = [];
    for (let y = 1; y < HEIGHT - 1; y++) {
      for (let pos = y * WIDTH + 1; pos < y * WIDTH + WIDTH - 1; pos++) {
        if (!open[pos]) continue;
        let count = 1;
        let sum = cur[pos]!;
        for (const n of [-1, 1, -WIDTH, WIDTH]) {
          if (open[pos + n]) {
            sum += cur[pos + n]!;
            count++;
          }
        }
        const value = sum >= count ? Math.trunc(sum / count) - 1 : 0;
        if (value > 0) next.push([pos, value]);
      }
    }
    floor.gas![kind] = next;
    const inside = new Set(next.map(([cell]) => cell));
    for (const char of breathers(ctx)) {
      if (!inside.has(char.pos) || !isAlive(char) || immuneTo(char, 'gas')) continue;
      breathe(ctx, char, kind);
    }
  }
  tidy(floor);
}

/** Everyone on the depth who breathes: heroes, and monsters other than the harmless. */
function breathers(ctx: Ctx): Char[] {
  return [...heroesOn(ctx.world, ctx.depth), ...ctx.floor.mobs.filter((mob) => mob.state !== 'passive')];
}

function breathe(ctx: Ctx, char: Char, kind: GasKind): void {
  if (kind === 'paralytic') {
    char.paralysed = Math.max(char.paralysed ?? 0, PARALYSIS_TURNS);
    return;
  }
  // ToxicGas.evolve: the deeper, the deadlier.
  const strength = 5 + ctx.depth * 5;
  let damage = Math.trunc((char.ht + strength) / 40);
  if (ctx.rng.int(40) < (char.ht + strength) % 40) damage++;
  if (damage <= 0) return;
  ctx.effects.push({ type: 'hurt', depth: ctx.depth, who: char.id, damage });
  hurt(ctx, char, damage, 'gas');
}

/** Drops empty clouds, and the gas clock with the last of them. */
function tidy(floor: Floor): void {
  if (!floor.gas) return;
  for (const kind of GAS_KINDS) if (floor.gas[kind]?.length === 0) delete floor.gas[kind];
  if (!hasGas(floor)) {
    delete floor.gas;
    delete floor.gasAt;
  }
}
