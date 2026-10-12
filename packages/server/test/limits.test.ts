import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_BYTES, MessageLimiter, messageBytes, RATES, TokenBucket, WindowLimiter } from '../src/limits';

describe('room message limits', () => {
  it('measures messages in bytes, strings by their UTF-8', () => {
    expect(messageBytes('{"type":"sync"}')).toBe(15);
    expect(messageBytes(new ArrayBuffer(100))).toBe(100);
    // Cyrillic takes two bytes a letter: a string near the limit is measured exactly.
    expect(messageBytes('я'.repeat(MAX_MESSAGE_BYTES / 2 + 1))).toBe(MAX_MESSAGE_BYTES + 2);
  });

  it('gives a burst, then refills at its rate', () => {
    const bucket = new TokenBucket({ burst: 3, perSecond: 2 }, 0);
    expect([bucket.take(0), bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([true, true, true, false]);
    expect(bucket.take(400)).toBe(false);
    expect(bucket.take(500)).toBe(true);
    // Never more than the burst, however long it rests.
    const rested = [...Array(5)].map(() => bucket.take(60_000));
    expect(rested).toEqual([true, true, true, false, false]);
  });

  it('lets a hero walk at a run but not flood the room', () => {
    const limiter = new MessageLimiter();
    // Ten steps a second for two seconds: the burst covers the difference from the rate.
    let allowed = 0;
    for (let t = 0; t < 2000; t += 100) if (limiter.allow('a', 'act', t)) allowed++;
    expect(allowed).toBe(20);
    // A sustained flood gets the rate and no more.
    let flood = 0;
    for (let t = 10_000; t < 20_000; t += 10) if (limiter.allow('b', 'act', t)) flood++;
    expect(flood).toBeLessThanOrEqual(RATES.act.burst + RATES.act.perSecond * 10 + 1);
  });

  it('counts each player and each kind apart, and forgets a player who left', () => {
    const limiter = new MessageLimiter();
    expect([limiter.allow('a', 'sync', 0), limiter.allow('a', 'sync', 0), limiter.allow('a', 'sync', 0)]).toEqual([true, true, false]);
    expect(limiter.allow('b', 'sync', 0)).toBe(true);
    expect(limiter.allow('a', 'look', 0)).toBe(true);
    expect(limiter.allow('a', 'sync', 2000)).toBe(true);
    limiter.forget('a');
    expect([limiter.allow('a', 'sync', 2000), limiter.allow('a', 'sync', 2000)]).toEqual([true, true]);
  });

  it('allows so many in a sliding window', () => {
    const limiter = new WindowLimiter(2, 1000, 2);
    expect([limiter.allow('x', 0), limiter.allow('x', 10), limiter.allow('x', 20)]).toEqual([true, true, false]);
    expect(limiter.allow('x', 1005)).toBe(true);
    // Others are counted apart, and the quiet ones forgotten as more come.
    expect([limiter.allow('y', 5000), limiter.allow('z', 5000), limiter.allow('w', 5000)]).toEqual([true, true, true]);
  });
});
