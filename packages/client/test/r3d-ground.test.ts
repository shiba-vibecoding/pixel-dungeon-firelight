import { describe, expect, it } from 'vitest';
import { Texture } from 'three';
import { fx } from '../src/fx';
import { MAX_GAP, gapOfAlpha, gapRows } from '../src/r3d/feet';
import { Tufts, TUFT_CAPACITY } from '../src/r3d/grass3d';
import { makeAir } from '../src/r3d/fogofwar';
import { TIERS } from '../src/r3d/governor';
import { UV_DISC, UV_DOT } from '../src/r3d/effects3d';

/** A 12 x 15 frame whose opaque pixels are in rows 0 to `last`. */
const frame = (last: number, w = 12, h = 15): Uint8Array => {
  const a = new Uint8Array(w * h);
  for (let row = 0; row <= last; row++) for (let col = 3; col < 9; col++) a[row * w + col] = 255;
  return a;
};

describe('the feet on the floor (feet.ts)', () => {
  it('counts the clear rows under the lowest opaque pixel of a frame', () => {
    expect(gapOfAlpha(frame(14), 12, 12, 15)).toBe(0);
    expect(gapOfAlpha(frame(13), 12, 12, 15)).toBe(1);
    expect(gapOfAlpha(frame(12), 12, 12, 15)).toBe(2);
    expect(gapOfAlpha(frame(11), 12, 12, 15)).toBe(MAX_GAP);
  });

  it('puts right a row or two and leaves a leap alone', () => {
    // More than MAX_GAP clear rows is a frame that is meant to be off the ground.
    expect(gapOfAlpha(frame(10), 12, 12, 15)).toBe(0);
    expect(gapOfAlpha(new Uint8Array(12 * 15), 12, 12, 15)).toBe(0);
  });

  it('counts the opaque rows by the alpha test of the sprites (a half or more), not by any pixel', () => {
    const a = frame(13);
    for (let col = 0; col < 12; col++) a[14 * 12 + col] = 60;
    expect(gapOfAlpha(a, 12, 12, 15)).toBe(1);
    for (let col = 0; col < 12; col++) a[14 * 12 + col] = 130;
    expect(gapOfAlpha(a, 12, 12, 15)).toBe(0);
  });

  it('draws a picture it cannot read as it is', () => {
    // (No canvas here: the sheet cannot be read.)
    expect(gapRows({ width: 12, height: 15 } as unknown as HTMLCanvasElement, 0, 0, 12, 15)).toBe(0);
  });
});

describe('the blades over the feet in short grass (grass3d.ts)', () => {
  const stub = { width: 16, height: 16 } as unknown as HTMLCanvasElement;
  const make = (): Tufts => new Tufts(makeAir(new Texture()), stub, stub, 0.14);

  it('is nothing at all, not even a draw, while no one stands in grass', () => {
    const t = make();
    t.begin();
    t.end();
    expect(t.mesh.visible).toBe(false);
    expect(t.mesh.count).toBe(0);
  });

  it('is a few small instances in one draw, written each frame', () => {
    const t = make();
    t.begin();
    t.add(10.5, 4.6, 0.26);
    t.add(10.7, 4.7, 0.22);
    t.end();
    expect(t.mesh.visible).toBe(true);
    expect(t.mesh.count).toBe(2);
    const m = t.mesh.instanceMatrix.array as Float32Array;
    expect([m[12], m[14], m[0], m[5]]).toEqual([expect.closeTo(10.5, 5), expect.closeTo(4.6, 5), expect.closeTo(0.26, 5), expect.closeTo(0.26, 5)]);
    // The next frame starts over.
    t.begin();
    t.add(3, 3, 0.2);
    t.end();
    expect(t.mesh.count).toBe(1);
  });

  it('never writes more than it has room for', () => {
    const t = make();
    t.begin();
    for (let i = 0; i < TUFT_CAPACITY + 20; i++) t.add(i % 40, 2, 0.2);
    t.end();
    expect(t.mesh.count).toBe(TUFT_CAPACITY);
  });
});

describe('the contact shadow, dust and splash', () => {
  it('has a picture of its own in the effects atlas, beside and not over the soft dot', () => {
    expect(UV_DISC).not.toEqual(UV_DOT);
    const [u, v, du, dv] = UV_DISC;
    expect(u).toBeGreaterThanOrEqual(0);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(u + du).toBeLessThanOrEqual(1);
    expect(v + dv).toBeLessThanOrEqual(1);
    const overlaps = u < UV_DOT[0] + UV_DOT[2] && UV_DOT[0] < u + du && v < UV_DOT[1] + UV_DOT[3] && UV_DOT[1] < v + dv;
    expect(overlaps).toBe(false);
  });

  it('keeps a particle low over the floor when it is asked to (dust), and not otherwise', () => {
    fx.reset();
    fx.burst(100, 100, 0, { count: 3, colors: ['#fff'], speed: [1, 2], life: [100, 200], low: true });
    expect(fx.particles.length).toBeGreaterThan(0);
    expect(fx.particles.every((p) => p.low === true)).toBe(true);
    fx.reset();
    fx.burst(100, 100, 0, { count: 3, colors: ['#fff'], speed: [1, 2], life: [100, 200] });
    expect(fx.particles.every((p) => p.low === undefined)).toBe(true);
    fx.reset();
  });

  it('is off at low and min for the dust and the splash (they are particles)', () => {
    expect(TIERS.map((t) => [t.name, t.particles])).toEqual([['high', true], ['mid', true], ['low', false], ['min', false]]);
  });
});
