import { describe, expect, it } from 'vitest';
import { isSoft, softShare } from '../src/r3d/softalpha';

const pixels = (alphas: number[]): number[] => alphas.flatMap((a) => [200, 200, 200, a]);

describe('sheets with soft bodies', () => {
  it('count the visible pixels that are neither clear nor solid', () => {
    expect(softShare(pixels([0, 0, 255, 255]))).toBe(0);
    expect(softShare(pixels([0, 100, 255, 255]))).toBeCloseTo(1 / 3, 6);
    expect(softShare(pixels([0, 0, 0]))).toBe(0);
  });

  it('send a ghost (three quarters of it soft) to the blended batch, and keep solid pixel art in the cut-out one', () => {
    const ghost = pixels([...Array(10).fill(255), ...Array(30).fill(110), ...Array(20).fill(0)]);
    const rat = pixels([...Array(40).fill(255), 252, ...Array(20).fill(0)]);
    expect(isSoft(ghost)).toBe(true);
    expect(isSoft(rat)).toBe(false);
  });

  it('do not take a stray soft pixel for a soft body', () => {
    const yog = pixels([...Array(1000).fill(255), 128, 128, 128]);
    expect(isSoft(yog)).toBe(false);
  });
});
