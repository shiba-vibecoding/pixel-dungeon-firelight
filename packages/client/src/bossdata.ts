/*
 * The staging of the bosses that the designer's data gives (part 13, fx.json → `bosses`): how a slime squashes when struck, which loop goes
 * over the machine at which share of its health, how many pieces fly from its burst, how the king falls, how often the old god's eye
 * glints, which effect is the fist of each kind. Read with the defaults the file has, so a file without them (or a game before it has
 * loaded) still stages the same (test/bossdata.test.ts keeps the defaults equal to the file).
 */
import type { FxLib } from './fxsheet';

/** [scale across, scale up, ms] of a sprite with its feet fixed. */
export type SquashStep = readonly [number, number, number];

export interface Staging {
  gooSquash: readonly SquashStep[];
  gooHit: string;
  gooDeath: string;
  tenguJump: string;
  tenguMark: string;
  tenguMarkRows: number;
  /** The machine's loops: a stage while health is at or under its share of the greatest, worst last. */
  dmStages: ReadonlyArray<{ from: number; fx: string }>;
  dmDeath: string;
  dmDebris: string;
  dmDebrisCount: number;
  kingThrone: string;
  kingSummon: string;
  kingFall: { rotate: number; ms: number; steps: number; then: string };
  yogGlintEvery: readonly [number, number];
  yogGlint: string;
  yogFists: Readonly<Record<string, string>>;
  yogDeath: string;
  yogAmulet: string;
  steam: string;
}

export const DEFAULT_STAGING: Staging = {
  gooSquash: [[1.25, 0.75, 60], [0.9, 1.12, 60], [1, 1, 80]],
  gooHit: 'arena.goo.splash',
  gooDeath: 'arena.goo.pop',
  tenguJump: 'arena.tengu.smoke',
  tenguMark: 'arena.tengu.mark',
  tenguMarkRows: 3,
  dmStages: [
    { from: 0.66, fx: 'arena.dm300.damage1' },
    { from: 0.4, fx: 'arena.dm300.damage2' },
    { from: 0.2, fx: 'arena.dm300.damage3' },
  ],
  dmDeath: 'arena.dm300.explode',
  dmDebris: 'arena.dm300.debris',
  dmDebrisCount: 6,
  kingThrone: 'arena.throne',
  kingSummon: 'arena.king.undead',
  kingFall: { rotate: 90, ms: 600, steps: 4, then: 'arena.king.crown' },
  yogGlintEvery: [2200, 3600],
  yogGlint: 'arena.yog.glint',
  yogFists: { rottingFist: 'arena.yog.fist.rotting', burningFist: 'arena.yog.fist.burning' },
  yogDeath: 'arena.yog.death',
  yogAmulet: 'arena.yog.amulet',
  steam: 'arena.steam',
};

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const text = (v: unknown, fallback: string): string => (typeof v === 'string' && v !== '' ? v : fallback);
const number = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** The staging of a loaded fx.json, each part from the file where it is whole and from the defaults where it is not. */
export function stagingOf(lib: FxLib | null): Staging {
  const raw = obj(lib?.bosses);
  if (!raw) return DEFAULT_STAGING;
  const d = DEFAULT_STAGING;
  const goo = obj(raw.goo);
  const tengu = obj(raw.tengu);
  const dm = obj(raw.dm300);
  const king = obj(raw.king);
  const yog = obj(raw.yog);
  const squash = obj(goo?.squash)?.onHit;
  const steps = Array.isArray(squash) ? squash.filter((s): s is number[] => Array.isArray(s) && s.length === 3 && s.every((n) => typeof n === 'number')) : [];
  const stages = Array.isArray(dm?.stages)
    ? (dm!.stages as unknown[]).flatMap((s) => {
        const o = obj(s);
        return o && typeof o.from === 'number' && typeof o.fx === 'string' ? [{ from: o.from, fx: o.fx }] : [];
      })
    : [];
  const fall = obj(king?.fall);
  const fists = obj(obj(yog?.fists));
  const glint = Array.isArray(yog?.glintEvery) && (yog!.glintEvery as unknown[]).length === 2 && (yog!.glintEvery as unknown[]).every((n) => typeof n === 'number');
  return {
    gooSquash: steps.length > 0 ? (steps as unknown as SquashStep[]) : d.gooSquash,
    gooHit: text(goo?.hit, d.gooHit),
    gooDeath: text(goo?.death, d.gooDeath),
    tenguJump: text(tengu?.jump, d.tenguJump),
    tenguMark: text(tengu?.mark, d.tenguMark),
    tenguMarkRows: number(tengu?.markRows, d.tenguMarkRows),
    dmStages: stages.length > 0 ? stages : d.dmStages,
    dmDeath: text(dm?.death, d.dmDeath),
    dmDebris: d.dmDebris,
    dmDebrisCount: number(dm?.debris, d.dmDebrisCount),
    kingThrone: text(king?.throne, d.kingThrone),
    kingSummon: text(king?.summon, d.kingSummon),
    kingFall: fall
      ? { rotate: number(fall.rotate, d.kingFall.rotate), ms: number(fall.ms, d.kingFall.ms), steps: Math.max(1, number(fall.steps, d.kingFall.steps)), then: text(fall.then, d.kingFall.then) }
      : d.kingFall,
    yogGlintEvery: glint ? (yog!.glintEvery as unknown as readonly [number, number]) : d.yogGlintEvery,
    yogGlint: text(yog?.glint, d.yogGlint),
    yogFists: {
      rottingFist: text(fists?.rotting, d.yogFists.rottingFist!),
      burningFist: text(fists?.burning, d.yogFists.burningFist!),
    },
    yogDeath: text(yog?.death, d.yogDeath),
    yogAmulet: text(yog?.amulet, d.yogAmulet),
    steam: d.steam,
  };
}

/** The stage of the machine's loop at a share of its health: the worst whose share it is at or under, or -1 for none yet. */
export function stageAt(stages: Staging['dmStages'], frac: number): number {
  let at = -1;
  for (let i = 0; i < stages.length; i++) if (frac <= stages[i]!.from) at = i;
  return at;
}

/** How the squash of a blow stands `ms` after it: [scale across, scale up], or null when it is over. Steps, held as the file gives them. */
export function squashAt(steps: readonly SquashStep[], ms: number): readonly [number, number] | null {
  if (ms < 0) return null;
  let t = ms;
  for (const [sx, sy, hold] of steps) {
    if (t < hold) return [sx, sy];
    t -= hold;
  }
  return null;
}

/** How long a squash lasts in all, ms. */
export const squashMs = (steps: readonly SquashStep[]): number => steps.reduce((sum, s) => sum + s[2], 0);
