import {
  act, type Action, addHero, applyEvent, type ClientMessage, createWorld, type Effect, heroById, type HeroClass,
  restartWorld, type ServerMessage, type World,
} from '@pd/core';

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
}

const SAVE_VERSION = 21;

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
  text: { connecting: string; reconnecting: string; replaced: string; full: string };
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
  };

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
        if (result.ok) pending.push(...result.effects);
        if (message.event.type === 'restart') session.generation++;
        if (message.event.type === 'act' && message.event.heroId === session.myId) inFlight = false;
        break;
      }
      case 'presence':
        session.online = message.online;
        break;
      case 'rejected':
        inFlight = false;
        break;
    }
  };

  const connect = (): void => {
    const url = new URL(`/room/${encodeURIComponent(options.room)}`, options.server);
    url.searchParams.set('hero', options.heroClass);
    if (options.initData) {
      url.searchParams.set('initData', options.initData);
    } else {
      url.searchParams.set('id', options.playerId);
      url.searchParams.set('name', options.name);
    }
    socket = new WebSocket(url);
    socket.onopen = () => {
      session.status = '';
    };
    socket.onmessage = (event) => receive(JSON.parse(String(event.data)) as ServerMessage);
    socket.onclose = (event) => {
      inFlight = false;
      if (closed) return;
      if (event.code === 4000) {
        session.status = options.text.replaced;
        return;
      }
      if (event.code === 4001) {
        session.status = options.text.full;
        return;
      }
      session.status = options.text.reconnecting;
      setTimeout(connect, 1500);
    };
  };
  connect();
  return session;
}
