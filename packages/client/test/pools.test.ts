import { describe, expect, it } from 'vitest';
import { LENGTH, T, WIDTH } from '@pd/core';
import { K_FLOOR, K_WALL } from '../src/r3d/levelgeom';
import { bakePools, type Source } from '../src/r3d/lightrig';
import { clampBrightness, BRIGHTNESS_DEFAULT, BRIGHTNESS_MAX, BRIGHTNESS_MIN } from '../src/brightness';

const torch = (cell: number): Source => ({
  x: (cell % WIDTH) + 0.5, y: 1.35, z: Math.trunc(cell / WIDTH) + 1.95, cell, color: 0xff9448, intensity: 13, distance: 9, decay: 1.7, hz: 6, amp: 0.18, torch: true,
});

describe('the baked pools of the fixed fires', () => {
  it('lay warm light round a torch, strongest at its foot, nothing far away', () => {
    const kinds = new Uint8Array(LENGTH).fill(K_FLOOR);
    const cell = 20 + 20 * WIDTH;
    const pools = bakePools([torch(cell)], kinds);
    const at = (x: number, z: number, c: number): number => pools[(x + z * WIDTH) * 3 + c]!;
    // The torch's wall is at (20, 20); it hangs over the floor cell south of it.
    expect(at(20, 21, 0)).toBeGreaterThan(80);
    expect(at(20, 21, 0)).toBeGreaterThan(at(20, 24, 0));
    expect(at(20, 21, 0)).toBeGreaterThan(at(20, 21, 2));
    expect(at(30, 30, 0)).toBe(0);
  });

  it('do not pass through a wall', () => {
    const kinds = new Uint8Array(LENGTH).fill(K_FLOOR);
    for (let x = 0; x < WIDTH; x++) kinds[x + 22 * WIDTH] = K_WALL;
    const pools = bakePools([torch(20 + 20 * WIDTH)], kinds);
    expect(pools[(20 + 21 * WIDTH) * 3]).toBeGreaterThan(0);
    // Behind the wall, though well within reach.
    expect(pools[(20 + 23 * WIDTH) * 3]).toBe(0);
  });

  it('light other fixed fires too (lava), more softly than a torch', () => {
    const kinds = new Uint8Array(LENGTH).fill(K_FLOOR);
    const lava: Source = { x: 10.5, y: 0.45, z: 10.5, cell: 10 + 10 * WIDTH, color: 0xff5a1a, intensity: 2.5, distance: 5, decay: 1.4, hz: 0, amp: 0, torch: false };
    const pools = bakePools([lava], kinds);
    const mid = pools[(10 + 10 * WIDTH) * 3]!;
    expect(mid).toBeGreaterThan(40);
    expect(mid).toBeLessThan(bakePools([torch(10 + 9 * WIDTH)], kinds)[(10 + 10 * WIDTH) * 3]! + 1);
    expect(T.WALL).toBeDefined();
  });
});

describe('the brightness setting', () => {
  it('runs from 0.5 to 2.5, defaults a little above 1, and clamps', () => {
    expect(BRIGHTNESS_MIN).toBe(0.5);
    expect(BRIGHTNESS_MAX).toBe(2.5);
    expect(BRIGHTNESS_DEFAULT).toBeGreaterThan(1);
    expect(BRIGHTNESS_DEFAULT).toBeLessThan(1.6);
    expect(clampBrightness(9)).toBe(2.5);
    expect(clampBrightness(0)).toBe(0.5);
    expect(clampBrightness(Number.NaN)).toBe(BRIGHTNESS_DEFAULT);
  });
});
