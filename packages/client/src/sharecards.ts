import type { BoardEntry } from './checked';
import { lookOfEntry } from './cardlook';
import type { CardLook } from './cardlook';
import { artUrl, compete, loadCompete, tierOf } from './compete';
import { formatNumber } from './compete-text';
import { loadFl } from './flart';
import { canDownloadFile, downloadFile } from './telegram';
import { drawScene, fireColour, sceneLayout, whenWhole } from './herocard';
import { lang } from './i18n';
import { tx, txn } from './compete-ui';

/*
 * The pictures a player sends of their hero (design part 7): a story of 1080 x 1920 and a card for a chat of 1280 x 640, drawn on a canvas
 * on the phone like the result's card (share.ts). The hero stands by his own fire, as the hero card dresses him, on the camp's own
 * picture; under him the place on the day's board, the name, the class, the depth and the streak. The dungeon's seed is never on them: it
 * would spoil the daily dungeon for whoever opens the picture. No price is on them either: nothing of the competitions is sold.
 */

export interface HeroPicture {
  name: string;
  look: CardLook;
  heroClass: string;
  /** The place on the day's board, when the hero is on it (and when it is told). */
  place: number | null;
  depth: number;
  /** Days in a row; 0 or less says nothing of it. */
  streak: number;
  /** The league's step key, when the player has a league. */
  tier?: string;
  /** How the hero grew, in a line («level 1 → 13 · health 20 → 80 · strength 11 → 16»: growend.ts growthLine). */
  growth?: string;
}

const FONTS = { big: 'Galmuri11', small: 'Galmuri9' } as const;
const font = (px: number, small: boolean): string => `${px}px ${small ? FONTS.small : FONTS.big}`;

interface TextOptions {
  align?: CanvasTextAlign;
  /** The text shrinks until it fits this width. */
  max?: number;
  small?: boolean;
  shadow?: boolean;
}

/** Text on a card: Galmuri, with the dark shadow the game's own text has, fitted to a width if one is asked. Returns the width drawn. */
function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, colour: string, o: TextOptions = {}): number {
  g.font = font(px, o.small === true);
  if (o.max) {
    while (px > 12 && g.measureText(s).width > o.max) {
      px -= 2;
      g.font = font(px, o.small === true);
    }
  }
  g.textAlign = o.align ?? 'left';
  g.textBaseline = 'alphabetic';
  if (o.shadow !== false) {
    g.fillStyle = '#0b0b09';
    g.fillText(s, x, y + Math.max(2, px / 10));
  }
  g.fillStyle = colour;
  g.fillText(s, x, y);
  return g.measureText(s).width;
}

const loaded = new Map<string, Promise<HTMLImageElement | null>>();
function image(path: string): Promise<HTMLImageElement | null> {
  let found = loaded.get(path);
  if (!found) {
    found = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = artUrl(path);
    });
    loaded.set(path, found);
  }
  return found;
}

/** The game's logo in the picture's language, drawn `w` wide at x, y; its height. */
async function logo(g: CanvasRenderingContext2D, x: number, y: number, w: number): Promise<number> {
  const img = await image(`brand/logo-${lang}@4x.png`);
  if (!img) return 0;
  const h = (w * img.height) / img.width;
  g.drawImage(img, x, y, w, h);
  return h;
}

const canvasOf = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [canvas, g];
};

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> => new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));

/** The fonts the pictures use are in before they are drawn. */
const fontsReady = (): Promise<unknown> => Promise.all([document.fonts.load(font(40, false)), document.fonts.load(font(32, true))]).catch(() => undefined);

/** The line of the hero's class, the depth and (if any) the streak: «Mage · Depth 17 · 12 days in a row». */
const detailLine = (d: HeroPicture, withStreak: boolean): string =>
  [tx(`classes.${d.heroClass}`), tx('storyDepth', { n: d.depth }), withStreak && d.streak > 0 ? txn('streak', d.streak) : ''].filter(Boolean).join(' · ');

/** The place line, «#4 of the day» (or the name alone is big when the hero has no place). */
const placeLine = (d: HeroPicture): string | null => (d.place === null ? null : tx('storyPlace', { n: d.place }));

/** The story: the whole screen of a phone. */
export async function storyPicture(d: HeroPicture): Promise<Blob | null> {
  await Promise.all([loadCompete(), loadFl(), fontsReady()]);
  const layout = sceneLayout('story');
  if (!layout) return null;
  const [canvas, g] = canvasOf(1080, 1920);
  const W = 1080;
  const H = 1920;
  g.fillStyle = '#0b0b09';
  g.fillRect(0, 0, W, H);
  const scale = typeof layout.scale === 'number' ? layout.scale : 12;
  const [ax, ay] = layout.at ?? [0, 0];
  await whenWhole(() => drawScene(g, d.look, 'story', ax, ay, scale));
  const sceneH = layout.scene[1] * scale;
  const top = g.createLinearGradient(0, 0, 0, 420);
  top.addColorStop(0, 'rgba(11,11,9,.85)');
  top.addColorStop(1, 'rgba(11,11,9,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, W, 420);
  const fade = g.createLinearGradient(0, sceneH - 300, 0, sceneH);
  fade.addColorStop(0, 'rgba(11,11,9,0)');
  fade.addColorStop(1, '#0b0b09');
  g.fillStyle = fade;
  g.fillRect(0, sceneH - 300, W, 300);
  await logo(g, 270, 70, 540);
  let y = sceneH + 60;
  const place = placeLine(d);
  if (place) {
    text(g, place, W / 2, y, 130, '#ffcc66', { align: 'center', max: W - 80 });
    y += 120;
  } else {
    y += 40;
  }
  text(g, d.name, W / 2, y, place ? 80 : 110, '#ffeba4', { align: 'center', max: W - 100 });
  text(g, detailLine(d, true), W / 2, y + 80, 44, '#e8e2c8', { align: 'center', small: true, max: W - 80 });
  if (d.growth) text(g, d.growth, W / 2, y + 136, 36, '#ffcc66', { align: 'center', small: true, max: W - 80 });
  // The league he plays in: its badge and name.
  const tier = tierOf(d.tier);
  const badge = d.tier && tier ? await image(tier.badge) : null;
  if (tier && badge) {
    g.drawImage(badge, W / 2 - 40, y + (d.growth ? 170 : 120), 80, 80);
    text(g, tx('leagueOf', { t: tier.name[lang] }), W / 2, y + (d.growth ? 300 : 250), 40, tier.color, { align: 'center', max: W - 80 });
  }
  text(g, tx('deeperQ'), W / 2, H - 120, 56, '#ff9a3a', { align: 'center', max: W - 80 });
  text(g, '@pixel_dungeon_gamebot', W / 2, H - 56, 36, '#b0b5a3', { align: 'center', small: true });
  return toBlob(canvas);
}

/** The card for a chat: the scene on the left, the logo and the words on the right. */
export async function chatPicture(d: HeroPicture): Promise<Blob | null> {
  await Promise.all([loadCompete(), loadFl(), fontsReady()]);
  const layout = sceneLayout('chat');
  if (!layout) return null;
  const [canvas, g] = canvasOf(1280, 640);
  const W = 1280;
  const H = 640;
  g.fillStyle = '#0b0b09';
  g.fillRect(0, 0, W, H);
  // The fire's colour spreads over the card.
  const light = g.createRadialGradient(360, 420, 0, 360, 420, 640);
  const colour = fireColour(d.look);
  light.addColorStop(0, `${colour}66`);
  light.addColorStop(0.45, `${colour}22`);
  light.addColorStop(1, `${colour}00`);
  g.fillStyle = light;
  g.fillRect(0, 0, W, H);
  const scale = typeof layout.scale === 'number' ? layout.scale : 8;
  const [ax, ay] = layout.at ?? [40, 64];
  g.fillStyle = '#0b0b09';
  g.fillRect(ax - 6, ay - 6, layout.scene[0] * scale + 12, layout.scene[1] * scale + 12);
  await whenWhole(() => drawScene(g, d.look, 'chat', ax, ay, scale));
  const x = 730;
  const lh = await logo(g, x, 44, 360);
  let y = 44 + lh + 90;
  const place = placeLine(d);
  if (place) {
    text(g, place, x, y, 84, '#ffcc66', { max: W - x - 40 });
    y += 72;
  } else {
    y += 20;
  }
  text(g, d.name, x, y, 52, '#ffeba4', { max: W - x - 40 });
  y += 52;
  text(g, detailLine(d, false), x, y, 32, '#e8e2c8', { small: true, max: W - x - 40 });
  if (d.growth) {
    y += 44;
    text(g, d.growth, x, y, 28, '#ffcc66', { small: true, max: W - x - 40 });
  }
  if (d.streak > 0) {
    y += 44;
    text(g, txn('streak', d.streak), x, y, 32, '#ff9a3a', { small: true, max: W - x - 40 });
  }
  const tier = tierOf(d.tier);
  const badge = d.tier && tier ? await image(tier.badge) : null;
  if (tier && badge) {
    y += 24;
    g.drawImage(badge, x, y, 48, 48);
    text(g, tier.name[lang], x + 64, y + 38, 32, tier.color);
  }
  text(g, '@pixel_dungeon_gamebot', W - 40, H - 28, 26, '#7a8173', { align: 'right', small: true, shadow: false });
  return toBlob(canvas);
}

/** What the card of a circle's week says: the circle, the week, the first five (as the board has them), and who won last week if known. */
export interface CirclePicture {
  circle: string;
  week: number;
  rows: readonly BoardEntry[];
  /** The name of last week's champion of the circle, if there was one: his row carries the title. */
  champion: string | null;
}

/** Name colours as the picture paints them (the shop's `fl-name-*` colours, by the key of the item). */
const NAME_COLOURS: Readonly<Record<string, string>> = {
  ember: '#ff9a3a', gold: '#ffcc66', frost: '#9fdcff', moss: '#8adc5a', rose: '#ff8aa8', violet: '#b48aff', ash: '#c8c2b8', flame: '#ffcc66',
};

/** «Circle of the week» for a chat: 1280 x 640, the first five of the circle's board, each a hero card by his fire, the first with the champion's title. No seed, no price. */
export async function circlePicture(d: CirclePicture): Promise<Blob | null> {
  await Promise.all([loadCompete(), loadFl(), fontsReady()]);
  const [canvas, g] = canvasOf(1280, 640);
  const W = 1280;
  g.fillStyle = '#0b0b09';
  g.fillRect(0, 0, W, 640);
  const glow = g.createRadialGradient(220, 600, 0, 220, 600, 700);
  glow.addColorStop(0, '#ff9a3a66');
  glow.addColorStop(0.45, '#ff9a3a22');
  glow.addColorStop(1, '#ff9a3a00');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, 640);
  text(g, tx('circleCardTitle'), 60, 96, 64, '#ffeba4', { max: 760 });
  text(g, tx('circleCardSub', { c: d.circle, n: d.week }), 60, 146, 32, '#b0b5a3', { small: true, max: 760 });
  const lh = await logo(g, W - 340, 40, 280);
  const top = Math.max(186, 40 + lh + 22);
  const medal = ['#ffd84a', '#d6dde3', '#e09a5a', '#b0b5a3', '#b0b5a3'];
  const titleItem = compete()?.titles.find((title) => title.sku === 'title.circle_champion');
  const titleIcon = titleItem ? await image(titleItem.icon) : null;
  const rows = d.rows.slice(0, 5);
  for (let i = 0; i < rows.length; i++) {
    const entry = rows[i]!;
    const y = top + i * 86;
    g.fillStyle = '#0b0b09';
    g.fillRect(57, y, W - 114, 74);
    g.fillRect(60, y - 3, W - 120, 80);
    g.fillStyle = i === 0 ? '#3b2a1c' : '#282a24';
    g.fillRect(60, y, W - 120, 74);
    text(g, String(i + 1), 104, y + 52, 40, medal[i]!, { align: 'center' });
    // The hero by his fire: the row's scene at x3 (no frame), inside its own place.
    await whenWhole(() => drawScene(g, lookOfEntry({ heroClass: entry.heroClass, ...(entry.w ? { w: entry.w } : {}) }), 'row', 140, y + 1, 3));
    const key = (entry.w?.nc ?? entry.nc ?? '').replace(/^name\./, '');
    text(g, entry.name, 272, y + 46, 36, NAME_COLOURS[key] ?? '#e8e2c8', { max: 560 });
    text(g, tx(`classes.${entry.heroClass}`), 272, y + 68, 22, '#b0b5a3', { small: true, shadow: false });
    if (d.champion !== null && entry.name === d.champion && titleItem && titleIcon) {
      g.drawImage(titleIcon, 700, y + 18, 36, 36);
      text(g, titleItem.name[lang], 750, y + 48, 28, '#ffeba4', { max: 300 });
    }
    text(g, formatNumber(entry.score, lang), W - 90, y + 50, 38, i === 0 ? '#ffd84a' : '#e8e2c8', { align: 'right' });
  }
  return toBlob(canvas);
}

/**
 * Keeps a picture for the player: Telegram's own download (8.0 and later, from a public address: the server's card), else the browser's
 * (a link with `download`). Resolves to whether something was offered.
 */
export async function savePicture(blob: Blob, fileName: string, publicUrl: string | null): Promise<boolean> {
  if (publicUrl && canDownloadFile()) {
    // Telegram's own download (8.0 and later) wants a public address: the server's copy of the picture.
    if (await downloadFile(publicUrl, fileName)) return true;
  }
  try {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
