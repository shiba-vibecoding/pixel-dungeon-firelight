import { describe, expect, it } from 'vitest';
import { SEASON } from '../src/boards';
import { hiddenName, nameOnBoards, setHidden, wornOnBoards } from '../src/privacy';
import { dayLeft, mayWrite, OVERTAKEN_TOP, overtakenJob, streakReminder, type Subscriber, weeklyResult } from '../src/reminders';

const at = (iso: string): number => Date.parse(iso);
const sub: Subscriber = { chat: 7, ru: true, streak: 5, last: '2026-10-12', season: SEASON };

describe('«you were passed on the day\'s board» (reminders.ts)', () => {
  const now = at('2026-10-13T11:30:00Z');

  it('writes to a subscriber who stands in the top 50, with the board button, in their language', () => {
    const job = overtakenJob(sub, 'Саша', 4, now)!;
    expect(job.chat).toBe(7);
    expect(job.text).toContain('Саша');
    expect(job.text).toContain('#4');
    expect(job.text).toContain('12 ч 30 мин');
    expect(job.start).toBe('boards');
    const en = overtakenJob({ ...sub, ru: false }, 'Sasha', 4, now)!;
    expect(en.text).toContain('Sasha passed you');
    expect(en.text).toContain('12 h 30 min');
    expect(en.button).toBe('See the board');
  });

  it('does not write to someone who fell below the top 50, or has a place that cannot be', () => {
    expect(overtakenJob(sub, 'X', OVERTAKEN_TOP, now)).not.toBeNull();
    expect(overtakenJob(sub, 'X', OVERTAKEN_TOP + 1, now)).toBeNull();
    expect(overtakenJob(sub, 'X', 0, now)).toBeNull();
  });

  it('writes at most once a day to a player in all, whatever the message', () => {
    expect(mayWrite(sub, now)).toBe(true);
    const told = { ...sub, sent: '2026-10-13' };
    expect(mayWrite(told, now)).toBe(false);
    expect(overtakenJob(told, 'X', 3, now)).toBeNull();
    // Yesterday's message does not count.
    expect(overtakenJob({ ...sub, sent: '2026-10-12' }, 'X', 3, now)).not.toBeNull();
    // The streak reminder keeps to the same day's count.
    expect(streakReminder({ ...sub, sent: '2026-10-13' }, at('2026-10-13T17:00:00Z'))).toBeNull();
  });

  it('counts the time left of the UTC day', () => {
    expect(dayLeft(at('2026-10-13T23:51:00Z'), true)).toBe('9 мин');
    expect(dayLeft(at('2026-10-13T00:00:00Z'), false)).toBe('24 h 0 min');
    expect(dayLeft(at('2026-10-13T18:45:00Z'), false)).toBe('5 h 15 min');
  });

  it('leaves the weekly result as it was', () => {
    expect(weeklyResult(sub, '2026-W41', 3, 120).text).toContain('медаль');
  });
});

describe('hide me from the boards (privacy.ts)', () => {
  it('is off by default: the name is the real one', () => {
    expect(nameOnBoards({ name: 'Kirill' })).toBe('Kirill');
    expect(nameOnBoards({ name: 'Kirill' }, 'Kir')).toBe('Kir');
  });

  it('names a hidden player «Hero» (Герой for a Russian), and stops when they come out', () => {
    const profile: { name: string; hidden?: boolean; alias?: string } = { name: 'Kirill' };
    expect(setHidden(profile, true, true)).toBe(true);
    expect(nameOnBoards(profile)).toBe('Герой');
    expect(setHidden(profile, true, true)).toBe(false);
    expect(setHidden(profile, false)).toBe(true);
    expect(nameOnBoards(profile)).toBe('Kirill');
    expect(setHidden(profile, false)).toBe(false);
    expect(hiddenName(false)).toBe('Hero');
  });

  it('takes the name colour and the title off a hidden player\'s hero, and leaves the look', () => {
    const worn = { l: 'skin.mage.ember', h: 'hat.crown', nc: 'name.gold', tt: 'title.kindler' };
    expect(wornOnBoards({ name: 'A' }, worn)).toEqual(worn);
    expect(wornOnBoards({ name: 'A', hidden: true }, worn)).toEqual({ l: 'skin.mage.ember', h: 'hat.crown' });
    expect(wornOnBoards({ name: 'A', hidden: true }, { nc: 'name.gold' })).toBeUndefined();
    expect(wornOnBoards({ name: 'A', hidden: true }, undefined)).toBeUndefined();
  });
});
