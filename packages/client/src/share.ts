import type { HeroClass } from '@pd/core';
import { fxText } from './cards';
import { lang, locale, t } from './i18n';
import { AVATAR } from './screens';

/*
 * The daily result as a picture (the design system's PD.share.card, 1200x630):
 * the hero's portrait, the day, the name, how the run ended, and depth, score
 * and place on panels, over the sewers' floor, with the logo.
 */

export interface ShareCard {
  name: string;
  heroClass: HeroClass;
  level: number;
  depth: number;
  score: number;
  /** Place on today's board, if known. */
  place: number | null;
  won: boolean;
  /** What ended the run, for a fall. */
  cause: string;
}

const C = {
  void: '#0b0b09', s800: '#282a24', s700: '#3b3e36', s200: '#9fa896', ink: '#e8e2c8', muted: '#b0b5a3', gold: '#ffeba4',
  goldDeep: '#ffcc66', bad: '#ff8585', ally: '#5ec8c0',
} as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(src));
    image.src = src;
  });
}

/** A floor of sewer tiles with walls, from a seed, as the design draws it. */
function floor(g: CanvasRenderingContext2D, tiles: HTMLImageElement, width: number, height: number, scale: number, seed: number): void {
  const size = 16 * scale;
  let r = seed;
  const rnd = (): number => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280;
  };
  for (let y = 0; y < Math.ceil(height / size); y++) {
    for (let x = 0; x < Math.ceil(width / size); x++) {
      const wall = y === 0 || y === Math.ceil(height / size) - 1 || (x % 7 === 0 && y % 3 !== 1);
      const tile = wall ? (rnd() < 0.15 ? 12 : 4) : rnd() < 0.2 ? 2 : rnd() < 0.08 ? 24 : 1;
      g.drawImage(tiles, (tile % 16) * 16, Math.floor(tile / 16) * 16, 16, 16, x * size, y * size, size, size);
    }
  }
}

/** Draws the card; resolves to a PNG. */
export async function shareCard(data: ShareCard): Promise<Blob | null> {
  const base = `${import.meta.env.BASE_URL}assets/`;
  const [tiles, avatars, logo] = await Promise.all([
    loadImage(`${base}tiles0.png`), loadImage(`${base}avatars.png`), loadImage(`${base}banner-title.png`),
  ]);
  await Promise.all([document.fonts.load('36px Galmuri11'), document.fonts.load('20px Galmuri9')]).catch(() => undefined);
  const canvas = document.createElement('canvas');
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  floor(g, tiles, W, H, 4, 11);
  g.fillStyle = 'rgba(11, 11, 9, 0.82)';
  g.fillRect(0, 0, W, H);

  // The hero's portrait, eight times over, in a stone frame.
  g.fillStyle = C.void;
  g.fillRect(64, 104, 256, 336);
  g.fillStyle = C.s200;
  g.fillRect(68, 108, 248, 328);
  g.fillStyle = C.s800;
  g.fillRect(72, 112, 240, 320);
  g.drawImage(avatars, AVATAR[data.heroClass] * 24, 0, 24, 32, 96, 144, 192, 256);
  fxText(g, `${t.classes[data.heroClass]}, ${t.levelShort} ${data.level}`, 192, 486, 1, { scale: 2, color: C.muted, shadow: 0 });

  const x0 = 384;
  const day = new Date().toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long' });
  fxText(g, `${t.daily.toUpperCase()} · ${day}`, x0, 132, 1, { scale: 2, color: C.goldDeep, align: 'left', shadow: 0 });
  fxText(g, data.name, x0, 216, 1, { scale: data.name.length > 12 ? 4 : 6, color: C.ink, align: 'left' });
  fxText(g, data.won ? t.victory : data.cause, x0, 264, 1, { scale: 2, color: data.won ? C.gold : C.bad, align: 'left', shadow: 0 });
  const stats: Array<[string, string, string]> = [
    [t.statDepth, String(data.depth), C.ink],
    [t.score, data.score.toLocaleString(locale), C.gold],
    [t.place, data.place ? String(data.place) : '—', C.ally],
  ];
  stats.forEach(([label, value, color], i) => {
    const bx = x0 + i * 256;
    const by = 300;
    g.fillStyle = C.s800;
    g.fillRect(bx, by, 232, 112);
    g.fillStyle = C.s700;
    g.fillRect(bx, by, 232, 4);
    fxText(g, label, bx + 20, by + 40, 1, { font: 'small', scale: 3, color: C.muted, align: 'left', shadow: 0, outline: 'none' });
    fxText(g, value, bx + 20, by + 96, 1, { font: 'small', scale: value.length > 7 ? 4 : 5, color, align: 'left', shadow: 0, outline: 'none' });
  });
  // Our logo already says TELEGRAM.
  g.drawImage(logo, 0, 0, logo.width, logo.height, W - 72 - 256, H - 36 - 140, 256, 140);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/**
 * Shares the picture where the phone can share files (the Web Share API);
 * false where it cannot, for the caller to share text instead.
 */
export async function sharePicture(data: ShareCard, text: string): Promise<boolean> {
  try {
    const blob = await shareCard(data);
    if (!blob) return false;
    const file = new File([blob], 'pixel-dungeon-daily.png', { type: 'image/png' });
    if (!navigator.canShare?.({ files: [file] })) return false;
    await navigator.share({ files: [file], text });
    return true;
  } catch (error) {
    // Cancelled by the player: shared nothing, but nothing else to offer either.
    return error instanceof DOMException && error.name === 'AbortError';
  }
}
