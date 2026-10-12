import { DurableObject } from 'cloudflare:workers';
import { allowedLook, type ClientMessage, emptyWallet, type HeroClass, isPatron, type Look, type PlayerInfo, type Wallet } from '@pd/core';
import { botApi, createInvoice, handleUpdate, type Wallets } from './payments';
import { ChunkWriter, chunkKeys, fromChunks } from './chunks';
import { type DailyEntry, type DailyResult, Leaderboard, parseResult } from './leaderboard';
import { type Delivery, RoomLogic, type RoomState } from './room-logic';
import { verifyInitData } from './telegram-auth';

/*
 * Co-op server: one Durable Object per room holds the authoritative world.
 * WebSockets use the hibernation API, so an idle room costs nothing and is
 * restored from storage when the next message arrives.
 *
 *   GET /room/<name>  (WebSocket upgrade)
 *     ?initData=<Telegram.WebApp.initData>&hero=<class>   with BOT_TOKEN set
 *     ?id=<id>&name=<name>&hero=<class>                   in development, or as a
 *                                                         guest when ALLOW_GUESTS is "true"
 */

export interface Env {
  ROOM: DurableObjectNamespace<Room>;
  DAILY: DurableObjectNamespace<DailyBoard>;
  /** One per Telegram user: what they bought in Pixel-Mart. */
  WALLET: DurableObjectNamespace<WalletStore>;
  /** The secret Telegram sends with every webhook call (setWebhook's secret_token). */
  WEBHOOK_SECRET?: string;
  /** The Mini App's t.me link, for the bot's play button. */
  APP_LINK?: string;
  /** Bot token secret. When set, players must prove their identity with Telegram init data. */
  BOT_TOKEN?: string;
  /** "true" lets players without Telegram join as guests even when BOT_TOKEN is set. */
  ALLOW_GUESTS?: string;
}

const HERO_CLASSES: readonly HeroClass[] = ['warrior', 'mage', 'rogue', 'huntress'];

function heroClassOf(params: URLSearchParams): HeroClass {
  const value = params.get('hero');
  return (HERO_CLASSES as readonly string[]).includes(value ?? '') ? (value as HeroClass) : 'warrior';
}

/** Who is asking: from Telegram init data, or a client-chosen id (development and guests). */
async function authenticate(params: URLSearchParams, env: Env): Promise<PlayerInfo | null> {
  const name = (params.get('name') || 'Hero').slice(0, 32);
  const heroClass = heroClassOf(params);
  // Monster ids start with '#', so player ids never may.
  const clientId = (params.get('id') || crypto.randomUUID()).replace(/^#+/, '').slice(0, 64) || 'anon';
  if (env.BOT_TOKEN) {
    const initData = params.get('initData');
    if (initData) {
      const user = await verifyInitData(initData, env.BOT_TOKEN);
      if (!user) return null;
      return { id: `tg${user.id}`, name: (user.first_name || user.username || 'Hero').slice(0, 32), heroClass };
    }
    // Browser players outside Telegram, if allowed; they can never pose as a Telegram user.
    return env.ALLOW_GUESTS === 'true' ? { id: `guest-${clientId}`, name, heroClass } : null;
  }
  // Development: without a bot token the client is trusted.
  return { id: clientId, name, heroClass };
}

export class Room extends DurableObject<Env> {
  private logic: RoomLogic | null = null;
  private readonly writer = new ChunkWriter();

  private playerOf(ws: WebSocket): PlayerInfo {
    return ws.deserializeAttachment() as PlayerInfo;
  }

  private async room(): Promise<RoomLogic> {
    if (!this.logic) {
      this.logic = RoomLogic.restore(await this.load(), Math.floor(Math.random() * 2 ** 31));
      this.logic.restoreOnline(this.ctx.getWebSockets().map((ws) => this.playerOf(ws).id));
    }
    return this.logic;
  }

  /** Sends what the room produced, saves it and sets the turn-timeout alarm. */
  private async apply(deliveries: Delivery[]): Promise<void> {
    this.deliver(deliveries);
    await this.persist();
    const deadline = this.logic?.deadline();
    if (deadline) {
      await this.ctx.storage.setAlarm(deadline);
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }

  override async alarm(): Promise<void> {
    const room = await this.room();
    await this.apply(room.tick(Date.now()));
  }

  override async fetch(request: Request): Promise<Response> {
    const player = await authenticate(new URL(request.url).searchParams, this.env);
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
    const room = await this.room();
    if (room.isFull(player.id)) {
      // Accept just to say why, then close: a failed upgrade would look like a network error.
      server.accept();
      server.close(4001, 'the party is full');
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(player);
    await this.apply(room.connect(player, Date.now()));
    // What everyone already in the room wears.
    this.deliver([{ to: [player.id], message: { type: 'looks', looks: await this.looks() } }]);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** What the players of this room wear (Pixel-Mart), by player id; kept so a hibernated room remembers. */
  private async looks(): Promise<Record<string, Look>> {
    return (await this.ctx.storage.get<Record<string, Look>>('looks')) ?? {};
  }

  /** A player's look, checked against their wallet (a Telegram player's purchases), then shown to the room. */
  private async wear(player: PlayerInfo, look: Look): Promise<void> {
    const telegram = /^tg(\d+)$/.exec(player.id);
    const wallet = telegram ? await wallets(this.env).get(Number(telegram[1])) : emptyWallet();
    // In development (no bot token) the client is trusted, as it is with its identity.
    const allowed = this.env.BOT_TOKEN ? allowedLook(look, wallet, player.heroClass, Date.now()) : look;
    const looks = { ...(await this.looks()), [player.id]: allowed };
    await this.ctx.storage.put('looks', looks);
    const everyone = this.ctx.getWebSockets().map((ws) => this.playerOf(ws).id);
    this.deliver([{ to: everyone, message: { type: 'looks', looks } }]);
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    let message: ClientMessage;
    try {
      message = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)) as ClientMessage;
    } catch {
      return;
    }
    if (message.type === 'look') {
      await this.wear(this.playerOf(ws), message.look ?? {});
      return;
    }
    const room = await this.room();
    const deliveries = room.receive(this.playerOf(ws).id, message, Date.now());
    if (message.type === 'sync') {
      this.deliver(deliveries);
    } else {
      await this.apply(deliveries);
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
      await this.apply(room.disconnect(id, Date.now()));
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

  /** The stored room, from its chunks (see chunks.ts); a room stored whole by an earlier version is read as is. */
  private async load(): Promise<RoomState | undefined> {
    const meta = await this.ctx.storage.get<unknown>('state');
    if (meta === undefined) return undefined;
    if (typeof meta !== 'string') return meta as RoomState;
    const chunks = await this.ctx.storage.get<string>(chunkKeys(meta));
    const entries = new Map<string, string>([['state', meta], ...chunks]);
    this.writer.loaded(entries);
    return fromChunks(entries);
  }

  /** Writes the chunks that changed since last time, and drops those of depths gone after a restart. */
  private async persist(): Promise<void> {
    if (!this.logic) return;
    const { put, remove } = this.writer.changes(this.logic.state());
    if (Object.keys(put).length > 0) await this.ctx.storage.put(put);
    if (remove.length > 0) await this.ctx.storage.delete(remove);
  }
}

/** A player's Pixel-Mart wallet (see @pd/core shop.ts), kept under their Telegram id. */
export class WalletStore extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    if (request.method === 'PUT') {
      const wallet = (await request.json()) as Wallet;
      await this.ctx.storage.put('wallet', wallet);
      return json(wallet);
    }
    return json((await this.ctx.storage.get<Wallet>('wallet')) ?? emptyWallet());
  }
}

/** Wallets by Telegram user id. Updates go through one object per user, which runs them one at a time. */
function wallets(env: Env): Wallets {
  const stub = (user: number): DurableObjectStub<WalletStore> => env.WALLET.get(env.WALLET.idFromName(`tg${user}`));
  const get = async (user: number): Promise<Wallet> => (await (await stub(user).fetch('https://wallet/')).json()) as Wallet;
  return {
    get,
    async update(user, change) {
      const next = change(await get(user));
      await stub(user).fetch('https://wallet/', { method: 'PUT', body: JSON.stringify(next) });
      return next;
    },
  };
}

/** The Telegram user behind a request's init data; Pixel-Mart takes no guests. */
async function telegramUser(body: Record<string, unknown>, env: Env): Promise<number | null> {
  if (!env.BOT_TOKEN || typeof body.initData !== 'string') return null;
  const user = await verifyInitData(body.initData, env.BOT_TOKEN);
  return user ? user.id : null;
}

async function shop(request: Request, env: Env, route: 'me' | 'invoice'): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!env.BOT_TOKEN) return json({ error: 'the shop is closed' }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const user = await telegramUser(body, env);
  if (user === null) return json({ error: 'unauthorized' }, 401);
  if (route === 'me') {
    const wallet = await wallets(env).get(user);
    return json({ owned: wallet.owned, patronUntil: wallet.patronUntil ?? null, patron: isPatron(wallet, Date.now()), tipped: wallet.tipped ?? 0 });
  }
  const text = { title: String(body.title ?? 'Pixel-Mart'), description: String(body.description ?? 'Pixel Dungeon') };
  const result = await createInvoice(botApi(env.BOT_TOKEN), user, String(body.sku ?? ''), text);
  return 'link' in result ? json(result) : json(result, 400);
}

async function webhook(request: Request, env: Env): Promise<Response> {
  // Only Telegram knows the secret set with setWebhook.
  if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const update = await request.json();
  await handleUpdate(update as Parameters<typeof handleUpdate>[0], botApi(env.BOT_TOKEN), wallets(env), env.APP_LINK ?? '');
  return new Response('ok');
}

/** One day's leaderboard of the daily dungeon. */
export class DailyBoard extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const board = new Leaderboard((await this.ctx.storage.get<DailyEntry[]>('board')) ?? []);
    const url = new URL(request.url);
    if (request.method === 'POST') {
      const { player, result } = (await request.json()) as { player: PlayerInfo; result: DailyResult };
      const rank = board.submit(player.id, player.name, result, Date.now());
      await this.ctx.storage.put('board', board.entries());
      return json({ rank, top: board.top(20) });
    }
    const id = url.searchParams.get('me');
    return json({ rank: id ? board.rank(id) : null, top: board.top(20) });
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

/** Only today's board (UTC, give or take a day for time zones) takes results. */
function isCurrentDay(date: string, now: number): boolean {
  const day = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(day) && Math.abs(now - day - 12 * 3600_000) <= 36 * 3600_000;
}

async function daily(request: Request, env: Env, date: string): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const board = env.DAILY.get(env.DAILY.idFromName(date));
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const me = url.searchParams.get('me');
    return board.fetch(`https://board/${me ? `?me=${encodeURIComponent(me)}` : ''}`);
  }
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!isCurrentDay(date, Date.now())) return json({ error: 'this day is over' }, 400);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const params = new URLSearchParams();
  for (const key of ['initData', 'id', 'name', 'hero'] as const) {
    if (typeof body[key] === 'string') params.set(key, body[key] as string);
  }
  const player = await authenticate(params, env);
  if (!player) return json({ error: 'unauthorized' }, 401);
  const result = parseResult(body.result);
  if (!result) return json({ error: 'bad result' }, 400);
  const response = await board.fetch('https://board/', { method: 'POST', body: JSON.stringify({ player, result }) });
  const payload = (await response.json()) as Record<string, unknown>;
  return json({ ...payload, you: player.id });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/shop/me' || url.pathname === '/shop/invoice') return shop(request, env, url.pathname === '/shop/me' ? 'me' : 'invoice');
    if (url.pathname === '/telegram/webhook' && request.method === 'POST') return webhook(request, env);
    const day = /^\/daily\/(\d{4}-\d{2}-\d{2})$/.exec(url.pathname);
    if (day) return daily(request, env, day[1]!);

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
