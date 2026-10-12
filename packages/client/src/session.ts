import {
  act, type Action, addHero, applyEvent, type ClientMessage, createWorld, type HeroClass, type ServerMessage, type World,
} from '@pd/core';

/*
 * Where the world comes from. A local session runs the core directly; an
 * online session keeps a replica of the room's world, applying the ordered
 * events the server broadcasts, and only sends intentions.
 */

export interface Session {
  /** Null until an online session receives its first snapshot. */
  world: World | null;
  myId: string;
  online: string[];
  status: string;
  /** True while an action waits for the server's confirmation. */
  waiting: boolean;
  send(action: Action): void;
}

export function localSession(seed: number, heroClass: HeroClass): Session {
  const world = createWorld(seed);
  addHero(world, { id: 'me', name: 'You', heroClass });
  return {
    world,
    myId: 'me',
    online: ['me'],
    status: `offline · seed ${seed}`,
    waiting: false,
    send(action) {
      act(world, 'me', action);
    },
  };
}

export interface OnlineOptions {
  server: string;
  room: string;
  playerId: string;
  name: string;
  heroClass: HeroClass;
  /** Telegram.WebApp.initData when running inside Telegram. */
  initData?: string;
}

export function onlineSession(options: OnlineOptions): Session {
  let seq = 0;
  let socket: WebSocket | null = null;

  const session: Session = {
    world: null,
    myId: options.playerId,
    online: [],
    status: 'connecting…',
    waiting: false,
    send(action) {
      if (!socket || socket.readyState !== WebSocket.OPEN || session.waiting) return;
      session.waiting = true;
      transmit({ type: 'act', action });
    },
  };

  const transmit = (message: ClientMessage): void => {
    socket?.send(JSON.stringify(message));
  };

  const receive = (message: ServerMessage): void => {
    switch (message.type) {
      case 'snapshot':
        session.world = message.world;
        session.myId = message.you;
        session.online = message.online;
        seq = message.seq;
        session.waiting = false;
        break;
      case 'event':
        if (!session.world || message.seq !== seq + 1) {
          // Missed an event: start over from a fresh snapshot.
          transmit({ type: 'sync' });
          return;
        }
        applyEvent(session.world, message.event);
        seq = message.seq;
        if (message.event.type === 'act' && message.event.heroId === session.myId) {
          session.waiting = false;
        }
        break;
      case 'presence':
        session.online = message.online;
        break;
      case 'rejected':
        session.waiting = false;
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
      session.status = `room ${options.room}`;
    };
    socket.onmessage = (event) => receive(JSON.parse(String(event.data)) as ServerMessage);
    socket.onclose = (event) => {
      session.waiting = false;
      if (event.code === 4000) {
        session.status = 'opened in another tab';
        return;
      }
      session.status = 'reconnecting…';
      setTimeout(connect, 1500);
    };
  };
  connect();
  return session;
}
