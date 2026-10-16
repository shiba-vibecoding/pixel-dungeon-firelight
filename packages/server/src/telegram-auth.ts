/*
 * Validates Telegram Mini App init data (core.telegram.org/bots/webapps):
 * secret = HMAC-SHA256("WebAppData", botToken); the data-check string (all
 * fields except `hash`, sorted, "key=value" joined by newlines) must hash to
 * `hash` with that secret.
 */

export interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
  language_code?: string;
  /** The chat the game was opened from (signed with the rest: a device cannot say another): its mark, and its kind (group, supergroup, channel, private, sender). */
  chat_instance?: string;
  chat_type?: string;
}

/** How long init data is good for: a day for anything that spends, a week to read (the Mini App can stay open for long). */
export const DAY_SECONDS = 24 * 60 * 60;
export const WEEK_SECONDS = 7 * DAY_SECONDS;
/** How far ahead of the server's clock a signing date may be: clocks differ a little, never by more. */
const CLOCK_SKEW_SECONDS = 5 * 60;

const encoder = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  // Node's types (the tests') and the Workers' differ on which byte arrays a key may be; both take these.
  const cryptoKey = await crypto.subtle.importKey('raw', key as Uint8Array<ArrayBuffer>, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns the signed-in user, or null if the data is forged, malformed, stale or dated in the future. */
export async function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = DAY_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<TelegramUser | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = await hmac(encoder.encode('WebAppData'), botToken);
  const expected = hex(await hmac(secret, checkString));
  if (expected.length !== hash.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff !== 0) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSeconds - authDate > maxAgeSeconds || authDate - nowSeconds > CLOCK_SKEW_SECONDS) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '') as TelegramUser;
    if (typeof user.id !== 'number') return null;
    const instance = params.get('chat_instance');
    const type = params.get('chat_type');
    return { ...user, ...(instance ? { chat_instance: instance } : {}), ...(type ? { chat_type: type } : {}) };
  } catch {
    return null;
  }
}
