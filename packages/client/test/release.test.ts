import { describe, expect, it } from 'vitest';
import type { Action } from '@pd/core';
import { ACTIONS_KEPT, describeAction, ERRORS_KEPT, noteAction, noteError, recent, resetActions } from '../src/diag';
import { compareVersions, newsDue } from '../src/news';
import { CURRENT, RELEASES } from '../src/releases';
import { CAMP_EN, ordinal } from '../src/i18n-camp';
import { CAMP_RU } from '../src/i18n-camp.ru';
import { unclaimed } from '../src/checked';
import { baseOf } from '../vite.config';

describe('the news data', () => {
  it('has the versions newest first, each once, with both languages for every line', () => {
    const versions = RELEASES.map((release) => release.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < versions.length; i++) expect(compareVersions(versions[i - 1]!, versions[i]!)).toBeGreaterThan(0);
    expect(CURRENT).toBe(RELEASES[0]);
    for (const release of RELEASES) {
      expect(release.changes.length).toBeGreaterThan(0);
      for (const change of release.changes) {
        expect(['add', 'now', 'fix', 'bal']).toContain(change.tag);
        expect(change.text.ru.length).toBeGreaterThan(5);
        expect(change.text.en.length).toBeGreaterThan(5);
      }
    }
  });

  it('is Firelight 3.0: a major update with its banner words and four main items', () => {
    expect(CURRENT.version).toBe('3.0');
    expect(CURRENT.major).toBe(true);
    expect(CURRENT.main).toHaveLength(4);
    expect(CURRENT.title).toEqual({ ru: 'У костра', en: 'Firelight' });
    expect(CURRENT.kick?.en && CURRENT.kick.ru && CURRENT.sub?.en && CURRENT.sub.ru).toBeTruthy();
    for (const item of CURRENT.main!) expect(item.title.ru && item.title.en && item.text.ru && item.text.en).toBeTruthy();
  });

  it('has the same screens’ strings in Russian as in English, none empty', () => {
    const shape = (value: unknown): unknown =>
      Array.isArray(value) ? value.map(shape) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)])) : typeof value;
    expect(shape(CAMP_RU)).toEqual(shape(CAMP_EN));
    const empty = (value: unknown): boolean =>
      typeof value === 'string' ? value.trim() === '' : Array.isArray(value) ? value.some(empty) : value && typeof value === 'object' ? Object.values(value).some(empty) : false;
    expect(empty(CAMP_RU)).toBe(false);
    expect(empty(CAMP_EN)).toBe(false);
    // Four heroes of the original, each with words to say and a sulk.
    expect(CAMP_EN.camp.cls).toHaveLength(4);
    expect(CAMP_RU.camp.say).toHaveLength(4);
    expect(CAMP_RU.camp.sulk).toHaveLength(4);
    expect(CAMP_EN.coach.steps).toHaveLength(4);
  });
});

describe('when the news are shown', () => {
  const facts = { local: null, veteran: true, current: '3.0' };

  it('compares dotted versions as numbers', () => {
    expect(compareVersions('2.4', '2.10')).toBeLessThan(0);
    expect(compareVersions('3.0', '3.0')).toBe(0);
    expect(compareVersions('3', '2.9.9')).toBeGreaterThan(0);
  });

  it('shows them once to a player who has played before, and not again', () => {
    expect(newsDue(facts)).toBe('show');
    expect(newsDue({ ...facts, local: '2.4' })).toBe('show');
    expect(newsDue({ ...facts, local: '3.0' })).toBe('none');
  });

  it('does not show them to a brand-new player, who has the tutorial instead', () => {
    expect(newsDue({ ...facts, veteran: false })).toBe('mark');
  });

  it('takes the newer of this device’s word and the server’s', () => {
    expect(newsDue({ ...facts, server: '3.0' })).toBe('none');
    expect(newsDue({ ...facts, local: '2.4', server: '3.0' })).toBe('none');
    expect(newsDue({ ...facts, server: undefined })).toBe('show');
  });
});

describe('the mail', () => {
  it('counts the letters not yet claimed, and says places as 1st, 2nd, 3rd', () => {
    const letter = { id: 'a', kind: 'cup' as const, board: 'daily:2026-10-12', place: 1, at: 0, gifts: [] };
    expect(unclaimed([letter, { ...letter, id: 'b', claimed: 5 }, { ...letter, id: 'c' }])).toBe(2);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

describe('where the game is served from', () => {
  it('is the Firelight project site unless the environment says otherwise', () => {
    expect(baseOf(undefined)).toBe('/pixel-dungeon-firelight/');
    expect(baseOf('')).toBe('/pixel-dungeon-firelight/');
    expect(baseOf('/pd')).toBe('/pd/');
    expect(baseOf('x/y/')).toBe('/x/y/');
    expect(baseOf('./')).toBe('./');
  });
});

describe('what a problem report carries', () => {
  it('keeps the last actions and errors, no more than the report takes', () => {
    resetActions();
    for (let i = 0; i < ACTIONS_KEPT + 30; i++) noteAction({ type: 'move', to: i } as Action);
    for (let i = 0; i < ERRORS_KEPT + 5; i++) noteError(`error ${i}\n  at somewhere`);
    const { actions, errors } = recent();
    expect(actions).toHaveLength(ACTIONS_KEPT);
    expect(actions.at(-1)).toBe(`#${ACTIONS_KEPT + 30} move {"to":${ACTIONS_KEPT + 29}}`);
    expect(errors).toHaveLength(ERRORS_KEPT);
    expect(errors.at(-1)).toBe(`error ${ERRORS_KEPT + 4} at somewhere`);
    resetActions();
    expect(recent().actions).toEqual([]);
  });

  it('writes an action as a short line', () => {
    expect(describeAction({ type: 'wait' } as Action, 3)).toBe('#3 wait');
    expect(describeAction({ type: 'say', text: 'x'.repeat(300) } as unknown as Action, 4).length).toBeLessThanOrEqual(80);
  });
});
