import { CORS, json } from './http';
import { verifyInitData, WEEK_SECONDS } from './telegram-auth';

/*
 * The photo mode's picture (client photoui.ts): a snapshot with a frame and stickers, kept a day at a public address so that Telegram can
 * fetch it, for a story (WebApp.shareToStory takes only an https address) and for the «Save» button (WebApp.downloadFile takes only one
 * too: a data or blob address is refused).
 *
 *   POST /photo     PNG body, the player's init data in the X-Init-Data header -> { url }
 *   GET  /card/<id>.png                                                        (sharing.ts serves it)
 *
 * It stores into the same Durable Object as the result cards (the Card of sharing.ts: its bytes and an alarm that deletes them), with a
 * shorter life; nothing about that storage changes. A photo is bigger than a card, so it has its own size cap, and a player's own
 * allowance: a few seconds between pictures and a handful a day.
 */

/** The largest picture taken. Under a Durable Object value's limit (2 MB in SQLite storage); the client shrinks its picture to fit. */
export const MAX_PHOTO_BYTES = 1_800_000;
/** How long a photo is kept: the story fetches it at once. */
export const PHOTO_TTL_MS = 24 * 3600_000;
/** How many photos one player may post in a day, per Worker instance. */
export const PHOTOS_PER_DAY = 20;
/** The shortest wait between two photos of one player. */
export const PHOTO_GAP_MS = 2000;
/** The widest or tallest picture taken (pixels). */
export const MAX_PHOTO_SIDE = 4096;

/** What the route asks of the Worker's environment (the real one is `Env` of index.ts): the bot's token, and the store the pictures go to (the Card of sharing.ts). */
export interface PhotoEnv {
  BOT_TOKEN?: string | undefined;
  CARD: {
    idFromName(name: string): unknown;
    get(id: never): { fetch(input: string, init: { method: string; body: Uint8Array }): Promise<Response> };
  };
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Whether the bytes are a PNG of a sane size (its signature and header), not just something with the right first bytes. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) return null;
  // The first chunk is IHDR: length 13, the name, then the width and height as big-endian 32-bit numbers.
  const name = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (name !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width < 1 || height < 1 || width > MAX_PHOTO_SIDE || height > MAX_PHOTO_SIDE) return null;
  return { width, height };
}

/** What a player may post, by player: a gap between two, and a count for the day. */
export class PhotoAllowance {
  private readonly seen = new Map<string, { day: string; count: number; at: number }>();

  /** 'ok' (and counts it), 'busy' (too soon after the last), or 'day' (the day's photos are used). */
  take(user: number, now: number): 'ok' | 'busy' | 'day' {
    const day = new Date(now).toISOString().slice(0, 10);
    const key = String(user);
    const entry = this.seen.get(key);
    if (!entry || entry.day !== day) {
      this.seen.set(key, { day, count: 1, at: now });
      this.prune(day);
      return 'ok';
    }
    if (now - entry.at < PHOTO_GAP_MS) return 'busy';
    if (entry.count >= PHOTOS_PER_DAY) return 'day';
    entry.count++;
    entry.at = now;
    return 'ok';
  }

  private prune(day: string): void {
    if (this.seen.size < 5000) return;
    for (const [key, entry] of this.seen) if (entry.day !== day) this.seen.delete(key);
  }
}

const allowance = new PhotoAllowance();

/** The body's bytes, or null if it runs past the limit (stopped as soon as it does, whatever Content-Length says). */
async function readBytes(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.byteLength;
  }
  return all;
}

/** POST /photo. */
export async function photoRoute(request: Request, env: PhotoEnv, url: URL, now = Date.now(), limits = allowance): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type, X-Init-Data' } });
  }
  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  if (!env.BOT_TOKEN) return json({ error: 'photos need Telegram' }, 503);
  const user = await verifyInitData(request.headers.get('X-Init-Data') ?? '', env.BOT_TOKEN, WEEK_SECONDS, Math.floor(now / 1000));
  if (!user) return json({ error: 'unauthorized' }, 401);
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_PHOTO_BYTES) return json({ error: 'too big' }, 413);
  const turn = limits.take(user.id, now);
  if (turn === 'busy') return json({ error: 'wait a moment' }, 429);
  if (turn === 'day') return json({ error: 'too many photos today' }, 429);
  const bytes = await readBytes(request, MAX_PHOTO_BYTES);
  if (!bytes) return json({ error: 'too big' }, 413);
  if (!pngSize(bytes)) return json({ error: 'not a picture' }, 400);
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  try {
    await env.CARD.get(env.CARD.idFromName(id) as never).fetch(`https://card/?ttl=${PHOTO_TTL_MS}`, { method: 'PUT', body: bytes });
  } catch {
    return json({ error: 'could not keep the picture' }, 502);
  }
  return json({ url: `${url.origin}/card/${id}.png` });
}
