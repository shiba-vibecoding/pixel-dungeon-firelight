/*
 * The photo mode's composer: what a snapshot, a filter, a frame and stickers make together, as one PNG. No page, no game in here: the
 * screen (photoui.ts) holds the state and the pictures, and this draws them, the same way for the preview and for the file, so that
 * what is on screen is what is saved.
 *
 * Everything is placed by fractions of the picture (a sticker's middle, its size against the picture's) and by one «unit», the size of
 * a pixel of the art on this picture, a whole number of device pixels: so frames and stickers are crisp (nearest), whatever the size
 * of the snapshot, and the same picture drawn smaller or larger is the same picture.
 *
 * The filters are the design's (`.fl-filter-warm` and the others in ui.css) worked out on the pixels, not given to the canvas as a CSS
 * `filter`: not every webview draws with `ctx.filter` (iOS did not for years), and a file must come out the way the preview was.
 */

export type PhotoFilter = 'none' | 'warm' | 'noir' | 'dream';
export const PHOTO_FILTERS: readonly PhotoFilter[] = ['none', 'warm', 'noir', 'dream'];

/** A picture the composer can draw (an <img>, a canvas, or, in tests, anything with a size). */
export type Art = CanvasImageSource & { width: number; height: number };

/** The frame art: 24 x 24, the 8 pixels at its edges are the frame, the rest is the hole. */
export const FRAME_SIZE = 24;
export const FRAME_SLICE = 8;

/** The stickers are 16 x 16 pixels of art. */
export const STICKER_SIZE = 16;

/** The largest side of what is made (pixels): a phone's whole screen for a story is 1080 x 1920. */
export const MAX_SIDE = 1920;

/** How far a sticker may be made smaller or larger (a factor of the unit). */
export const STICKER_MIN = 0.5;
export const STICKER_MAX = 6;
export const STICKER_START = 2;
/** Most stickers on one picture. */
export const STICKERS_MAX = 24;

export interface PlacedSticker {
  /** Told apart from another of the same kind. */
  uid: number;
  /** The catalogue's id (`sticker.fire`). */
  id: string;
  /** Its middle, as a fraction of the picture's width and height (0 to 1). */
  x: number;
  y: number;
  /** Its size: a factor of the unit (the art pixel of the picture). */
  k: number;
}

export interface PhotoLook {
  filter: PhotoFilter;
  /** The frame's art key (`photo.gilded`, or `plain`), or null for none. */
  frame: string | null;
  stickers: PlacedSticker[];
}

/** The pictures the composer draws with, by the keys the look names. */
export interface PhotoArt {
  frames: Readonly<Record<string, Art | undefined>>;
  stickers: Readonly<Record<string, Art | undefined>>;
  /** The game's logo, in the player's language, for the corner. */
  mark?: Art | undefined;
}

export const emptyLook = (): PhotoLook => ({ filter: 'none', frame: null, stickers: [] });

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/* ---- Where things go ---- */

export interface PhotoLayout {
  /** Device pixels to one pixel of the art. */
  unit: number;
  /** The frame's thickness. */
  border: number;
  /** Device pixels to one pixel of the logo. */
  markPx: number;
  /** The gap between the border and what stands in the corners. */
  margin: number;
}

/** The size things are drawn at on a picture of this size: a frame's pixel is about a hundred-and-tenth of its short side. */
export function photoLayout(width: number, height: number): PhotoLayout {
  const short = Math.min(width, height);
  const unit = clamp(Math.round(short / 110), 1, 14);
  return { unit, border: FRAME_SLICE * unit, markPx: Math.max(1, Math.round((short * 0.26) / 89)), margin: unit * 2 };
}

/** The size to make a picture of this size at: the most it may be, in whole steps of the source's pixels when it is pixel art. */
export function workingSize(width: number, height: number, pixelArt: boolean): { width: number; height: number; scale: number } {
  const long = Math.max(width, height);
  if (pixelArt) {
    // Whole steps up, so that every pixel of the source stays a clean block: as many as keep it under the largest side, and a
    // thousand pixels or more where the source allows.
    const steps = Math.max(1, Math.min(Math.ceil(1080 / long), Math.floor(MAX_SIDE / long)));
    return { width: width * steps, height: height * steps, scale: steps };
  }
  const scale = Math.min(1, MAX_SIDE / long);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

/** A sticker's box on a picture of this size, in its pixels. */
export function stickerBox(sticker: PlacedSticker, width: number, height: number, art: Art): { x: number; y: number; w: number; h: number; px: number } {
  const px = Math.max(1, Math.round(sticker.k * photoLayout(width, height).unit));
  const w = art.width * px;
  const h = art.height * px;
  return { x: Math.round(sticker.x * width - w / 2), y: Math.round(sticker.y * height - h / 2), w, h, px };
}

/** The sticker under a point (the topmost, which is the last), or -1. */
export function stickerAt(look: PhotoLook, width: number, height: number, art: PhotoArt, x: number, y: number): number {
  for (let i = look.stickers.length - 1; i >= 0; i--) {
    const sticker = look.stickers[i]!;
    const picture = art.stickers[sticker.id];
    if (!picture) continue;
    const box = stickerBox(sticker, width, height, picture);
    if (x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h) return i;
  }
  return -1;
}

/** A sticker moved by a fraction of the picture; its middle stays on the picture. */
export function moveSticker(sticker: PlacedSticker, dx: number, dy: number): PlacedSticker {
  return { ...sticker, x: clamp(sticker.x + dx, 0, 1), y: clamp(sticker.y + dy, 0, 1) };
}

/** A sticker made larger or smaller by a factor (1.25: a quarter larger); kept between the least and the most. */
export function scaleSticker(sticker: PlacedSticker, factor: number): PlacedSticker {
  return { ...sticker, k: clamp(sticker.k * factor, STICKER_MIN, STICKER_MAX) };
}

/**
 * Where the next sticker goes: round the middle, not on it (the hero stands about there), each in a corner of its own so that they do
 * not hide one another; the middle itself last.
 */
export function nextSpot(count: number): { x: number; y: number } {
  const spots: ReadonlyArray<readonly [number, number]> = [[0.72, 0.3], [0.28, 0.3], [0.72, 0.7], [0.28, 0.7], [0.5, 0.17], [0.5, 0.83], [0.5, 0.5]];
  const [x, y] = spots[count % spots.length]!;
  return { x, y };
}

/* ---- The filters ---- */

/** A colour change: out = A x in + b (b in 0..255 units), A row by row. */
export interface Transform {
  a: readonly number[];
  b: readonly number[];
}

const IDENTITY: Transform = { a: [1, 0, 0, 0, 1, 0, 0, 0, 1], b: [0, 0, 0] };

/** `second` after `first`. */
function then(first: Transform, second: Transform): Transform {
  const a: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      a.push(second.a[row * 3]! * first.a[col]! + second.a[row * 3 + 1]! * first.a[3 + col]! + second.a[row * 3 + 2]! * first.a[6 + col]!);
    }
  }
  const b = [0, 1, 2].map((row) => second.a[row * 3]! * first.b[0]! + second.a[row * 3 + 1]! * first.b[1]! + second.a[row * 3 + 2]! * first.b[2]! + second.b[row]!);
  return { a, b };
}

/* The CSS filter functions (Filter Effects Module): the same matrices, so that the preview in the shop, which is CSS, and the file agree. */
const sepia = (amount: number): Transform => {
  const k = 1 - clamp(amount, 0, 1);
  return {
    a: [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k],
    b: [0, 0, 0],
  };
};
const grayscale = (amount: number): Transform => {
  const k = 1 - clamp(amount, 0, 1);
  return {
    a: [0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k, 0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k, 0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k],
    b: [0, 0, 0],
  };
};
const saturate = (s: number): Transform => ({
  a: [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  b: [0, 0, 0],
});
const hueRotate = (degrees: number): Transform => {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return {
    a: [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
    ],
    b: [0, 0, 0],
  };
};
const brightness = (factor: number): Transform => ({ a: [factor, 0, 0, 0, factor, 0, 0, 0, factor], b: [0, 0, 0] });
const contrast = (factor: number): Transform => {
  const offset = (0.5 - 0.5 * factor) * 255;
  return { a: [factor, 0, 0, 0, factor, 0, 0, 0, factor], b: [offset, offset, offset] };
};

const chain = (...steps: Transform[]): Transform => steps.reduce(then, IDENTITY);

/** Each filter as the design writes it in ui.css (.fl-filter-warm and the others). */
const TRANSFORMS: Record<PhotoFilter, Transform> = {
  none: IDENTITY,
  warm: chain(sepia(0.35), saturate(1.25), hueRotate(-12), brightness(1.06)),
  noir: chain(grayscale(1), contrast(1.3), brightness(0.92)),
  dream: chain(saturate(1.35), hueRotate(14), brightness(1.1), contrast(0.92)),
};

export const filterTransform = (filter: PhotoFilter): Transform => TRANSFORMS[filter];

/** A filter on RGBA pixels, in place (alpha untouched). */
export function applyFilter(data: Uint8ClampedArray, filter: PhotoFilter): void {
  if (filter === 'none') return;
  const { a, b } = TRANSFORMS[filter];
  const [a0, a1, a2, a3, a4, a5, a6, a7, a8] = a as [number, number, number, number, number, number, number, number, number];
  const [b0, b1, b2] = b as [number, number, number];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const bl = data[i + 2]!;
    // A Uint8ClampedArray clamps to 0..255 and rounds on assignment.
    data[i] = a0 * r + a1 * g + a2 * bl + b0;
    data[i + 1] = a3 * r + a4 * g + a5 * bl + b1;
    data[i + 2] = a6 * r + a7 * g + a8 * bl + b2;
  }
}

/* ---- Drawing ---- */

/** The frame's art drawn over the edges of the picture: the corners as they are, the sides stretched (the design's border-image, slice 8, stretch). */
export function drawFrame(g: CanvasRenderingContext2D, frame: Art, width: number, height: number, border: number): void {
  const s = FRAME_SLICE;
  const inner = FRAME_SIZE - 2 * s;
  const fw = frame.width;
  // Art of another size than 24 is cut by the same eighths.
  const k = fw / FRAME_SIZE;
  const e = s * k;
  const m = inner * k;
  const pieces: ReadonlyArray<readonly [number, number, number, number, number, number, number, number]> = [
    [0, 0, e, e, 0, 0, border, border],
    [fw - e, 0, e, e, width - border, 0, border, border],
    [0, fw - e, e, e, 0, height - border, border, border],
    [fw - e, fw - e, e, e, width - border, height - border, border, border],
    [e, 0, m, e, border, 0, width - 2 * border, border],
    [e, fw - e, m, e, border, height - border, width - 2 * border, border],
    [0, e, e, m, 0, border, border, height - 2 * border],
    [fw - e, e, e, m, width - border, border, border, height - 2 * border],
  ];
  for (const [sx, sy, sw, sh, dx, dy, dw, dh] of pieces) g.drawImage(frame, sx, sy, sw, sh, dx, dy, dw, dh);
}

export interface ComposeOptions {
  /** The line in the frame's top corner (the depth and the place); drawn by this. */
  caption?: (g: CanvasRenderingContext2D, x: number, y: number, unit: number) => void;
  /** Draw the logo in the corner (the saved picture has it, so does the preview). */
  mark?: boolean;
}

/**
 * Draws the picture into a canvas context the size of the picture: the snapshot (with its filter already on it), the frame, the stickers
 * in the order they were put, the caption and the logo. Pixel art is drawn without smoothing; the snapshot itself with it, unless it is
 * itself pixel art (`smooth`).
 */
export function compose(
  g: CanvasRenderingContext2D, base: Art, smooth: boolean, look: PhotoLook, art: PhotoArt, width: number, height: number, options: ComposeOptions = {},
): void {
  const layout = photoLayout(width, height);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, width, height);
  g.imageSmoothingEnabled = smooth;
  g.drawImage(base, 0, 0, base.width, base.height, 0, 0, width, height);
  g.imageSmoothingEnabled = false;
  const frame = look.frame ? art.frames[look.frame] : undefined;
  if (frame) drawFrame(g, frame, width, height, layout.border);
  for (const sticker of look.stickers) {
    const picture = art.stickers[sticker.id];
    if (!picture) continue;
    const box = stickerBox(sticker, width, height, picture);
    g.drawImage(picture, 0, 0, picture.width, picture.height, box.x, box.y, box.w, box.h);
  }
  const edge = (frame ? layout.border : 0) + layout.margin;
  if (options.caption) options.caption(g, edge, edge, layout.unit);
  if (options.mark !== false && art.mark) {
    const w = art.mark.width * layout.markPx;
    const h = art.mark.height * layout.markPx;
    g.drawImage(art.mark, 0, 0, art.mark.width, art.mark.height, width - edge - w, height - edge - h, w, h);
  }
  g.restore();
}
