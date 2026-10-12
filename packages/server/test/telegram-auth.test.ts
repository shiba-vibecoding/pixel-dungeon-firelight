import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyInitData } from '../src/telegram-auth';

const BOT_TOKEN = '123456:TEST-token-for-unit-tests';

/** Signs init data the way Telegram does, using Node's own HMAC. */
function sign(fields: Record<string, string>, token = BOT_TOKEN): string {
  const checkString = Object.keys(fields).sort().map((key) => `${key}=${fields[key]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const now = 1_800_000_000;
const user = JSON.stringify({ id: 4242, first_name: 'Kirill', username: 'kirill' });

describe('Telegram init data', () => {
  it('accepts data signed with the bot token', async () => {
    const initData = sign({ auth_date: String(now - 60), query_id: 'AAE', user });
    expect(await verifyInitData(initData, BOT_TOKEN, 86400, now)).toMatchObject({ id: 4242, first_name: 'Kirill' });
  });

  it('rejects tampered, foreign and stale data', async () => {
    const initData = sign({ auth_date: String(now - 60), user });
    const tampered = initData.replace('4242', '4243');
    expect(await verifyInitData(tampered, BOT_TOKEN, 86400, now)).toBeNull();
    expect(await verifyInitData(sign({ auth_date: String(now), user }, '999:other'), BOT_TOKEN, 86400, now)).toBeNull();
    const stale = sign({ auth_date: String(now - 2 * 86400), user });
    expect(await verifyInitData(stale, BOT_TOKEN, 86400, now)).toBeNull();
    expect(await verifyInitData('user=x', BOT_TOKEN, 86400, now)).toBeNull();
  });

  it('rejects data signed in the future, beyond a little clock skew', async () => {
    expect(await verifyInitData(sign({ auth_date: String(now + 60), user }), BOT_TOKEN, 86400, now)).toMatchObject({ id: 4242 });
    expect(await verifyInitData(sign({ auth_date: String(now + 3600), user }), BOT_TOKEN, 86400, now)).toBeNull();
  });

  it('takes a longer age where asked (reading the shop)', async () => {
    const old = sign({ auth_date: String(now - 3 * 86400), user });
    expect(await verifyInitData(old, BOT_TOKEN, 86400, now)).toBeNull();
    expect(await verifyInitData(old, BOT_TOKEN, 7 * 86400, now)).toMatchObject({ id: 4242 });
  });
});
