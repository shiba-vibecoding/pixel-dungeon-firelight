import { exploredCells, F, type Floor, hasFlag, type Hero, type Level, trapAt, type TrapKind, type World } from '@pd/core';
import { seenCells } from './sight';

/*
 * Mis-tap protection: on a phone a thumb lands a cell off about one time in ten, and one death in ten is such a
 * tap. A tap that would put the hero straight onto a trap they know of, or into a cloud of gas they can see, asks
 * first (the chasm's question, main.ts); the answer «don't ask again» is kept in the settings, on this device.
 * Pure rules here; the question and the settings switch live with the other windows.
 *
 * (PD 1.9 has no standing flames: a fire trap or a potion of liquid flame burns whoever is near at once and the
 * grass turns to embers, so there is no fire to step into; the clouds of toxic and paralytic gas are what lingers.)
 */

export type Danger = 'trap' | 'gas';

const KEY = 'pd-confirm-danger';

/** Whether the question is asked at all (the settings): on unless the player turned it off. */
export const confirmDanger = {
  on: ((): boolean => {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch {
      return true;
    }
  })(),
  set(on: boolean): void {
    this.on = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // For this session only.
    }
  },
};

/** The clouds a breath of which harms (a web only holds). */
const CLOUDS = ['toxic', 'paralytic'] as const;

/** Whether a cloud of toxic or paralytic gas lies on a cell. */
export const gassed = (floor: Floor | undefined, cell: number): boolean =>
  !!floor?.gas && CLOUDS.some((kind) => floor.gas![kind]?.some(([at, volume]) => at === cell && volume > 0));

/** Which cloud lies on a cell (toxic before paralytic), if any. */
export function gasKindAt(floor: Floor | undefined, cell: number): (typeof CLOUDS)[number] | null {
  return CLOUDS.find((kind) => floor?.gas?.[kind]?.some(([at, volume]) => at === cell && volume > 0)) ?? null;
}

/** The cells in sight that are under a cloud now (what a tap's route should keep out of). */
export function gasCells(world: World, depth: number): Set<number> {
  const cells = new Set<number>();
  const floor = world.floors[depth];
  if (!floor?.gas) return cells;
  const seen = seenCells(world, depth);
  for (const kind of CLOUDS) {
    for (const [cell, volume] of floor.gas[kind] ?? []) if (volume > 0 && seen[cell]) cells.add(cell);
  }
  return cells;
}

/** The trap a cell holds if the hero knows of it (a hidden one is not known, a spent one is none). */
export function knownTrap(world: World, hero: Hero, level: Level, cell: number): TrapKind | undefined {
  const terrain = level.map[cell];
  if (terrain === undefined || hasFlag(terrain, F.SECRET) || !exploredCells(world, hero.depth)[cell]) return undefined;
  return trapAt(terrain);
}

/**
 * What stepping onto a cell would be: a trap the hero knows of, or a cloud in sight; a hero floating over the floor
 * fears no trap, one already in a cloud (getting out of it) or immune to gases fears no cloud. Null: nothing the hero could
 * not see coming.
 */
export function stepDanger(world: World, hero: Hero, level: Level, cell: number): Danger | null {
  // Floating over the floor passes a trap by, but not a cloud: gas is breathed in the air.
  if ((hero.levitating ?? 0) <= 0 && knownTrap(world, hero, level, cell)) return 'trap';
  const floor = world.floors[hero.depth];
  if ((hero.gasImmune ?? 0) <= 0 && seenCells(world, hero.depth)[cell] && gassed(floor, cell) && !gassed(floor, hero.pos)) return 'gas';
  return null;
}

/** The first danger on a walk, with its place in it. */
export function firstDanger(world: World, hero: Hero, level: Level, path: readonly number[]): { index: number; danger: Danger } | null {
  for (let index = 0; index < path.length; index++) {
    const danger = stepDanger(world, hero, level, path[index]!);
    if (danger) return { index, danger };
  }
  return null;
}
