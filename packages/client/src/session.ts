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

const SAVE_VERSION = 30;

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
export function soloSession(key: string | null, heroClass: HeroClass, newSeed: () => number): Session {
  const fresh = (): World => {
    const world = createWorld(newSeed());
    addHero(world, { id: 'me', name: 'You', heroClass });
    return world;
  };
  let pending: Effect[] = [];
  let saveTimer = 0;
  const save = (): void => {
    if (!key) return;
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        const world = session.world!;
        if (world.over) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify({ version: SAVE_VERSION, world } satisfies SoloSave));
      } catch {
        // Out of space or storage blocked: the run simply is not kept.
      }
    }, 300);
  };

  const session: Session = {
    mode: 'solo',
    world: (key && loadSolo(key)) || fresh(),
    myId: 'me',
    online: ['me'],
    status: '',
    generation: 0,
    busy: false,
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
      clearTimeout(saveTimer);
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

export function onlineSession(options: OnlineOptions): Session {
  let seq = 0;
  let socket: WebSocket | null = null;
  let inFlight = false;
  let closed = false;
  let pending: Effect[] = [];

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
      return inFlight || Boolean(me?.intent);
    },
    send(action) {
      if (socket?.readyState !== WebSocket.OPEN || session.busy) return;
      inFlight = true;
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
        inFlight = false;
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
        if (message.event.type === 'act' && message.event.heroId === session.myId) inFlight = false;
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
        inFlight = false;
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
    socket = new WebSocket(url);
    let opened = false;
    socket.onopen = () => {
      opened = true;
      failures = 0;
      session.status = '';
      if (myLook) transmit({ type: 'look', look: myLook });
    };
    socket.onmessage = (event) => {
      try {
        receive(JSON.parse(String(event.data)) as ServerMessage);
      } catch (error) {
        // Whatever broke, the room's own world puts it right.
        report('error', `receive: ${(error as Error).message}`, (error as Error).stack);
        transmit({ type: 'sync' });
      }
    };
    socket.onclose = (event) => {
      inFlight = false;
      if (closed) return;
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
        // The room runs newer rules than this page: load the new build, straight back into the room.
        session.status = options.text.updating;
        setTimeout(() => location.reload(), 900);
        return;
      }
      session.status = options.text.reconnecting;
      setTimeout(connect, 1500);
    };
  };
  connect();
  return session;
}
