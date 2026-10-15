import { describe, expect, it } from 'vitest';
import { practiceSeed } from '@pd/core';
import { DEV_DAILY_SECRET, secretDailySeed } from '../src/daily-seed';

describe('the daily seed', () => {
  it('is the same all day for one secret, and differs by day and by secret', async () => {
    const a = await secretDailySeed('s3cret', '2026-10-15');
    expect(await secretDailySeed('s3cret', '2026-10-15')).toBe(a);
    expect(await secretDailySeed('s3cret', '2026-10-16')).not.toBe(a);
    expect(await secretDailySeed('other', '2026-10-15')).not.toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2 ** 31);
  });

  it('differs from the public development value once a secret is set, and from the practice seed', async () => {
    const day = '2026-10-15';
    expect(DEV_DAILY_SECRET).toBeTruthy();
    expect(await secretDailySeed('s3cret', day)).not.toBe(await secretDailySeed(DEV_DAILY_SECRET, day));
    expect(await secretDailySeed(undefined, day)).toBe(await secretDailySeed('', day));
    expect(await secretDailySeed(undefined, day)).toBe(await secretDailySeed(DEV_DAILY_SECRET, day));
    expect(await secretDailySeed('s3cret', day)).not.toBe(practiceSeed(day));
    expect(await secretDailySeed(undefined, day)).not.toBe(practiceSeed(day));
  });

  it('leaves the device only a practice seed, the same for everyone on a day', () => {
    expect(practiceSeed('2026-10-15')).toBe(practiceSeed('2026-10-15'));
    expect(practiceSeed('2026-10-15')).not.toBe(practiceSeed('2026-10-16'));
  });
});
