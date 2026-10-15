import { describe, expect, it } from 'vitest';
import { emptyWallet, type Wallet } from '@pd/core';
import { type AdminOps, parseAdminCommand } from '../src/admin';
import { WindowLimiter } from '../src/limits';
import { compareVersions, newsSeenAfter, parseVersion } from '../src/news';
import { changeOutages, isDay, joinOutages, parseOutageDays } from '../src/outages';
import { type BotApi, type BotConfig, handleUpdate, type Wallets } from '../src/payments';
import {
  adminNotice, escapeHtml, giveHonor, MAX_ACTIONS, MAX_ERRORS, MAX_PROBLEM_BYTES, newId, parseProblem, parseProblemId, PROBLEMS_PER_DAY, takeProblemSlot,
} from '../src/problem';
import { emptyProfile, keepStreak, type Streak, streakNow } from '../src/runs';

describe('problem reports', () => {
  const body = (more: Record<string, unknown> = {}) => ({
    text: 'после лестницы пропал рюкзак', attach: true,
    info: { version: '2.4', rules: 18, build: 'abc123', device: 'Pixel 7', platform: 'android', lang: 'ru', run: { id: 'r1', seed: 12345, depth: 9, slot: 'dungeon', seq: 812 } },
    actions: Array.from({ length: 300 }, (_, i) => `move ${i}`), errors: Array.from({ length: 30 }, (_, i) => `TypeError ${i}`), ...more,
  });

  it('keeps the version, the run, the device, the last ~200 actions and the last console errors', () => {
    const problem = parseProblem(body(), 5)!;
    expect(problem.facts).toMatchObject({ version: '2.4', rules: 18, build: 'abc123', platform: 'android', run: { id: 'r1', seed: 12345, depth: 9, seq: 812 } });
    expect(problem.actions).toHaveLength(MAX_ACTIONS);
    expect(problem.actions!.at(-1)).toBe('move 299');
    expect(problem.errors).toHaveLength(MAX_ERRORS);
    expect(problem.errors!.at(-1)).toBe('TypeError 29');
  });

  it('leaves the log out when the player did not attach it', () => {
    const problem = parseProblem(body({ attach: false }), 5)!;
    expect(problem.actions).toBeUndefined();
    expect(problem.errors).toBeUndefined();
    expect(problem.text).toBe('после лестницы пропал рюкзак');
  });

  it('cuts every field, strips control characters and refuses what is not a report', () => {
    const problem = parseProblem(body({ text: `${'я'.repeat(2000)}\u0000\u0007`, actions: ['x'.repeat(500), '\u0000\u0001'], errors: ['e'.repeat(900)] }), 5)!;
    expect(problem.text).toHaveLength(1000);
    expect(problem.actions).toEqual(['x'.repeat(80)]);
    expect(problem.errors![0]).toHaveLength(300);
    expect(parseProblem(null, 5)).toBeNull();
    expect(parseProblem('nonsense', 5)).toBeNull();
    expect(parseProblem({ text: 'hi' }, 5)).toBeNull();
    expect(parseProblem({ text: 'hi', info: { rules: 'x' } }, 5)).toBeNull();
  });

  it('allows five reports a player a (UTC) day, and counts a new day afresh', () => {
    let state: { day: string; count: number } | undefined;
    for (let i = 0; i < PROBLEMS_PER_DAY; i++) {
      const taken = takeProblemSlot(state, '2026-10-27');
      expect(taken.ok).toBe(true);
      state = taken.state;
    }
    expect(takeProblemSlot(state, '2026-10-27').ok).toBe(false);
    expect(takeProblemSlot(state, '2026-10-28')).toEqual({ ok: true, state: { day: '2026-10-28', count: 1 } });
  });

  it('shows the admin a short notice with the id, the player’s words escaped', () => {
    const problem = { ...parseProblem(body({ text: '<b>hi</b> & <a href="x">link</a>' }), 5)!, id: 'ABC234' };
    const notice = adminNotice(problem);
    expect(notice).toContain('<code>ABC234</code>');
    expect(notice).toContain('/bughunter ABC234');
    expect(notice).toContain('&lt;b&gt;hi&lt;/b&gt; &amp; &lt;a href="x"&gt;link&lt;/a&gt;');
    expect(notice).not.toContain('<b>');
    expect(notice).not.toContain('<a ');
    expect(escapeHtml('<&>')).toBe('&lt;&amp;&gt;');
    expect(notice.split('\n').length).toBeLessThanOrEqual(6);
  });

  it('makes ids an admin can type, and gives the badge once', () => {
    expect(newId()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    expect(parseProblemId(' abc234 ')).toBe('ABC234');
    expect(parseProblemId('ABC10O')).toBeNull();
    expect(parseProblemId('ABC')).toBeNull();
    const p: { honors?: string[] } = {};
    expect(giveHonor(p, 'bughunter')).toBe(true);
    expect(giveHonor(p, 'bughunter')).toBe(false);
    expect(giveHonor(p, 'admin')).toBe(false);
    expect(p.honors).toEqual(['bughunter']);
  });
});

/** A Bot API that remembers its calls. */
function fakeApi(): { api: BotApi; calls: Array<{ method: string; params: Record<string, unknown> }> } {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  return { api: async (method, params) => (calls.push({ method, params }), true), calls };
}

const wallets: Wallets = { get: async () => emptyWallet(), apply: async () => emptyWallet() as Wallet };
const ADMIN = 900;

function fakeOps(): AdminOps & { log: string[] } {
  const log: string[] = [];
  let days: string[] = [];
  return {
    log,
    async bugHunter(id) {
      log.push(`hunter ${id}`);
      return id === 'ABC234' ? 'granted' : 'unknown';
    },
    async outages(change) {
      if (change) {
        log.push(`outage ${change.op} ${change.day}`);
        days = changeOutages(days, change.op, change.day);
      }
      return days;
    },
  };
}

const config = (ops: AdminOps): BotConfig => ({ appLink: 'https://t.me/bot/app', adminChatId: String(ADMIN), ops, supportLimiter: new WindowLimiter(5, 60_000) });
const say = (chat: number, text: string, user = chat) => ({ message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: user, first_name: 'X' }, text } });

describe('the admin’s bot commands', () => {
  it('parse /bughunter and /outage', () => {
    expect(parseAdminCommand('/bughunter abc234')).toEqual({ kind: 'bughunter', id: 'ABC234' });
    expect(parseAdminCommand('/bughunter')).toEqual({ kind: 'usage' });
    expect(parseAdminCommand('/bughunter 1234')).toEqual({ kind: 'usage' });
    expect(parseAdminCommand('/outage 2026-10-20')).toEqual({ kind: 'outage', op: 'add', day: '2026-10-20' });
    expect(parseAdminCommand('/outage remove 2026-10-20')).toEqual({ kind: 'outage', op: 'remove', day: '2026-10-20' });
    expect(parseAdminCommand('/outage')).toEqual({ kind: 'outage', op: 'list' });
    expect(parseAdminCommand('/outage 2026-02-30')).toEqual({ kind: 'usage' });
    expect(parseAdminCommand('/outage tomorrow')).toEqual({ kind: 'usage' });
  });

  it('work from the admin chat only', async () => {
    const ops = fakeOps();
    const mine = fakeApi();
    await handleUpdate(say(ADMIN, '/bughunter ABC234'), mine.api, wallets, config(ops), 1);
    expect(ops.log).toEqual(['hunter ABC234']);
    expect(String(mine.calls[0]!.params.text)).toContain('got the');
    await handleUpdate(say(ADMIN, '/bughunter ZZZZZZ'), mine.api, wallets, config(ops), 1);
    expect(String(mine.calls[1]!.params.text)).toContain('No report');
    await handleUpdate(say(ADMIN, '/outage 2026-10-20'), mine.api, wallets, config(ops), 1);
    expect(ops.log).toEqual(['hunter ABC234', 'hunter ZZZZZZ', 'outage add 2026-10-20']);
    expect(String(mine.calls[2]!.params.text)).toContain('2026-10-20');

    // Anyone else, in a private chat or a group, in any words: the commands do nothing at all.
    const other = fakeApi();
    const before = [...ops.log];
    await handleUpdate(say(555, '/bughunter ABC234'), other.api, wallets, config(ops), 1);
    await handleUpdate(say(555, '/outage 2026-10-21'), other.api, wallets, config(ops), 1);
    await handleUpdate({ message: { message_id: 2, chat: { id: -100, type: 'supergroup' }, from: { id: 555 }, text: '/bughunter ABC234' } }, other.api, wallets, config(ops), 1);
    // ...and not even when it is the admin's user id writing from another chat.
    await handleUpdate(say(556, '/outage remove 2026-10-20', ADMIN), other.api, wallets, config(ops), 1);
    expect(ops.log).toEqual(before);
    // With no admin chat set, nobody is one.
    await handleUpdate(say(ADMIN, '/bughunter ABC234'), other.api, wallets, { ...config(ops), adminChatId: undefined }, 1);
    expect(ops.log).toEqual(before);
  });
});

describe('days the server was down', () => {
  const streak = (more: Partial<Streak> = {}): Streak => ({ last: '2026-10-10', count: 2, best: 2, freezes: 0, ...more });

  it('parses the variable and the admin’s list into real days', () => {
    expect(parseOutageDays('2026-10-20, 2026-10-18 nonsense 2026-02-30;2026-10-20')).toEqual(['2026-10-18', '2026-10-20']);
    expect(parseOutageDays(undefined)).toEqual([]);
    expect(isDay('2026-10-20')).toBe(true);
    expect(isDay('2026-13-01')).toBe(false);
    expect(joinOutages(['2026-10-20'], ['2026-10-18', '2026-10-20'])).toEqual(['2026-10-18', '2026-10-20']);
    expect(changeOutages(['2026-10-18'], 'add', '2026-10-20')).toEqual(['2026-10-18', '2026-10-20']);
    expect(changeOutages(['2026-10-18', '2026-10-20'], 'remove', '2026-10-18')).toEqual(['2026-10-20']);
    expect(changeOutages(['2026-10-18'], 'add', 'x')).toEqual(['2026-10-18']);
  });

  it('do not break a streak: the day missed to an outage is a day played', () => {
    // Played the 10th, the server was down the 11th, played the 12th: with no freeze, the streak without outage would break.
    expect(keepStreak(streak(), '2026-10-12')).toMatchObject({ count: 1 });
    expect(keepStreak(streak(), '2026-10-12', ['2026-10-11'])).toMatchObject({ count: 4, freezes: 0 });
  });

  it('spend no freeze, and spend one only for a day that was missed', () => {
    expect(keepStreak(streak({ freezes: 1 }), '2026-10-12', ['2026-10-11'])).toMatchObject({ freezes: 1 });
    // Two days off, one of them an outage: the freeze covers the other.
    expect(keepStreak(streak({ freezes: 1 }), '2026-10-13', ['2026-10-11'])).toMatchObject({ count: 4, freezes: 0 });
    // Two missed and only one freeze: broken as ever.
    expect(keepStreak(streak({ freezes: 1 }), '2026-10-14', ['2026-10-11'])).toMatchObject({ count: 1, freezes: 0 });
    // Without outages everything is as it was.
    expect(keepStreak(streak({ freezes: 1 }), '2026-10-12')).toMatchObject({ count: 3, freezes: 0 });
  });

  it('keep the streak shown alive over the outage, and break it past the freezes as before', () => {
    expect(streakNow(streak(), '2026-10-12', ['2026-10-11']).count).toBe(2);
    expect(streakNow(streak(), '2026-10-12').count).toBe(0);
    expect(streakNow(streak(), '2026-10-13', ['2026-10-11']).count).toBe(0);
    expect(streakNow(streak({ freezes: 1 }), '2026-10-13', ['2026-10-11']).count).toBe(2);
  });
});

describe('news seen', () => {
  it('reads dotted versions only, and keeps the newer of two', () => {
    expect(parseVersion('2.4')).toBe('2.4');
    expect(parseVersion('1.9.2')).toBe('1.9.2');
    expect(parseVersion('v2')).toBeNull();
    expect(parseVersion('2.4; drop')).toBeNull();
    expect(parseVersion(5)).toBeNull();
    expect(compareVersions('2.10', '2.9')).toBeGreaterThan(0);
    expect(newsSeenAfter(undefined, '2.3')).toBe('2.3');
    expect(newsSeenAfter('2.3', '2.4')).toBe('2.4');
    expect(newsSeenAfter('2.4', '2.3')).toBe('2.4');
  });

  it('limits a problem report to 40 KB and five a day', () => {
    expect(MAX_PROBLEM_BYTES).toBe(40 * 1024);
    expect(PROBLEMS_PER_DAY).toBe(5);
    expect(emptyProfile('A').coachDone).toBe(false);
  });
});
