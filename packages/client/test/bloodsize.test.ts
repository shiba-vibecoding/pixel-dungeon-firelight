import { describe, expect, it } from 'vitest';
import { ATLAS } from '../src/fxsheet';
import { DOT_AT, SOLID_AT, UV_DOT, UV_SOLID } from '../src/r3d/effects3d';
import { chunkSize, SPECK_GROW, stainSize } from '../src/r3d/bloodsize';

describe('blood in the 3D view', () => {
  it('draws no chunk or stain as a card: the largest (4.2 px) is under a third of a cell, a splat of 2 px about a sixth', () => {
    expect(chunkSize(4.2, 3)).toBeLessThan(0.3);
    expect(chunkSize(2.4, 2)).toBeGreaterThanOrEqual(0.08);
    expect(stainSize(4.2, true)).toBeLessThan(0.3);
    expect(stainSize(2, false)).toBeLessThan(0.18);
    expect(stainSize(1, false)).toBeCloseTo(0.0875, 5);
    // A flying speck of 3 px is under half a cell, however long it is seen.
    expect((3 / 16) * SPECK_GROW).toBeLessThan(0.35);
  });

  it('takes the solid and dot pictures from inside the atlas, in the corner the designer\'s sheets leave alone', () => {
    for (const uv of [UV_SOLID, UV_DOT]) {
      expect(uv[0]).toBeGreaterThanOrEqual(0);
      expect(uv[1]).toBeGreaterThanOrEqual(0);
      expect(uv[0] + uv[2]).toBeLessThanOrEqual(1);
      expect(uv[1] + uv[3]).toBeLessThanOrEqual(1);
      expect(uv[2]).toBeGreaterThan(0);
    }
    // Pixel positions agree with the uv (a wrong atlas size would show as a solid, or a pink, quad).
    expect(UV_SOLID[0]).toBeCloseTo(SOLID_AT[0] / ATLAS.w, 10);
    expect(UV_SOLID[1]).toBeCloseTo(1 - (SOLID_AT[1] + SOLID_AT[3]) / ATLAS.h, 10);
    for (const at of [SOLID_AT, DOT_AT]) {
      for (const free of ATLAS.free) {
        const apart = at[0] + at[2] <= free.x || free.x + free.w <= at[0] || at[1] + at[3] <= free.y || free.y + free.h <= at[1];
        expect(apart, `${at.join(',')} overlaps the designer's room`).toBe(true);
      }
    }
  });
});
