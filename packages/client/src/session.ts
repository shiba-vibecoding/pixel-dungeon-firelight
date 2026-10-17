import {
  act, type Action, addHero, applyBoon, applyEvent, type Bones, type ClientMessage, createWorld, dailyRules, type Effect, fingerprint, giveBones, heroById,
  type HeroClass,
  LIVE_CALM_MS, liveBeatMs, liveReady, liveTick,
  type Look, restartWorld, RULES_VERSION, type ServerMessage, type Signal, type World,
} from '@pd/core';
import type { RunApi, RunMeta, SyncAnswer } from './checked';
import { noteAction, resetActions } from './diag';
import { guestSecret } from './guest';
import { browserBuses, INSTANCE, Lease } from './instance';
import { onLeave } from './leave';
import { netlog, sendNetlog, startNetlog } from './netlog';
import { report } from './report';
import { forgetSlot, readSlot, type SavedCheck, SlotKeeper, type SlotRead, type StorageLike } from './savestore';
import { reloadForUpdate } from './update';

/*
 * Where the world comes from. A solo session runs the core directly and keeps
 * the run in local storage (savestore.ts: a turn is saved the moment it is taken); an online session keeps a replica of the
 * room's world, applying the ordered events the server broadcasts, and only sends
 * intentions.
 */

export interface Session {
  readonly mode: 'solo' | 'online';
  /** Null until an online session receives its first snapshot. */
  world: World | null;
  myId: string;
  online: string[];
  /** Connection state for the HUD; empty when all is well. */
  status: string;
  /** Bumped whenever the world is replaced wholesale, so views reset. */
  generation: number;
  /** True while my last action is in flight or queued behind companions. */
  readonly busy: boolean;
  /**
   * Online, a step of a walk may follow the last one before the room has answered: the
   * room's answer takes longer than a step on many phones' networks, and a walk paced
   * by it stutters. Null when the next action must wait; else the cell my last step,
   * still on its way, goes to (where the next one starts from).
   */
  readonly stepAhead: number | null;
  /**
   * Live turns (world.live): how long the current beat lasts (ms), so a step on screen takes as long and
   * walks never pause; null under classic turns.
   */
  readonly beatMs: number | null;
  /** Alone under live turns: while this says so (a window open, the app put away), the clock stands still. */
  hold?: () => boolean;
  send(action: Action): void;
  /** A new run after the party has fallen. */
  restart(): void;
  /** Effects that happened since the last call, in order. */
  drain(): Effect[];
  close(): void;
  /** What each player wears (Pixel-Mart), by hero id; outside the world. */
  looks: Record<string, Look>;
  /** Puts my look on, for the party to see. */
  wear(look: Look): void;
  /** A ping or an emote for the party (co-op only; alone there is no one to signal). */
  signal(signal: Signal): void;
  /** Signals the room relayed since the last call (mine among them), in order: who sent each, and when it came (performance.now()). */
  drainSignals(): Array<{ from: string; signal: Signal; at: number }>;
  /** A checked run (checked.ts): how it stands with the server; null for a run played on the device alone. */
  readonly checked?: CheckState | null;
  /**
   * Solo: another copy of the game holds this run now, 'window' on this device (another tab or window), 'device' by the server's word
   * (another phone or computer). This copy neither plays nor writes until the player takes the run back.
   */
  readonly superseded?: 'window' | 'device' | null;
  /** Takes the run back from the copy that has it (the one that had it is then the older, and stands aside in its turn). */
  takeBack?(): void;
}

export interface CheckState {
  readonly meta: RunMeta;
  /** The device has moves the server has not taken, and cannot reach it just now. */
  readonly offline: boolean;
  /** Tries the server again at once (the offline window's «Retry», the network coming back), instead of waiting out the backoff. */
  retry(): void;
  /** The run's end as the server scored it, once the run is over; null if it cannot be had (or the run is not checked). */
  finished(): Promise<SyncAnswer | null>;
}

/** What a checked run needs besides the world. */
export interface CheckOptions {
  api: RunApi;
  meta: RunMeta;
  /** Moves played and not yet taken by the server. */
  log?: Action[];
  /** The run's world as the server gave it (a new run, or one carried on from another device). */
  world?: World;
  /** A new checked run in the same slot (after a fall); null: none could be had, the next is the device's alone. */
  renew(): Promise<{ run: RunMeta; world: World } | null>;
}

/** Moves sent to the server at once when so many wait; fewer go after SYNC_DELAY_MS. */
const SYNC_BATCH = 40;
const SYNC_DELAY_MS = 8000;
/** The most moves one request carries (the server takes at most 400; a keepalive request must stay small). */
const SYNC_MAX = 300;
/** How long the end of a run waits for the server's word on it. */
const FINISH_WAIT_MS = 10_000;

export { SAVE_VERSION } from './savestore';

/** The device's storage, or null where there is none (blocked, or a private window that refuses it). */
function deviceStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** What a slot holds: the run to carry on, and what was found wrong with it (savestore.ts). */
export function inspectSolo(key: string): SlotRead {
  const storage = deviceStorage();
  return storage ? readSlot(storage, key) : { run: null, recovered: null, damaged: false, stale: null, gen: 0, replayed: 0, at: 0 };
}

/** A run is worth carrying on while it is under way, or over but with moves the server has not heard (its end is told to it first). */
const playable = (run: NonNullable<SlotRead['run']>): boolean => !run.world.over || (run.check !== null && run.check.log.length > 0);

/** The run a read of a slot gives to carry on, if any. */
export const carriedOn = (read: SlotRead): NonNullable<SlotRead['run']> | null => (read.run && playable(read.run) ? read.run : null);

/** The saved run, brought up to this version and to the last turn taken; null if there is none, it is over, or it is too old to carry on. */
export function loadSolo(key: string): World | null {
  const run = inspectSolo(key).run;
  return run && playable(run) ? run.world : null;
}

/** A saved checked run's standing with the server: its run, and the moves not yet sent. */
export function loadCheck(key: string): { meta: RunMeta; log: Action[] } | null {
  const run = inspectSolo(key).run;
  return run && playable(run) ? run.check : null;
}

/** A run saved by a version too old to carry on, still in its slot: the title says so before a new run replaces it. */
export function staleSolo(key: string): { depth: number; heroClass: HeroClass } | null {
  const read = inspectSolo(key);
  return read.run ? null : read.stale;
}

export function forgetSolo(key: string): void {
  const storage = deviceStorage();
  if (storage) forgetSlot(storage, key);
}

/**
 * @param key local storage slot, or null not to save
 * @param newSeed seed for a fresh run (also used by restart)
 */
/**
 * @param challenges the challenges of a fresh run (a bit mask; see Challenges in the core)
 * @param bones a fallen hero's bones for a fresh run to hold (bones.ts), read when the run starts
 * @param copy which copy of the game this is (the page's own token; the tests bring their own): the lease on the device and the server's owner token are named by it
 */
export function soloSession(
  key: string | null, heroClass: HeroClass, newSeed: () => number, name = 'Hero', challenges = 0,
  bones: () => Bones | null = () => null, live = false, checkOptions?: CheckOptions, daily?: string, copy: string = INSTANCE,
): Session {
  // A problem report's log is of the run played now.
  resetActions();
  const fresh = (): World => {
    // The daily dungeon played without the server keeps the day's rules all the same (daily.ts).
    const rules = daily ? dailyRules(daily) : null;
    const world = createWorld(newSeed(), rules ? rules.challenge : challenges, live);
    const hero = addHero(world, { id: 'me', name, heroClass });
    if (rules) applyBoon(world, hero, rules.boon);
    const left = bones();
    if (left) giveBones(world, left);
    return world;
  };
  let pending: Effect[] = [];
  const storage = key ? deviceStorage() : null;
  /** Another copy of the game takes the run: this one stands aside. */
  let superseded: 'window' | 'device' | null = null;
  let closed = false;
  const lease = key && storage ? new Lease(storage, key, () => supersede('window'), browserBuses(), copy) : null;
  // The newer copy takes over: whoever starts playing a run holds it.
  lease?.claim();
  const read = key && storage ? readSlot(storage, key) : null;
  let keeper = key && storage ? new SlotKeeper(storage, key, read?.gen ?? 0) : null;

  /* Saving: a turn at a time (the journal), the whole run now and then (a snapshot); see savestore.ts. */
  const failed = (): void => {
    // Out of space or storage blocked: the run is not kept, and the player is told (main.ts, once).
    dispatchEvent(new Event('pd-save-failed'));
  };
  /** A run that is over and has nothing left to tell the server is kept no longer. */
  const finished = (): boolean => Boolean(session.world?.over) && !(check && check.log.length > 0);
  /** Writes the whole run now. */
  const snapshotNow = (): void => {
    if (!keeper || superseded) return;
    if (finished()) keeper.drop();
    else if (!keeper.snapshot(session.world!, check)) failed();
  };
  /** A change that has no action to show for it (a run renewed, the server's copy taken): the whole run, now. */
  const save = snapshotNow;
  let snapTimer = 0;
  /** Live turns have no action to journal: the whole run is written soon after. */
  const saveSoon = (): void => {
    if (!keeper) return;
    clearTimeout(snapTimer);
    snapTimer = window.setTimeout(snapshotNow, 300);
  };
  /** Leaving the app (Telegram closed or sent to the background, the page going, the browser freezing it) must not lose the last moves: they are already in the journal, and now the server hears of them. */
  const leave = (reason: string): void => {
    if (closed || superseded) return;
    // (A folding viewport is not yet a going: the server is told, the storage left as it is.)
    if (reason !== 'viewport' && keeper?.pending) snapshotNow();
    void syncNow(true);
  };
  const supersede = (kind: 'window' | 'device'): void => {
    if (superseded || closed) return;
    superseded = kind;
    clearTimeout(snapTimer);
    clearTimeout(syncTimer);
    dispatchEvent(new CustomEvent('pd-superseded', { detail: kind }));
  };

  /* Checked runs: moves go to the server in batches; its answer may send its own copy back. */
  let check: SavedCheck | null = checkOptions ? { meta: { ...checkOptions.meta }, log: [...(checkOptions.log ?? [])] } : null;
  /** Requests on their way (a keepalive one may overlap another: the server skips moves it has, and so does the log). */
  let inflight = 0;
  let keepaliveOut = false;
  let syncTimer = 0;
  let retryMs = 0;
  let offline = false;
  /** A run carried on is checked against the server's once, moves or none. */
  let verify = check !== null;
  /** The first word to the server (and the first after the run is taken back) says that this copy is the one playing. */
  let claim = check !== null;
  let answer: SyncAnswer | null = null;
  let waiters: Array<(answer: SyncAnswer | null) => void> = [];
  const settleWaiters = (value: SyncAnswer | null): void => {
    for (const waiter of waiters) waiter(value);
    waiters = [];
  };
  const syncSoon = (delay: number): void => {
    if (!check || superseded) return;
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => void syncNow(), delay);
  };
  const syncNow = async (keepalive = false): Promise<void> => {
    if (!check || closed || superseded || (check.log.length === 0 && !verify)) return;
    if (keepalive ? keepaliveOut : inflight > 0) return;
    clearTimeout(syncTimer);
    inflight++;
    if (keepalive) keepaliveOut = true;
    const meta = { ...check.meta };
    const batch = check.log.slice(0, keepalive ? Math.min(SYNC_MAX, 150) : SYNC_MAX);
    const whole = batch.length === check.log.length;
    const claiming = claim;
    let reply: SyncAnswer | 'offline' | 'unauthorized' | 'rules';
    try {
      reply = await checkOptions!.api.sync(meta, batch, whole ? fingerprint(session.world!) : null, keepalive, { sid: copy, claim: claiming });
    } finally {
      inflight--;
      if (keepalive) keepaliveOut = false;
    }
    // Another run took the slot meanwhile (a restart): this answer is of no use. Nor is it once the session is closed or stands aside.
    if (closed || superseded || !check || check.meta.id !== meta.id) return;
    if (reply === 'offline') {
      // The server cannot be reached: the moves stay in the log (kept on the device with the run), and are sent
      // again after 2, 4, 8... seconds up to a minute, or at once when the network comes back or the player asks.
      if (!offline) dispatchEvent(new CustomEvent('pd-net', { detail: 'offline' }));
      offline = true;
      retryMs = Math.min(60_000, retryMs ? retryMs * 2 : 2000);
      syncSoon(retryMs);
      return;
    }
    if (reply === 'unauthorized') {
      // The server no longer knows the player: the run goes on, on the device alone.
      check = null;
      settleWaiters(null);
      save();
      return;
    }
    if (reply === 'rules') {
      // The game was updated: the new version picks the run up where the server has it (what the device holds is written first).
      snapshotNow();
      reloadForUpdate();
      return;
    }
    if (reply.reason === 'taken') {
      // Another device has taken the run over: this one neither plays nor sends until the player takes it back.
      supersede('device');
      return;
    }
    if (reply.reason === 'none') {
      // The server keeps no run here (gone after long disuse): the run goes on, on the device alone.
      check = null;
      settleWaiters(null);
      save();
      return;
    }
    if (!reply.world && reply.seq === meta.seq && batch.length > 0) {
      // Nothing taken and nothing said why: try again later rather than at once.
      retryMs = Math.min(60_000, retryMs ? retryMs * 2 : 2000);
      syncSoon(retryMs);
      return;
    }
    if (offline) dispatchEvent(new CustomEvent('pd-net', { detail: 'online' }));
    offline = false;
    retryMs = 0;
    verify = false;
    if (claiming) claim = false;
    if (reply.world && reply.run) {
      // The device's copy parted from the server's (or the run went on elsewhere): the server's is the run. The moves it did not take are
      // counted, so that the window can say so.
      const lost = check.log.length;
      session.world = reply.world;
      check = { meta: reply.run, log: [] };
      pending = [];
      session.generation++;
      dispatchEvent(new CustomEvent('pd-run-restored', { detail: { reason: reply.reason ?? '', lost } }));
      if (reply.finished) {
        answer = reply;
        settleWaiters(reply);
      }
      save();
      return;
    }
    // (By the count now, not the count the request was made at: a second request may have been answered first.)
    check.log.splice(0, Math.max(0, reply.seq - check.meta.seq));
    check.meta.seq = Math.max(check.meta.seq, reply.seq);
    if (reply.finished) {
      answer = reply;
      settleWaiters(reply);
    }
    if (keeper && !superseded) {
      if (finished()) keeper.drop();
      else if (!keeper.ack(session.world!, check)) failed();
    }
    // (A run that is over has no reason to wait: its end is what the boards are waiting for.)
    if (check.log.length > 0) syncSoon(check.log.length >= SYNC_BATCH || session.world?.over ? 0 : SYNC_DELAY_MS);
  };
  /** The network came back (the browser says so): the waiting moves go at once. */
  const back = (): void => {
    if (offline && check) {
      retryMs = 0;
      void syncNow();
    }
  };
  /** The page is in view again: another copy may have taken the run while it was out of sight. */
  const shown = (): void => {
    if (!document.hidden) lease?.check();
  };
  const offLeave = onLeave(leave);
  document.addEventListener('visibilitychange', shown);
  addEventListener('online', back);

  const resumed = !checkOptions?.world && read?.run && playable(read.run) ? read.run : null;
  const session: Session = {
    mode: 'solo',
    world: checkOptions?.world ?? resumed?.world ?? fresh(),
    myId: 'me',
    online: ['me'],
    status: '',
    generation: 0,
    busy: false,
    stepAhead: null,
    get beatMs() {
      return session.world?.live ? beat : null;
    },
    get superseded() {
      return superseded;
    },
    send(action) {
      if (superseded || closed) return;
      // Another copy may have taken the run since the last look: it is asked before anything is done.
      if (lease && !lease.check()) return;
      const depth = heroById(session.world!, 'me')?.depth;
      const result = act(session.world!, 'me', action);
      if (result.ok) {
        pending.push(...result.effects);
        noteAction(action);
        if (check) check.log.push(action);
        // The turn is saved the moment it is taken: an action in the journal; the whole run when a depth is new, the run is over, or the journal is full.
        if (keeper) {
          const world = session.world!;
          if (world.over || heroById(world, 'me')?.depth !== depth) snapshotNow();
          else if (!keeper.note(action, world, check)) failed();
        }
        if (check) {
          // The end goes at once (its place on the boards is awaited); a new depth soon; else in batches.
          const world = session.world!;
          if (world.over) void syncNow();
          else syncSoon(check.log.length >= SYNC_BATCH ? 0 : heroById(world, 'me')?.depth !== depth ? 500 : SYNC_DELAY_MS);
        }
      } else {
        // Refused: let the player know why, where that is worth saying.
        pending.push({ type: 'interrupted', hero: 'me', reason: result.reason });
      }
    },
    restart() {
      if (superseded) return;
      if (checkOptions && check) {
        // A checked run's successor comes from the server too; failing that, the device plays one alone.
        const old = check.meta.id;
        void checkOptions.renew().then((next) => {
          if (closed || superseded || !check || check.meta.id !== old) return;
          if (next) {
            session.world = next.world;
            check = { meta: next.run, log: [] };
            claim = true;
            verify = true;
          } else {
            check = null;
            restartWorld(session.world!, newSeed());
          }
          answer = null;
          pending = [];
          session.generation++;
          save();
        });
        return;
      }
      restartWorld(session.world!, newSeed());
      const left = bones();
      if (left) giveBones(session.world!, left);
      session.generation++;
      save();
    },
    drain() {
      const effects = pending;
      pending = [];
      return effects;
    },
    close() {
      if (closed) return;
      // Back to the title: what was played is kept, to the last move, and the server hears of it.
      void syncNow(true);
      closed = true;
      clearTimeout(clock);
      clearTimeout(syncTimer);
      clearTimeout(snapTimer);
      // (The journal already holds every move: the snapshot is only to keep the next start short.)
      if (!superseded && keeper?.pending) snapshotNow();
      offLeave();
      document.removeEventListener('visibilitychange', shown);
      removeEventListener('online', back);
      lease?.release();
    },
    takeBack() {
      if (!superseded || closed) return;
      const how = superseded;
      superseded = null;
      offline = false;
      retryMs = 0;
      if (how === 'window' && key && storage) {
        // The copy that took the run has played on: its save is the run now, not this copy's world.
        lease!.claim();
        const taken = readSlot(storage, key);
        keeper = new SlotKeeper(storage, key, taken.gen);
        if (taken.run && playable(taken.run)) {
          session.world = taken.run.world;
          check = taken.run.check && checkOptions ? { meta: { ...taken.run.check.meta }, log: [...taken.run.check.log] } : null;
          pending = [];
          session.generation++;
        }
      }
      // A checked run says to the server that this copy plays again; it answers with its own word if the run went on elsewhere.
      claim = check !== null;
      verify = check !== null;
      save();
      void syncNow();
      dispatchEvent(new Event('pd-taken-back'));
    },
    looks: {},
    wear(look) {
      session.looks = { me: look };
    },
    signal() {},
    drainSignals: () => [],
    get checked(): CheckState | null {
      if (!check) return null;
      const meta = check.meta;
      return {
        meta,
        offline,
        retry: back,
        finished: () => {
          if (answer) return Promise.resolve(answer);
          if (!check || !session.world?.over) return Promise.resolve(null);
          void syncNow();
          return new Promise((resolve) => {
            waiters.push(resolve);
            window.setTimeout(() => resolve(answer), FINISH_WAIT_MS);
          });
        },
      };
    },
  };
  // Live turns alone: the session's own clock plays the hero's depth a beat at a time whenever there
  // is something to play (an order, or a move in a fight), a beat no sooner than the last has been
  // seen; it stands still while a window is open or the app is put away.
  let clock = 0;
  let beat = LIVE_CALM_MS;
  let nextBeat = 0;
  const tick = (): void => {
    if (closed) return;
    const world = session.world!;
    const me = heroById(world, 'me');
    const now = performance.now();
    if (me && world.live && !document.hidden && !superseded && !session.hold?.() && now >= nextBeat && liveReady(world, me.depth)) {
      beat = liveBeatMs(world, me.depth);
      const result = liveTick(world, me.depth);
      if (result.ok) pending.push(...result.effects);
      nextBeat = now + beat;
      saveSoon();
    }
    clock = window.setTimeout(tick, world.live ? 16 : 1000);
  };
  if (session.world!.live) clock = window.setTimeout(tick, 16);
  // The run as it stands (a run brought back from the journal, or from a damaged save's backup, is written whole at once).
  save();
  if (resumed && read?.recovered) dispatchEvent(new CustomEvent('pd-save-recovered', { detail: read.recovered }));
  // A checked run carried on: the server's copy is checked against this one at once.
  if (check) void syncNow();
  return session;
}

export interface OnlineOptions {
  server: string;
  room: string;
  playerId: string;
  name: string;
  heroClass: HeroClass;
  /** Telegram.WebApp.initData when running inside Telegram. */
  initData?: string;
  text: { connecting: string; reconnecting: string; replaced: string; full: string; updating: string };
}

/** Steps of a walk that may be on their way to the room at once. */
const STEPS_AHEAD = 3;
/** A word to the room this often keeps the line warm (mobile networks drop quiet ones) and proves it alive. */
const PING_MS = 4000;
/** Nothing heard for this long: the connection is dead, however open it looks. */
const SILENCE_MS = 10_000;
/** Out of sight this long (Telegram minimised, another chat open): leave the room, so the party is not held up. */
const AWAY_MS = 5000;

export function onlineSession(options: OnlineOptions): Session {
  let seq = 0;
  let socket: WebSocket | null = null;
  /** My actions sent and not yet come back from the room. */
  let inFlight = 0;
  /** Where the last of them, if they are all steps, leads; null otherwise. */
  let ahead: number | null = null;
  /** Live turns: how long the room's current beat lasts (ms), from its last tick. */
  let beat = LIVE_CALM_MS;
  let closed = false;
  let pending: Effect[] = [];
  /** When the room was last heard from (performance.now()). */
  let lastHeard = 0;
  /** Left the room while the app was out of sight; back when it shows again. */
  let away = false;
  let awayTimer = 0;
  let retryTimer = 0;

  const transmit = (message: ClientMessage): void => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const session: Session = {
    mode: 'online',
    world: null,
    myId: options.playerId,
    online: [],
    status: options.text.connecting,
    generation: 0,
    get busy() {
      // Live turns: an order goes at once and replaces the last; nothing waits for the room.
      if (session.world?.live) return false;
      const me = session.world && heroById(session.world, session.myId);
      return inFlight > 0 || Boolean(me?.intent);
    },
    get stepAhead() {
      const me = session.world && heroById(session.world, session.myId);
      const open = socket?.readyState === WebSocket.OPEN;
      return open && inFlight > 0 && inFlight < STEPS_AHEAD && ahead !== null && !me?.intent && !session.world?.live ? ahead : null;
    },
    get beatMs() {
      return session.world?.live ? beat : null;
    },
    send(action) {
      if (socket?.readyState !== WebSocket.OPEN) return;
      // Only a step may follow steps still on their way; anything else waits for the room.
      const follows = action.type === 'move' && session.stepAhead !== null;
      if (session.busy && !follows) return;
      inFlight++;
      sentAt.push(performance.now());
      // Steps are many: only the rest are written down one by one (steps go into the summary).
      if (action.type !== 'move') netlog(`act ${action.type}${inFlight > 1 ? ` (${inFlight} on the way)` : ''}`);
      ahead = action.type === 'move' && (inFlight === 1 || ahead !== null) ? action.to : null;
      transmit({ type: 'act', action });
    },
    restart() {
      transmit({ type: 'restart' });
    },
    drain() {
      const effects = pending;
      pending = [];
      return effects;
    },
    close() {
      closed = true;
      clearTimeout(awayTimer);
      clearTimeout(retryTimer);
      clearInterval(pinger);
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('online', onOnline);
      socket?.close();
    },
    looks: {},
    wear(look) {
      myLook = look;
      transmit({ type: 'look', look });
    },
    signal(signal) {
      transmit({ type: 'signal', signal });
    },
    drainSignals() {
      const received = signals;
      signals = [];
      return received;
    },
  };
  /** Signals received and not yet shown (see drainSignals). */
  let signals: Array<{ from: string; signal: Signal; at: number }> = [];
  /** My look, sent again whenever the connection is made anew. */
  let myLook: Look | null = null;
  /** Connections in a row that never opened. */
  let failures = 0;

  const receive = (message: ServerMessage): void => {
    switch (message.type) {
      case 'snapshot':
        session.world = message.world;
        session.myId = message.you;
        session.online = message.online;
        seq = message.seq;
        inFlight = 0;
        ahead = null;
        sentAt.length = 0;
        netlog(`snapshot seq ${message.seq}, ${message.world.heroes.length} heroes, ${message.online.length} online`);
        session.generation++;
        break;
      case 'event': {
        if (!session.world || message.seq !== seq + 1) {
          // Missed an event: start over from a fresh snapshot.
          netlog(`missed event: got ${message.seq} after ${seq}; sync`);
          transmit({ type: 'sync' });
          return;
        }
        const result = applyEvent(session.world, message.event);
        seq = message.seq;
        if (result.ok) {
          pending.push(...result.effects);
        } else {
          // The room took this action, so a world that refuses it has drifted from the room's:
          // start over from the room's own, and say so.
          report('desync', `${message.event.type === 'act' ? message.event.action.type : message.event.type}: ${result.reason}`);
          netlog(`desync: ${message.event.type === 'act' ? message.event.action.type : message.event.type}: ${result.reason}`);
          sendNetlog('desync');
          transmit({ type: 'sync' });
          return;
        }
        if (message.event.type === 'restart') session.generation++;
        // A beat of my depth sets how long steps take on my screen.
        if (message.event.type === 'tick' && message.event.depth === heroById(session.world, session.myId)?.depth) beat = message.event.ms;
        if (message.event.type === 'act' && message.event.heroId === session.myId) {
          inFlight = Math.max(0, inFlight - 1);
          const at = sentAt.shift();
          if (at !== undefined) noteRtt(performance.now() - at, message.event.action.type);
        }
        if (inFlight === 0) ahead = null;
        break;
      }
      case 'presence':
        session.online = message.online;
        break;
      case 'looks':
        session.looks = message.looks;
        break;
      case 'signal':
        // Kept only briefly: a tab in the background must not pile them up.
        signals.push({ from: message.from, signal: message.signal, at: performance.now() });
        if (signals.length > 16) signals.shift();
        break;
      case 'rejected':
        // Steps sent after a refused one are refused too, or soon will be: the walk stops here.
        inFlight = Math.max(0, inFlight - 1);
        sentAt.shift();
        netlog(`refused: ${message.reason}`);
        ahead = null;
        pending.push({ type: 'interrupted', hero: session.myId, reason: message.reason });
        break;
    }
  };

  const connect = (): void => {
    const url = new URL(`/room/${encodeURIComponent(options.room)}`, options.server);
    url.searchParams.set('hero', options.heroClass);
    url.searchParams.set('v', String(RULES_VERSION));
    if (options.initData) {
      url.searchParams.set('initData', options.initData);
    } else {
      // The id serves a server in development; a live one knows a guest by their secret alone.
      url.searchParams.set('id', options.playerId);
      url.searchParams.set('gs', guestSecret());
      url.searchParams.set('name', options.name);
    }
    const ws = new WebSocket(url);
    socket = ws;
    netlog(`connecting${failures ? ` (try ${failures + 1})` : ''}`);
    let opened = false;
    ws.onopen = () => {
      opened = true;
      failures = 0;
      lastHeard = performance.now();
      netlog('open');
      session.status = '';
      if (myLook) transmit({ type: 'look', look: myLook });
    };
    ws.onmessage = (event) => {
      lastHeard = performance.now();
      // The room's answer to a ping, given without waking it.
      if (event.data === 'pong') return;
      try {
        receive(JSON.parse(String(event.data)) as ServerMessage);
      } catch (error) {
        // Whatever broke, the room's own world puts it right.
        report('error', `receive: ${(error as Error).message}`, (error as Error).stack);
        transmit({ type: 'sync' });
      }
    };
    ws.onclose = (event) => {
      if (socket !== ws) return;
      netlog(`closed ${event.code}${event.reason ? ` ${event.reason}` : ''}${opened ? '' : ' (never opened)'}`);
      if (opened && !closed && !away && event.code !== 1000 && event.code < 4000) sendNetlog(`dropped ${event.code}`);
      inFlight = 0;
      ahead = null;
      sentAt.length = 0;
      if (closed || away) return;
      // A room that cannot be reached (refused, or the network) is worth knowing about once it keeps happening.
      if (!opened && ++failures === 3) report('socket', `cannot connect: close ${event.code}${event.reason ? ` ${event.reason}` : ''}`, undefined, { telegram: Boolean(options.initData) });
      if (opened && event.code !== 1000 && event.code !== 1001 && event.code < 4000) report('socket', `dropped: close ${event.code}`);
      if (event.code === 4000) {
        session.status = options.text.replaced;
        return;
      }
      if (event.code === 4001) {
        session.status = options.text.full;
        return;
      }
      if (event.code === 4002) {
        // The room runs other rules than this page: load the current build, straight back into the room,
        // past any cached copy of the page. Just reloaded and still out of step (the new build or the
        // server is still on its way out): wait and ask again rather than reload over and over.
        session.status = options.text.updating;
        let last = 0;
        try {
          last = Number(sessionStorage.getItem('pd-reloaded')) || 0;
        } catch {
          // Then reload.
        }
        if (Date.now() - last < 60_000) {
          setTimeout(connect, 15_000);
          return;
        }
        try {
          sessionStorage.setItem('pd-reloaded', String(Date.now()));
        } catch {
          // Reloads anyway.
        }
        const fresh = new URL(location.href);
        fresh.searchParams.set('fresh', String(Date.now()));
        setTimeout(() => location.replace(fresh.toString()), 900);
        return;
      }
      session.status = options.text.reconnecting;
      retry();
    };
  };

  /** Connects again soon: at once after a dropped line, then less and less often while the network is down. */
  const retry = (): void => {
    clearTimeout(retryTimer);
    retryTimer = window.setTimeout(connect, Math.min(4000, 250 * 2 ** Math.min(4, failures)));
  };

  /** Drops a connection that has gone silent (half open: it looks fine and carries nothing) and makes a new one. */
  const reconnectNow = (): void => {
    const dead = socket;
    socket = null;
    inFlight = 0;
    ahead = null;
    if (dead) {
      dead.onclose = null;
      dead.onmessage = null;
      try {
        dead.close();
      } catch {
        // Already gone.
      }
    }
    clearTimeout(retryTimer);
    session.status = options.text.reconnecting;
    connect();
  };

  const pinger = window.setInterval(() => {
    if (closed || away || socket?.readyState !== WebSocket.OPEN) return;
    if (performance.now() - lastHeard > SILENCE_MS) {
      netlog(`silent for ${Math.round((performance.now() - lastHeard) / 1000)} s: reconnecting`);
      sendNetlog('silent line');
      reconnectNow();
      return;
    }
    socket.send('ping');
  }, PING_MS);

  const onVisibility = (): void => {
    clearTimeout(awayTimer);
    if (document.hidden) {
      // A moment out of sight keeps the room; a while, and the party goes on without waiting for me.
      awayTimer = window.setTimeout(() => {
        netlog('hidden: leaving the room for now');
        away = true;
        socket?.close(1000, 'away');
      }, AWAY_MS);
      return;
    }
    if (away) {
      away = false;
      netlog('shown again: back to the room');
      reconnectNow();
    } else if (socket?.readyState === WebSocket.OPEN && performance.now() - lastHeard > PING_MS * 1.5) {
      // Back from a short absence: make sure the line survived it.
      socket.send('ping');
    }
  };
  /** When my actions were sent, oldest first, to time the room's answers. */
  const sentAt: number[] = [];
  /** Answers over the last stretch, written down as one line every so often (and the slow ones each). */
  const rtts: number[] = [];
  let summaryAt = performance.now();
  const noteRtt = (ms: number, kind: string): void => {
    rtts.push(ms);
    if (ms > 1500) netlog(`slow answer: ${kind} after ${Math.round(ms)} ms`);
    const now = performance.now();
    if (now - summaryAt < 15_000) return;
    const sorted = [...rtts].sort((a, b) => a - b);
    netlog(`${Math.round((now - summaryAt) / 1000)} s: ${rtts.length} actions, answer median ${Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0)} ms, worst ${Math.round(sorted[sorted.length - 1] ?? 0)} ms`);
    rtts.length = 0;
    summaryAt = now;
  };

  const onOnline = (): void => {
    if (!closed && !away && socket?.readyState !== WebSocket.OPEN) reconnectNow();
  };
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('online', onOnline);

  startNetlog(`co-op session: room ${options.room.length} chars, ${options.initData ? 'telegram' : 'guest'}, ${navigator.onLine ? 'online' : 'offline'}`);
  connect();
  return session;
}
