import { describe, expect, it } from 'vitest';
import { LENGTH, T, WIDTH } from '@pd/core';
import { fx } from '../src/fx';

/** A floor of plain ground with a pool of water around (10, 10). */
function pool(): void {
  const map = new Array<number>(LENGTH).fill(T.EMPTY);
  for (let y = 8; y <= 12; y++) for (let x = 8; x <= 12; x++) map[y * WIDTH + x] = T.WATER;
  fx.reset();
  fx.floor = map;
}

describe('blood in water', () => {
  it('reddens the water round a creature wounded in it, and nothing on dry ground', () => {
    pool();
    fx.bleedWater(3 * 16 + 8, 3 * 16 + 8, 0, 1, 2);
    expect(fx.bleeds).toHaveLength(0);
    fx.bleedWater(10 * 16 + 8, 10 * 16 + 8, 0, 1, 2);
    expect(fx.bleeds).toHaveLength(1);
    expect(fx.waterRed(10.5, 10.5, 50)).toBeGreaterThan(0.3);
  });

  it('spreads out over a second and a half, thins to its edge, and is gone in nine seconds', () => {
    pool();
    fx.bleedWater(10 * 16 + 8, 10 * 16 + 8, 0, 1, 2);
    expect(fx.waterRed(12.5, 10.5, 50)).toBe(0);
    expect(fx.waterRed(12.5, 10.5, 2000)).toBeGreaterThan(0);
    expect(fx.waterRed(10.5, 10.5, 2000)).toBeGreaterThan(fx.waterRed(11.5, 10.5, 2000));
    expect(fx.waterRed(10.5, 10.5, 5000)).toBeLessThan(fx.waterRed(10.5, 10.5, 2000));
    expect(fx.waterRed(10.5, 10.5, 9001)).toBe(0);
    fx.update(9500, 16);
    expect(fx.bleeds).toHaveLength(0);
  });

  it('deepens one cloud for a second wound close by and soon after, and keeps few at once', () => {
    pool();
    fx.bleedWater(10 * 16 + 8, 10 * 16 + 8, 0, 0.4, 1.2);
    fx.bleedWater(10 * 16 + 10, 10 * 16 + 8, 200, 0.4, 2);
    expect(fx.bleeds).toHaveLength(1);
    expect(fx.bleeds[0]!.power).toBeCloseTo(0.6, 5);
    for (let i = 0; i < 30; i++) fx.bleedWater(10 * 16 + 8, 10 * 16 + 8, 1000 * (i + 1), 0.5, 1);
    expect(fx.bleeds.length).toBeLessThanOrEqual(10);
  });
});
