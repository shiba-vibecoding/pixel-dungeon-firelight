import { DurableObject } from 'cloudflare:workers';
import { type Action, dayOf, type HeroClass, isPatron, RULES_VERSION, weekEnd, weekOf } from '@pd/core';
import { BOARD_KINDS, type BoardKind, boardName, boardObject, boardOfRun, boardsFor, isArenaBoard } from './boards';
import { secretDailySeed } from './daily-seed';
import { CORS, json, jsonBody } from './http';
import type { Env } from './index';
import { BOARD_SIZE, type DailyEntry, type Passed, publicId } from './leaderboard';
import type { PutAnswer } from './board-state';
import { parseSlice } from './slices';
import { legacyFields, wornByClass, wornOf } from './worn';
import { claimAll, claimLetter, collectMail, type Lookup, noteEntered, readAll } from './mail';
import { newsSeenAfter, parseVersion } from './news';
import { outageDays } from './outages';
import { giveHonor, MAX_PROBLEM_BYTES, parseProblem, PROBLEMS_PER_DAY, takeProblemSlot } from './problem';
import { readBody } from './secret';
import { claimGifts, giftLetters, type Facts } from './shopapi';
import { emptyShop, shopOf, type WalletView } from './wallet';
import { walletsOf } from './walletsdo';
import { sanitizeAction } from './messages';
import { loadPlayer } from './season';
import { EntryWriter, toEntries } from './run-store';
import { describe, ended, MAX_SYNC_ACTIONS, parseSlot, PlayerLogic, type RunSlot, type RunSummary, streakNow } from './runs';
import { notifierStub } from './notifier';
import { OVERTAKEN_TOP } from './reminders';
import { verifyInitData, WEEK_SECONDS } from './telegram-auth';
import { speaksRussian } from './catalogue';
import { nameOnBoards, setHidden, wornOnBoards } from './privacy';
import { type Heat, heatOf } from './heat';
import { freezeHall } from './hall';
import { currentTier, inRoom, type LeagueDeps, settleLeague, syncLeague } from './league-flow';
import { deskName, leagueStub, roomName } from './league';
import { capOf, type CircleDeps, codesOf, joined, left, mayJoin, putCircles, settleCircles } from './circle-flow';
import { circleBoard, circleStub } from './circle';
import { type CircleKind, cleanName, groupCode, isCode, KINDS, MAX_CIRCLES, newCode } from './circle-rules';
import { leaguesOpen, OPEN_AT, TIERS, zones } from './league-rules';
import { closeDueSeasons, putHeat, rollSeason, type SeasonDeps, settleBoard } from './season-flow';
import { seasonAt, seasonStart } from './season-clock';

/*
 * Checked runs over HTTP (runs.ts):
 *
 *   POST /run   { initData, rules, op: 'start', slot, hero, challenges }   a new run: its id and world
 *               { initData, rules, op: 'sync', slot, run, from, actions, hash, sid?, claim? }  moves played on the device; `sid` names the copy of the game, `claim` takes the run over from another copy (else a sync from a copy that does not hold the run is answered reason 'taken')
 *               { initData, rules, op: 'get', slot }                         the run as the server has it
 *   POST /me    { initData }                     the profile: records, streak, trophies, mail, places now
 *               { initData, coachDone: true }    the step tutorial is done (kept with the profile, for every device)
 *               { initData, news: '2.4' }        the news of that version have been seen (kept the same way)
 *   POST /mail  { initData, op: 'readAll' | 'claim' | 'claimAll', letter }   the mailbox (mail.ts): its letters and trophies after
 *   POST /board { initData?, kind }              a board's best, and my place on it
 *   POST /problem { initData, text?, attach, info, actions?, errors? }   a report of a problem (problem.ts): at most five a day
 *
 * Each player's runs and profile live in their own Durable Object (Player), so a player's
 * requests are taken one at a time. Only Telegram players have checked runs: elsewhere the
 * game is played on the device alone, and counts nowhere.
 */

/** The largest sync: init data and MAX_SYNC_ACTIONS actions. */
const MAX_RUN_BYTES = 128 * 1024;
const HERO_CLASSES: readonly HeroClass[] = ['warrior', 'mage', 'rogue', 'huntress'];
/** How many entries a board shows. */
const BOARD_TOP = BOARD_SIZE;

interface Who {
  /** The account key: tg<Telegram id>, or the development id. */
  key: string;
  name: string;
  /** The player's Telegram language is Russian (what a name hidden on the boards is called). */
  ru?: boolean;
  /** The chat the game was opened from, from the signed init data (a group's circle is made from it). */
  chat?: { instance: string; type: string };
}

/** The player behind a request: Telegram init data; without a bot token (development), the id the client gives. */
async function who(body: Record<string, unknown>, env: Env): Promise<Who | null> {
  if (env.BOT_TOKEN) {
    if (typeof body.initData !== 'string' || !body.initData) return null;
    const user = await verifyInitData(body.initData, env.BOT_TOKEN, WEEK_SECONDS);
    return user ? { key: `tg${user.id}`, name: (user.first_name || user.username || 'Hero').slice(0, 32), ru: speaksRussian(user.language_code), ...(user.chat_instance ? { chat: { instance: user.chat_instance, type: user.chat_type ?? '' } } : {}) } : null;
  }
  const id = typeof body.id === 'string' ? body.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) : '';
  return id ? { key: `dev${id}`, name: (typeof body.name === 'string' && body.name.slice(0, 32)) || 'Hero' } : null;
}

/** The token a copy of the game names itself by (checked.ts DeviceTag), cleaned; empty when it names none (an older client). */
const deviceToken = (value: unknown): string => (typeof value === 'string' ? value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) : '');

const playerStub = (env: Env, key: string): DurableObjectStub<Player> => env.PLAYER.get(env.PLAYER.idFromName(key));
const boardStub = (env: Env, name: string): DurableObjectStub => env.DAILY.get(env.DAILY.idFromName(boardObject(name)));
/** The key a board's public ids are made with: a server secret, so they cannot be worked back to accounts. */
const boardKey = (env: Env): string => env.BOT_TOKEN ?? 'development';

/** POST /run: to the player's own object, once they are known. */
export async function runRoute(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const body = await jsonBody(request, MAX_RUN_BYTES);
  if (!body) return json({ error: 'bad json' }, 400);
  // A device on other rules would play the run otherwise than the server: it updates first.
  if (body.rules !== RULES_VERSION) return json({ error: 'rules', rules: RULES_VERSION }, 409);
  const player = await who(body, env);
  if (!player) return json({ error: 'unauthorized' }, 401);
  const response = await playerStub(env, player.key).fetch('https://player/run', {
    method: 'POST', body: JSON.stringify({ ...body, initData: undefined, player }),
  });
  return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

/** POST /me: the profile. */
export async function meRoute(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const body = await jsonBody(request);
  if (!body) return json({ error: 'bad json' }, 400);
  const player = await who(body, env);
  if (!player) return json({ error: 'unauthorized' }, 401);
  const news = parseVersion(body.news);
  const response = await playerStub(env, player.key).fetch('https://player/me', {
    method: 'POST', body: JSON.stringify({ player, coachDone: body.coachDone === true, ...(news ? { news } : {}), ...(typeof body.hidden === 'boolean' ? { hidden: body.hidden } : {}) }),
  });
  return withGifts(env, player.key, response);
}

/**
 * An answer with a mailbox in it, with the gifts of Pixel-Mart's catalogue (shopapi.ts) among its letters: they are kept in the wallet,
 * which a season's wipe never touches, and come to the player's mail from there. Any other answer, and a wallet that cannot be reached, go through.
 */
async function withGifts(env: Env, key: string, response: Response): Promise<Response> {
  const headers = { 'Content-Type': 'application/json', ...CORS };
  const text = await response.text();
  const user = /^tg(\d+)$/.exec(key)?.[1];
  if (!response.ok || !user) return new Response(text, { status: response.status, headers });
  try {
    const answer = JSON.parse(text) as { mail?: Array<{ at: number }> };
    if (!Array.isArray(answer.mail)) return new Response(text, { status: response.status, headers });
    const gifts = giftLetters(await walletsOf(env).get(Number(user)), Date.now());
    if (gifts.length === 0) return new Response(text, { status: response.status, headers });
    answer.mail = [...gifts, ...answer.mail].sort((a, b) => b.at - a.at);
    return new Response(JSON.stringify(answer), { status: response.status, headers });
  } catch {
    return new Response(text, { status: response.status, headers });
  }
}

/** POST /mail: read, claim or claim all; the player's own object does it. */
export async function mailRoute(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const body = await jsonBody(request);
  if (!body) return json({ error: 'bad json' }, 400);
  const player = await who(body, env);
  if (!player) return json({ error: 'unauthorized' }, 401);
  const op = body.op === 'readAll' || body.op === 'claim' || body.op === 'claimAll' ? body.op : null;
  if (!op) return json({ error: 'bad op' }, 400);
  const id = typeof body.letter === 'string' ? body.letter.slice(0, 64) : '';
  // A gift's letter is claimed in the wallet (it grants the item there); the player's own object hears of the rest.
  const user = /^tg(\d+)$/.exec(player.key)?.[1];
  const gift = op === 'claim' && id.startsWith('gift:');
  if (user && (gift || op === 'claimAll')) {
    try {
      await claimGifts(walletsOf(env), Number(user), gift ? id.slice('gift:'.length) : null, Date.now());
    } catch {
      return json({ error: 'wallet' }, 502);
    }
  }
  const response = await playerStub(env, player.key).fetch('https://player/mail', { method: 'POST', body: JSON.stringify({ player, op: gift ? 'none' : op, id }) });
  return withGifts(env, player.key, response);
}

/**
 * POST /problem: a player's report of what went wrong. Anyone who sent the rules of an older build may send one
 * (they are the ones likeliest to need to), so the rules are not checked; the body is capped, the player known by
 * their init data, and their own object counts their reports of the day (problem.ts) before the store keeps this.
 */
export async function problemRoute(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const text = await readBody(request, MAX_PROBLEM_BYTES);
  if (text === null) return json({ error: 'too big' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  if (typeof body !== 'object' || body === null) return json({ error: 'bad json' }, 400);
  const player = await who(body as Record<string, unknown>, env);
  if (!player) return json({ error: 'unauthorized' }, 401);
  const problem = parseProblem(body, Date.now());
  if (!problem) return json({ error: 'bad report' }, 400);
  const response = await playerStub(env, player.key).fetch('https://player/problem', { method: 'POST', body: JSON.stringify({ player, problem }) });
  return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

/**
 * POST /board: a board's best, and (for a known player) their place. `metric` (score, speed, depth) and `cls` (a hero) name a slice of it
 * (slices.ts); `played` is how many players the board has had, `rank` the player's true place on the score list however far down.
 */
export async function boardRoute(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const body = await jsonBody(request);
  if (!body) return json({ error: 'bad json' }, 400);
  // The season's board ranks Heat (season-flow.ts): it has no slices.
  const season = body.kind === 'season';
  const kind = (BOARD_KINDS as readonly unknown[]).includes(body.kind) ? (body.kind as BoardKind) : null;
  if (!kind && !season) return json({ error: 'bad board' }, 400);
  const slice = parseSlice(season ? undefined : body.metric, season ? undefined : body.cls);
  if (!slice) return json({ error: 'bad slice' }, 400);
  const now = Date.now();
  const current = seasonAt(now, seasonStart(env.COMPETE_SEASON_START));
  const name = season ? `season:${current.id}` : boardName(kind!, now);
  const player = await who(body, env);
  const me = player ? await publicId(boardKey(env), name, player.key) : null;
  const sliced = `${slice.metric === 'score' ? '' : `&metric=${slice.metric}`}${slice.cls ? `&cls=${slice.cls}` : ''}`;
  const response = await boardStub(env, name).fetch(`https://board/?name=${encodeURIComponent(name)}${me ? `&me=${me}` : ''}&top=${BOARD_TOP}${sliced}`);
  const payload = (await response.json()) as { rank: number | null; top: DailyEntry[]; total?: number; played?: number; you?: DailyEntry };
  return json({ name, ...payload, ...(season ? { season: { id: current.id, number: current.number, start: current.start, end: current.end, daysLeft: current.daysLeft, started: current.started } } : {}) });
}

/** POST /league: the player's league: their step, their room of the week and where they stand in it (the object settles last week and joins a room first). */
export async function leagueRoute(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const body = await jsonBody(request);
  if (!body) return json({ error: 'bad json' }, 400);
  const player = await who(body, env);
  if (!player) return json({ error: 'unauthorized' }, 401);
  const response = await playerStub(env, player.key).fetch('https://player/league', {
    method: 'POST', body: JSON.stringify({ player, ...(typeof body.seen === 'string' ? { seen: body.seen } : {}) }),
  });
  return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

/** POST /circle: a player's circles (list, board, create, join, leave); the player's own object decides. */
export async function circleRoute(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const body = await jsonBody(request);
  if (!body) return json({ error: 'bad json' }, 400);
  const player = await who(body, env);
  if (!player) return json({ error: 'unauthorized' }, 401);
  const ops = ['list', 'board', 'create', 'join', 'leave'];
  if (body.op !== undefined && !ops.includes(String(body.op))) return json({ error: 'bad op' }, 400);
  const response = await playerStub(env, player.key).fetch('https://player/circle', {
    method: 'POST', body: JSON.stringify({ player, op: body.op, code: body.code, name: body.name, kind: body.kind, group: body.group === true }),
  });
  return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

/** Tells a player's object that what they wear changed (equipment, a refund): the boards still open show it (Player.worn). Never fails the caller. */
export async function patchWorn(env: Env, user: number): Promise<void> {
  const key = `tg${user}`;
  try {
    await playerStub(env, key).fetch('https://player/worn', { method: 'POST', body: JSON.stringify({ player: { key, name: '' } }) });
  } catch {
    // The boards catch up with the next change or the next run.
  }
}

/*
 * What the arena of waves left in a profile (its trophies, finished runs and badges) stays in the storage, but is not served: the game
 * has no such mode now.
 */
const shownTrophy = (trophy: { board: string }): boolean => !isArenaBoard(trophy.board);
const shownLetter = (letter: { board: string }): boolean => !isArenaBoard(letter.board);
const shownRun = (run: RunSummary): boolean => (run as { mode?: string }).mode !== 'arena' && (run.slot as string) !== 'arena';

/** A player's checked runs and profile (runs.ts), kept in storage as run-store.ts cuts them. */
export class Player extends DurableObject<Env> {
  private logic: PlayerLogic | null = null;
  private readonly writer = new EntryWriter();

  private async load(): Promise<PlayerLogic> {
    if (!this.logic) {
      const entries = await this.ctx.storage.list<string>();
      this.writer.loaded(entries);
      // A player of an earlier season is started afresh (season.ts), and that is written out at once, runs under way and all.
      const loaded = loadPlayer(entries);
      this.logic = new PlayerLogic(loaded.profile, loaded.runs);
      if (loaded.wiped) await this.persist(new Set(), new Map());
    }
    return this.logic;
  }

  /** Writes what changed. `fresh`: slots whose run is new (all of it written); `touched`: depths a slot's run may have changed. */
  private async persist(fresh: ReadonlySet<RunSlot>, touched: ReadonlyMap<RunSlot, ReadonlySet<number>>): Promise<void> {
    const logic = this.logic!;
    const entries = toEntries(logic.profile, logic.runs, (key, slot, depth) =>
      fresh.has(slot) || touched.get(slot)?.has(depth) ? undefined : this.writer.get(key));
    const { put, remove } = this.writer.changes(entries);
    try {
      if (Object.keys(put).length > 0) await this.ctx.storage.put(put);
      if (remove.length > 0) await this.ctx.storage.delete(remove);
    } catch (error) {
      // What was written is no longer known: the next load reads it again.
      this.writer.reset();
      this.logic = null;
      throw error;
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = (await request.json()) as Record<string, unknown> & { player: Who };
    const logic = await this.load();
    const now = Date.now();
    if (url.pathname === '/mail') return json(await this.mail(logic, body, now));
    if (url.pathname === '/facts') {
      // What the shop needs of the player (shopapi.ts): the pass's XP, the best streak and the trophies that earn things.
      const p = logic.profile;
      const facts: Facts = { pass: p.pass ?? null, streakBest: p.streak.best, trophies: p.trophies.map((trophy) => ({ board: trophy.board, place: trophy.place })), badges: p.badges.earned, honour: p.honour ?? [], leagueBest: p.league?.best ?? 0 };
      return json(facts);
    }
    if (url.pathname === '/card') {
      // What a friend may see of this player (shopapi.ts friendsOf): a name and a class, and only if they have played.
      const p = logic.profile;
      const heroClass = p.history[0]?.heroClass ?? (Object.keys(p.bestByClass)[0] as HeroClass | undefined);
      return json(p.games > 0 ? { name: p.name, ...(heroClass ? { heroClass } : {}) } : null);
    }
    if (url.pathname === '/worn') return json(await this.worn(logic, body.player));
    if (url.pathname === '/league') return json(await this.league(logic, body, now));
    if (url.pathname === '/circle') return this.circle(logic, body, now);
    if (url.pathname === '/honor') {
      // The admin confirmed a problem report (index.ts adminOps): the badge goes to the profile, once.
      const granted = giveHonor(logic.profile, String(body.honor ?? ''));
      if (granted) await this.persist(new Set(), new Map());
      return json({ granted });
    }
    if (url.pathname === '/problem') {
      const today = dayOf(now);
      const taken = takeProblemSlot(logic.profile.problems, today);
      if (!taken.ok) return json({ error: 'limit' }, 429);
      const before = logic.profile.problems;
      logic.profile.problems = taken.state;
      let id: string | null = null;
      try {
        const stored = await this.env.REPORTS.get(this.env.REPORTS.idFromName('all')).fetch('https://reports/problem', {
          method: 'POST', body: JSON.stringify({ problem: body.problem, by: body.player.key }),
        });
        if (stored.ok) id = ((await stored.json()) as { id: string }).id;
      } catch {
        // Told below.
      }
      // A report that could not be kept does not count against the day.
      if (id === null) logic.profile.problems = before;
      await this.persist(new Set(), new Map());
      return id === null ? json({ error: 'not kept' }, 502) : json({ id, left: Math.max(0, PROBLEMS_PER_DAY - taken.state.count) });
    }
    if (url.pathname === '/me') {
      // The tutorial's end is kept once and for good; a light answer, the profile comes with the next ask.
      if (body.coachDone === true) {
        if (!logic.profile.coachDone) {
          logic.profile.coachDone = true;
          await this.persist(new Set(), new Map());
        }
        return json({ coachDone: true });
      }
      if (typeof body.hidden === 'boolean') {
        // «Hide me from the boards»: kept with the profile, and the boards still open take the name now.
        if (setHidden(logic.profile, body.hidden, body.player.ru)) {
          await this.persist(new Set(), new Map());
          await this.worn(logic, body.player, true);
        }
        return json({ hidden: logic.profile.hidden === true });
      }
      if (typeof body.news === 'string') {
        const seen = newsSeenAfter(logic.profile.newsSeen, body.news);
        if (seen !== logic.profile.newsSeen) {
          logic.profile.newsSeen = seen;
          await this.persist(new Set(), new Map());
        }
        return json({ news: seen });
      }
      return json(await this.me(logic, body.player, now));
    }
    const slot = parseSlot(body.slot);
    if (!slot) return json({ error: 'bad slot' }, 400);
    switch (body.op) {
      case 'start': {
        const heroClass = (HERO_CLASSES as readonly unknown[]).includes(body.hero) ? (body.hero as HeroClass) : 'warrior';
        const challenges = Number.isInteger(body.challenges) ? (body.challenges as number) & 0xff : 0;
        const run = logic.start({
          slot, heroClass, challenges, name: body.player.name, seed: crypto.getRandomValues(new Uint32Array(1))[0]! >>> 1,
          ...(slot === 'daily' ? { dailySeed: await secretDailySeed(this.env.DAILY_SECRET, dayOf(now)) } : {}),
          id: crypto.randomUUID(), now, today: dayOf(now), outages: slot === 'daily' ? await outageDays(this.env) : [],
          ...(deviceToken(body.sid) ? { sid: deviceToken(body.sid) } : {}),
        });
        await this.persist(new Set([slot]), new Map());
        // The reminders hear that the streak was kept today (they keep nothing for those who did not ask).
        const chat = /^tg(\d+)$/.exec(body.player.key)?.[1];
        if (slot === 'daily' && run.ranked && chat) {
          try {
            await notifierStub(this.env).fetch('https://notifier/streak', {
              method: 'POST', body: JSON.stringify({ chat: Number(chat), streak: logic.profile.streak.count, last: logic.profile.streak.last }),
            });
          } catch {
            // A reminder may go out needlessly; nothing else is lost.
          }
        }
        return json({ run: describe(run), world: run.world });
      }
      case 'get': {
        const run = logic.runs[slot];
        return json(run ? { run: describe(run), world: run.world, ...ended(run) } : { run: null });
      }
      case 'sync': {
        const raw = Array.isArray(body.actions) ? body.actions : [];
        if (raw.length > MAX_SYNC_ACTIONS) return json({ error: 'too many actions' }, 413);
        const actions: Action[] = [];
        for (const item of raw) {
          const action = sanitizeAction(item);
          if (!action) return json({ error: 'bad action' }, 400);
          actions.push(action);
        }
        const from = Number.isInteger(body.from) ? (body.from as number) : -1;
        const id = typeof body.run === 'string' ? body.run : '';
        const hash = typeof body.hash === 'string' ? body.hash : null;
        const sid = deviceToken(body.sid);
        const result = logic.sync(slot, id, from, actions, hash, now, sid ? { sid, claim: body.claim === true } : undefined);
        await this.persist(new Set(), new Map([[slot, result.touched]]));
        if (!result.finish) return json(result.reply);
        // The run has ended: onto its boards, and the places it took there with the answer (and any asked again).
        const run = logic.runs[slot]!;
        run.places = await this.submit(body.player, result.finish.summary, now);
        await this.persist(new Set(), new Map());
        return json({ ...result.reply, ...ended(run) });
      }
      default:
        return json({ error: 'bad op' }, 400);
    }
  }

  /** What was last sent to the open boards (see worn()), so the same look is not sent twice. */
  private lastWorn = '';

  /**
   * Equipment changed or a purchase was refunded: the boards still open (today's daily, this week's, the best ever) that this player is on
   * show what they wear now. One call to each board they are on (their profile knows which; the wallet is read once, never per row), and
   * none at all when the look is the same as last sent. Finished boards stay as photographs of their day.
   */
  private async worn(logic: PlayerLogic, player: Who, force = false): Promise<{ boards: number }> {
    const profile = logic.profile;
    const wallet = await this.wallet(player.key);
    const now = Date.now();
    const open = [boardName('daily', now), boardName('week', now)].filter((name) => profile.entered.includes(name));
    if (profile.games > 0) open.push(boardName('all', now));
    // The boards of the player's circles of the week.
    for (const ref of profile.circles ?? []) if (ref.week === weekOf(now)) open.push(circleBoard(ref.code, ref.week));
    // The season's board, where the player's Heat stands.
    if (profile.heat?.sent) open.push(`season:${profile.heat.season}`);
    // What the entries should say: the look of each class (a wallet's word), and the name (the real one, or the alias of a hidden player).
    if (!wallet && /^tg\d+$/.test(player.key)) return { boards: 0 };
    // The step of the player's league is part of the look (its frame when no other is worn): the record's word.
    const league = profile.league ? currentTier(profile.league, weekOf(now)) : undefined;
    const byClass = Object.fromEntries(Object.entries(wallet ? wornByClass(shopOf(wallet), league) : {}).map(([heroClass, worn]) => [heroClass, wornOnBoards(profile, worn)]));
    const name = nameOnBoards(profile);
    // The room of the week shows it too.
    const room = profile.league?.week === weekOf(now) && profile.league.room && profile.league.roomTier ? roomName(profile.league.roomTier, profile.league.week, profile.league.room) : null;
    const signature = JSON.stringify([open, byClass, name, room]);
    if ((open.length === 0 && !room) || (signature === this.lastWorn && !force)) return { boards: 0 };
    const results = await Promise.all(open.map(async (board) => {
      try {
        const id = await publicId(boardKey(this.env), board, player.key);
        const response = await boardStub(this.env, board).fetch(`https://board/worn?name=${encodeURIComponent(board)}`, { method: 'POST', body: JSON.stringify({ owner: player.key, id, byClass, name }) });
        return response.ok;
      } catch {
        return false;
      }
    }));
    if (room) {
      try {
        results.push((await leagueStub(this.env, room).fetch('https://league/worn', { method: 'POST', body: JSON.stringify({ owner: player.key, byClass, name }) })).ok);
      } catch {
        results.push(false);
      }
    }
    // A board that could not be reached is tried again with the next change.
    if (results.every(Boolean)) this.lastWorn = signature;
    return { boards: open.length };
  }

  /** A finished run onto the boards it counts for; its place on each. */
  private async submit(player: Who, summary: RunSummary, now: number): Promise<Partial<Record<BoardKind, number | null>>> {
    const places: Partial<Record<BoardKind, number | null>> = {};
    const wallet = await this.wallet(player.key);
    const patron = wallet ? isPatron(wallet, now) : false;
    // What the hero wears on the boards (hero card, name colour, title, frame): built here from what the wallet owns and wears; never the device's word.
    // A player who asked to be hidden is «Hero» there, without the colour and the title that would say who.
    const profile = this.logic!.profile;
    const week = weekOf(now);
    const worn = wornOnBoards(profile, wornOf(wallet ? shopOf(wallet) : emptyShop(), summary.heroClass, summary.armor, profile.league ? currentTier(profile.league, week) : undefined, summary.weapon));
    const shownName = nameOnBoards(profile, player.name);
    let weekEntry: DailyEntry | null = null;
    let weekPlayed = 0;
    for (const kind of boardsFor(summary)) {
      const name = boardOfRun(kind, summary, now);
      const entry: DailyEntry = {
        id: await publicId(boardKey(this.env), name, player.key), owner: player.key, name: shownName,
        heroClass: summary.heroClass, depth: summary.depth, level: summary.level, gold: summary.gold, won: summary.won,
        score: summary.score, turns: summary.turns, kills: summary.kills, at: now, ...(patron ? { patron } : {}),
        ...(worn ? { w: worn, ...legacyFields(worn) } : {}),
      };
      noteEntered(this.logic!.profile, name);
      try {
        const response = await boardStub(this.env, name).fetch(`https://board/put?name=${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(entry) });
        const put = (await response.json()) as PutAnswer;
        places[kind] = put.rank;
        if (kind === 'week') {
          weekEntry = entry;
          weekPlayed = put.played;
        }
        // The day's board: the player right behind this one now hears of it (if they asked the bot to).
        if (kind === 'daily' && put.passed) await this.overtaken(put.passed, shownName);
      } catch {
        places[kind] = null;
      }
    }
    // The league: last week's room is settled; the leagues open, this run goes to the room (the first of the week puts the player in one, with
    // their best run of the week, which may be an earlier one than this).
    if (weekEntry) {
      const inLeague = inRoom(profile, week);
      const best = !inLeague && leaguesOpen(weekPlayed) ? ((await this.weekView(player, now)).entry ?? weekEntry) : weekEntry;
      await this.leagueSync(this.logic!, player, now, best, weekPlayed);
      // The circles' boards of the week (up to 2): only a run that beats what each has.
      if ((profile.circles ?? []).length > 0) await putCircles(profile, weekEntry, week, this.circleDeps(player, now));
    }
    return places;
  }

  /** Tells the bot a player was passed on the day's board: it writes to them only if they asked for reminders, and once a day (reminders.ts). */
  private async overtaken(passed: Passed, who: string): Promise<void> {
    const chat = /^tg(\d+)$/.exec(passed.owner)?.[1];
    if (!chat || passed.rank > OVERTAKEN_TOP) return;
    try {
      await notifierStub(this.env).fetch('https://notifier/overtaken', { method: 'POST', body: JSON.stringify({ chat: Number(chat), who, place: passed.rank }) });
    } catch {
      // The push is lost; nothing else is.
    }
  }

  /** A Telegram player's wallet (Pixel-Mart): a patron's star by their name on the boards, what they wear for them. Null if it cannot be had. */
  private async wallet(key: string): Promise<WalletView | null> {
    if (!/^tg\d+$/.test(key)) return null;
    try {
      return (await (await this.env.WALLET.get(this.env.WALLET.idFromName(key)).fetch('https://wallet/')).json()) as WalletView;
    } catch {
      return null;
    }
  }

  /** What a finished board says of a player: their place and how many were on it (null: not on it, or the board is gone). */
  private standing(key: string): Lookup {
    return async (name) => {
      try {
        // By the player's id on that board: the true place, how many played, and (a day's board) the places on its speed and depth lists.
        const id = await publicId(boardKey(this.env), name, key);
        const lists = name.startsWith('daily:') ? '&lists=1' : '';
        const response = await boardStub(this.env, name).fetch(`https://board/?name=${encodeURIComponent(name)}&me=${id}&top=0${lists}`);
        const answer = (await response.json()) as { rank: number | null; played?: number; total?: number; speed?: number | null; depth?: number | null };
        if (!answer.rank) return null;
        const played = answer.played ?? answer.total;
        return {
          rank: answer.rank, ...(played ? { total: played, played } : {}),
          ...(answer.speed !== undefined ? { speed: answer.speed } : {}), ...(answer.depth !== undefined ? { depth: answer.depth } : {}),
        };
      } catch {
        // Asked again next time.
        return 'error';
      }
    };
  }

  /** What the league's objects are asked on this player's behalf (league-flow.ts). */
  private leagueDeps(player: Who, now: number): LeagueDeps {
    const key = boardKey(this.env);
    return {
      now, start: seasonStart(this.env.COMPETE_SEASON_START),
      standing: async (tier, week, room) => {
        try {
          const name = roomName(tier, week, room);
          const id = await publicId(key, name, player.key);
          const answer = (await (await leagueStub(this.env, name).fetch(`https://league/?me=${id}`)).json()) as { size: number; rank: number | null };
          return answer.rank ? { place: answer.rank, size: answer.size } : null;
        } catch {
          return 'error';
        }
      },
      join: async (tier, week) => {
        try {
          const answer = (await (await leagueStub(this.env, deskName(tier, week)).fetch('https://league/join', { method: 'POST', body: JSON.stringify({ owner: player.key }) })).json()) as { room?: number };
          return Number.isInteger(answer.room) ? (answer.room as number) : null;
        } catch {
          return null;
        }
      },
      put: async (tier, week, room, entry) => {
        try {
          const name = roomName(tier, week, room);
          const response = await leagueStub(this.env, name).fetch('https://league/put', {
            method: 'POST', body: JSON.stringify({ entry: { ...entry, id: await publicId(key, name, player.key), owner: player.key } }),
          });
          return response.ok;
        } catch {
          return false;
        }
      },
    };
  }

  /**
   * The league's part of a visit or of a run's end: last week's room is settled, and (the leagues open) the best run of the week is put in this
   * week's room. `entry` is the player's best run on the week's board, `played` how many have played the week. A step that changed is put on the
   * boards still open. Returns whether the profile changed.
   */
  private async leagueSync(logic: PlayerLogic, player: Who, now: number, entry: DailyEntry | null, played: number): Promise<boolean> {
    const p = logic.profile;
    const deps = this.leagueDeps(player, now);
    const week = weekOf(now);
    const before = currentTier(p.league, week);
    let changed = await settleLeague(p, deps, week);
    if (await syncLeague(p, entry, leaguesOpen(played), deps, week)) changed = true;
    if (changed && currentTier(p.league, week) !== before) await this.worn(logic, player, true);
    return changed;
  }

  /** Tells the bot the room of the week (once a week); whether the profile changed. */
  private async tellLeague(p: PlayerLogic['profile'], player: Who, now: number): Promise<boolean> {
    const state = p.league;
    const chat = /^tg(\d+)$/.exec(player.key)?.[1];
    if (!chat || !state?.week || !state.room || !state.roomTier || state.told === state.week || state.week !== weekOf(now)) return false;
    try {
      await notifierStub(this.env).fetch('https://notifier/league', { method: 'POST', body: JSON.stringify({ chat: Number(chat), tier: state.roomTier, week: state.week, room: state.room }) });
      state.told = state.week;
      return true;
    } catch {
      return false;
    }
  }

  /** The player's own best run of the week and how many have played it (the league's input, from the week's board). */
  private async weekView(player: Who, now: number): Promise<{ entry: DailyEntry | null; played: number; rank: number | null }> {
    const name = boardName('week', now);
    try {
      const id = await publicId(boardKey(this.env), name, player.key);
      const answer = (await (await boardStub(this.env, name).fetch(`https://board/?name=${encodeURIComponent(name)}&me=${id}&top=0`)).json()) as { rank: number | null; played?: number; total?: number; you?: DailyEntry };
      return { entry: answer.you ?? null, played: answer.played ?? answer.total ?? 0, rank: answer.rank };
    } catch {
      return { entry: null, played: 0, rank: null };
    }
  }

  /** The league screen: the step, the room of the week with where the player stands, and last week's result (the player's visit settles and joins first). */
  private async league(logic: PlayerLogic, body: Record<string, unknown>, now: number): Promise<Record<string, unknown>> {
    const p = logic.profile;
    const player = body.player as Who;
    if (typeof body.seen === 'string') {
      if (p.leagueSeen !== body.seen) {
        p.leagueSeen = body.seen;
        await this.persist(new Set(), new Map());
      }
      return { seen: p.leagueSeen };
    }
    const view = await this.weekView(player, now);
    if (await this.leagueSync(logic, player, now, view.entry, view.played)) await this.persist(new Set(), new Map());
    const week = weekOf(now);
    const open = leaguesOpen(view.played);
    const tier = currentTier(p.league, week);
    let room: Record<string, unknown> | null = null;
    if (open && inRoom(p, week)) {
      const state = p.league!;
      const name = roomName(state.roomTier!, week, state.room!);
      try {
        const id = await publicId(boardKey(this.env), name, player.key);
        const answer = (await (await leagueStub(this.env, name).fetch(`https://league/?me=${id}`)).json()) as { size: number; top: DailyEntry[]; rank: number | null };
        room = { number: state.room, tier: state.roomTier, size: answer.size, top: answer.top, rank: answer.rank, ...zones(answer.size) };
      } catch {
        room = null;
      }
    }
    return {
      open, need: OPEN_AT, played: view.played, week, endsAt: weekEnd(now), tier, best: p.league?.best ?? 0, tiers: TIERS, room,
      ...(p.leagueResult ? { result: p.leagueResult } : {}), seen: p.leagueSeen ?? null,
    };
  }

  /** What the circles' objects are asked on this player's behalf (circle-flow.ts). */
  private circleDeps(player: Who, now: number): CircleDeps {
    const key = boardKey(this.env);
    return {
      now, start: seasonStart(this.env.COMPETE_SEASON_START),
      champion: async (code, week) => {
        try {
          const answer = (await (await circleStub(this.env, code).fetch(`https://circle/?me=${encodeURIComponent(player.key)}&code=${code}&settle=${week}`)).json()) as { champion?: { you: boolean } | null; settled?: boolean; error?: string };
          if (answer.error) return 'error';
          return { you: answer.champion?.you === true, settled: answer.settled === true };
        } catch {
          return 'error';
        }
      },
      put: async (code, week, entry) => {
        try {
          const name = circleBoard(code, week);
          const response = await boardStub(this.env, name).fetch(`https://board/put?name=${encodeURIComponent(name)}`, {
            method: 'POST', body: JSON.stringify({ ...entry, id: await publicId(key, name, player.key), owner: player.key }),
          });
          return response.ok;
        } catch {
          return false;
        }
      },
    };
  }

  /**
   * The circles' screen and its operations (all of them judged here, from the signed init data and the player's own record):
   *   list                        the circles the player is in (their record: no call)
   *   board { code }              a circle of theirs: its name, size and last week's champion, and this week's board
   *   create { name, kind }       a new circle of friends (or a group), the player its first member
   *   join { code } | { group }   joins by the invite code, or the group's circle of the chat the game was opened from (made if it is not there)
   *   leave { code }
   */
  private async circle(logic: PlayerLogic, body: Record<string, unknown>, now: number): Promise<Response> {
    const p = logic.profile;
    const player = body.player as Who;
    const week = weekOf(now);
    const deps = this.circleDeps(player, now);
    const told = (): Array<Record<string, unknown>> => (p.circles ?? []).map((ref) => ({ code: ref.code, name: ref.name, kind: ref.kind, cap: capOf(ref.kind) }));
    const op = body.op === undefined ? 'list' : body.op;
    // The player's best run of the week goes to a circle's board as they come in, so that they stand on it at once.
    const present = async (): Promise<void> => {
      const view = await this.weekView(player, now);
      if (await putCircles(p, view.entry, week, deps)) await this.persist(new Set(), new Map());
    };
    if (op === 'list') return json({ circles: told(), max: MAX_CIRCLES });
    if (op === 'board') {
      const code = body.code;
      if (!isCode(code) || !codesOf(p).includes(code)) return json({ error: 'not your circle' }, 403);
      try {
        const last = weekOf(now - 7 * 86_400_000);
        const meta = (await (await circleStub(this.env, code).fetch(`https://circle/?me=${encodeURIComponent(player.key)}&code=${code}&settle=${last}`)).json()) as Record<string, unknown>;
        if (meta.error || meta.member !== true) {
          // Gone (or the player is no longer in it): forgotten here.
          if (left(p, code)) await this.persist(new Set(), new Map());
          return json({ error: 'no such circle' }, 404);
        }
        const name = circleBoard(code, week);
        const id = await publicId(boardKey(this.env), name, player.key);
        const board = (await (await boardStub(this.env, name).fetch(`https://board/?name=${encodeURIComponent(name)}&me=${id}&top=50`)).json()) as Record<string, unknown>;
        return json({ code, circle: meta, week, board: { name, ...board }, circles: told() });
      } catch {
        return json({ error: 'circle' }, 502);
      }
    }
    if (op === 'leave') {
      const code = body.code;
      if (!isCode(code) || !left(p, code)) return json({ error: 'not your circle' }, 404);
      await this.persist(new Set(), new Map());
      try {
        await circleStub(this.env, code).fetch('https://circle/leave', { method: 'POST', body: JSON.stringify({ owner: player.key }) });
      } catch {
        // The circle still lists them; they are out of it here, which is what counts.
      }
      return json({ ok: true, circles: told() });
    }
    if (op === 'create' || op === 'join') {
      let code: unknown = body.code;
      let create: { name: string; kind: CircleKind } | undefined;
      if (op === 'create') {
        const name = cleanName(body.name);
        const kind = (KINDS as readonly unknown[]).includes(body.kind) ? (body.kind as CircleKind) : 'friends';
        if (!name) return json({ error: 'bad name' }, 400);
        if (codesOf(p).length >= MAX_CIRCLES) return json({ error: 'limit' }, 409);
        code = newCode(crypto.getRandomValues(new Uint8Array(10)));
        create = { name, kind };
      } else if (body.group === true) {
        // The group's circle: named by the chat the game was opened from, in the signed init data (never by what a device says).
        const chat = player.chat;
        if (!chat || !['group', 'supergroup', 'channel'].includes(chat.type)) return json({ error: 'not from a group' }, 400);
        code = await groupCode(chat.instance, boardKey(this.env));
        create = { name: cleanName(body.name) ?? (player.ru ? 'Группа' : 'Group'), kind: 'group' };
      }
      if (!isCode(code)) return json({ error: 'bad code' }, 400);
      let meta: { kind: CircleKind; size: number; name: string } | null = null;
      if (op === 'join') {
        try {
          const found = (await (await circleStub(this.env, code).fetch(`https://circle/?me=${encodeURIComponent(player.key)}`)).json()) as { kind?: CircleKind; size?: number; name?: string; error?: string };
          if (!found.error && found.kind && typeof found.size === 'number' && found.name) meta = { kind: found.kind, size: found.size, name: found.name };
        } catch {
          return json({ error: 'circle' }, 502);
        }
      }
      const verdict = mayJoin(p, code, meta ?? (create ? { kind: create.kind, size: 0 } : null));
      if (verdict === 'already') return json({ ok: true, kept: true, circles: told() });
      if (verdict !== 'ok') return json({ error: verdict }, verdict === 'full' || verdict === 'limit' ? 409 : verdict === 'no such circle' ? 404 : 400);
      try {
        const response = await circleStub(this.env, code).fetch('https://circle/join', { method: 'POST', body: JSON.stringify({ owner: player.key, ...(create ? { create } : {}) }) });
        const answer = (await response.json()) as { circle?: { name: string; kind: CircleKind }; error?: string };
        if (!response.ok || !answer.circle) return json({ error: answer.error ?? 'circle' }, response.status === 409 ? 409 : response.status === 404 ? 404 : 502);
        joined(p, { code, name: answer.circle.name, kind: answer.circle.kind });
        await this.persist(new Set(), new Map());
        await present();
        return json({ ok: true, code, circles: told() });
      } catch {
        return json({ error: 'circle' }, 502);
      }
    }
    return json({ error: 'bad op' }, 400);
  }

  /** The player's Heat on the season's board (their best stands); whether the board took it. */
  private async putHeat(player: Who, heat: Heat, season: string, now: number): Promise<boolean> {
    const profile = this.logic!.profile;
    const name = `season:${season}`;
    const wallet = await this.wallet(player.key);
    const heroClass = profile.history[0]?.heroClass ?? 'warrior';
    const worn = wornOnBoards(profile, wallet ? wornOf(shopOf(wallet), heroClass) : undefined);
    const entry: DailyEntry = {
      id: await publicId(boardKey(this.env), name, player.key), owner: player.key, name: nameOnBoards(profile, player.name), heroClass,
      depth: Math.max(1, profile.deepest), level: 1, gold: 0, won: false, score: heatOf(heat), at: now, ...(worn ? { w: worn, ...legacyFields(worn) } : {}),
    };
    try {
      const response = await boardStub(this.env, name).fetch(`https://board/put?name=${encodeURIComponent(name)}`, { method: 'POST', body: JSON.stringify(entry) });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** The mailbox: a letter read or claimed, or all of them; the letters and the trophies as they stand. */
  private async mail(logic: PlayerLogic, body: Record<string, unknown>, now: number): Promise<Record<string, unknown>> {
    const p = logic.profile;
    const op = body.op;
    const id = typeof body.id === 'string' ? body.id : '';
    const changed = op === 'claimAll' ? claimAll(p, now) > 0 : op === 'claim' ? claimLetter(p, id, now) === 'claimed' : op === 'readAll' ? readAll(p) : false;
    if (changed) await this.persist(new Set(), new Map());
    return { mail: p.mail.filter(shownLetter), trophies: p.trophies.filter(shownTrophy) };
  }

  /** The profile, with the places held now and any letters of boards finished since last asked. */
  private async me(logic: PlayerLogic, player: Who, now: number): Promise<Record<string, unknown>> {
    const p = logic.profile;
    // The season (season-flow.ts): the Heat of the season now; every finished day counts once, and a fast or deep one wins its title.
    const start = seasonStart(this.env.COMPETE_SEASON_START);
    const deps: SeasonDeps = {
      now, start, standing: this.standing(player.key), put: (heat, season) => this.putHeat(player, heat, season, now), freeze: (id) => freezeHall(this.env, id),
    };
    let changed = await rollSeason(p, deps);
    const places: Partial<Record<BoardKind, number | null>> = {};
    const totals: Partial<Record<BoardKind, number>> = {};
    for (const kind of BOARD_KINDS) {
      const name = boardName(kind, now);
      try {
        // By the player's id on this board: their true place, beyond the top 100 too, and how many have played.
        const id = await publicId(boardKey(this.env), name, player.key);
        const response = await boardStub(this.env, name).fetch(`https://board/?name=${encodeURIComponent(name)}&me=${id}&top=0`);
        const answer = (await response.json()) as { rank: number | null; played?: number; total?: number };
        places[kind] = answer.rank ?? null;
        totals[kind] = answer.played ?? answer.total ?? 0;
      } catch {
        places[kind] = null;
      }
    }
    // The league: last week's room is settled and, the leagues open, this week's joined (its Heat and last week's end go into the season first).
    const week = await this.weekView(player, now);
    if (await this.leagueSync(logic, player, now, week.entry, week.played)) changed = true;
    // The bot is told once a week which room the player is in (it keeps nothing for a player who did not ask for reminders), so that its
    // Monday message can say how the week ended there: not at a run's end, where every call counts.
    if (await this.tellLeague(p, player, now)) changed = true;
    // Boards finished since last asked become letters (mail.ts); the trophies are claimed from them, and the days are counted in Heat.
    if (await collectMail(p, now, this.standing(player.key), (board, standing) => void settleBoard(p, board, standing, deps))) changed = true;
    // The week that has just ended in each of the player's circles: its champion gets the honour and the Heat.
    if (await settleCircles(p, this.circleDeps(player, now))) changed = true;
    if (await closeDueSeasons(p, deps)) changed = true;
    if (await putHeat(p, deps)) changed = true;
    if (changed) await this.persist(new Set(), new Map());
    const today = dayOf(now);
    const sNow = seasonAt(now, start);
    const runs = Object.fromEntries(
      Object.entries(logic.runs).map(([slot, run]) => {
        const hero = run.world.heroes[0];
        return [slot, { ...describe(run), over: Boolean(run.finished), depth: hero?.depth ?? 1, lvl: hero?.lvl ?? 1, heroClass: hero?.heroClass }];
      }),
    );
    return {
      name: p.name, games: p.games, wins: p.wins, deepest: p.deepest, best: p.best, bestByClass: p.bestByClass,
      streak: streakNow(p.streak, today, await outageDays(this.env)), dailyDone: p.dailyDate === today,
      badges: { ...p.badges, earned: p.badges.earned.filter((id) => !/^arena\d+$/.test(id)) }, history: p.history.filter(shownRun),
      trophies: p.trophies.filter(shownTrophy), mail: p.mail.filter(shownLetter), coachDone: p.coachDone, newsSeen: p.newsSeen ?? null, honors: p.honors ?? [], hidden: p.hidden === true, places, totals, runs, today,
      // The competitions' season: its id and days left, the Heat so far, the seasons closed, what has been won.
      season: { id: sNow.id, number: sNow.number, start: sNow.start, end: sNow.end, daysLeft: sNow.daysLeft, started: sNow.started },
      // The leagues: open or waiting for players, the step, the room, last week's result and whether the player has seen it.
      league: { open: leaguesOpen(week.played), need: OPEN_AT, played: week.played, tier: currentTier(p.league, weekOf(now)), best: p.league?.best ?? 0, inRoom: inRoom(p, weekOf(now)) },
      ...(p.leagueResult ? { leagueResult: p.leagueResult } : {}), leagueSeen: p.leagueSeen ?? null,
      heat: heatOf(p.heat), heatDays: Object.keys(p.heat?.days ?? {}).length, seasons: p.seasons ?? [], honour: p.honour ?? [],
    };
  }
}
