import { CATALOG, type Item, passSku } from './catalog';

/*
 * The season pass: 30 levels, a free track and a paid one, a season long (the season is the world's, boards.ts SEASON on the server;
 * a new season starts a new pass, and the checked-run XP starts from nothing with the player's profile). XP comes from checked runs
 * only (the server adds it as a run ends, once per run: see awardRun), so a device cannot give itself any. The rewards are catalogue
 * items, the earn-only ones that name a level (catalog.ts); buying the paid track is one Stars purchase a season (passSku).
 *
 * Pure data and arithmetic, shared by the server (which keeps the XP and the claims) and the client (which shows the track).
 */

export const PASS_LEVELS = 30;
/** The most XP one day can give, so that the pass is a season's play and not a night's. */
export const DAY_XP_CAP = 500;
/** The most one run gives. */
export const RUN_XP_CAP = 400;
/** How many finished runs' ids the progress remembers, so that a run is counted once. */
const RUNS_KEPT = 40;

/** XP from level n-1 to level n. */
export const levelCost = (n: number): number => 100 + 10 * (n - 1);

/** Total XP at which level n is reached. */
export function xpToReach(level: number): number {
  const n = Math.max(0, Math.min(PASS_LEVELS, Math.floor(level)));
  return 100 * n + 5 * n * (n - 1);
}

/** The level an XP total stands at, 0 to PASS_LEVELS. */
export function passLevel(xp: number): number {
  let level = 0;
  while (level < PASS_LEVELS && xpToReach(level + 1) <= xp) level++;
  return level;
}

/** XP into the current level and what it takes to the next ({into, need}); at the top, both zero. */
export function levelProgress(xp: number): { level: number; into: number; need: number } {
  const level = passLevel(xp);
  if (level >= PASS_LEVELS) return { level, into: 0, need: 0 };
  return { level, into: xp - xpToReach(level), need: levelCost(level + 1) };
}

/** What a finished checked run says for the pass. */
export interface PassRun {
  /** The run's id: one run counts once. */
  id: string;
  mode: 'dungeon' | 'arena';
  /** The daily dungeon's slot. */
  daily: boolean;
  /** Counts for the boards: a daily dungeon played again the same day does not. */
  ranked: boolean;
  /** The deepest depth; in the arena, the waves held. */
  depth: number;
  kills: number;
  won: boolean;
}

/** XP for one run: for depth, for kills, for a win and for the daily dungeon; a run that does not rank gives none. */
export function runXp(run: Omit<PassRun, 'id'>): number {
  if (!run.ranked) return 0;
  const kills = Math.max(0, run.kills);
  const depth = Math.max(0, run.depth);
  const xp = run.mode === 'arena'
    ? 10 + 8 * depth + Math.floor(Math.min(kills, 150) / 3)
    : 15 + 6 * depth + Math.floor(Math.min(kills, 120) / 2) + (run.won ? 150 : 0) + (run.daily ? 60 : 0);
  return Math.min(RUN_XP_CAP, Math.floor(xp));
}

/** What the server keeps of a player's pass. */
export interface PassProgress {
  season: number;
  xp: number;
  /** The latest runs counted, newest last. */
  runs: string[];
  /** The day (YYYY-MM-DD, UTC) the day's XP is of, and how much it has come to. */
  day: string;
  dayXp: number;
}

export const emptyProgress = (season: number): PassProgress => ({ season, xp: 0, runs: [], day: '', dayXp: 0 });

/**
 * The progress once a run has ended: its XP added (less what the day's cap leaves), once. A run counted already adds nothing, and
 * progress of another season starts afresh. Returns a new object and how much XP was added.
 */
export function awardRun(progress: PassProgress | undefined, season: number, run: PassRun, day: string): { progress: PassProgress; added: number } {
  const current = progress && progress.season === season ? progress : emptyProgress(season);
  if (current.runs.includes(run.id)) return { progress: current, added: 0 };
  const sameDay = current.day === day;
  const taken = sameDay ? current.dayXp : 0;
  const added = Math.max(0, Math.min(runXp(run), DAY_XP_CAP - taken));
  return {
    progress: { season, xp: current.xp + added, runs: [...current.runs, run.id].slice(-RUNS_KEPT), day, dayXp: taken + added },
    added,
  };
}

/* ---- The track ---- */

export type Track = 'free' | 'paid';

export interface Reward {
  level: number;
  free?: string;
  paid?: string;
}

/** The pass's rewards by level, from the catalogue's earn-only items that name a level. */
export function rewardsOf(catalog: readonly Item[] = CATALOG): Reward[] {
  const rewards: Reward[] = Array.from({ length: PASS_LEVELS }, (_, i) => ({ level: i + 1 }));
  for (const entry of catalog) {
    if (entry.earn?.by !== 'pass') continue;
    const reward = rewards[entry.earn.level - 1];
    if (reward) reward[entry.earn.track] = entry.id;
  }
  return rewards;
}

export const REWARDS: readonly Reward[] = rewardsOf();

/** The item a track gives at a level, or null. */
export const rewardAt = (track: Track, level: number): string | null => REWARDS[level - 1]?.[track] ?? null;

/** What is wrong with the pass's data: an empty list is a good one. */
export function validatePass(catalog: readonly Item[] = CATALOG): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of catalog) {
    if (entry.earn?.by !== 'pass') continue;
    const { level, track } = entry.earn;
    if (!Number.isInteger(level) || level < 1 || level > PASS_LEVELS) problems.push(`${entry.id}: level ${level} is off the track`);
    const key = `${track}:${level}`;
    if (seen.has(key)) problems.push(`${entry.id}: two rewards at ${key}`);
    seen.add(key);
  }
  if (!REWARDS.some((reward) => reward.free)) problems.push('the free track is empty');
  if (!REWARDS.some((reward) => reward.paid)) problems.push('the paid track is empty');
  // The top of each track ends with its best reward.
  if (!rewardAt('free', PASS_LEVELS) || !rewardAt('paid', PASS_LEVELS)) problems.push('level 30 gives nothing on a track');
  return problems;
}

/** The pass bought for a season is owned when the wallet holds its item. */
export const ownsPass = (owned: ReadonlySet<string> | readonly string[], season: number): boolean =>
  (owned instanceof Set ? owned.has(passSku(season)) : (owned as readonly string[]).includes(passSku(season)));

