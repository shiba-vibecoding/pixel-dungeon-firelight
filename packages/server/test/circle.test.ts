import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { weekOf } from '@pd/core';
import { type CircleDeps, type CircleProfile, codesOf, joined, left, mayJoin, putCircles, settleCircles } from '../src/circle-flow';
import { CAPS, championOf, cleanName, groupCode, isCode, joinVerdict, MAX_CIRCLES, MIN_PLAYERS, NAME_MAX, newCode } from '../src/circle-rules';
import { heatOf } from '../src/heat';
import type { DailyEntry } from '../src/leaderboard';
import { seasonStart } from '../src/season-clock';
import { verifyInitData } from '../src/telegram-auth';

const entry = (score: number): DailyEntry => ({ id: 'x', owner: 'tg1', name: 'N', heroClass: 'mage', depth: 8, level: 8, gold: 0, won: false, score, turns: 2000, at: 1 });

describe('a circle\'s code and name (circle-rules.ts)', () => {
  it('is ten letters and digits, and a code made for friends never starts like a group\'s', () => {
    for (let n = 0; n < 200; n++) {
      const bytes = new Uint8Array(10).map((_, i) => (n * 31 + i * 17) % 256);
      const code = newCode(bytes);
      expect(isCode(code)).toBe(true);
      expect(code.startsWith('g')).toBe(false);
    }
    expect(isCode('abcdefghij')).toBe(true);
    expect(isCode('ABCDEFGHIJ')).toBe(false);
    expect(isCode('abc')).toBe(false);
    expect(isCode('abcdefghij1')).toBe(false);
    expect(isCode('abc defghi')).toBe(false);
    expect(isCode(undefined)).toBe(false);
    expect(isCode({ length: 10 })).toBe(false);
  });

  it('names a group\'s circle from its chat, the same for everyone in it and different for another chat or another server secret', async () => {
    const a = await groupCode('chat-instance-1', 'secret');
    expect(isCode(a)).toBe(true);
    expect(a.startsWith('g')).toBe(true);
    expect(await groupCode('chat-instance-1', 'secret')).toBe(a);
    expect(await groupCode('chat-instance-2', 'secret')).not.toBe(a);
    expect(await groupCode('chat-instance-1', 'other')).not.toBe(a);
  });

  it('cleans a name: trimmed, one space between words, no control or invisible characters, cut to 24; nothing left is no name', () => {
    expect(cleanName('  Night   Delvers  ')).toBe('Night Delvers');
    expect(cleanName('Ночные\nспелеологи')).toBe('Ночные спелеологи');
    expect(cleanName('a\u0000b​c')).toBe('a b c');
    expect(cleanName('x'.repeat(100))).toHaveLength(NAME_MAX);
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('\u0007​')).toBeNull();
    expect(cleanName(42)).toBeNull();
  });
});

describe('joining a circle (circle-rules.ts, circle-flow.ts)', () => {
  const room = { kind: 'friends' as const, size: 3 };

  it('takes a circle by a code that is one, that exists, that has room, that the player is not in, with the player in fewer than 2', () => {
    expect(MAX_CIRCLES).toBe(2);
    expect(CAPS).toEqual({ friends: 50, group: 200 });
    expect(joinVerdict('abcdefghij', [], room)).toBe('ok');
    expect(joinVerdict('nonsense', [], room)).toBe('bad code');
    expect(joinVerdict(undefined, [], room)).toBe('bad code');
    expect(joinVerdict('abcdefghij', [], null)).toBe('no such circle');
    expect(joinVerdict('abcdefghij', ['abcdefghij'], room)).toBe('already');
    expect(joinVerdict('abcdefghij', ['aaaaaaaaaa', 'bbbbbbbbbb'], room)).toBe('limit');
  });

  it('refuses a full circle: 50 friends, 200 in a group', () => {
    expect(joinVerdict('abcdefghij', [], { kind: 'friends', size: 49 })).toBe('ok');
    expect(joinVerdict('abcdefghij', [], { kind: 'friends', size: 50 })).toBe('full');
    expect(joinVerdict('gabcdef012', [], { kind: 'group', size: 50 })).toBe('ok');
    expect(joinVerdict('gabcdef012', [], { kind: 'group', size: 200 })).toBe('full');
  });

  it('checks already being in it before the limit and the room before nothing else, so a repeated join is told it is kept', () => {
    expect(joinVerdict('abcdefghij', ['abcdefghij', 'bbbbbbbbbb'], { kind: 'friends', size: 50 })).toBe('already');
  });

  it('keeps at most two circles in the player\'s record, each once, and lets one go', () => {
    const profile: CircleProfile = {};
    joined(profile, { code: 'aaaaaaaaaa', name: 'A', kind: 'friends' });
    joined(profile, { code: 'aaaaaaaaaa', name: 'A', kind: 'friends' });
    joined(profile, { code: 'bbbbbbbbbb', name: 'B', kind: 'group' });
    joined(profile, { code: 'cccccccccc', name: 'C', kind: 'friends' });
    expect(codesOf(profile)).toEqual(['aaaaaaaaaa', 'bbbbbbbbbb']);
    expect(mayJoin(profile, 'cccccccccc', room)).toBe('limit');
    expect(left(profile, 'aaaaaaaaaa')).toBe(true);
    expect(left(profile, 'aaaaaaaaaa')).toBe(false);
    expect(mayJoin(profile, 'cccccccccc', room)).toBe('ok');
    expect(left(profile, 'bbbbbbbbbb')).toBe(true);
    expect(profile.circles).toBeUndefined();
  });
});

describe('who is the champion of a circle\'s week (circle-rules.ts, circle-flow.ts)', () => {
  it('is the first on its board, if at least two played', () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(championOf({ owner: 'tg1', name: 'A', score: 900 }, 2)).toEqual({ owner: 'tg1', name: 'A', score: 900 });
    expect(championOf({ owner: 'tg1', name: 'A', score: 900 }, 1)).toBeNull();
    expect(championOf(null, 5)).toBeNull();
    expect(championOf({ name: 'A', score: 900 }, 5)).toBeNull();
  });

  const start = seasonStart('2026-10-19');
  const monday = Date.parse('2026-11-02T10:00:00Z');
  const deps = (champion: CircleDeps['champion']): CircleDeps => ({ now: monday, start, champion, put: async () => true });

  it('gives the honour and the week\'s 30 Heat to the player who won the week just over, once', async () => {
    const profile: CircleProfile = { circles: [{ code: 'aaaaaaaaaa', name: 'A', kind: 'friends' }], heat: { season: 's1', days: {}, league: {}, circle: {} } };
    const asked: string[] = [];
    const d = deps(async (code, week) => {
      asked.push(`${code}:${week}`);
      return { you: true, settled: true };
    });
    expect(await settleCircles(profile, d)).toBe(true);
    expect(asked).toEqual([`aaaaaaaaaa:${weekOf(monday - 7 * 86_400_000)}`]);
    expect(profile.honour).toEqual(['circle_champion']);
    expect(heatOf(profile.heat)).toBe(30);
    // Looked at once a week: asking again changes nothing and calls nothing.
    expect(await settleCircles(profile, d)).toBe(false);
    expect(asked).toHaveLength(1);
    expect(heatOf(profile.heat)).toBe(30);
  });

  it('gives nothing to one who did not win, and tries again when the circle cannot be asked or the week is not told yet', async () => {
    const profile: CircleProfile = { circles: [{ code: 'aaaaaaaaaa', name: 'A', kind: 'friends' }], heat: { season: 's1', days: {}, league: {}, circle: {} } };
    expect(await settleCircles(profile, deps(async () => 'error'))).toBe(false);
    expect(await settleCircles(profile, deps(async () => ({ you: true, settled: false })))).toBe(false);
    expect(profile.honour).toBeUndefined();
    expect(await settleCircles(profile, deps(async () => ({ you: false, settled: true })))).toBe(true);
    expect(profile.honour).toBeUndefined();
    expect(heatOf(profile.heat)).toBe(0);
    expect(profile.circles?.[0]?.settled).toBe(weekOf(monday - 7 * 86_400_000));
  });

  it('counts the week once even if the player won two circles', async () => {
    const profile: CircleProfile = {
      circles: [{ code: 'aaaaaaaaaa', name: 'A', kind: 'friends' }, { code: 'bbbbbbbbbb', name: 'B', kind: 'group' }], heat: { season: 's1', days: {}, league: {}, circle: {} },
    };
    await settleCircles(profile, deps(async () => ({ you: true, settled: true })));
    expect(heatOf(profile.heat)).toBe(30);
    expect(profile.honour).toEqual(['circle_champion']);
  });
});

describe('the run on the circles\' boards (circle-flow.ts)', () => {
  it('goes to every circle\'s board on the first run of a week, and again only when it is bettered', async () => {
    const profile: CircleProfile = { circles: [{ code: 'aaaaaaaaaa', name: 'A', kind: 'friends' }, { code: 'bbbbbbbbbb', name: 'B', kind: 'group' }] };
    const puts: string[] = [];
    const put: CircleDeps['put'] = async (code, week, e) => {
      puts.push(`${code}:${week}:${e.score}`);
      return true;
    };
    expect(await putCircles(profile, entry(900), '2026-W44', { put })).toBe(true);
    expect(puts).toEqual(['aaaaaaaaaa:2026-W44:900', 'bbbbbbbbbb:2026-W44:900']);
    expect(await putCircles(profile, entry(500), '2026-W44', { put })).toBe(false);
    expect(await putCircles(profile, entry(900), '2026-W44', { put })).toBe(false);
    expect(await putCircles(profile, entry(1200), '2026-W44', { put })).toBe(true);
    expect(puts).toHaveLength(4);
    // A new week starts again, whatever last week's best was.
    expect(await putCircles(profile, entry(100), '2026-W45', { put })).toBe(true);
    expect(puts.at(-1)).toBe('bbbbbbbbbb:2026-W45:100');
  });

  it('keeps trying a circle whose board could not be reached, and sends nothing for a player in none', async () => {
    const profile: CircleProfile = { circles: [{ code: 'aaaaaaaaaa', name: 'A', kind: 'friends' }] };
    expect(await putCircles(profile, entry(900), '2026-W44', { put: async () => false })).toBe(false);
    expect(profile.circles?.[0]?.put).toBeUndefined();
    expect(await putCircles({}, entry(900), '2026-W44', { put: async () => { throw new Error('no circles, no calls'); } })).toBe(false);
    expect(await putCircles(profile, null, '2026-W44', { put: async () => true })).toBe(false);
  });
});

describe('a game opened from a chat (telegram-auth.ts)', () => {
  const token = '123456:TEST-token-for-unit-tests';
  const sign = (fields: Record<string, string>): string => {
    const checkString = Object.keys(fields).sort().map((key) => `${key}=${fields[key]}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    return new URLSearchParams({ ...fields, hash: createHmac('sha256', secret).update(checkString).digest('hex') }).toString();
  };
  const now = 1_800_000_000;
  const user = JSON.stringify({ id: 7, first_name: 'K' });

  it('tells the chat\'s mark and kind when they are signed with the rest, and not when they are added afterwards', async () => {
    const signed = sign({ auth_date: String(now), user, chat_instance: '-123456', chat_type: 'supergroup' });
    expect(await verifyInitData(signed, token, 86400, now)).toMatchObject({ id: 7, chat_instance: '-123456', chat_type: 'supergroup' });
    expect(await verifyInitData(sign({ auth_date: String(now), user }), token, 86400, now)).toEqual({ id: 7, first_name: 'K' });
    // A device that adds another chat's mark after the signing breaks the signature.
    expect(await verifyInitData(`${sign({ auth_date: String(now), user })}&chat_instance=999`, token, 86400, now)).toBeNull();
    expect(await verifyInitData(signed.replace('-123456', '-654321'), token, 86400, now)).toBeNull();
  });
});
