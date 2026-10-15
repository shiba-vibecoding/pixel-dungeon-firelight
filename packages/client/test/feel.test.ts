import { describe, expect, it } from 'vitest';
import { hapticAllowed } from '../src/telegram';

describe('haptics are rate-limited', () => {
  it('lets one buzz through for a flurry of the same kind', () => {
    expect(hapticAllowed('hit', 10_000)).toBe(true);
    expect(hapticAllowed('hit', 10_040)).toBe(false);
    expect(hapticAllowed('tick', 10_060)).toBe(false);
    expect(hapticAllowed('hit', 10_200)).toBe(true);
  });

  it('lets a stronger one through at once, and notifications over impacts', () => {
    expect(hapticAllowed('tick', 20_000)).toBe(true);
    expect(hapticAllowed('slam', 20_010)).toBe(true);
    expect(hapticAllowed('hit', 20_020)).toBe(false);
    expect(hapticAllowed('success', 20_030)).toBe(true);
    expect(hapticAllowed('error', 20_040)).toBe(true);
  });

  it('starts over when the clock goes back', () => {
    expect(hapticAllowed('slam', 50_000)).toBe(true);
    expect(hapticAllowed('hit', 100)).toBe(true);
  });
});

describe('waves of rings', () => {
  it('live while their last ring runs, are reported as moving, and stay within the cap', async () => {
    const { fx } = await import('../src/fx');
    fx.reset();
    const opts = { colors: '#fff', rings: 4, tiles: 6, duration: 700 };
    fx.wave(100, 100, 1000, opts);
    expect(fx.moving(1100)).toBe(true);
    fx.update(1000 + 700 + 3 * 120 - 1, 16);
    expect(fx.waves.length).toBe(1);
    fx.update(1000 + 700 + 3 * 120 + 1, 16);
    expect(fx.waves.length).toBe(0);
    expect(fx.moving(5000)).toBe(false);
    for (let i = 0; i < 20; i++) fx.wave(0, 0, 5000, opts);
    expect(fx.waves.length).toBeLessThanOrEqual(6);
    fx.reset();
  });
});
