import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/catalog';
import {
  type Art, applyFilter, compose, drawFrame, filterTransform, emptyLook, FRAME_SIZE, MAX_SIDE, moveSticker, nextSpot, photoLayout, PHOTO_FILTERS,
  type PhotoArt, type PhotoLook, type PlacedSticker, scaleSticker, STICKER_MAX, STICKER_MIN, stickerAt, stickerBox, workingSize,
} from '../src/photo';

const art = (width: number, height: number, name = 'art'): Art => ({ width, height, name }) as unknown as Art;

type Call = { op: string; args: unknown[] };
/** A canvas context that only writes down what it is told. */
function fakeContext(): { g: CanvasRenderingContext2D; calls: Call[]; smoothing: boolean[] } {
  const calls: Call[] = [];
  const smoothing: boolean[] = [];
  const state: Record<string, unknown> = { imageSmoothingEnabled: true };
  const g = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push({ op: key, args });
        if (key === 'drawImage') smoothing.push(state.imageSmoothingEnabled as boolean);
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return { g: g as unknown as CanvasRenderingContext2D, calls, smoothing };
}

const sticker = (patch: Partial<PlacedSticker> = {}): PlacedSticker => ({ uid: 1, id: 'sticker.fire', x: 0.5, y: 0.5, k: 2, ...patch });
const sources = (calls: Call[]): string[] => calls.filter((c) => c.op === 'drawImage').map((c) => (c.args[0] as unknown as { name: string }).name);

describe('the photo layout', () => {
  it('makes the art pixel a whole number of device pixels, about a hundred-and-tenth of the short side', () => {
    expect(photoLayout(1125, 2436)).toMatchObject({ unit: 10, border: 80 });
    expect(photoLayout(1920, 1200).unit).toBe(11);
    expect(photoLayout(100, 100).unit).toBe(1);
    expect(photoLayout(100, 100).markPx).toBeGreaterThanOrEqual(1);
    for (const [w, h] of [[375, 812], [1280, 800], [1080, 1920], [4000, 4000]] as const) {
      const layout = photoLayout(w, h);
      expect(Number.isInteger(layout.unit) && Number.isInteger(layout.border) && Number.isInteger(layout.markPx)).toBe(true);
    }
  });

  it('keeps the picture within the largest side: pixel art in whole steps up, other pictures scaled down', () => {
    // A camp scene of 190 x 400 scene pixels: three steps already make its long side 1200, over a thousand.
    expect(workingSize(190, 400, true)).toEqual({ width: 570, height: 1200, scale: 3 });
    // One whose long side is a little over 1920 / 2 is made no larger than the limit.
    expect(workingSize(100, 700, true)).toEqual({ width: 200, height: 1400, scale: 2 });
    // A small scene is made over a thousand pixels across its long side.
    expect(workingSize(86, 70, true)).toEqual({ width: 86 * 13, height: 70 * 13, scale: 13 });
    // The picture is never made smaller than itself in a pixel art step.
    expect(workingSize(3000, 3000, true).scale).toBe(1);
    expect(workingSize(1125, 2436, false)).toEqual({ width: 887, height: 1920, scale: 1920 / 2436 });
    expect(workingSize(800, 600, false)).toEqual({ width: 800, height: 600, scale: 1 });
    for (const [w, h] of [[375, 812], [2436, 1125], [5000, 100]] as const) {
      const size = workingSize(w, h, false);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(MAX_SIDE);
    }
  });
});

describe('stickers', () => {
  const fire = art(16, 16, 'fire');
  const all: PhotoArt = { frames: {}, stickers: { 'sticker.fire': fire, 'sticker.crown': art(16, 16, 'crown') } };

  it('sit with their middle where they are put, a whole number of pixels per art pixel', () => {
    const box = stickerBox(sticker({ x: 0.5, y: 0.25, k: 1.5 }), 1000, 2000, fire);
    // unit 9 at 1000 wide, 1.5 of it rounds to 14.
    expect(box.px).toBe(14);
    expect(box).toMatchObject({ w: 224, h: 224, x: 500 - 112, y: 500 - 112 });
    expect(stickerBox(sticker({ k: STICKER_MIN }), 40, 40, fire).px).toBe(1);
  });

  it('are found under a touch, the topmost first, and not outside their box', () => {
    const look: PhotoLook = { ...emptyLook(), stickers: [sticker({ uid: 1, id: 'sticker.fire' }), sticker({ uid: 2, id: 'sticker.crown', x: 0.52 })] };
    const box = stickerBox(look.stickers[1]!, 1000, 1000, art(16, 16));
    expect(stickerAt(look, 1000, 1000, all, 520, 500)).toBe(1);
    expect(stickerAt(look, 1000, 1000, all, box.x - 5, 500)).toBe(0);
    expect(stickerAt(look, 1000, 1000, all, 5, 5)).toBe(-1);
    // A sticker whose art has not come is not there to be touched.
    expect(stickerAt(look, 1000, 1000, { frames: {}, stickers: {} }, 500, 500)).toBe(-1);
  });

  it('move by fractions of the picture and stay on it; scale within limits', () => {
    expect(moveSticker(sticker(), 0.1, -0.2)).toMatchObject({ x: 0.6, y: 0.3 });
    expect(moveSticker(sticker(), 5, -5)).toMatchObject({ x: 1, y: 0 });
    expect(scaleSticker(sticker({ k: 2 }), 1.25).k).toBe(2.5);
    expect(scaleSticker(sticker({ k: 2 }), 100).k).toBe(STICKER_MAX);
    expect(scaleSticker(sticker({ k: 2 }), 0.001).k).toBe(STICKER_MIN);
    // A sticker is never changed in place.
    const s = sticker();
    moveSticker(s, 0.3, 0.3);
    scaleSticker(s, 2);
    expect(s).toEqual(sticker());
  });

  it('are put round the middle, each in a place of its own, the middle last', () => {
    const spots = Array.from({ length: 7 }, (_, i) => nextSpot(i));
    expect(spots[0]).not.toEqual({ x: 0.5, y: 0.5 });
    expect(spots[6]).toEqual({ x: 0.5, y: 0.5 });
    expect(new Set(spots.map((p) => `${p.x},${p.y}`)).size).toBe(7);
    for (const p of spots) expect(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1).toBe(true);
  });
});

describe('filters', () => {
  const run = (filter: Parameters<typeof applyFilter>[1], rgba: number[]): number[] => {
    const data = new Uint8ClampedArray(rgba);
    applyFilter(data, filter);
    return [...data];
  };

  it('leave a picture alone with none, and the alpha alone with any', () => {
    expect(run('none', [10, 200, 90, 255])).toEqual([10, 200, 90, 255]);
    for (const filter of PHOTO_FILTERS) expect(run(filter, [10, 200, 90, 77])[3]).toBe(77);
    expect(filterTransform('none').a).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('noir takes the colour out, and keeps the light and dark apart', () => {
    for (const rgba of [[200, 40, 40, 255], [30, 90, 200, 255], [250, 250, 20, 255]]) {
      const [r, g, b] = run('noir', rgba);
      expect(r).toBe(g);
      expect(g).toBe(b);
    }
    const [dark] = run('noir', [20, 20, 20, 255]);
    const [light] = run('noir', [220, 220, 220, 255]);
    expect(light! - dark!).toBeGreaterThan(200 - 20);
  });

  it('warm leans to red, dream is brighter and louder than the picture', () => {
    const [r, , b] = run('warm', [128, 128, 128, 255]);
    expect(r).toBeGreaterThan(b!);
    const grey = run('dream', [100, 100, 100, 255]);
    expect(grey[0]).toBeGreaterThan(100);
    const [dr, dg, db] = run('dream', [200, 80, 80, 255]);
    expect(Math.max(dr!, dg!, db!) - Math.min(dr!, dg!, db!)).toBeGreaterThan(120);
  });

  it('are the CSS filters of the design, worked out: grayscale and brightness agree with their definitions', () => {
    // brightness(.92) after contrast(1.3) after grayscale(1): mid grey 128 -> ((128 - 127.5) * 1.3 + 127.5) * .92
    const [v] = run('noir', [128, 128, 128, 255]);
    expect(v).toBe(Math.round(((128 - 127.5) * 1.3 + 127.5) * 0.92));
  });
});

describe('composing', () => {
  const base = art(100, 200, 'base');
  const frame = art(FRAME_SIZE, FRAME_SIZE, 'frame');
  const fire = art(16, 16, 'fire');
  const full: PhotoArt = { frames: { 'photo.gilded': frame }, stickers: { 'sticker.fire': fire }, mark: art(89, 32, 'mark') };

  it('draws the frame as eight pieces over the edge: corners whole, sides stretched', () => {
    const { g, calls } = fakeContext();
    drawFrame(g, frame, 400, 800, 40);
    const draws = calls.filter((c) => c.op === 'drawImage').map((c) => c.args.slice(1) as number[]);
    expect(draws).toHaveLength(8);
    // Top left corner: the art's 8 x 8 into 40 x 40; the top side: its middle 8 x 8 stretched across.
    expect(draws).toContainEqual([0, 0, 8, 8, 0, 0, 40, 40]);
    expect(draws).toContainEqual([8, 0, 8, 8, 40, 0, 320, 40]);
    expect(draws).toContainEqual([0, 8, 8, 8, 0, 40, 40, 720]);
    expect(draws).toContainEqual([16, 16, 8, 8, 360, 760, 40, 40]);
  });

  it('draws the snapshot, then the frame, then the stickers in the order they were put, then the logo', () => {
    const { g, calls } = fakeContext();
    const look: PhotoLook = { filter: 'none', frame: 'photo.gilded', stickers: [sticker({ uid: 1 }), sticker({ uid: 2, x: 0.2 })] };
    compose(g, base, false, look, full, 100, 200);
    const names = sources(calls);
    expect(names[0]).toBe('base');
    expect(names.slice(1, 9)).toEqual(Array(8).fill('frame'));
    expect(names.slice(9, 11)).toEqual(['fire', 'fire']);
    expect(names[11]).toBe('mark');
    expect(names).toHaveLength(12);
    // The logo stands in the lower right corner, inside the frame's border.
    const mark = calls.filter((c) => c.op === 'drawImage').at(-1)!.args as number[];
    const layout = photoLayout(100, 200);
    expect(mark[5]! + mark[7]!).toBe(100 - layout.border - layout.margin);
    expect(mark[6]! + mark[8]!).toBe(200 - layout.border - layout.margin);
  });

  it('draws pixel art without smoothing, and the snapshot with it only if it is not pixel art', () => {
    const smooth = fakeContext();
    compose(smooth.g, base, true, { ...emptyLook(), frame: 'photo.gilded', stickers: [sticker()] }, full, 100, 200);
    expect(smooth.smoothing[0]).toBe(true);
    expect(smooth.smoothing.slice(1).every((on) => !on)).toBe(true);
    const crisp = fakeContext();
    compose(crisp.g, base, false, emptyLook(), full, 100, 200);
    expect(crisp.smoothing[0]).toBe(false);
  });

  it('leaves out what is not chosen or not there: no frame, a sticker whose art has not come, no logo', () => {
    const { g, calls } = fakeContext();
    compose(g, base, false, { filter: 'warm', frame: null, stickers: [sticker({ id: 'sticker.crown' })] }, { frames: full.frames, stickers: full.stickers }, 100, 200);
    expect(sources(calls)).toEqual(['base']);
    const unknown = fakeContext();
    compose(unknown.g, base, false, { ...emptyLook(), frame: 'photo.nothing' }, full, 100, 200);
    expect(sources(unknown.calls)).toEqual(['base', 'mark']);
  });

  it('lets the caller write a caption inside the frame, and can leave the logo off', () => {
    const { g, calls } = fakeContext();
    let at: number[] = [];
    compose(g, base, false, { ...emptyLook(), frame: 'photo.gilded' }, full, 100, 200, { caption: (_c, x, y, unit) => { at = [x, y, unit]; }, mark: false });
    const layout = photoLayout(100, 200);
    expect(at).toEqual([layout.border + layout.margin, layout.border + layout.margin, layout.unit]);
    expect(sources(calls)).not.toContain('mark');
  });
});

describe('the shop’s frames and stickers', () => {
  const designer = JSON.parse(readFileSync(new URL('../public/assets/mart/fl/catalog.json', import.meta.url), 'utf8')) as {
    items: Array<{ sku: string; kind: string; sprite?: string }>;
  };
  it('each have the art the photo mode draws with, in the designer’s folder', () => {
    const sold = CATALOG.filter((item) => item.category === 'photoframe' || item.category === 'sticker');
    expect(sold.length).toBe(18);
    for (const item of sold) {
      const raw = designer.items.find((entry) => entry.sku === item.id);
      expect(raw?.sprite, item.id).toBeTruthy();
      expect(existsSync(new URL(`../public/assets/${raw!.sprite}`, import.meta.url)), item.id).toBe(true);
    }
    for (const path of ['ui/fl-photo-frame.png', 'brand/logo-en.png', 'brand/logo-ru.png', 'ui/fl-camera.png']) {
      expect(existsSync(new URL(`../public/assets/${path}`, import.meta.url)), path).toBe(true);
    }
  });
});
