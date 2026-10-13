import type { Action, BadgeId, BadgeProgress, HeroClass, RunOutcome, World } from '@pd/core';
import { RULES_VERSION } from '@pd/core';

/*
 * Checked runs (the server's player.ts): the server hands out each run and plays the moves the
 * device sends it again on its own copy, so that what a run scores, the badges it earns and its
 * places on the boards are the server's word, not the device's. Only Telegram players have them
 * (the server knows them by their init data); in a plain browser the game is played on the
 * device alone and counts nowhere.
 */

export type RunSlot = 'dungeon' | 'arena' | 'daily';
export type BoardKind = 'daily' | 'week' | 'arena' | 'all' | 'arenaAll';

export interface RunMeta {
  id: string;
  slot: RunSlot;
  seq: number;
  /** Counts for the boards (a daily dungeon played again the same day does not). */
  ranked: boolean;
  date?: string;
}

export interface RunSummary extends RunOutcome {
  slot: RunSlot;
  ranked: boolean;
  at: number;
  date?: string;
}

export interface SyncAnswer {
  seq: number;
  /** The server's copy, when the device's parted from it. */
  run?: RunMeta;
  world?: World;
  badges?: BadgeId[];
  /** The run is over: how it ended, and its places on the boards. */
  finished?: RunSummary;
  places?: Partial<Record<BoardKind, number | null>>;
  record?: boolean;
  reason?: string;
}

export type Trouble = 'offline' | 'unauthorized' | 'rules';

export interface Profile {
  name: string;
  games: number;
  wins: number;
  deepest: number;
  best: number;
  bestByClass: Partial<Record<HeroClass, number>>;
  arenaWaves: number;
  arenaBest: number;
  streak: { last: string | null; count: number; best: number; freezes: number };
  /** Today's daily dungeon has been begun (its ranked try is spent). */
  dailyDone: boolean;
  badges: BadgeProgress;
  history: RunSummary[];
  trophies: Array<{ board: string; place: number; at: number }>;
  places: Partial<Record<BoardKind, number | null>>;
  runs: Partial<Record<RunSlot, RunMeta & { over: boolean; depth: number; lvl: number; heroClass?: HeroClass }>>;
  today: string;
}

export interface BoardEntry {
  id: string;
  name: string;
  heroClass: HeroClass;
  score: number;
  depth: number;
  level: number;
  gold: number;
  won: boolean;
  kills?: number;
  patron?: boolean;
  at: number;
}

export interface BoardView {
  name: string;
  rank: number | null;
  top: BoardEntry[];
  total?: number;
  you?: BoardEntry;
}

export interface Identity {
  initData?: string;
  /** Development only (a server without a bot token takes the device's word for who it is). */
  id?: string;
  name?: string;
}

export interface RunApi {
  start(slot: RunSlot, hero: HeroClass, challenges: number): Promise<{ run: RunMeta; world: World } | Trouble>;
  sync(meta: RunMeta, actions: readonly Action[], hash: string | null, keepalive?: boolean): Promise<SyncAnswer | Trouble>;
  get(slot: RunSlot): Promise<{ run: RunMeta | null; world?: World } | Trouble>;
  me(): Promise<Profile | null>;
  board(kind: BoardKind): Promise<BoardView | null>;
}

/** The server's HTTP address, from its WebSocket one. */
export const httpBase = (server: string): string => server.replace(/^ws(s?):/, 'http$1:');

/** Talks to the server's checked runs; null where there are none (no server, or not in Telegram outside development). */
export function runApi(server: string, identity: () => Identity, development: boolean): RunApi | null {
  if (!server || (!identity().initData && !development)) return null;
  const base = httpBase(server);
  const post = async <T>(path: string, body: Record<string, unknown>, keepalive = false): Promise<T | Trouble> => {
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...identity(), rules: RULES_VERSION, ...body }),
        keepalive,
      });
      if (response.status === 401) return 'unauthorized';
      if (response.status === 409) return 'rules';
      if (!response.ok) return 'offline';
      return (await response.json()) as T;
    } catch {
      return 'offline';
    }
  };
  const quiet = async <T>(path: string, body: Record<string, unknown>): Promise<T | null> => {
    const answer = await post<T>(path, body);
    return typeof answer === 'string' ? null : answer;
  };
  return {
    start: (slot, hero, challenges) => post('/run', { op: 'start', slot, hero, challenges }),
    // A keepalive request (the app being put away) must stay under 64 KB: the batch is cut to fit.
    sync: (meta, actions, hash, keepalive = false) =>
      post('/run', { op: 'sync', slot: meta.slot, run: meta.id, from: meta.seq, actions, hash }, keepalive),
    get: (slot) => post('/run', { op: 'get', slot }),
    me: () => quiet('/me', {}),
    board: (kind) => quiet('/board', { kind }),
  };
}
