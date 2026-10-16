import {
  act, type Action, addHero, applyBoon, type BadgeId, type BadgeProgress, type Bones, checkBadges, countGame, createWorld, dailyRules, dayOf, deriveSeed,
  emptyBadgeProgress, fingerprint, giveBones, type HeroClass, heroById, leaveBones, Rng, type RunOutcome, runOutcome, type World,
} from '@pd/core';
import { awardRun, type PassProgress } from '../../client/src/pass';
import { SEASON } from './boards';
import type { Heat } from './heat';
import { armorTierOf } from './worn';
import type { Letter } from './mail';
import type { LeagueResult, LeagueState } from './league-flow';
import type { SeasonResult } from './season-flow';

/*
 * A player's checked runs and what they add up to. The device plays a run at once, with no
 * wait for the network, and sends what the player did in batches; the server plays the same
 * actions on its own copy of the run (the core is deterministic), so the score, the badges and
 * the places on the boards come from the server's copy only. A device whose copy parts from it
 * (a bug, or an edited device) is sent the server's back. A run's past cannot be played again:
 * the server never takes back what it has taken, so dying cannot be undone by reloading.
 *
 * Pure logic, kept by the player's Durable Object (Player, index.ts).
 */

/*
 * The arena of waves had a slot of its own ('arena'). It has none now: a player's stored arena run (run-store.ts) is left in the
 * storage as it is and never loaded, served or played, and its results (the profile's arenaWaves and arenaBest, the history's
 * entries, the old boards) stay stored and unserved.
 */
export type RunSlot = 'dungeon' | 'daily';
export const RUN_SLOTS: readonly RunSlot[] = ['dungeon', 'daily'];

/** The hero's id in a player's own run. */
export const ME = 'me';
/** The most actions one sync takes; a device with more sends them in turns. */
export const MAX_SYNC_ACTIONS = 400;

export interface Run {
  id: string;
  slot: RunSlot;
  seed: number;
  /** The daily dungeon: its day (YYYY-MM-DD). */
  date?: string;
  /** Counts for the boards: every run but a daily dungeon played again the same day. */
  ranked: boolean;
  /** Actions taken so far. */
  seq: number;
  startedAt: number;
  updatedAt: number;
  /** How it ended, once it has. */
  finished?: RunOutcome;
  summary?: RunSummary;
  /** A new best of the player's. */
  record?: boolean;
  /** Its places on the boards it went to (player.ts). */
  places?: Partial<Record<string, number | null>>;
  world: World;
}

/** A finished run, as the player's history keeps it. */
export interface RunSummary extends RunOutcome {
  /** The tier of the armour the hero wore at the end (the row of the hero's sheet: 1 cloth ... 5 plate, 6 the class armour), from the final world; absent from runs before it was kept. */
  armor?: number;
  slot: RunSlot;
  ranked: boolean;
  at: number;
  date?: string;
}

export interface Streak {
  /** The last day (YYYY-MM-DD) that kept the streak: a daily dungeon begun. */
  last: string | null;
  count: number;
  best: number;
  /** Days the streak may miss without breaking: one earned every seven days of it, two at most. */
  freezes: number;
}

/** A place among the best of a finished week or day, won once and kept. */
export interface Trophy {
  board: string;
  place: number;
  at: number;
}

export interface Profile {
  name: string;
  games: number;
  wins: number;
  deepest: number;
  /** The best checked score in the dungeon, and by class. */
  best: number;
  bestByClass: Partial<Record<HeroClass, number>>;
  streak: Streak;
  /** The season the profile is of (boards.ts SEASON; absent: season 1, before Firelight): see season.ts. */
  season?: number;
  /** The last day whose ranked daily dungeon was begun. */
  dailyDate: string | null;
  badges: BadgeProgress;
  /** The last fallen hero's bones, for the next ordinary run. */
  bones: Bones | null;
  history: RunSummary[];
  trophies: Trophy[];
  /** Boards already looked at for trophies (their names). */
  claimed: string[];
  /** The boards of a day or week this player's runs went onto (mail.ts makes their letters once they close). */
  entered: string[];
  /** The letters of the mailbox (mail.ts). */
  mail: Letter[];
  /** The step tutorial has been seen through or skipped, on any device (a setting: kept through a season's wipe). */
  coachDone: boolean;
  /** The last version of the news the player has seen, on any device (news.ts; a setting: kept through a season's wipe). */
  newsSeen?: string;
  /** Honours the admin gave: 'bughunter' for a confirmed report (problem.ts). */
  honors?: string[];
  /** «Hide me from the boards» (privacy.ts; a setting: kept through a season's wipe): the name on the boards is the alias. */
  hidden?: boolean;
  alias?: string;
  /** The competitions' season (heat.ts, season-flow.ts): the Heat of the season now, the one just over while its hall of fame is awaited, the seasons closed, and what has been won (honours.ts). */
  heat?: Heat;
  heatPrev?: Heat;
  seasons?: SeasonResult[];
  honour?: string[];
  /** The weekly leagues (league-flow.ts): the step and the room of the week, the result of the last week, and the week whose result the player has seen. */
  league?: LeagueState;
  leagueResult?: LeagueResult;
  leagueSeen?: string;
  /** The problem reports sent today, for the daily limit (problem.ts). */
  problems?: { day: string; count: number };
  /** The season pass's XP, from this season's checked runs only (pass.ts); a new season starts it afresh with the rest of the profile. */
  pass?: PassProgress;
}

export const MAX_FREEZES = 2;
const HISTORY = 20;

export function emptyProfile(name = 'Hero'): Profile {
  return {
    name, games: 0, wins: 0, deepest: 0, best: 0, bestByClass: {},
    streak: { last: null, count: 0, best: 0, freezes: 0 }, dailyDate: null, badges: emptyBadgeProgress(), bones: null, history: [], trophies: [], claimed: [], entered: [], mail: [], coachDone: false,
  };
}

/** The days between two dates (YYYY-MM-DD), b after a. */
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The day after `day` (YYYY-MM-DD). */
const nextDay = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** A gap longer than this many days is a broken streak whatever the outages (and keeps the day-by-day walk short). */
const LONGEST_GAP = 400;

const asSet = (days: ReadonlySet<string> | readonly string[]): ReadonlySet<string> => (days instanceof Set ? days : new Set(days as readonly string[]));

/**
 * The streak once a daily dungeon is begun on `today`: a day on from the last goes on; a gap the
 * freezes can cover goes on too, spending them; a longer one starts afresh. A day the server was down
 * (`outages`, outages.ts) counts as played: it neither breaks the streak nor spends a freeze, and adds
 * its day to the count as a day played does (the seventh day of a streak earns its freeze all the same).
 */
export function keepStreak(streak: Streak, today: string, outages: ReadonlySet<string> | readonly string[] = []): Streak {
  if (streak.last === today) return streak;
  const gap = streak.last ? daysBetween(streak.last, today) : Infinity;
  if (gap < 1) return streak;
  const down = asSet(outages);
  let { count, freezes } = streak;
  if (streak.last && gap <= LONGEST_GAP) {
    // Day by day, in order: a missed day takes a freeze or breaks the streak; a day of outage is a day played.
    for (let day = nextDay(streak.last); day < today; day = nextDay(day)) {
      if (down.has(day)) {
        count++;
        if (count % 7 === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
      } else if (freezes > 0) {
        freezes--;
      } else {
        count = 0;
      }
    }
    count++;
  } else {
    count = 1;
    freezes = 0;
  }
  // Every seventh day of a streak earns a freeze.
  const earned = count % 7 === 0 ? 1 : 0;
  return { last: today, count, best: Math.max(streak.best, count), freezes: Math.min(MAX_FREEZES, freezes + earned) };
}

/**
 * A streak as it stands on `today` without anything played: broken if the freezes cannot cover the gap. The
 * server's outage days are no gap (the next daily dungeon adds them to the count).
 */
export function streakNow(streak: Streak, today: string, outages: ReadonlySet<string> | readonly string[] = []): Streak {
  if (!streak.last) return streak;
  const gap = daysBetween(streak.last, today);
  if (gap > LONGEST_GAP) return { ...streak, count: 0 };
  const down = asSet(outages);
  let missed = 0;
  for (let day = nextDay(streak.last); day < today; day = nextDay(day)) if (!down.has(day)) missed++;
  return missed > streak.freezes ? { ...streak, count: 0 } : streak;
}

export interface StartOptions {
  slot: RunSlot;
  heroClass: HeroClass;
  challenges: number;
  name: string;
  /** For runs that are not the daily dungeon's. */
  seed: number;
  /** The daily dungeon's seed, derived from the server's secret (daily-seed.ts); without it the daily takes `seed`, never a public value. */
  dailySeed?: number;
  /** A fresh id for the run. */
  id: string;
  now: number;
  /** Today (YYYY-MM-DD, UTC). */
  today: string;
  /** The days the server was down (outages.ts): the daily streak takes them as played. */
  outages?: readonly string[];
}

export interface SyncReply {
  /** Actions taken so far. */
  seq: number;
  /** The run as the server has it, when the device's copy differs (or is of another run). */
  run?: { id: string; seq: number; ranked: boolean; slot: RunSlot; date?: string };
  world?: World;
  /** Badges the run earned in this batch. */
  badges?: BadgeId[];
  /** The run is over: how it ended, its places on the boards (once they are known) and whether it is a record. */
  finished?: RunSummary;
  places?: Partial<Record<string, number | null>>;
  record?: boolean;
  /** Why the server's copy was sent. */
  reason?: string;
}

export interface SyncResult {
  reply: SyncReply;
  /** Depths that may have changed. */
  touched: Set<number>;
  finish?: Finish;
}

/** What the boards and the profile hear when a run ends. */
export interface Finish {
  summary: RunSummary;
  /** A new best of the player's (the dungeon score). */
  record: boolean;
}

export class PlayerLogic {
  constructor(
    public profile: Profile,
    public readonly runs: Partial<Record<RunSlot, Run>> = {},
  ) {}

  /**
   * A new run in a slot. The daily dungeon is one per day: asked again while it is under way,
   * it carries on; once it is over, a new one is practice that does not count.
   */
  start(options: StartOptions): Run {
    const { slot, now, today } = options;
    const current = this.runs[slot];
    if (slot === 'daily' && current && current.date === today && !current.finished) return current;
    const daily = slot === 'daily';
    const ranked = !daily || this.profile.dailyDate !== today;
    const seed = daily ? (options.dailySeed ?? options.seed) : options.seed;
    // The daily dungeon has its own rules (daily.ts): the day's hardship, and its boon once the hero is there.
    const rules = daily ? dailyRules(today) : null;
    const world = createWorld(seed, rules ? rules.challenge : options.challenges);
    const hero = addHero(world, { id: ME, name: options.name, heroClass: options.heroClass });
    if (rules) applyBoon(world, hero, rules.boon);
    // Bones.java: a fallen hero's bones wait in ordinary runs, never in the daily dungeon (the same for everyone).
    if (slot === 'dungeon' && this.profile.bones) {
      giveBones(world, this.profile.bones);
      this.profile.bones = null;
    }
    if (daily && ranked) {
      this.profile.dailyDate = today;
      this.profile.streak = keepStreak(this.profile.streak, today, options.outages);
    }
    this.profile.name = options.name;
    this.profile.games++;
    countGame(this.profile.badges, seed);
    const run: Run = { id: options.id, slot, seed, ...(daily ? { date: today } : {}), ranked, seq: 0, startedAt: now, updatedAt: now, world };
    this.runs[slot] = run;
    return run;
  }

  /**
   * The device's actions `from` its count of actions taken, and what its copy's fingerprint
   * came to after them. Actions the server already has (an answer lost on the way) are skipped;
   * an action the server's copy refuses, a fingerprint that differs, or a count the server never
   * reached sends the server's copy back.
   */
  sync(slot: RunSlot, id: string, from: number, actions: readonly Action[], hash: string | null, now: number): SyncResult {
    const run = this.runs[slot];
    const touched = new Set<number>();
    let finish: Finish | undefined;
    if (!run) return { reply: { seq: 0, reason: 'none' }, touched };
    const resend = (reason: string): SyncResult => ({ reply: { seq: run.seq, run: describe(run), world: run.world, reason, ...ended(run) }, touched, ...(finish ? { finish } : {}) });
    if (run.id !== id) return resend('another run');
    if (from > run.seq || from + actions.length < run.seq) return resend('out of step');
    const fresh: BadgeId[] = [];
    // Where the hero was and went: only those depths (and the ones beside, where things fall) can have changed.
    const near = (): void => {
      const depth = heroById(run.world, ME)?.depth;
      if (depth !== undefined) for (const d of [depth - 1, depth, depth + 1]) touched.add(d);
    };
    near();
    for (const action of actions.slice(run.seq - from)) {
      if (run.world.over) return resend('over');
      const result = act(run.world, ME, action);
      near();
      if (!result.ok) return resend(`refused: ${result.reason}`);
      run.seq++;
      const me = heroById(run.world, ME);
      if (me) fresh.push(...checkBadges(this.profile.badges, run.world, me, result.effects).fresh);
      if (run.world.over && !run.finished) finish = this.finish(run, now);
    }
    run.updatedAt = now;
    const reply: SyncReply = { seq: run.seq, ...(fresh.length ? { badges: fresh } : {}), ...ended(run) };
    if (hash !== null && from + actions.length === run.seq && hash !== fingerprint(run.world)) {
      return { reply: { ...reply, run: describe(run), world: run.world, reason: 'parted' }, touched, ...(finish ? { finish } : {}) };
    }
    return { reply, touched, ...(finish ? { finish } : {}) };
  }

  /** A run's end: into the profile, the history and (for a fallen hero of an ordinary run) the bones. */
  private finish(run: Run, now: number): Finish {
    const me = heroById(run.world, ME)!;
    const outcome = runOutcome(run.world, me);
    run.finished = outcome;
    const summary: RunSummary = { ...outcome, armor: armorTierOf(me), slot: run.slot, ranked: run.ranked, at: now, ...(run.date ? { date: run.date } : {}) };
    run.summary = summary;
    const p = this.profile;
    let record = false;
    record = run.ranked && outcome.score > p.best;
    if (run.ranked) {
      p.best = Math.max(p.best, outcome.score);
      p.bestByClass[outcome.heroClass] = Math.max(p.bestByClass[outcome.heroClass] ?? 0, outcome.score);
    }
    p.deepest = Math.max(p.deepest, outcome.depth);
    if (outcome.won) p.wins++;
    if (run.slot === 'dungeon' && !outcome.won) {
      // Bones.leave, with its dice from the run's own seed.
      const rng = Rng.seeded(deriveSeed(run.seed, 0xb0e5));
      p.bones = leaveBones(me, rng.int(4), rng.float());
    }
    p.history = [summary, ...p.history].slice(0, HISTORY);
    // Pass XP for the run, once (pass.ts): from the server's own copy of the run, so nothing a device says can add to it.
    p.pass = awardRun(p.pass, SEASON, {
      id: run.id, daily: run.slot === 'daily', ranked: run.ranked, depth: outcome.depth, kills: outcome.kills, won: outcome.won,
    }, dayOf(now)).progress;
    run.record = record;
    return { summary, record };
  }
}

/** What a reply says of a run that is over. */
export function ended(run: Run): Pick<SyncReply, 'finished' | 'places' | 'record'> {
  return run.summary ? { finished: run.summary, places: run.places ?? {}, record: run.record ?? false } : {};
}

export function describe(run: Run): NonNullable<SyncReply['run']> {
  return { id: run.id, seq: run.seq, ranked: run.ranked, slot: run.slot, ...(run.date ? { date: run.date } : {}) };
}

/** A slot's name from a request, or null. */
export const parseSlot = (value: unknown): RunSlot | null => (RUN_SLOTS as readonly unknown[]).includes(value) ? (value as RunSlot) : null;
