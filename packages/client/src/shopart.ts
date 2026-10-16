import { artSku, type Item, type Rarity } from './catalog';
import { flItem, flUrl, iconPath, flImage } from './flart';

/*
 * Pixel-Mart's pictures: an item's card art (the designer's icon of it, drawn at a whole multiple, nearest), a profile frame round a
 * portrait, a title's plate, a name in its colour. An earn-only item the designer drew nothing for (the streak and board rewards)
 * is a small generated glyph in its tones, the placeholder it has been.
 */

/** The glyphs of the placeholders: `k` outline, `a` the item's tone, `b` its shade, `c` its light, `w` white, `.` empty. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  trail: ['........', '.kk.....', '.kak.kk.', '.kk.kak.', '....kk..', '.kk.....', 'kak.kk..', '.kk.kak.'],
  frame: ['kkkkkkkk', 'kaaaaaak', 'kabbbbak', 'kab..bak', 'kab..bak', 'kabbbbak', 'kaaaaaak', 'kkkkkkkk'],
  title: ['kkkkkkkk', 'kaaaaaak', 'kcccccck', 'kaaaaaak', 'kkkkkkkk', '.k....k.', '........', '........'],
  namecolor: ['...kk...', '..kaak..', '.kaaaak.', '.kacaak.', 'kaacaaak', 'kaaaaaak', '.kaaaak.', '..kkkk..'],
  bundle: ['.kk..kk.', 'k.kkkk.k', 'kkkkkkkk', 'kaacaaak', 'kcccccck', 'kaacaaak', 'kaaaaaak', 'kkkkkkkk'],
  pass: ['kkkkkkkk', 'kaaaaaak', 'kacwwcak', 'kacwwcak', 'kaaaaaak', 'kkkkkkkk', '........', '........'],
  default: ['..kkkk..', '.kaaaak.', '.kaccak.', 'kaaaaaak', 'kaaaaaak', '.kaaaak.', '..kaak..', '...kk...'],
};

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
};
const mix = (c: [number, number, number], to: number, k: number): string => `rgb(${c.map((v) => Math.round(v + (to - v) * k)).join(',')})`;

/** The placeholder icon of an item with no art of the designer's, 8x8, to be shown pixelated at any size. */
export function glyph(item: Item): HTMLCanvasElement {
  const canvas = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
  canvas.className = 'pd-glyph';
  const g = canvas.getContext('2d')!;
  const base = rgb(item.tones?.[0] ?? '#c8c8c8');
  const palette: Record<string, string> = { k: '#14110e', a: mix(base, 255, 0), b: mix(base, 0, 0.45), c: mix(base, 255, 0.55), w: '#ffffff' };
  const rows = GLYPHS[item.category] ?? GLYPHS.default!;
  rows.forEach((row, y) => {
    for (let x = 0; x < 8; x++) {
      const color = palette[row[x]!];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}

/** The size, in art pixels, of the picture at an icon's path, once it has come (a `fit` needs it). */
const sized = (path: string): [number, number] | null => {
  const image = flImage(path);
  return image.complete && image.naturalWidth > 0 ? [image.naturalWidth, image.naturalHeight] : null;
};

/** An image of the art folder at a whole multiple of its pixels that fits a box (`max` at most); it is sized when it has loaded. */
export function pixelImage(path: string, box: number, max = 4, className = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.alt = '';
  img.className = className;
  img.decoding = 'async';
  const place = (): void => {
    const s = Math.max(1, Math.min(max, Math.floor(box / Math.max(img.naturalWidth, img.naturalHeight))));
    img.style.width = `${img.naturalWidth * s}px`;
    img.style.height = `${img.naturalHeight * s}px`;
  };
  img.addEventListener('load', place, { once: true });
  const known = sized(path);
  img.src = flUrl(path);
  if (known) {
    const s = Math.max(1, Math.min(max, Math.floor(box / Math.max(known[0], known[1]))));
    img.style.width = `${known[0] * s}px`;
    img.style.height = `${known[1] * s}px`;
  }
  return img;
}

/** The colours a profile frame lights its rim with (for the places that cannot draw the frame's picture). */
const FRAME_TONES: Readonly<Record<string, readonly [string, string]>> = {
  ember: ['#ff7a2a', '#7a2a0a'], frost: ['#bfe3ff', '#3a6ea8'], moss: ['#8adc5a', '#2a5a2a'], bone: ['#e8e0c8', '#6a604a'], stars: ['#b8c0ff', '#2a2a6a'],
  runes: ['#c06aff', '#3a1a6a'], crystal: ['#7ae8ff', '#1a5a7a'], sunforge: ['#ffd84a', '#8a5a0a'], laurel: ['#6adf6a', '#2a5a2a'], cup: ['#ffd84a', '#8a5a0a'],
};

/** CSS for a portrait in a profile frame: the designer's frame as a nine-slice border (4 art pixels), and its tones for the plain rim. */
export function frameStyle(item: Item | undefined): string {
  if (!item) return '';
  const key = item.id.split('.')[1] ?? '';
  const tones = FRAME_TONES[key] ?? item.tones ?? ['#c8c8c8', '#444444'];
  const raw = flItem(item.id);
  const vars = `--fa:${tones[0]};--fb:${tones[1] ?? tones[0]};`;
  if (!raw?.sprite) return `${vars}border:6px solid var(--fa);`;
  return `${vars}border:12px solid transparent;border-image:url("${flUrl(raw.sprite)}") ${raw.slice ?? 4} fill / 12px stretch;image-rendering:pixelated;box-shadow:none;background-clip:border-box;`;
}

/** What a rarity is called in CSS (game.css .rar-<name> sets the frame's colour). */
export const rarityClass = (rarity: Rarity): string => `rar-${rarity}`;

/** Paints a name in its colour item: the designer's colour class (fl-mart.css), or a shimmer through the tones of a placeholder. */
export function paintName(node: HTMLElement, item: Item | undefined): void {
  if (!item) return;
  const raw = flItem(item.id);
  if (raw?.css) {
    node.classList.add('fl-name', raw.css);
    return;
  }
  if (!item.tones?.length) return;
  if (item.shimmer && item.tones.length > 1) {
    node.classList.add('pd-name-shimmer');
    node.style.setProperty('--shimmer', `linear-gradient(90deg, ${[...item.tones, item.tones[0]].join(', ')})`);
  } else {
    node.style.color = item.tones[0]!;
  }
}

/** A title's plate: the designer's, with its icon, in the title's rarity. */
export function titlePlate(item: Item, text: string): HTMLElement {
  const raw = flItem(item.id);
  const plate = document.createElement('div');
  plate.className = `fl-title-plate ${raw?.rarity ?? 'common'}`;
  if (raw?.plate) plate.style.borderImageSource = `url("${flUrl(raw.plate)}")`;
  const icon = document.createElement('span');
  if (raw?.icon) icon.append(pixelImage(raw.icon, 18, 2));
  const label = document.createElement('span');
  label.textContent = text;
  plate.append(icon, label);
  return plate;
}

/** A portrait in a frame, `scale` screen pixels to an art pixel (the frame is 14 x 14 at 4 slices: the face inside). */
export function framedFace(frame: Item | undefined, avatar: number, scale = 3): HTMLElement {
  const face = document.createElement('div');
  face.className = 'fl-face';
  const raw = frame ? flItem(frame.id) : undefined;
  if (raw?.sprite) {
    face.style.borderImageSource = `url("${flUrl(raw.sprite)}")`;
    face.style.borderWidth = face.style.borderImageWidth = `${(raw.slice ?? 4) * scale}px`;
  } else {
    face.style.border = 'none';
  }
  const inner = document.createElement('i');
  inner.className = 'fl-face-av';
  inner.style.setProperty('--av', String(avatar));
  inner.style.setProperty('--s', String(scale));
  face.append(inner);
  return face;
}

/** An item's picture for a card, a slot or a list: the designer's art, else the placeholder. `scale` is the most screen pixels of one art pixel. */
export function itemArt(item: Item, scale = 4, box = 96): HTMLElement {
  const holder = document.createElement('span');
  holder.className = `pd-item-art ${item.category}`;
  const raw = flItem(item.id);
  if (item.category === 'namecolor' && raw?.css) {
    const sample = document.createElement('span');
    sample.className = `fl-name ${raw.css}`;
    sample.textContent = 'Aa';
    holder.append(sample);
    return holder;
  }
  if (item.category === 'title') {
    holder.append(titlePlate(item, item.name.en === item.name.ru ? item.name.en : (document.documentElement.lang === 'ru' ? item.name.ru : item.name.en)));
    return holder;
  }
  if (item.category === 'bundle' && item.items?.length && !item.pack) {
    // A bundle shows a few of its parts, side by side.
    holder.classList.add('parts');
    for (const id of item.items.slice(0, 4)) {
      const part = { id, category: 'hat' } as Item;
      const path = iconPath(part);
      if (path) holder.append(pixelImage(path, Math.floor(box / 2), Math.max(2, scale - 1)));
    }
    return holder;
  }
  if (item.category === 'frame') {
    holder.append(framedFace(item, 0, Math.max(1, Math.min(3, Math.floor(box / 32)))));
    return holder;
  }
  const path = iconPath(item);
  if (path) {
    holder.append(pixelImage(path, box, scale + 2));
    return holder;
  }
  const node = glyph(item);
  node.style.width = `${8 * scale}px`;
  node.style.height = `${8 * scale}px`;
  holder.append(node);
  return holder;
}

export { artSku };
