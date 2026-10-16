import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_PHOTO_BYTES, PHOTO_GAP_MS, PHOTO_TTL_MS, PHOTOS_PER_DAY, PhotoAllowance, type PhotoEnv, photoRoute, pngSize } from '../src/photos';

const TOKEN = '123456:TEST-token-for-unit-tests';
const NOW = 1_800_000_000_000;

/** Init data signed the way Telegram does. */
function sign(id: number, authDate = NOW / 1000 - 60): string {
  const fields: Record<string, string> = { auth_date: String(authDate), user: JSON.stringify({ id, first_name: 'Test' }) };
  const check = Object.keys(fields).sort().map((key) => `${key}=${fields[key]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

/** A PNG's signature and header for a picture of the size (the rest is padding: the route reads no further). */
function png(width = 1080, height = 1920, total = 5000): Uint8Array {
  const bytes = new Uint8Array(total);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A Card store that keeps what it is given. */
function fakeEnv(token: string | undefined = TOKEN): { env: PhotoEnv; kept: Array<{ id: string; ttl: string | null; size: number }> } {
  const kept: Array<{ id: string; ttl: string | null; size: number }> = [];
  const env = {
    ...(token ? { BOT_TOKEN: token } : {}),
    CARD: {
      idFromName: (name: string) => name,
      get: (id: string) => ({
        fetch: async (address: string, init: { body: Uint8Array }) => {
          kept.push({ id, ttl: new URL(address).searchParams.get('ttl'), size: init.body.length });
          return new Response(null, { status: 204 });
        },
      }),
    },
  } as unknown as PhotoEnv;
  return { env, kept };
}

type Body = NonNullable<ConstructorParameters<typeof Request>[1]>['body'];
const post = (body: Body, headers: Record<string, string> = {}): Request =>
  new Request('https://pd.example/photo', { method: 'POST', headers: { 'Content-Type': 'image/png', ...headers }, body });
const url = new URL('https://pd.example/photo');

describe('photo header', () => {
  it('reads the size of a PNG, and refuses what is not one', () => {
    expect(pngSize(png(1080, 1920))).toEqual({ width: 1080, height: 1920 });
    expect(pngSize(png(0, 10))).toBeNull();
    expect(pngSize(png(8000, 10))).toBeNull();
    expect(pngSize(new Uint8Array(100))).toBeNull();
    const notHeader = png();
    notHeader[12] = 0x58;
    expect(pngSize(notHeader)).toBeNull();
    expect(pngSize(png().subarray(0, 20))).toBeNull();
  });
});

describe('photo allowance', () => {
  it('makes a player wait between two photos, and stops the day at its count', () => {
    const limits = new PhotoAllowance();
    expect(limits.take(1, NOW)).toBe('ok');
    expect(limits.take(1, NOW + 100)).toBe('busy');
    // Someone else is not held up by it.
    expect(limits.take(2, NOW + 100)).toBe('ok');
    let at = NOW;
    for (let i = 1; i < PHOTOS_PER_DAY; i++) {
      at += PHOTO_GAP_MS + 1;
      expect(limits.take(1, at)).toBe('ok');
    }
    expect(limits.take(1, at + PHOTO_GAP_MS + 1)).toBe('day');
    // The next day it is fresh.
    expect(limits.take(1, NOW + 24 * 3600_000)).toBe('ok');
  });
});

describe('POST /photo', () => {
  it('keeps a good photo for a day and answers its public address', async () => {
    const { env, kept } = fakeEnv();
    const answer = await photoRoute(post(png(), { 'X-Init-Data': sign(7) }), env, url, NOW, new PhotoAllowance());
    expect(answer.status).toBe(200);
    const { url: address } = (await answer.json()) as { url: string };
    expect(address).toMatch(/^https:\/\/pd\.example\/card\/[0-9a-f]{32}\.png$/);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ size: 5000, ttl: String(PHOTO_TTL_MS) });
    expect(address).toContain(kept[0]!.id);
  });

  it('answers a preflight, with the init data header allowed', async () => {
    const { env } = fakeEnv();
    const answer = await photoRoute(new Request('https://pd.example/photo', { method: 'OPTIONS' }), env, url, NOW, new PhotoAllowance());
    expect(answer.status).toBe(204);
    expect(answer.headers.get('Access-Control-Allow-Headers')).toContain('X-Init-Data');
  });

  it('wants Telegram: no bot token, no init data, forged or stale init data are all turned away', async () => {
    const limits = new PhotoAllowance();
    expect((await photoRoute(post(png(), { 'X-Init-Data': sign(7) }), fakeEnv('').env, url, NOW, limits)).status).toBe(503);
    const { env, kept } = fakeEnv();
    expect((await photoRoute(post(png()), env, url, NOW, limits)).status).toBe(401);
    expect((await photoRoute(post(png(), { 'X-Init-Data': sign(7).replace('7', '8') }), env, url, NOW, limits)).status).toBe(401);
    expect((await photoRoute(post(png(), { 'X-Init-Data': sign(7, NOW / 1000 - 30 * 86400) }), env, url, NOW, limits)).status).toBe(401);
    expect(kept).toHaveLength(0);
  });

  it('takes only a PNG, and not a big one', async () => {
    const limits = new PhotoAllowance();
    const { env, kept } = fakeEnv();
    const as = (id: number): Record<string, string> => ({ 'X-Init-Data': sign(id) });
    expect((await photoRoute(post(new Uint8Array(5000), as(1)), env, url, NOW, limits)).status).toBe(400);
    expect((await photoRoute(post(png(9000, 9000), as(2)), env, url, NOW, limits)).status).toBe(400);
    // Too big by its own word (Content-Length), and by its bytes when the word is missing.
    expect((await photoRoute(post(png(1080, 1920, MAX_PHOTO_BYTES + 1), as(3)), env, url, NOW, limits)).status).toBe(413);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const part = png(1080, 1920, 600_000);
        for (let i = 0; i < 4; i++) controller.enqueue(part);
        controller.close();
      },
    });
    const chunked = new Request('https://pd.example/photo', { method: 'POST', headers: as(4), body: stream, duplex: 'half' } as RequestInit);
    expect((await photoRoute(chunked, env, url, NOW, limits)).status).toBe(413);
    expect(kept).toHaveLength(0);
    // The largest allowed goes through.
    expect((await photoRoute(post(png(1080, 1920, MAX_PHOTO_BYTES), as(5)), env, url, NOW, limits)).status).toBe(200);
  });

  it('holds a player to the allowance', async () => {
    const limits = new PhotoAllowance();
    const { env, kept } = fakeEnv();
    const headers = { 'X-Init-Data': sign(9) };
    expect((await photoRoute(post(png(), headers), env, url, NOW, limits)).status).toBe(200);
    expect((await photoRoute(post(png(), headers), env, url, NOW + 10, limits)).status).toBe(429);
    expect((await photoRoute(post(png(), headers), env, url, NOW + PHOTO_GAP_MS + 10, limits)).status).toBe(200);
    expect(kept).toHaveLength(2);
  });
});
