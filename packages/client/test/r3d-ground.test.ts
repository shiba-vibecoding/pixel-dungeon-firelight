import { describe, expect, it } from 'vitest';
import { Texture } from 'three';
import { fx } from '../src/fx';
import sharp from 'sharp';
import { type Footprint, MAX_GAP, footprintOfAlpha, gapOfAlpha, gapRows } from '../src/r3d/feet';
import { subImageSupported } from '../src/r3d/texsub';
import { type Contact, WATER_BLOB, WATER_CONTACT, contactAt, pixelDepth } from '../src/r3d/contact';
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

describe('the contact shadow touches the soles (contact.ts)', () => {
  const read = async (path: string): Promise<{ alpha: Uint8Array; width: number; height: number }> => {
    const { data, info } = await sharp(new URL(`../public/assets/${path}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = new Uint8Array(info.width * info.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
    return { alpha, width: info.width, height: info.height };
  };
  const out: Contact = { x: 0, z: 0, width: 0, depth: 0 };
  const foot: Footprint = { lo: 0, hi: 0, gap: 0 };
  /** The floor depth of one art pixel on the screen. */
  const px = pixelDepth();

  it('finds the columns of the lowest opaque row and the row over it, and the clear rows under them', () => {
    const a = new Uint8Array(12 * 15);
    for (let col = 2; col < 6; col++) a[13 * 12 + col] = 255;
    // A foot lifted by one row (the other foot is on the floor).
    for (let col = 8; col < 10; col++) a[12 * 12 + col] = 255;
    expect(footprintOfAlpha(a, 12, 0, 0, 12, 15, foot)).toBe(true);
    expect(foot).toEqual({ lo: 2, hi: 9, gap: 1 });
    expect(footprintOfAlpha(new Uint8Array(12 * 15), 12, 0, 0, 12, 15, foot)).toBe(false);
  });

  it('is centred on the feet, as wide as them, with its top edge over the soles and no slip', () => {
    contactAt(5, 7, 3, 8, 12, false, 1, false, out);
    expect(out.x).toBeCloseTo(5, 6);
    expect(out.width).toBeGreaterThanOrEqual(6 / 16);
    // Its top edge is above the line under the soles by more than half a pixel (so it lies behind the lowest row), and it shows below it.
    expect(out.z - out.depth / 2).toBeLessThan(7 - 0.5 * px);
    expect(out.z + out.depth / 2).toBeGreaterThan(7 + 1 * px);
    // Feet to the right of the middle of the picture shift it, and a mirrored figure shifts it the other way.
    contactAt(5, 7, 6, 11, 12, false, 1, false, out);
    expect(out.x).toBeCloseTo(5 + 3 / 16, 6);
    contactAt(5, 7, 6, 11, 12, true, 1, false, out);
    expect(out.x).toBeCloseTo(5 - 3 / 16, 6);
  });

  it('starts at the waterline, a row up, when wading (the lowest row is under the surface)', () => {
    const dry = { ...contactAt(5, 7, 3, 8, 12, false, 1, false, out) };
    const wet = contactAt(5, 7, 3, 8, 12, false, 1, true, out);
    expect(dry.z - dry.depth / 2 - (wet.z - wet.depth / 2)).toBeCloseTo(px, 6);
    expect(WATER_CONTACT).toBeLessThan(0.5);
    expect(WATER_BLOB).toBeLessThan(0.5);
  });

  it('holds for every frame of the hero and the rat, from the side, the front and the back', async () => {
    const sheets: Array<[string, number, number]> = [];
    for (const hero of ['warrior', 'mage', 'rogue', 'ranger']) sheets.push([`${hero}.png`, 12, 15]);
    for (const hero of ['mage', 'ranger', 'rogue', 'warrior']) for (const view of ['front', 'back']) sheets.push([`dirs/${hero}-${view}.png`, 12, 15]);
    sheets.push(['rat.png', 16, 15], ['dirs/rat-front.png', 16, 15], ['dirs/rat-back.png', 16, 15]);
    let frames = 0;
    for (const [path, w, h] of sheets) {
      let img;
      try {
        img = await read(path);
      } catch {
        continue;
      }
      for (let row = 0; row + h <= img.height; row += h) {
        for (let col = 0; col + w <= img.width; col += w) {
          if (!footprintOfAlpha(img.alpha, img.width, col, row, w, h, foot)) continue;
          frames++;
          for (const flip of [false, true]) {
            contactAt(0, 0, foot.lo, foot.hi, w, flip, 1, false, out);
            const what = `${path} frame ${col / w},${row / h}${flip ? ' flipped' : ''}`;
            // Where the feet are on the screen across, in the picture's own columns (mirrored if flipped).
            const left = flip ? (w - 1 - foot.hi) : foot.lo;
            const right = flip ? (w - foot.lo) : foot.hi + 1;
            const centre = ((left + right) / 2 - w / 2) / 16;
            expect(Math.abs(out.x - centre), `${what}: centred under the feet`).toBeLessThan(1e-9);
            expect(out.x - out.width / 2, `${what}: wide enough, left`).toBeLessThanOrEqual(left / 16 - w / 32 + 1e-9);
            expect(out.x + out.width / 2, `${what}: wide enough, right`).toBeGreaterThanOrEqual(right / 16 - w / 32 - 1e-9);
            // Its top edge is over the lowest row of the feet (which is one pixel high, above the soles' line at z 0) and it shows under it.
            expect(out.z - out.depth / 2, `${what}: overlaps the soles`).toBeLessThanOrEqual(-0.5 * px);
            expect(out.z - out.depth / 2, `${what}: not floating above them`).toBeGreaterThanOrEqual(-2 * px);
            expect(out.z + out.depth / 2, `${what}: shows below the soles`).toBeGreaterThanOrEqual(1.5 * px);
          }
        }
      }
    }
    expect(frames).toBeGreaterThan(40);
  });
});

describe('the rectangle uploads fall back to whole textures when unsure (texsub.ts)', () => {
  const fakeRenderer = (gl: unknown): Parameters<typeof subImageSupported>[0] =>
    ({ getContext: () => gl, state: { bindTexture: () => undefined, unbindTexture: () => undefined } }) as unknown as Parameters<typeof subImageSupported>[0];

  it('says no for a context that is not WebGL 2, one that throws, and one that gives back the wrong pixels', () => {
    expect(subImageSupported(fakeRenderer({}))).toBe(false);
    expect(subImageSupported(fakeRenderer({ texStorage2D: () => undefined, readPixels: () => undefined, getError: () => { throw new Error('lost'); } }))).toBe(false);
    // A card that takes the calls but returns zeros (the rectangle never landed).
    const gl: Record<string, unknown> = {
      texStorage2D: () => undefined, readPixels: () => undefined, getError: () => 0, NO_ERROR: 0, createTexture: () => ({}), createFramebuffer: () => ({}),
      pixelStorei: () => undefined, texImage2D: () => undefined, texParameteri: () => undefined, texSubImage2D: () => undefined, getParameter: () => null,
      bindFramebuffer: () => undefined, framebufferTexture2D: () => undefined, checkFramebufferStatus: () => 36053, FRAMEBUFFER_COMPLETE: 36053,
      deleteFramebuffer: () => undefined, deleteTexture: () => undefined,
    };
    expect(subImageSupported(fakeRenderer(gl))).toBe(false);
  });

  it('says yes for a context that puts the rectangle where it should (flipped) and remembers the answer', () => {
    // A 4 x 4 texture kept in memory, written by texSubImage2D with the flip, read by readPixels.
    const tex = new Uint8Array(4 * 4 * 4);
    let flip = false;
    let calls = 0;
    const gl: Record<string, unknown> = {
      texStorage2D: () => undefined, getError: () => 0, NO_ERROR: 0, createTexture: () => ({}), createFramebuffer: () => ({}),
      UNPACK_FLIP_Y_WEBGL: 1, pixelStorei: (k: number, v: boolean) => { if (k === 1) flip = v; },
      texImage2D: () => { calls++; tex.fill(0); },
      texParameteri: () => undefined,
      texSubImage2D: (_t: number, _l: number, x: number, y: number, w: number, h: number, _f: number, _ty: number, data: Uint8Array) => {
        for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
          const from = ((flip ? h - 1 - row : row) * w + col) * 4;
          for (let c = 0; c < 4; c++) tex[((y + row) * 4 + x + col) * 4 + c] = data[from + c]!;
        }
      },
      getParameter: () => null, bindFramebuffer: () => undefined, framebufferTexture2D: () => undefined, checkFramebufferStatus: () => 1, FRAMEBUFFER_COMPLETE: 1,
      readPixels: (x: number, y: number, _w: number, _h: number, _f: number, _t: number, out: Uint8Array) => { for (let c = 0; c < 4; c++) out[c] = tex[(y * 4 + x) * 4 + c]!; },
      deleteFramebuffer: () => undefined, deleteTexture: () => undefined,
    };
    const renderer = fakeRenderer(gl);
    expect(subImageSupported(renderer)).toBe(true);
    expect(subImageSupported(renderer)).toBe(true);
    expect(calls).toBe(1);
  });
});
