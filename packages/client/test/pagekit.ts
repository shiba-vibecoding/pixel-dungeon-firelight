import { act, type Action, fingerprint, heroById, type World } from '@pd/core';
import { setMaxListeners } from 'node:events';
import { vi } from 'vitest';
import type { DeviceTag, RunApi, RunMeta, SyncAnswer } from '../src/checked';
import { type Mirror } from '../src/mirror';
import { hydrate, setMirror } from '../src/savestore';
import { type Session, soloSession, type CheckOptions } from '../src/session';
import { carriedOn, inspectSolo, loadCheck, loadSolo } from '../src/session';
import { planStart } from '../src/startplan';
import { unreachable } from '../src/checked';
import { emptyProfile, ended, ME, PlayerLogic } from '../../server/src/runs';
import { MemStorage, botStep } from './savekit';

/*
 * A page, as the tests open it: a solo session on a storage, with the server in front of it as a fake that is the real PlayerLogic
 * (the same code replays the moves). Opening one does what main.ts startRun does (planStart, then the session), so that a run kept
 * by a page that was killed is found by the next the way the game finds it. The globals a session reaches for (the window, the
 * document, localStorage) are stubbed in kit.ts; this module is about the pages.
 */

export const KEY = 'pd-solo';

/** A request the fake server has been handed. */
export interface Call {
  op: 'sync' | 'start' | 'get';
  from?: number;
  actions?: number;
  keepalive?: boolean;
  tag?: DeviceTag;
  answer?: string;
}

export class FakeServer {
  readonly logic = new PlayerLogic(emptyProfile('T'));
  /** The hero of every run it hands out is made sturdy (a scripted game is about saving, not survival). */
  sturdy = true;
  /** Changes the world of each new run before it is handed out (the server's copy too: both start the same). */
  prepare: ((world: World) => void) | null = null;
  /** 'ok' answers; 'offline' is a network that is down (the request never arrives); 'lost-reply' lets the server take the request and drops the answer. */
  mode: 'ok' | 'offline' | 'lost-reply' = 'ok';
  now = 1000;
  calls: Call[] = [];
  private seed = 100;

  get run() {
    return this.logic.runs.dungeon;
  }

  /** The server's api for a page: requests of a dead page go nowhere. */
  api(page: { dead: boolean }): RunApi {
    const server = this;
    const dead = <T>(): Promise<T> => new Promise<T>(() => undefined);
    const api: Pick<RunApi, 'start' | 'get' | 'sync'> = {
      start: async (slot, hero, challenges, sid) => {
        if (page.dead) return dead();
        if (server.mode === 'offline') return 'offline';
        const run = server.logic.start({
          slot, heroClass: hero, challenges, name: 'T', seed: server.seed++, id: `run-${server.seed}`, now: server.now++, today: '2026-10-17',
          ...(sid ? { sid } : {}),
        });
        server.calls.push({ op: 'start' });
        if (server.sturdy) Object.assign(heroById(run.world, ME)!, { attackSkill: 600, defenseSkill: 80, ht: 5000, hp: 5000, str: 22 });
        server.prepare?.(run.world);
        return { run: { id: run.id, slot: run.slot, seq: run.seq, ranked: run.ranked }, world: structuredClone(run.world) };
      },
      get: async (slot) => {
        if (page.dead) return dead();
        if (server.mode === 'offline') return 'offline';
        const run = server.logic.runs[slot];
        server.calls.push({ op: 'get' });
        return run ? { run: { id: run.id, slot: run.slot, seq: run.seq, ranked: run.ranked }, world: structuredClone(run.world) } : { run: null };
      },
      sync: async (meta: RunMeta, actions: readonly Action[], hash: string | null, keepalive = false, tag?: DeviceTag) => {
        if (page.dead) return dead();
        if (server.mode === 'offline') {
          server.calls.push({ op: 'sync', from: meta.seq, actions: actions.length, keepalive, answer: 'offline', ...(tag ? { tag } : {}) });
          return 'offline';
        }
        const result = server.logic.sync(meta.slot, meta.id, meta.seq, actions, hash, server.now++, tag);
        const run = server.logic.runs[meta.slot];
        // (As player.ts answers: the reply, and a finished run's end with it.)
        const reply: SyncAnswer = structuredClone(result.finish && run ? { ...result.reply, ...ended(run) } : result.reply) as SyncAnswer;
        server.calls.push({ op: 'sync', from: meta.seq, actions: actions.length, keepalive, answer: reply.reason ?? 'ok', ...(tag ? { tag } : {}) });
        // (The answer is lost on the way: the page, which has no word, takes the request for failed after its time. A page killed since never hears.)
        await Promise.resolve();
        if (page.dead) return dead();
        if (server.mode === 'lost-reply') return 'offline';
        return reply;
      },
    };
    return api as RunApi;
  }
}

export interface Page {
  readonly storage: MemStorage;
  session: Session;
  /** The page was killed: it does nothing from now on, and what it wrote is all that is left of it. */
  dead: boolean;
  /** Which copy of the game this page is. */
  readonly copy: string;
  plan: string;
}

/** The events the pages dispatched, in order (the window's own, as main.ts hears them). */
export const events: Array<{ type: string; detail: unknown }> = [];

let counter = 0;

/** The globals a session reaches for: a window and a document that hear events, and no BroadcastChannel (the tests send the storage event by hand). */
export function installGlobals(): EventTarget {
  const target = new EventTarget();
  const doc = Object.assign(new EventTarget(), { hidden: false, visibilityState: 'visible' });
  // (A killed page never takes its listeners off, as a dead page does not: there are many.)
  setMaxListeners(0, target, doc);
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('addEventListener', target.addEventListener.bind(target));
  vi.stubGlobal('removeEventListener', target.removeEventListener.bind(target));
  vi.stubGlobal('dispatchEvent', (event: Event) => {
    events.push({ type: event.type, detail: (event as CustomEvent).detail });
    return target.dispatchEvent(event);
  });
  vi.stubGlobal('BroadcastChannel', undefined);
  events.length = 0;
  return target;
}

/**
 * Opens a page on a storage as main.ts startRun does for the dungeon slot: carries the kept run on, or takes the server's, or begins
 * a new one. `server` null: a page with no way to the server (played on the device alone).
 */
export async function openPage(
  storage: MemStorage, server: FakeServer | null,
  options: { copy?: string; seed?: number; fresh?: boolean; unreachable?: boolean; mirror?: Mirror & { data: Map<string, string> } } = {},
): Promise<Page> {
  vi.stubGlobal('localStorage', storage);
  const page = { storage, dead: false, copy: options.copy ?? `page-${counter++}`, plan: '' } as Page;
  // The mirror (IndexedDB) is the browser's, not the page's: what a killed page gave it stays, and it gives nothing more once it is dead.
  const shared = options.mirror;
  setMirror(shared ? {
    put: (key, value) => { if (!storage.dead) shared.put(key, value); },
    remove: (keys) => { if (!storage.dead) shared.remove(keys); },
    read: (keys) => shared.read(keys),
    keys: () => shared.keys(),
  } : null);
  // As main.ts does at start: a run the browser had not written out when the app was killed is found in the mirror.
  if (shared && !options.fresh) await hydrate(storage, KEY);
  const api = server ? server.api(page) : null;
  const newSeed = (): number => options.seed ?? 4242;
  const read = options.fresh ? null : inspectSolo(KEY);
  const kept = read ? carriedOn(read) : null;
  const check = kept?.check ?? null;
  const plan = planStart({ kept: kept !== null, check: check !== null, stale: false, api: api !== null });
  page.plan = plan;
  const renew = async (): Promise<{ run: RunMeta; world: World } | null> => {
    const answer = await api!.start('dungeon', 'warrior', 0, page.copy);
    return typeof answer === 'string' ? null : answer;
  };
  if (plan === 'resume-checked') {
    page.session = soloSession(KEY, 'warrior', newSeed, 'T', 0, undefined, false, { api: api!, meta: check!.meta, log: check!.log, renew }, undefined, page.copy);
  } else if (plan === 'resume-offline') {
    page.session = soloSession(KEY, 'warrior', newSeed, 'T', 0, undefined, false, { api: unreachable() as RunApi, meta: check!.meta, log: check!.log, renew: async () => null }, undefined, page.copy);
  } else if (plan === 'resume-local') {
    page.session = soloSession(KEY, 'warrior', newSeed, 'T', 0, undefined, false, undefined, undefined, page.copy);
  } else if (plan === 'server' && api) {
    // Carried on from another device, or new.
    const carried = options.fresh ? null : await api.get('dungeon');
    const answer = carried && typeof carried !== 'string' && carried.run && carried.world && !carried.world.over
      ? { run: carried.run, world: carried.world }
      : await api.start('dungeon', 'warrior', 0, page.copy);
    if (typeof answer === 'string') throw new Error('no run to be had');
    page.session = soloSession(KEY, 'warrior', newSeed, 'T', 0, undefined, false, { api, meta: answer.run, world: answer.world, renew }, undefined, page.copy);
  } else {
    page.session = soloSession(KEY, 'warrior', newSeed, 'T', 0, undefined, false, undefined, undefined, page.copy);
  }
  return page;
}

/** One turn of the bot, as a player would take it. Returns whether the world took it. */
export function turn(page: Page): boolean {
  const world = page.session.world!;
  const before = world.turn;
  const action = botStep(world);
  page.session.send(action);
  if (world.turn === before) {
    page.session.send({ type: 'wait' });
  }
  return page.session.world!.turn !== before;
}

/** The kill: timers die with the page, and what it was in the middle of is never finished. */
export function kill(page: Page): void {
  page.dead = true;
  page.storage.dead = true;
  // (Clearing the timers resets the fake clock; the clock of the world does not stop for a page that died.)
  const now = Date.now();
  vi.clearAllTimers();
  vi.setSystemTime(now);
}

/** A reloaded page sees what the dead one stored, on a storage of its own. */
export function reload(page: Page): MemStorage {
  return page.storage.clone();
}

/** The world with its keys in order, as text: two worlds of one run are the same text. */
export function canon(world: World): string {
  return JSON.stringify(world, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return value;
  });
}

export { act, fingerprint, loadCheck, loadSolo };
