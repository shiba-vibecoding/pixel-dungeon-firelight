import { describe, expect, it } from 'vitest';
import type { Texture, WebGLRenderer } from 'three';
import { fx } from '../src/fx';
import { BloodWater } from '../src/r3d/bloodwater';
import { Governor } from '../src/r3d/governor';
import { subImage } from '../src/r3d/texsub';
import { still } from '../src/r3d/quadbatch';

describe('the governor judges slow frames too', () => {
  const run = (governor: Governor, dt: number, hz: number, seconds: number): string[] => {
    const verdicts: string[] = [];
    for (let t = 0; t < seconds * 1000; t += Math.min(dt, 250)) {
      const v = governor.frame(dt, hz);
      if (v !== 'ok') verdicts.push(v);
    }
    return verdicts;
  };

  it('steps down a phone that draws four frames a second (these frames used to be taken for a hidden tab and ignored)', () => {
    const g = new Governor();
    expect(run(g, 300, 60, 12)).toEqual(['demote', 'demote', 'demote']);
    expect(g.tier.name).toBe('min');
  });

  it('decides at once, within half a second, when the frames are hopeless, and not that fast when they are only late', () => {
    const hopeless = new Governor();
    let frames = 0;
    while (hopeless.frame(80, 60) === 'ok' && frames < 100) frames++;
    expect(frames * 80).toBeLessThanOrEqual(600);
    const late = new Governor();
    frames = 0;
    while (late.frame(25, 60) === 'ok' && frames < 200) frames++;
    expect(frames * 25).toBeGreaterThanOrEqual(900);
  });

  it('still does not count a hidden tab or a window over the map', () => {
    const g = new Governor();
    for (let i = 0; i < 100; i++) expect(g.frame(5000, 60)).toBe('ok');
    expect(g.tier.name).toBe('high');
  });

  it('counts a long frame as 250 ms, and a hold is spent on them too', () => {
    const g = new Governor();
    g.hold(1000);
    let n = 0;
    while (g.frame(400, 60) === 'ok' && n < 20) n++;
    // 1000 ms of hold goes in 4 frames of 250, then the verdict comes after the hopeless 400 ms.
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(8);
  });

  it('holds a tier that keeps the refresh, however long it runs, and never goes back up', () => {
    const g = new Governor();
    expect(run(g, 1000 / 60, 60, 60)).toEqual([]);
    expect(g.tier.name).toBe('high');
  });
});

describe('the blood in the water is read 15 times a second, not every frame', () => {
  it('samples the clouds at most every 66 ms while the same ones are alive', () => {
    fx.reset();
    (fx as unknown as { isWater: () => boolean }).isWater = () => true;
    const water = new BloodWater();
    fx.bleedWater(100, 100, 0, 6, 3);
    water.update(0);
    const first = water.texture.version;
    water.update(20);
    water.update(50);
    expect(water.texture.version).toBe(first);
    water.update(70);
    expect(water.texture.version).toBeGreaterThan(first);
    // A new cloud is read at once.
    const second = water.texture.version;
    fx.bleedWater(200, 200, 71, 6, 3);
    water.update(72);
    expect(water.texture.version).toBeGreaterThan(second);
    fx.reset();
    delete (fx as unknown as { isWater?: () => boolean }).isWater;
  });
});

describe('a rectangle of pixels into a texture on the card (texsub.ts)', () => {
  const fake = (onCard: boolean): { renderer: WebGLRenderer; calls: string[] } => {
    const calls: string[] = [];
    const gl = {
      TEXTURE_2D: 1, UNPACK_FLIP_Y_WEBGL: 2, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 3, UNPACK_ALIGNMENT: 4, RGBA: 5, UNSIGNED_BYTE: 6,
      pixelStorei: (k: number, v: unknown) => calls.push(`store ${k} ${String(v)}`),
      texSubImage2D: (...a: unknown[]) => calls.push(`sub ${a.slice(1, 6).join(',')}`),
    };
    const renderer = {
      properties: { get: () => (onCard ? { __webglTexture: {} } : {}) },
      getContext: () => gl,
      state: { bindTexture: () => calls.push('bind') },
    } as unknown as WebGLRenderer;
    return { renderer, calls };
  };

  it('binds, sets the three unpack settings and sends, with no round trip to the card', () => {
    const { renderer, calls } = fake(true);
    const ok = subImage(renderer, { flipY: true } as Texture, 8, 4, 16, 12, new Uint8Array(16 * 12 * 4));
    expect(ok).toBe(true);
    expect(calls).toEqual(['bind', 'store 2 true', 'store 3 false', 'store 4 1', 'sub 0,8,4,16,12']);
  });

  it('does nothing for a texture the card does not have yet', () => {
    const { renderer, calls } = fake(false);
    expect(subImage(renderer, { flipY: true } as Texture, 0, 0, 1, 1, new Uint8Array(4))).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('meshes that never move', () => {
  it('are left out of the scene\'s walk for good', () => {
    const o = { matrixAutoUpdate: true, matrixWorldAutoUpdate: true };
    expect(still(o)).toBe(o);
    expect(o).toEqual({ matrixAutoUpdate: false, matrixWorldAutoUpdate: false });
  });
});
