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
}

const encoder = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Returns the signed-in user, or null if the data is forged, malformed or stale. */
export async function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 24 * 60 * 60,
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
  if (!Number.isFinite(authDate) || nowSeconds - authDate > maxAgeSeconds) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '') as TelegramUser;
    return typeof user.id === 'number' ? user : null;
  } catch {
    return null;
  }
}
