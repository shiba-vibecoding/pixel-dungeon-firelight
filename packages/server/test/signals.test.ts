import { describe, expect, it } from 'vitest';
import { LENGTH } from '@pd/core';
import { SIGNAL_BURST, SIGNAL_WINDOW_MS, SignalLimiter, validSignal } from '../src/signals';

describe('co-op signals', () => {
  it('relays pings and emotes as they are, rebuilt without anything else', () => {
    expect(validSignal({ kind: 'ping', depth: 3, cell: 120, extra: 'x' })).toEqual({ kind: 'ping', depth: 3, cell: 120 });
    expect(validSignal({ kind: 'emote', emote: 'thanks' })).toEqual({ kind: 'emote', emote: 'thanks' });
  });

  it('drops what is not a signal', () => {
    for (const bad of [
      null, 'ping', 7, {}, { kind: 'shout' },
      { kind: 'ping', depth: 0, cell: 1 }, { kind: 'ping', depth: 27, cell: 1 }, { kind: 'ping', depth: 2.5, cell: 1 },
      { kind: 'ping', depth: 1, cell: -1 }, { kind: 'ping', depth: 1, cell: LENGTH }, { kind: 'ping', depth: 1, cell: '5' },
      { kind: 'emote', emote: 'dance' }, { kind: 'emote' },
    ]) {
      expect(validSignal(bad)).toBeNull();
    }
  });

  it('lets each player send a few in a short while, and drops the rest', () => {
    const limiter = new SignalLimiter();
    for (let i = 0; i < SIGNAL_BURST; i++) expect(limiter.allow('alice', 1000 + i)).toBe(true);
    expect(limiter.allow('alice', 1100)).toBe(false);
    // Another player has their own allowance.
    expect(limiter.allow('bob', 1100)).toBe(true);
    // Once the first ones are old enough, there is room again.
    expect(limiter.allow('alice', 1000 + SIGNAL_WINDOW_MS)).toBe(true);
    expect(limiter.allow('alice', 1000 + SIGNAL_WINDOW_MS)).toBe(false);
  });
});
