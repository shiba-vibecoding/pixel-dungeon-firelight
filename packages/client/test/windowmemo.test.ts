import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMemo, loadMemo, type Memo, memoValid, saveMemo } from '../src/windowmemo';

const memo: Memo = { run: '123:abc', turn: 40, kind: 'scroll.upgrade', state: { w: 'pick', index: 3, button: 0 } };

/** A localStorage that remembers, for the test. */
function stubStorage(): Map<string, string> {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  });
  return data;
}

beforeEach(() => {
  stubStorage();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a window that comes back (after a reload, a turn of the phone)', () => {
  it('is put back only in the same run, at the same turn, with the hero alive and the game not over', () => {
    expect(memoValid(memo, '123:abc', 40, true, false)).toBe(true);
    expect(memoValid(memo, '124:abc', 40, true, false)).toBe(false);
    expect(memoValid(memo, '123:abc', 41, true, false)).toBe(false);
    expect(memoValid(memo, '123:abc', 40, false, false)).toBe(false);
    expect(memoValid(memo, '123:abc', 40, true, true)).toBe(false);
    expect(memoValid(null, '123:abc', 40, true, false)).toBe(false);
  });

  it('is kept on the device and read back, or forgotten', () => {
    expect(loadMemo()).toBeNull();
    saveMemo(memo);
    expect(loadMemo()).toEqual(memo);
    clearMemo();
    expect(loadMemo()).toBeNull();
  });

  it('a damaged note is no window', () => {
    const data = stubStorage();
    data.set('pd-window', '{"run":5}');
    expect(loadMemo()).toBeNull();
    data.set('pd-window', 'not json');
    expect(loadMemo()).toBeNull();
    data.set('pd-window', JSON.stringify({ run: 'a', turn: 1.5, state: {} }));
    expect(loadMemo()).toBeNull();
  });

  it('survives a storage that refuses', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    });
    expect(() => saveMemo(memo)).not.toThrow();
    expect(() => clearMemo()).not.toThrow();
    expect(loadMemo()).toBeNull();
  });
});
