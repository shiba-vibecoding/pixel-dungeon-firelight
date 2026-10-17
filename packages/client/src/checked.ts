import type { Action, BadgeId, BadgeProgress, HeroClass, RunOutcome, World } from '@pd/core';
import { RULES_VERSION } from '@pd/core';

/*
 * Checked runs (the server's player.ts): the server hands out each run and plays the moves the
 * device sends it again on its own copy, so that what a run scores, the badges it earns and its
 * places on the boards are the server's word, not the device's. Only Telegram players have them
 * (the server knows them by their init data); in a plain browser the game is played on the
 * device alone and counts nowhere.
 */

export type RunSlot = 'dungeon' | 'daily';
export type BoardKind = 'daily' | 'week' | 'all';

export interface RunMeta {
  id: string;
  slot: RunSlot;
  seq: number;
  /** Counts for the boards (a daily dungeon played again the same day does not). */
  ranked: boolean;
  date?: string;
}

export interface RunSummary extends RunOutcome {
  /** The tier of the armour worn at the end, from the server's final world (absent from runs before it). */
  armor?: number;
  /** The weapon in the hand at the end, from the final world (an item kind; absent: bare hands, or a run from before it was kept). */
  weapon?: string;
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

/** What a letter gives; kinds are added as rewards come (a server with a mailbox). */
export type Gift = { type: 'trophy'; board: string; place: number } | { type: 'item'; sku: string; from: number; name?: string; note?: string };

/** A letter of the mailbox: one a finished board the player placed on. */
export interface Letter {
  id: string;
  /** A gift is from a friend (Pixel-Mart's catalogue): its item is claimed from the mail. */
  kind: 'cup' | 'medal' | 'gift';
  board: string;
  place: number;
  total?: number;
  /** When the board closed. */
  at: number;
  gifts: Gift[];
  read?: boolean;
  claimed?: number;
}

/** How many letters wait to be claimed: the number on the camp's mail icon. */
export const unclaimed = (letters: readonly Letter[]): number => letters.filter((letter) => letter.claimed === undefined).length;

/**
 * The arena of waves is gone: a server of the old edition may still hold its trophies, letters and finished runs for a player, and a
 * client that meets them leaves them out, whatever the server says.
 */
const fromArena = (board: string): boolean => board.startsWith('arena');
export const withoutArena = (profile: Profile): Profile => ({
  ...profile,
  history: (profile.history ?? []).filter((run) => (run as { mode?: string }).mode !== 'arena' && (run.slot as string) !== 'arena'),
  trophies: (profile.trophies ?? []).filter((trophy) => !fromArena(trophy.board)),
  ...(profile.mail ? { mail: profile.mail.filter((letter) => !fromArena(letter.board)) } : {}),
});

export type Trouble = 'offline' | 'unauthorized' | 'rules';

/** A player's report of a problem: their words, and when attached, the run's last actions and the console's last errors (diag.ts). */
export interface ProblemReport {
  text: string;
  attach: boolean;
  info: {
    version: string;
    rules: number;
    build: string;
    run?: { id: string; seed: number; depth: number; slot: string; seq: number };
    device: string;
    platform: string;
    lang: string;
  };
  actions?: string[];
  errors?: string[];
}

export interface Profile {
  name: string;
  games: number;
  wins: number;
  deepest: number;
  best: number;
  bestByClass: Partial<Record<HeroClass, number>>;
  streak: { last: string | null; count: number; best: number; freezes: number };
  /** Today's daily dungeon has been begun (its ranked try is spent). */
  dailyDone: boolean;
  badges: BadgeProgress;
  history: RunSummary[];
  trophies: Array<{ board: string; place: number; at: number }>;
  /** The mailbox: letters not yet expired. Only a server that keeps one sends it (the camp's mail icon waits for it). */
  mail?: Letter[];
  /** The step tutorial has been seen through on any device. */
  coachDone?: boolean;
  /** The last version of the news seen on any device. */
  newsSeen?: string | null;
  /** Honours the admin gave: 'bughunter' for a confirmed problem report. */
  honors?: string[];
  /** «Hide me from the boards» (off by default). */
  hidden?: boolean;
  /** The competitions' season (server season-clock.ts): its id and days left, the Heat so far and the days it is made of, the seasons closed, what has been won. */
  season?: SeasonInfo;
  heat?: number;
  heatDays?: number;
  /** The weekly leagues: open or waiting for players, the step, the best step reached, and whether there is a room this week. */
  league?: { open: boolean; need: number; played: number; tier: string; best: number; inRoom: boolean };
  /** How the last week in a room ended (shown to the player once: `leagueSeen` is the week they have seen). */
  leagueResult?: LeagueResult;
  leagueSeen?: string | null;
  seasons?: SeasonResult[];
  honour?: string[];
  places: Partial<Record<BoardKind, number | null>>;
  /** How many players each board holds now. */
  totals?: Partial<Record<BoardKind, number>>;
  runs: Partial<Record<RunSlot, RunMeta & { over: boolean; depth: number; lvl: number; heroClass?: HeroClass }>>;
  today: string;
}

/** A season of the competitions: 8 weeks from a Monday; before the first begins nothing counts. */
export interface SeasonInfo {
  id: string;
  number: number;
  start: number;
  end: number;
  daysLeft: number;
  started: boolean;
}

/** A circle the player is in. */
export interface CircleRef {
  code: string;
  name: string;
  kind: 'friends' | 'group';
  cap: number;
}

export interface CirclesView {
  circles: CircleRef[];
  max: number;
}

/** A circle and the week's board of it. */
export interface CircleBoardView {
  code: string;
  week: string;
  circle: { name: string; kind: 'friends' | 'group'; size: number; cap: number; champion?: { week: string; you: boolean; name: string; score: number } | null };
  board: BoardView;
  circles: CircleRef[];
}

/** What a week in a room came to: the step of the room and the one after it, the place among the room, the Heat it gave. */
export interface LeagueResult {
  week: string;
  tier: string;
  to: string;
  result: 'up' | 'stay' | 'down';
  place: number;
  size: number;
  points: number;
  mark: boolean;
}

/** The league screen: the step, the room of the week and where the player stands in it. */
export interface LeagueView {
  open: boolean;
  need: number;
  played: number;
  week: string;
  endsAt: number;
  tier: string;
  best: number;
  tiers: string[];
  room: { number: number; tier: string; size: number; top: BoardEntry[]; rank: number | null; up: number; down: number } | null;
  result?: LeagueResult;
  seen: string | null;
}

/** A season closed for the player: the final place by Heat and what it won (honour keys: cup.s1, frame.season.s1, season_beacon). */
export interface SeasonResult {
  id: string;
  heat: number;
  rank: number;
  played: number;
  awards: string[];
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
  /** Turns the run took (speed and depth lists need them); absent from entries before they were kept. */
  turns?: number;
  patron?: boolean;
  /** What the player wears for the boards (Pixel-Mart's catalogue, by item id): name colour, title, portrait frame. */
  nc?: string;
  tt?: string;
  fr?: string;
  /** How the player's hero looked (the server's snapshot of what the wallet owned and wore: look of the class, hat, pet, fire, frame, title, name colour). Absent from older entries. */
  w?: BoardWorn;
  at: number;
}

/** What a board entry says the hero wore, by catalogue item id (the hero card, herocard.ts). */
export interface BoardWorn {
  /** The tier of the armour worn at the end of the run: the row of the hero's sheet (absent: cloth). */
  a?: number;
  /** The weapon in the hand at the end of the run (an item kind), from the verified final world. */
  wp?: string;
  l?: string;
  h?: string;
  p?: string;
  f?: string;
  fr?: string;
  tt?: string;
  nc?: string;
  /** The league's step the player stood on (the hero card's frame when no other is worn). */
  lg?: string;
}

/** A slice of a board (the same runs sorted another way): its metric, and the hero it is for (null: all). */
export interface BoardSlice {
  metric: 'score' | 'speed' | 'depth';
  cls: HeroClass | null;
}

export interface BoardView {
  name: string;
  rank: number | null;
  top: BoardEntry[];
  /** How many entries the list holds; `played` is how many players the board has had (the top 100 is all the list keeps). */
  total?: number;
  played?: number;
  you?: BoardEntry;
  /** The season board says which season it is of. */
  season?: SeasonInfo;
}

/** A page of the hall of fame: the top ten of a season by Heat, written once. */
export interface HallView {
  current: string;
  /** The seasons that are over (they have a page, when its grace days have passed). */
  available: string[];
  season: string | null;
  frozen: boolean;
  top: BoardEntry[];
}

export interface Identity {
  initData?: string;
  /** Development only (a server without a bot token takes the device's word for who it is). */
  id?: string;
  name?: string;
}

export interface RunApi {
  /** The result's picture at a public address (a story and a challenge need one); null if it cannot be had. */
  card(png: Blob): Promise<string | null>;
  /** The photo mode's picture (a PNG of up to 1.8 MB) at a public address, kept a day (server photos.ts); null if it cannot be had. */
  photo(png: Blob): Promise<string | null>;
  /** A message with the result the player may send to any chat (WebApp.shareMessage); its id, or null. */
  challenge(text: string, card: string | null, circle?: string): Promise<string | null>;
  /** The bot's reminders on or off; false if the server could not be told. */
  notify(on: boolean): Promise<boolean>;
  start(slot: RunSlot, hero: HeroClass, challenges: number): Promise<{ run: RunMeta; world: World } | Trouble>;
  sync(meta: RunMeta, actions: readonly Action[], hash: string | null, keepalive?: boolean): Promise<SyncAnswer | Trouble>;
  get(slot: RunSlot): Promise<{ run: RunMeta | null; world?: World } | Trouble>;
  me(): Promise<Profile | null>;
  /** The mailbox: read all, claim one (by its id) or claim all; the letters and trophies after it, or null. */
  mail(op: 'readAll' | 'claim' | 'claimAll', id?: string): Promise<{ mail: Letter[]; trophies: Profile['trophies'] } | null>;
  /** The step tutorial is done: kept with the profile, for every device. */
  coachDone(): Promise<boolean>;
  /** The news of this version have been seen: kept with the profile, for every device. */
  news(version: string): Promise<boolean>;
  /** «Report a problem»: true once the server has it; false when it could not be sent (or five went today). */
  problem(report: ProblemReport): Promise<boolean>;
  board(kind: BoardKind | 'season', slice?: BoardSlice): Promise<BoardView | null>;
  /** The player's circles (the list needs no call); `board` reads one: its name and size, last week's champion, this week's board. */
  circles(): Promise<CirclesView | null>;
  circleBoard(code: string): Promise<CircleBoardView | { error: string }>;
  /** Makes a circle, joins one by its code, joins the group the game was opened from, or leaves one; its error (limit, full, no such circle ...) if it was refused. */
  circleOp(op: 'create' | 'join' | 'leave', body: { code?: string; name?: string; kind?: 'friends' | 'group'; group?: boolean }): Promise<{ ok: true; code?: string; circles: CircleRef[] } | { error: string }>;
  /** The player's league: their step and room (the server settles last week and joins a room first). */
  league(): Promise<LeagueView | null>;
  /** The week's result has been seen (kept with the profile, for every device). */
  leagueSeen(week: string): Promise<boolean>;
  /** The hall of fame of a season (the latest over by default). */
  hall(season?: string): Promise<HallView | null>;
  /** «Hide me from the boards» on or off: the setting as the server kept it, or null if it could not be told. */
  hide(on: boolean): Promise<boolean | null>;
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
    me: async () => {
      const profile = await quiet<Profile>('/me', {});
      return profile && withoutArena(profile);
    },
    coachDone: async () => (await quiet<{ coachDone: boolean }>('/me', { coachDone: true }))?.coachDone === true,
    news: async (version) => (await quiet<{ news: string }>('/me', { news: version }))?.news !== undefined,
    mail: async (op, id) => {
      const answer = await quiet<{ mail: Letter[]; trophies: Profile['trophies'] }>('/mail', { op, ...(id ? { letter: id } : {}) });
      return answer && { mail: answer.mail.filter((letter) => !fromArena(letter.board)), trophies: answer.trophies.filter((trophy) => !fromArena(trophy.board)) };
    },
    problem: async (report) => {
      // The report goes in the body only (never in an address), and is sent whatever rules this build runs: an old build is the likeliest to need it.
      try {
        const response = await fetch(`${base}/problem`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...identity(), ...report }) });
        return response.ok;
      } catch {
        return false;
      }
    },
    card: async (png) => {
      try {
        const response = await fetch(`${base}/card`, { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Init-Data': identity().initData ?? '' }, body: png });
        return response.ok ? ((await response.json()) as { url: string }).url : null;
      } catch {
        return null;
      }
    },
    photo: async (png) => {
      try {
        const response = await fetch(`${base}/photo`, { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Init-Data': identity().initData ?? '' }, body: png });
        return response.ok ? ((await response.json()) as { url: string }).url : null;
      } catch {
        return null;
      }
    },
    challenge: async (text, card, circle) => (await quiet<{ id: string }>('/challenge', { text, card, ...(circle ? { circle } : {}) }))?.id ?? null,
    notify: async (on) => (await quiet<{ on: boolean }>('/notify', { on })) !== null,
    board: (kind, slice) => quiet('/board', { kind, ...(slice && slice.metric !== 'score' ? { metric: slice.metric } : {}), ...(slice?.cls ? { cls: slice.cls } : {}) }),
    hall: (season) => quiet('/hall', season ? { season } : {}),
    league: () => quiet('/league', {}),
    circles: () => quiet('/circle', { op: 'list' }),
    circleBoard: async (code) => (await post<CircleBoardView | { error: string }>('/circle', { op: 'board', code })) as CircleBoardView | { error: string },
    circleOp: async (op, body) => {
      const answer = await post<{ ok: true; code?: string; circles: CircleRef[] } | { error: string }>('/circle', { op, ...body });
      return typeof answer === 'string' ? { error: answer } : answer;
    },
    leagueSeen: async (week) => (await quiet<{ seen: string }>('/league', { seen: week })) !== null,
    hide: async (on) => (await quiet<{ hidden: boolean }>('/me', { hidden: on }))?.hidden ?? null,
  };
}
