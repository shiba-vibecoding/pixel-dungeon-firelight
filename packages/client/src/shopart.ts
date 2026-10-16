import { ART, type Item, type Rarity } from './catalog';

/*
 * Placeholder art for Pixel-Mart's catalogue, until the designer's sheets arrive: small generated pixel icons (an 8×8 glyph per category,
 * coloured with the item's tones) and, for hero looks, the class's own sprite tinted. Real art is loaded in their place as soon as the
 * item's asset is listed in catalog.ts ART (public/assets/shop/<asset>.png): nothing else changes.
 */

const BASE = `${import.meta.env.BASE_URL}assets/`;

/** The glyphs: `k` outline, `a` the item's tone, `b` its shade, `c` its light, `w` white, `.` empty. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  hat: ['..kkkk..', '.kaaaak.', '.kaccak.', 'kaaaaaak', 'kbbbbbbk', '.kkkkkk.', '........', '........'],
  pet: ['..k..k..', '.kakkak.', '.kaaaak.', 'kaakkaak', '.kaaaak.', '.kabbak.', '..k..k..', '........'],
  campfire: ['...k....', '..kak...', '..kaak..', '.kaacak.', '.kacwcak', '.kabcbak', '..kbbbk.', '...kkk..'],
  trail: ['........', '.kk.....', '.kak.kk.', '.kk.kak.', '....kk..', '.kk.....', 'kak.kk..', '.kk.kak.'],
  killfx: ['...k....', '.k.a.k..', '..kac...', 'kaacwcak', '..kac...', '.k.a.k..', '...k....', '........'],
  deathfx: ['..kkkk..', '.kccccck', '.kcckcck', '.kccccck', '..kcckk.', '..kbkbk.', '........', '........'],
  numbers: ['.kk.kk..', 'kaak.ak.', '.ak..ak.', '.ak.ak..', '.ak.ak..', 'kaaakaak', '........', '........'],
  quips: ['.kkkkkk.', 'kaaaaaak', 'kacaacak', 'kaaaaaak', '.kkkakk.', '...ka...', '....k...', '........'],
  decor: ['..kkkk..', '.kakkak.', '.kacwck.', '.kaccak.', '.kabbak.', '..kkkk..', '...kk...', '........'],
  frame: ['kkkkkkkk', 'kaaaaaak', 'kabbbbak', 'kab..bak', 'kab..bak', 'kabbbbak', 'kaaaaaak', 'kkkkkkkk'],
  title: ['kkkkkkkk', 'kaaaaaak', 'kcccccck', 'kaaaaaak', 'kkkkkkkk', '.k....k.', '........', '........'],
  namecolor: ['...kk...', '..kaak..', '.kaaaak.', '.kacaak.', 'kaacaaak', 'kaaaaaak', '.kaaaak.', '..kkkk..'],
  photoframe: ['kkkkkkkk', 'kwwwwwwk', 'kwbbbbwk', 'kwbccbwk', 'kwbbbbwk', 'kwwwwwwk', 'kwwwwwwk', 'kkkkkkkk'],
  sticker: ['...kk...', '...ka...', 'kkkaakkk', 'kaacaaak', '.kaaaak.', '.kaakak.', '.kak.kak', '..k..k..'],
  bundle: ['.kk..kk.', 'k.kkkk.k', 'kkkkkkkk', 'kaacaaak', 'kcccccck', 'kaacaaak', 'kaaaaaak', 'kkkkkkkk'],
  pass: ['kkkkkkkk', 'kaaaaaak', 'kacwwcak', 'kacwwcak', 'kaaaaaak', 'kkkkkkkk', '........', '........'],
  look: ['..kkkk..', '.kaaaak.', '.kaccak.', 'kaaaaaak', 'kaaaaaak', '.kaaaak.', '..kaak..', '...kk...'],
};

const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
};
const mix = (c: [number, number, number], to: number, k: number): string =>
  `rgb(${c.map((v) => Math.round(v + (to - v) * k)).join(',')})`;

/** The pixel icon of an item, 8×8, to be shown pixelated at any size. A multi-tone item's glyph is picked from its tones by id, so neighbours differ. */
export function glyph(item: Item): HTMLCanvasElement {
  const canvas = Object.assign(document.createElement('canvas'), { width: 8, height: 8 });
  canvas.className = 'pd-glyph';
  const g = canvas.getContext('2d')!;
  const base = rgb(item.tones?.[0] ?? '#c8c8c8');
  const palette: Record<string, string> = { k: '#14110e', a: mix(base, 255, 0), b: mix(base, 0, 0.45), c: mix(base, 255, 0.55), w: '#ffffff' };
  const rows = GLYPHS[item.category] ?? GLYPHS.look!;
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

const sheets = new Map<string, HTMLImageElement>();

function sheet(file: string): HTMLImageElement {
  let img = sheets.get(file);
  if (!img) {
    img = new Image();
    img.src = `${BASE}${file}`;
    sheets.set(file, img);
  }
  return img;
}

/** The class's sprite sheet (the huntress's is the ranger's). */
const CLASS_SHEET: Record<string, string> = { warrior: 'warrior', mage: 'mage', rogue: 'rogue', huntress: 'ranger' };

/** A hero of a class in a tint: the placeholder of a look (the first armour's frame, as the camp shows him). */
export function tintedHero(heroClass: string, color: string | undefined, strength = 0.45): HTMLCanvasElement {
  const canvas = Object.assign(document.createElement('canvas'), { width: 12, height: 15 });
  canvas.className = 'pd-glyph hero';
  const draw = (img: HTMLImageElement): void => {
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, 12, 15);
    g.drawImage(img, 0, 15, 12, 15, 0, 0, 12, 15);
    if (color) {
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = strength;
      g.fillStyle = color;
      g.fillRect(0, 0, 12, 15);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  };
  const img = sheet(`${CLASS_SHEET[heroClass] ?? 'warrior'}.png`);
  if (img.complete && img.naturalWidth > 0) draw(img);
  else img.addEventListener('load', () => draw(img), { once: true });
  return canvas;
}

/** The tint a look gives its hero: the legendary ones are stronger. */
export const lookTint = (item: Item): { color: string; strength: number } | undefined =>
  item.tones?.[0] ? { color: item.tones[0], strength: item.legendary ? 0.58 : 0.42 } : undefined;

/** An item's picture for a card or a slot: real art when it exists, else the placeholder. `scale` is the screen pixels of one art pixel. */
export function itemArt(item: Item, scale = 5): HTMLElement {
  const holder = document.createElement('span');
  holder.className = `pd-item-art ${item.category}`;
  let node: HTMLElement;
  let size: [number, number] = [8, 8];
  if (ART.has(item.asset)) {
    const img = new Image();
    img.src = `${BASE}shop/${item.asset}.png`;
    img.alt = '';
    node = img;
    size = [16, 16];
  } else if (item.category === 'look' && item.heroClass) {
    node = tintedHero(item.heroClass, item.tones?.[0], item.legendary ? 0.58 : 0.42);
    size = [12, 15];
  } else if (item.category === 'bundle' && item.items?.length) {
    node = glyph(item);
  } else {
    node = glyph(item);
  }
  node.style.width = `${size[0] * scale}px`;
  node.style.height = `${size[1] * scale}px`;
  holder.append(node);
  return holder;
}

/** What a rarity is called in CSS (game.css .rar-<name> sets the frame's colour). */
export const rarityClass = (rarity: Rarity): string => `rar-${rarity}`;

/** Paints a name in its colour item: a plain colour, or a shimmer through its tones (game.css .pd-name-shimmer). */
export function paintName(node: HTMLElement, item: Item | undefined): void {
  if (!item?.tones?.length) return;
  if (item.shimmer && item.tones.length > 1) {
    node.classList.add('pd-name-shimmer');
    node.style.setProperty('--shimmer', `linear-gradient(90deg, ${[...item.tones, item.tones[0]].join(', ')})`);
  } else {
    node.style.color = item.tones[0]!;
  }
}

/** CSS variables of a profile frame (its tones), for the portrait it frames. */
export const frameStyle = (item: Item | undefined): string =>
  item?.tones ? `--fa:${item.tones[0]};--fb:${item.tones[1] ?? item.tones[0]}` : '';
