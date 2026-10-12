import { DurableObject } from 'cloudflare:workers';
import type { ClientMessage, HeroClass, PlayerInfo } from '@pd/core';
import { type Delivery, RoomLogic, type RoomState } from './room-logic';
import { verifyInitData } from './telegram-auth';

/*
 * Co-op server: one Durable Object per room holds the authoritative world.
 * WebSockets use the hibernation API, so an idle room costs nothing and is
 * restored from storage when the next message arrives.
 *
 *   GET /room/<name>  (WebSocket upgrade)
 *     ?initData=<Telegram.WebApp.initData>&hero=<class>   with BOT_TOKEN set
 *     ?id=<id>&name=<name>&hero=<class>                   in development
 */

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  /** Bot token secret. When set, players must prove their identity with Telegram init data. */
  BOT_TOKEN?: string;
}

const HERO_CLASSES: readonly HeroClass[] = ['warrior', 'mage', 'rogue', 'huntress'];

function heroClassOf(url: URL): HeroClass {
  const value = url.searchParams.get('hero');
  return (HERO_CLASSES as readonly string[]).includes(value ?? '') ? (value as HeroClass) : 'warrior';
}

async function authenticate(request: Request, env: Env): Promise<PlayerInfo | null> {
  const url = new URL(request.url);
  if (env.BOT_TOKEN) {
    const user = await verifyInitData(url.searchParams.get('initData') ?? '', env.BOT_TOKEN);
    if (!user) return null;
    return { id: `tg${user.id}`, name: (user.first_name || user.username || 'Hero').slice(0, 32), heroClass: heroClassOf(url) };
  }
  // Development only: without a bot token the client is trusted.
  const id = url.searchParams.get('id') ?? crypto.randomUUID();
  return { id: id.slice(0, 64), name: (url.searchParams.get('name') || 'Hero').slice(0, 32), heroClass: heroClassOf(url) };
}

export class Room extends DurableObject<Env> {
  private logic: RoomLogic | null = null;

  private playerOf(ws: WebSocket): PlayerInfo {
    return ws.deserializeAttachment() as PlayerInfo;
  }

  private async room(): Promise<RoomLogic> {
    if (!this.logic) {
      const saved = await this.ctx.storage.get<RoomState>('state');
      this.logic = saved ? new RoomLogic(saved) : RoomLogic.create(Math.floor(Math.random() * 2 ** 31));
      this.logic.restoreOnline(this.ctx.getWebSockets().map((ws) => this.playerOf(ws).id));
    }
    return this.logic;
  }

  override async fetch(request: Request): Promise<Response> {
    const player = await authenticate(request, this.env);
    if (!player) {
      return new Response('unauthorized', { status: 401 });
    }

    // A player reconnecting from another tab replaces the old connection.
    for (const ws of this.ctx.getWebSockets()) {
      if (this.playerOf(ws).id === player.id) {
        ws.serializeAttachment({ ...this.playerOf(ws), id: `${player.id}#replaced` });
        ws.close(4000, 'replaced by a new connection');
      }
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(player);

    const room = await this.room();
    this.deliver(room.connect(player));
    await this.persist();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    let message: ClientMessage;
    try {
      message = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)) as ClientMessage;
    } catch {
      return;
    }
    const room = await this.room();
    this.deliver(room.receive(this.playerOf(ws).id, message));
    if (message.type === 'act') {
      await this.persist();
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.leave(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.leave(ws);
  }

  private async leave(ws: WebSocket): Promise<void> {
    const id = this.playerOf(ws).id;
    const stillConnected = this.ctx.getWebSockets().some((other) => other !== ws && this.playerOf(other).id === id);
    if (!stillConnected && !id.endsWith('#replaced')) {
      const room = await this.room();
      this.deliver(room.disconnect(id));
    }
  }

  private deliver(deliveries: Delivery[]): void {
    const sockets = this.ctx.getWebSockets();
    for (const { to, message } of deliveries) {
      const text = JSON.stringify(message);
      for (const ws of sockets) {
        if (to.includes(this.playerOf(ws).id)) {
          try {
            ws.send(text);
          } catch {
            // The socket is closing; its close handler updates presence.
          }
        }
      }
    }
  }

  private async persist(): Promise<void> {
    if (this.logic) {
      await this.ctx.storage.put('state', this.logic.state());
    }
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/room\/([A-Za-z0-9_-]{1,64})$/.exec(url.pathname);
    if (!match) {
      return new Response('Pixel Dungeon co-op server', { status: url.pathname === '/' ? 200 : 404 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a WebSocket upgrade', { status: 426 });
    }
    const room = env.ROOM.get(env.ROOM.idFromName(match[1]!));
    return room.fetch(request);
  },
} satisfies ExportedHandler<Env>;
