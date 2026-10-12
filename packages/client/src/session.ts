import {
  act, type Action, addHero, applyEvent, type ClientMessage, createWorld, type Effect, heroById, type HeroClass,
  type Look, restartWorld, RULES_VERSION, type ServerMessage, type Signal, type World,
} from '@pd/core';
import { report } from './report';

/*
 * Where the world comes from. A solo session runs the core directly and keeps
 * the run in local storage; an online session keeps a replica of the room's
 * world, applying the ordered events the server broadcasts, and only sends
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
}

const SAVE_VERSION = 31;

interface SoloSave {
  version: number;
  world: World;
}

export function loadSolo(key: string): World | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const save = JSON.parse(raw) as SoloSave;
    return save.version === SAVE_VERSION && !save.world.over ? save.world : null;
  } catch {
    return null;
  }
}

export function forgetSolo(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage is unavailable; nothing was saved either.
  }
}

/**
 * @param key local storage slot, or null not to save
 * @param newSeed seed for a fresh run (also used by restart)
 */
export function soloSession(key: string | null, heroClass: HeroClass, newSeed: () => number, name = 'Hero'): Session {
  const fresh = (): World => {
    const world = createWorld(newSeed());
    addHero(world, { id: 'me', name, heroClass });
    return world;
  };
  let pending: Effect[] = [];
  let saveTimer = 0;
  /** A save is waiting for the moves to settle. */
  let dirty = false;
  /** Writes the run now. */
  const flush = (): void => {
    clearTimeout(saveTimer);
    if (!key || !dirty) return;
    dirty = false;
    try {
      const world = session.world!;
      if (world.over) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ version: SAVE_VERSION, world } satisfies SoloSave));
    } catch {
      // Out of space or storage blocked: the run simply is not kept.
    }
  };
  /** Saves once the moves settle (writing after every step of a walk would be wasted). */
  const save = (): void => {
    if (!key) return;
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flush, 300);
  };
  // Leaving the app (Telegram closed or sent to the background) must not lose the last moves.
  const away = (): void => {
    if (document.hidden) flush();
  };
  document.addEventListener('visibilitychange', away);
  addEventListener('pagehide', flush);

  const session: Session = {
    mode: 'solo',
    world: (key && loadSolo(key)) || fresh(),
    myId: 'me',
    online: ['me'],
    status: '',
    generation: 0,
    busy: false,
    stepAhead: null,
    send(action) {
      const result = act(session.world!, 'me', action);
      if (result.ok) {
        pending.push(...result.effects);
        save();
      } else {
        // Refused: let the player know why, where that is worth saying.
        pending.push({ type: 'interrupted', hero: 'me', reason: result.reason });
      }
    },
    restart() {
      restartWorld(session.world!, newSeed());
      session.generation++;
      save();
    },
    drain() {
      const effects = pending;
      pending = [];
      return effects;
    },
    close() {
      // Back to the title: what was played is kept, to the last move.
      flush();
      document.removeEventListener('visibilitychange', away);
      removeEventListener('pagehide', flush);
    },
    looks: {},
    wear(look) {
      session.looks = { me: look };
    },
    signal() {},
    drainSignals: () => [],
  };
  save();
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
      const me = session.world && heroById(session.world, session.myId);
      return inFlight > 0 || Boolean(me?.intent);
    },
    get stepAhead() {
      const me = session.world && heroById(session.world, session.myId);
      const open = socket?.readyState === WebSocket.OPEN;
      return open && inFlight > 0 && inFlight < STEPS_AHEAD && ahead !== null && !me?.intent ? ahead : null;
    },
    send(action) {
      if (socket?.readyState !== WebSocket.OPEN) return;
      // Only a step may follow steps still on their way; anything else waits for the room.
      const follows = action.type === 'move' && session.stepAhead !== null;
      if (session.busy && !follows) return;
      inFlight++;
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
        session.generation++;
        break;
      case 'event': {
        if (!session.world || message.seq !== seq + 1) {
          // Missed an event: start over from a fresh snapshot.
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
          transmit({ type: 'sync' });
          return;
        }
        if (message.event.type === 'restart') session.generation++;
        if (message.event.type === 'act' && message.event.heroId === session.myId) inFlight = Math.max(0, inFlight - 1);
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
      url.searchParams.set('id', options.playerId);
      url.searchParams.set('name', options.name);
    }
    const ws = new WebSocket(url);
    socket = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      failures = 0;
      lastHeard = performance.now();
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
      inFlight = 0;
      ahead = null;
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
        away = true;
        socket?.close(1000, 'away');
      }, AWAY_MS);
      return;
    }
    if (away) {
      away = false;
      reconnectNow();
    } else if (socket?.readyState === WebSocket.OPEN && performance.now() - lastHeard > PING_MS * 1.5) {
      // Back from a short absence: make sure the line survived it.
      socket.send('ping');
    }
  };
  const onOnline = (): void => {
    if (!closed && !away && socket?.readyState !== WebSocket.OPEN) reconnectNow();
  };
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('online', onOnline);

  connect();
  return session;
}
