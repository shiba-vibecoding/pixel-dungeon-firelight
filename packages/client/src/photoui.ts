import { audio } from './audio';
import { CATALOG, type Item, itemName } from './catalog';
import { FX_COLORS, fxText } from './cards';
import { cosmetics } from './cosmetics';
import { flItem, flUrl, loadFl } from './flart';
import { lang } from './i18n';
import { P } from './i18n-photo';
import {
  type Art, compose, emptyLook, moveSticker, nextSpot, PHOTO_FILTERS, type PhotoArt, type PhotoFilter, type PhotoLook, type PlacedSticker,
  applyFilter, scaleSticker, STICKER_START, STICKERS_MAX, stickerAt, stickerBox, workingSize,
} from './photo';
import { el, show, toast, windowOf } from './screens';
import { appLink, canDownloadFile, canShareStory, downloadFile, inTelegram, inviteStart, shareStory } from './telegram';

/*
 * The photo mode's screen: a snapshot of the game (the map, or the camp) in a frame, with a filter and stickers on it, saved as a PNG or
 * sent to a story. Nothing here draws the game: the snapshot is taken by whoever opens the mode (main.ts, from the canvases, the HUD
 * left out), at the moment the camera button is pressed, so the renderer never pays for it in ordinary play. photo.ts composes;
 * this holds the choices and the gestures. While the screen is closed nothing of it runs.
 */

/** A snapshot of the game, as it was on the canvases. */
export interface Shot {
  canvas: HTMLCanvasElement;
  /** The picture is made of big pixels (the camp's scene): it is only made larger in whole steps, with no smoothing. */
  pixelArt: boolean;
  /** The line in the frame's corner: the depth and the place. */
  caption: string;
}

export interface PhotoOptions {
  shot: Shot;
  onClose(): void;
  /** Where the shop is, for the frames and stickers not owned yet; absent where the shop cannot be reached from here. */
  onShop?: () => void;
}

/**
 * A snapshot of a 2D canvas (the camp's scene, or the shop's stage), the part of it that is in `view` (the screen, when the canvas
 * runs off it) or all of it. The camp's scene is drawn in pixels of its own, shown many times larger: it stays pixel art.
 */
export function sceneShot(canvas: HTMLCanvasElement, view: DOMRect | null, caption: string): Shot | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1 || canvas.width < 1 || canvas.height < 1) return null;
  const left = view ? Math.max(rect.left, view.left) : rect.left;
  const top = view ? Math.max(rect.top, view.top) : rect.top;
  const right = view ? Math.min(rect.right, view.right) : rect.right;
  const bottom = view ? Math.min(rect.bottom, view.bottom) : rect.bottom;
  const kx = canvas.width / rect.width;
  const ky = canvas.height / rect.height;
  const sx = Math.max(0, Math.floor((left - rect.left) * kx));
  const sy = Math.max(0, Math.floor((top - rect.top) * ky));
  const sw = Math.min(canvas.width - sx, Math.round((right - left) * kx));
  const sh = Math.min(canvas.height - sy, Math.round((bottom - top) * ky));
  if (sw < 1 || sh < 1) return null;
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const g = out.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return { canvas: out, pixelArt: true, caption };
}

/** The camera's flash: the screen goes pale and clears in four steps (the design's .fl-photo-flash). */
export function flash(): void {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const node = el('div', { className: 'fl-photo-flash' });
  node.setAttribute('aria-hidden', 'true');
  document.body.append(node);
  setTimeout(() => node.remove(), 320);
}

/** What puts a picture at a public address (the server's /photo): set once at the start, absent offline. */
let upload: ((png: Blob) => Promise<string | null>) | null = null;
export function setPhotoUpload(fn: ((png: Blob) => Promise<string | null>) | null): void {
  upload = fn;
}

/** The largest PNG the server keeps (photos.ts MAX_PHOTO_BYTES), with a little to spare. */
const UPLOAD_BYTES = 1_700_000;

/** The free frame: the design's own (ui/fl-photo-frame.png), for whoever has bought none. */
export const PLAIN = 'plain';
const PLAIN_PATH = 'ui/fl-photo-frame.png';
const MARK_PATH = lang === 'ru' ? 'brand/logo-ru.png' : 'brand/logo-en.png';

const images = new Map<string, Promise<HTMLImageElement | null>>();

/** A picture of the art folder, whole, or null if it will not come. */
function picture(path: string): Promise<HTMLImageElement | null> {
  let image = images.get(path);
  if (!image) {
    image = new Promise((resolve) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => {
        images.delete(path);
        resolve(null);
      };
      node.src = flUrl(path);
    });
    images.set(path, image);
  }
  return image;
}

/** The frames this player may put on: the plain one and the ones owned, worn one first among them. */
export function ownedFrames(): Item[] {
  return CATALOG.filter((item) => item.category === 'photoframe' && cosmetics.ownsId(item.id));
}

/** The stickers this player has, in the catalogue's order. */
export function ownedStickers(): Item[] {
  return CATALOG.filter((item) => item.category === 'sticker' && cosmetics.ownsId(item.id));
}

/** The frame to start with: the one worn, or the plain one. */
export function startFrame(): string {
  const worn = cosmetics.photoFrame;
  return worn ? worn.id : PLAIN;
}

const pathOf = (id: string): string | undefined => flItem(id)?.sprite;

const stamp = (): string => {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

/** The picture as a PNG; smaller (by a fifth at a time) until it is no more than `limit` bytes, when there is one. */
async function pngOf(source: HTMLCanvasElement, limit?: number): Promise<Blob | null> {
  const blob = (canvas: HTMLCanvasElement): Promise<Blob | null> => new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  let current = await blob(source);
  let scale = 1;
  while (current && limit && current.size > limit && scale > 0.35) {
    scale *= 0.8;
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(source.width * scale));
    small.height = Math.max(1, Math.round(source.height * scale));
    const g = small.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(source, 0, 0, small.width, small.height);
    current = await blob(small);
  }
  return current && (!limit || current.size <= limit) ? current : null;
}

/** The snapshot at the size the photo is made, in a canvas of its own. */
function baseOf(shot: Shot): HTMLCanvasElement {
  const { width, height } = workingSize(shot.canvas.width, shot.canvas.height, shot.pixelArt);
  const base = document.createElement('canvas');
  base.width = width;
  base.height = height;
  const g = base.getContext('2d')!;
  g.imageSmoothingEnabled = !shot.pixelArt;
  g.imageSmoothingQuality = 'high';
  g.drawImage(shot.canvas, 0, 0, shot.canvas.width, shot.canvas.height, 0, 0, width, height);
  return base;
}

/** The photo mode, over whatever is on the screen. `onClose` is told when it is closed (by its cross, a tap beside it or Telegram's back button). */
export function showPhoto(options: PhotoOptions): void {
  const wait = windowOf({ title: P.title, onClose: options.onClose, className: 'ph-window' }, el('p', { className: 'pd-note center', textContent: P.preparing }));
  show(wait, options.onClose);
  void loadFl().then(() => build(options));
}

function build(options: PhotoOptions): void {
  const { shot } = options;
  const base = baseOf(shot);
  const W = base.width;
  const H = base.height;
  const frames = ownedFrames();
  const stickers = ownedStickers();
  const look: PhotoLook = { ...emptyLook(), frame: startFrame() };
  const art: { frames: Record<string, Art | undefined>; stickers: Record<string, Art | undefined>; mark: Art | undefined } = { frames: {}, stickers: {}, mark: undefined };
  const photoArt: PhotoArt = art;
  let selected = -1;
  let nextUid = 1;
  let closed = false;

  /* -- the filtered snapshot, made once for each filter used -- */
  const filtered = new Map<PhotoFilter, HTMLCanvasElement>([['none', base]]);
  const baseFor = (filter: PhotoFilter): HTMLCanvasElement => {
    const have = filtered.get(filter);
    if (have) return have;
    const copy = document.createElement('canvas');
    copy.width = W;
    copy.height = H;
    const g = copy.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(base, 0, 0);
    try {
      const pixels = g.getImageData(0, 0, W, H);
      applyFilter(pixels.data, filter);
      g.putImageData(pixels, 0, 0);
    } catch {
      // A canvas that cannot be read: the picture stays as it was.
    }
    filtered.set(filter, copy);
    return copy;
  };

  /* -- the preview, which is also what is saved -- */
  const canvas = el('canvas', { className: 'ph-canvas', width: W, height: H });
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', P.preview);
  const g = canvas.getContext('2d')!;
  const select = el('div', { className: 'ph-select' });
  select.hidden = true;
  const stage = el('div', { className: 'ph-stage' }, canvas, select);
  let queued = 0;
  let revision = 0;
  /** What was last put at a public address, for the revision it was made of: Save and Story from one picture send it once. */
  let sent: { revision: number; url: string } | null = null;

  const caption = (c: CanvasRenderingContext2D, x: number, y: number, unit: number): void => {
    if (!shot.caption) return;
    // Whole font pixels, as large as the picture's unit suggests, and no wider than the picture inside its frame (a glyph is about six of them).
    const room = Math.max(1, W - 2 * x);
    const px = Math.max(1, Math.min(Math.round(unit * 0.7), Math.floor(room / (shot.caption.length * 6.2))));
    fxText(c, shot.caption, x, y + 8 * px, px, { font: 'small', scale: 1, align: 'left', color: FX_COLORS.gold });
  };

  const redraw = (): void => {
    queued = 0;
    if (closed) return;
    compose(g, baseFor(look.filter), false, look, photoArt, W, H, { caption });
    // The marks round the chosen sticker, over the preview (not in the picture).
    const sticker = look.stickers[selected];
    const picture = sticker && art.stickers[sticker.id];
    if (sticker && picture) {
      const fit = placement();
      const box = stickerBox(sticker, W, H, picture);
      select.hidden = false;
      select.style.left = `${fit.x + box.x * fit.scale}px`;
      select.style.top = `${fit.y + box.y * fit.scale}px`;
      select.style.width = `${box.w * fit.scale}px`;
      select.style.height = `${box.h * fit.scale}px`;
    } else select.hidden = true;
    sizeButtons();
  };
  const schedule = (): void => {
    revision++;
    if (!queued) queued = requestAnimationFrame(redraw);
  };

  /** Where the picture lies in the stage (CSS pixels), the canvas being fitted (object-fit: contain) in its box. */
  const placement = (): { x: number; y: number; scale: number } => {
    const box = canvas.getBoundingClientRect();
    const host = stage.getBoundingClientRect();
    const scale = Math.min(box.width / W, box.height / H) || 1;
    return { x: box.left - host.left + (box.width - W * scale) / 2, y: box.top - host.top + (box.height - H * scale) / 2, scale };
  };
  /** The picture's own pixel under a point of the screen. */
  const pixelAt = (clientX: number, clientY: number): { x: number; y: number } => {
    const fit = placement();
    const host = stage.getBoundingClientRect();
    return { x: (clientX - host.left - fit.x) / fit.scale, y: (clientY - host.top - fit.y) / fit.scale };
  };
  /** Smooth where the picture is shown smaller than it is, nearest where it is shown larger (the art is pixels). */
  const crisp = (): void => {
    const fit = placement();
    canvas.style.imageRendering = fit.scale * (window.devicePixelRatio || 1) >= 1 ? 'pixelated' : 'auto';
  };

  /* -- stickers: drag, pinch, tap -- */
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { uid: number; moved: boolean; startX: number; startY: number; lastX: number; lastY: number } | null = null;
  let pinch: { uid: number; distance: number; k: number } | null = null;
  /** A pinch or a second finger came into this touch: lifting the fingers is not a tap. */
  let multi = false;
  const indexOf = (uid: number): number => look.stickers.findIndex((s) => s.uid === uid);
  const spread = (): number => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const update = (index: number, next: PlacedSticker): void => {
    look.stickers[index] = next;
    schedule();
  };

  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      multi = true;
      const target = drag ? indexOf(drag.uid) : selected;
      const sticker = look.stickers[target];
      if (sticker) pinch = { uid: sticker.uid, distance: spread() || 1, k: sticker.k };
      drag = null;
      return;
    }
    if (pointers.size > 2) return;
    multi = false;
    const at = pixelAt(event.clientX, event.clientY);
    const hit = stickerAt(look, W, H, photoArt, at.x, at.y);
    if (hit < 0) return;
    // The sticker touched comes to the front, and is the one the size buttons work on.
    const [sticker] = look.stickers.splice(hit, 1);
    look.stickers.push(sticker!);
    selected = look.stickers.length - 1;
    drag = { uid: sticker!.uid, moved: false, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY };
    schedule();
  });
  stage.addEventListener('pointermove', (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    last.x = event.clientX;
    last.y = event.clientY;
    if (pinch) {
      const index = indexOf(pinch.uid);
      const sticker = look.stickers[index];
      if (sticker) update(index, scaleSticker({ ...sticker, k: pinch.k }, spread() / pinch.distance));
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    drag.moved = true;
    const index = indexOf(drag.uid);
    const sticker = look.stickers[index];
    if (!sticker) return;
    const fit = placement();
    update(index, moveSticker(sticker, ((event.clientX - drag.lastX) / fit.scale) / W, ((event.clientY - drag.lastY) / fit.scale) / H));
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
  });
  const lift = (event: PointerEvent): void => {
    if (!pointers.delete(event.pointerId)) return;
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      return;
    }
    if (drag && pointers.size === 0) {
      // A touch that did not move is a tap: the sticker goes.
      const tapped = drag;
      drag = null;
      if (!tapped.moved && !multi && event.type === 'pointerup') {
        const index = indexOf(tapped.uid);
        if (index >= 0) {
          audio.play('click');
          look.stickers.splice(index, 1);
          selected = look.stickers.length - 1;
          schedule();
        }
      }
    }
    if (pointers.size === 0) multi = false;
  };
  stage.addEventListener('pointerup', lift);
  stage.addEventListener('pointercancel', lift);
  // A mouse wheel over the picture makes the chosen sticker larger or smaller.
  stage.addEventListener('wheel', (event) => {
    const sticker = look.stickers[selected];
    if (!sticker) return;
    event.preventDefault();
    update(selected, scaleSticker(sticker, event.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, { passive: false });

  /* -- the tray: filters, frames, stickers, the buttons -- */
  const filterButtons = new Map<PhotoFilter, HTMLButtonElement>();
  const filters = el('div', { className: 'fl-filters' });
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', P.filtersLabel);
  for (const name of PHOTO_FILTERS) {
    const chip = el('button', { className: `fl-filter ${name}`, textContent: P.filters[name] });
    chip.type = 'button';
    chip.onclick = () => {
      audio.play('click');
      look.filter = name;
      for (const [other, button] of filterButtons) button.setAttribute('aria-pressed', String(other === name));
      schedule();
    };
    filterButtons.set(name, chip);
    filters.append(chip);
  }
  for (const [name, button] of filterButtons) button.setAttribute('aria-pressed', String(name === look.filter));

  const tile = (content: Node, label: string, onTap: () => void, pressed?: boolean): HTMLButtonElement => {
    const button = el('button', { className: 'ph-tile', title: label }, content);
    button.type = 'button';
    button.ariaLabel = label;
    if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
    button.onclick = () => {
      audio.play('click');
      onTap();
    };
    return button;
  };
  const image = (path: string, scale: number, size: number): HTMLImageElement => {
    const node = el('img', { className: 'ph-art', src: flUrl(path), alt: '', draggable: false });
    node.style.width = `${size * scale}px`;
    node.style.height = `${size * scale}px`;
    return node;
  };

  const frameTiles = new Map<string | null, HTMLButtonElement>();
  const frameRow = el('div', { className: 'ph-row' });
  const markFrames = (): void => {
    for (const [key, button] of frameTiles) button.setAttribute('aria-pressed', String(key === look.frame));
  };
  const chooseFrame = (key: string | null): void => {
    look.frame = key;
    markFrames();
    schedule();
  };
  const noFrame = el('span', { className: 'ph-none', textContent: '∅' });
  frameTiles.set(null, tile(noFrame, P.noFrame, () => chooseFrame(null), look.frame === null));
  frameTiles.set(PLAIN, tile(image(PLAIN_PATH, 2, 24), P.plainFrame, () => chooseFrame(PLAIN), look.frame === PLAIN));
  for (const item of frames) {
    const path = pathOf(item.id);
    if (path) frameTiles.set(item.id, tile(image(path, 2, 24), itemName(item, lang === 'ru' ? 'ru' : 'en'), () => chooseFrame(item.id), look.frame === item.id));
  }
  frameRow.append(...frameTiles.values());
  if (options.onShop && frames.length < CATALOG.filter((item) => item.category === 'photoframe').length) {
    frameRow.append(el('button', { className: 'ph-tile more', textContent: `+ ${P.shopMore}`, onclick: () => { audio.play('click'); options.onShop!(); } }));
  }

  const smaller = el('button', { className: 'ph-step', textContent: '−', title: P.smaller, onclick: () => step(1 / 1.25) });
  const bigger = el('button', { className: 'ph-step', textContent: '+', title: P.bigger, onclick: () => step(1.25) });
  smaller.type = bigger.type = 'button';
  smaller.ariaLabel = P.smaller;
  bigger.ariaLabel = P.bigger;
  const step = (factor: number): void => {
    const sticker = look.stickers[selected];
    if (!sticker) return;
    audio.play('click');
    update(selected, scaleSticker(sticker, factor));
  };
  const sizeButtons = (): void => {
    smaller.disabled = bigger.disabled = !look.stickers[selected];
  };

  const stickerRow = el('div', { className: 'ph-row stickers' });
  for (const item of stickers) {
    const path = pathOf(item.id);
    if (!path) continue;
    stickerRow.append(tile(image(path, 3, 16), itemName(item, lang === 'ru' ? 'ru' : 'en'), () => {
      if (look.stickers.length >= STICKERS_MAX) look.stickers.shift();
      const spot = nextSpot(look.stickers.length);
      look.stickers.push({ uid: nextUid++, id: item.id, x: spot.x, y: spot.y, k: STICKER_START });
      selected = look.stickers.length - 1;
      schedule();
    }));
  }
  const stickerBlock = stickers.length > 0
    ? stickerRow
    : el('p', { className: 'pd-note', textContent: P.noStickers });
  if (stickers.length === 0 && options.onShop) {
    stickerBlock.style.cursor = 'pointer';
    stickerBlock.onclick = () => options.onShop!();
  }

  /* -- save and story -- */
  const buttons = el('div', { className: 'fl-photo-actions' });
  const saveButton = el('button', { className: 'pd-button save', textContent: P.save });
  const storyButton = el('button', { className: 'pd-button primary story', textContent: P.story });
  saveButton.type = storyButton.type = 'button';
  buttons.append(saveButton);
  const storyAvailable = canShareStory() && upload !== null;
  if (storyAvailable) buttons.append(storyButton);
  else buttons.classList.add('single');

  let busy = false;
  const guarded = (work: () => Promise<void>) => (): void => {
    if (busy) return;
    busy = true;
    saveButton.disabled = storyButton.disabled = true;
    audio.play('click');
    void work().finally(() => {
      busy = false;
      saveButton.disabled = storyButton.disabled = false;
    });
  };

  /** The picture at a public address (the same one for the same picture), or null. */
  const publicUrl = async (): Promise<string | null> => {
    if (!upload) return null;
    if (sent && sent.revision === revision) return sent.url;
    redrawNow();
    const png = await pngOf(canvas, UPLOAD_BYTES);
    if (!png) return null;
    const asked = revision;
    const url = await upload(png);
    if (url) sent = { revision: asked, url };
    return url;
  };
  const redrawNow = (): void => {
    if (queued) cancelAnimationFrame(queued);
    redraw();
  };

  saveButton.onclick = guarded(async () => {
    const name = `pixel-dungeon-firelight-${stamp()}.png`;
    // In Telegram the file is saved by Telegram, which fetches it from an address: only https, so the picture goes up first.
    if (inTelegram && canDownloadFile() && upload) {
      toast(P.preparing);
      const url = await publicUrl();
      if (url && (await downloadFile(url, name))) return toast(P.saved, { tone: 'good' });
    }
    redrawNow();
    const png = await pngOf(canvas);
    if (!png) return toast(P.saveFailed, { tone: 'warn' });
    if (inTelegram) {
      // Telegram without the download (older than 8.0), or the server out of reach: the phone's own share sheet, if it has one.
      const file = new File([png], name, { type: 'image/png' });
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] });
          return toast(P.savedShare, { tone: 'good' });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
      return holdToSave(png);
    }
    const href = URL.createObjectURL(png);
    const link = el('a', { href, download: name });
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
    toast(P.saved, { tone: 'good' });
  });

  storyButton.onclick = guarded(async () => {
    toast(P.preparing);
    const url = await publicUrl();
    if (!url) return toast(P.storyFailed, { tone: 'warn' });
    // The story's link opens the game (the widget is shown to Premium senders; the caption's text goes to everyone).
    shareStory(url, P.storyText, { url: appLink(inviteStart()), name: 'Pixel Dungeon' });
  });

  /** The last resort: the picture on its own, to be held and saved by the phone. */
  const holdToSave = (png: Blob): void => {
    const href = URL.createObjectURL(png);
    const layer = el('div', { className: 'ph-hold' }, el('img', { src: href, alt: P.preview }), el('p', { textContent: P.holdToSave }));
    layer.onclick = () => {
      layer.remove();
      URL.revokeObjectURL(href);
    };
    box.append(layer);
  };

  /* -- the window -- */
  const tray = el(
    'div',
    { className: 'ph-side' },
    el('div', { className: 'fl-photo-bar' }, filters),
    el('section', { className: 'ph-tray' }, el('h3', { textContent: P.frames }), frameRow),
    el('section', { className: 'ph-tray' }, el('div', { className: 'ph-tray-head' }, el('h3', { textContent: P.stickers }), el('span', { className: 'ph-steps' }, smaller, bigger)), stickerBlock, stickers.length > 0 ? el('p', { className: 'pd-note ph-hint', textContent: P.stickerHint }) : null),
    el('div', { className: 'fl-photo-bar' }, buttons),
  );
  const close = (): void => {
    closed = true;
    if (queued) cancelAnimationFrame(queued);
    options.onClose();
  };
  const box = windowOf({ title: P.title, onClose: close, className: 'ph-window' }, el('div', { className: 'ph-body' }, stage, tray));
  show(box, close);
  sizeButtons();
  // The frames and the stickers are the player's own: drawn as soon as their pictures have come.
  const wanted: Array<Promise<void>> = [];
  const want = (target: Record<string, Art | undefined>, key: string, path: string | undefined): void => {
    if (!path) return;
    wanted.push(picture(path).then((node) => {
      if (node) target[key] = node;
    }));
  };
  want(art.frames, PLAIN, PLAIN_PATH);
  for (const item of frames) want(art.frames, item.id, pathOf(item.id));
  for (const item of stickers) want(art.stickers, item.id, pathOf(item.id));
  wanted.push(picture(MARK_PATH).then((node) => {
    if (node) art.mark = node;
  }));
  // The caption's font must be in before the first picture is drawn.
  wanted.push(Promise.all([document.fonts?.load('10px Galmuri9')]).then(() => undefined, () => undefined));
  redraw();
  crisp();
  void Promise.all(wanted).then(() => {
    schedule();
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { crisp(); redraw(); }).observe(stage);
}
