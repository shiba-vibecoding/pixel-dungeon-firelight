import { artSku, type Item } from './catalog';

/*
 * The designer's art for Pixel-Mart (design part 5: public/assets/mart/fl/catalog.json and the sheets it names), read for the game: the
 * look of a hero, a hat, a pet, a trail, the effects of a kill and of a fall, the digits of the damage, a campfire's flame, logs and
 * sparks, the camp's decorations. The catalogue (catalog.ts) says WHAT is sold and for how much; this says what each thing looks like.
 *
 * Everything loads on demand, and every getter answers `undefined` until what it needs has come: a renderer draws what it has and the
 * rest as soon as it arrives (`onFlChange` tells it to draw again). Pictures are asked for with the build's mark on the address, as
 * sprites.ts does, so a new build's art is fetched and never an old one kept by the webview.
 */

declare const __BUILD__: { commit: string; date: string } | undefined;
const VERSION = typeof __BUILD__ !== 'undefined' ? __BUILD__.commit : 'dev';
const BASE = `${import.meta.env.BASE_URL}assets/`;

/** The designer's record of one item (catalog.json); only what the readers below look at is typed. */
export interface FlRaw {
  sku: string;
  kind: string;
  stars: number;
  name: { en: string; ru: string };
  heroClass?: string;
  skin?: string;
  legendary?: boolean;
  sheet?: string | { file: string; w: number; h: number; frames?: number; ms?: number; at?: readonly [number, number]; feet?: readonly [number, number]; idle?: number[]; walk?: number[]; glyphs?: string; advance?: number };
  glow?: string | Record<string, string>;
  glowPulse?: { hz: number; min: number; max: number };
  aura?: { sheet: string; frames: number; w: number; h: number; feet: readonly [number, number]; ms: number };
  icon?: string;
  sheets?: Record<string, string>;
  cell?: { w: number; h: number; heroAt: readonly [number, number] };
  slot?: string;
  fly?: boolean;
  follow?: { behind: number; lag_ms: number };
  flame?: { sheet: string; frames: number; w: number; h: number; ms: number };
  logs?: string;
  logsAt?: readonly [number, number];
  sparks?: { sheet: string; frames: number; w: number; h: number };
  light?: string;
  sprite?: string;
  plate?: string;
  slice?: number;
  anim?: { sheet: string; frames: number; ms: number };
  place?: { zone: string; feet: readonly [number, number] };
  w?: number;
  h?: number;
  items?: string[];
  css?: string;
  color?: string;
  rarity?: string;
  how?: string;
  season?: string;
  pack?: string;
}

export interface FlCategory {
  id: string;
  kinds: string[];
  en: string;
  ru: string;
  icon: string;
  signature?: boolean;
}

export interface FlCatalog {
  items: FlRaw[];
  categories: FlCategory[];
  bundles: Array<{ sku: string; items: string[]; stars: number; art: string; name: { en: string; ru: string }; full: number; save: number }>;
  season: {
    id: string; name: { en: string; ru: string }; number: number; days: number; levels: number; banner: string;
    how: { en: string; ru: string }; free: Array<[number, string]>; paid: Array<[number, string]>;
  };
}

let catalog: FlCatalog | null = null;
let strings: Record<string, Record<string, string>> = {};
let byId = new Map<string, FlRaw>();
let loading: Promise<FlCatalog | null> | null = null;

/** Bumps whenever the catalogue or any picture arrives: what is made from the art is made again. */
let version = 0;
const listeners: Array<() => void> = [];

function bump(): void {
  version++;
  for (const listener of listeners) listener();
}

/** `listener` is called whenever more of the art has come; the function it gives back stops that. */
export function onFlChange(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    const at = listeners.indexOf(listener);
    if (at >= 0) listeners.splice(at, 1);
  };
}

export const flVersion = (): number => version;

/** Fetches catalog.json (once); null if it cannot be had (the shop then shows placeholders). */
export function loadFl(): Promise<FlCatalog | null> {
  loading ??= Promise.all([
    fetch(`${BASE}mart/fl/catalog.json?v=${VERSION}`).then((response) => (response.ok ? (response.json() as Promise<FlCatalog>) : null)),
    fetch(`${BASE}mart/fl/strings.json?v=${VERSION}`).then((response) => (response.ok ? (response.json() as Promise<Record<string, Record<string, string>>>) : {})).catch(() => ({})),
  ])
    .then(([json, words]) => {
      strings = words;
      if (json) {
        catalog = json;
        byId = new Map([...json.items, ...extras].map((item) => [item.sku, item]));
        bump();
      }
      return json;
    })
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

export const flCatalog = (): FlCatalog | null => catalog;

/** Things of the art that are not in the shop's catalogue (the competitions' Beacon fire, design part 7): known by their sku like the rest. */
const extras: FlRaw[] = [];
export function addFlItems(items: readonly FlRaw[]): void {
  for (const item of items) {
    extras.push(item);
    byId.set(item.sku, item);
  }
  bump();
}

/** One of the designer's shop strings (strings.json) in a language, `{n}` filled; the key itself until they have come. */
export function flStr(lang: 'ru' | 'en', key: string, n?: number | string): string {
  const text = strings[lang]?.[key] ?? strings.en?.[key] ?? key;
  return n === undefined ? text : text.replace('{n}', String(n));
}

/** The designer's record of one of the catalogue's items (by our id), once the catalogue has come. */
export function flItem(id: string): FlRaw | undefined {
  if (!catalog) void loadFl();
  return byId.get(artSku(id));
}

const images = new Map<string, HTMLImageElement>();

/** A picture of the art folder (a path inside assets/), asked for once, with the build's mark. */
export function flImage(path: string): HTMLImageElement {
  let image = images.get(path);
  if (!image) {
    image = new Image();
    image.onload = bump;
    image.src = `${BASE}${path}?v=${VERSION}`;
    images.set(path, image);
  }
  return image;
}

export const flReady = (image: HTMLImageElement | undefined): image is HTMLImageElement => image !== undefined && image.complete && image.naturalWidth > 0;

/** The address of a picture of the art folder, for CSS and for <img>. */
export const flUrl = (path: string): string => `${BASE}${path}?v=${VERSION}`;

/** The picture if it has come, else undefined (and it is being fetched). */
function got(path: string | undefined): HTMLImageElement | undefined {
  if (!path) return undefined;
  const image = flImage(path);
  return flReady(image) ? image : undefined;
}

/** The designer's name for a hero class in sheet names. */
export const sheetClass = (heroClass: string): string => (heroClass === 'huntress' ? 'ranger' : heroClass);

/* ---- What each thing looks like ---- */

export interface LookArt {
  /** The whole sheet of the hero, in the layout of the original (12 x 15 frames, 21 across, a row for each armour). */
  sheet: HTMLImageElement;
  /** A legendary look: the mask of what glows, in the same layout, and how it pulses. */
  glow?: HTMLImageElement;
  pulse: { hz: number; min: number; max: number };
  /** The legendary look's aura: frames of w x h side by side, the feet at (feetX, feetY). */
  aura?: { image: HTMLImageElement; frames: number; w: number; h: number; feetX: number; feetY: number; ms: number };
}

export function lookArt(id: string): LookArt | undefined {
  const raw = flItem(id);
  if (!raw || typeof raw.sheet !== 'string') return undefined;
  const sheet = got(raw.sheet);
  if (!sheet) return undefined;
  const glow = typeof raw.glow === 'string' ? got(raw.glow) : undefined;
  const aura = raw.aura ? got(raw.aura.sheet) : undefined;
  // A legendary look shows once all its parts are here (the rest of the look would flash into place).
  if (raw.legendary && ((typeof raw.glow === 'string' && !glow) || (raw.aura && !aura))) return undefined;
  return {
    sheet,
    ...(glow ? { glow } : {}),
    pulse: raw.glowPulse ?? { hz: 1, min: 0.55, max: 1 },
    ...(aura && raw.aura ? { aura: { image: aura, frames: raw.aura.frames, w: raw.aura.w, h: raw.aura.h, feetX: raw.aura.feet[0], feetY: raw.aura.feet[1], ms: raw.aura.ms } } : {}),
  };
}

export interface HatArt {
  /** A hat for every frame and armour of the hero: cells of w x h, the hero's frame in each at (heroX, heroY). */
  image: HTMLImageElement;
  glow?: HTMLImageElement;
  w: number;
  h: number;
  heroX: number;
  heroY: number;
}

export function hatArt(id: string, heroClass: string): HatArt | undefined {
  const raw = flItem(id);
  const key = sheetClass(heroClass);
  if (!raw?.sheets?.[key]) return undefined;
  const image = got(raw.sheets[key]);
  if (!image) return undefined;
  const glowPath = raw.glow && typeof raw.glow !== 'string' ? raw.glow[key] : undefined;
  const glow = got(glowPath);
  if (glowPath && !glow) return undefined;
  const cell = raw.cell ?? { w: 16, h: 22, heroAt: [2, 7] as const };
  return { image, ...(glow ? { glow } : {}), w: cell.w, h: cell.h, heroX: cell.heroAt[0], heroY: cell.heroAt[1] };
}

export interface PetArt {
  image: HTMLImageElement;
  glow?: HTMLImageElement;
  w: number;
  h: number;
  /** Frames: standing, walking; the pet's feet in a frame. */
  idle: readonly number[];
  walk: readonly number[];
  feetX: number;
  feetY: number;
  ms: number;
  /** A flyer hangs above the floor and bobs. */
  fly: boolean;
  /** How long after the hero's step the pet takes its own, ms. */
  lag: number;
}

export function petArt(id: string): PetArt | undefined {
  const raw = flItem(id);
  if (!raw || typeof raw.sheet !== 'object') return undefined;
  const sheet = raw.sheet;
  const image = got(sheet.file);
  if (!image) return undefined;
  const glow = typeof raw.glow === 'string' ? got(raw.glow) : undefined;
  if (typeof raw.glow === 'string' && !glow) return undefined;
  const feet = sheet.feet ?? [6, 11];
  return {
    image, ...(glow ? { glow } : {}), w: sheet.w, h: sheet.h, idle: sheet.idle ?? [0, 1, 2, 3], walk: sheet.walk ?? [4, 5, 6, 7], feetX: feet[0], feetY: feet[1],
    ms: sheet.ms ?? 150, fly: raw.fly === true, lag: raw.follow?.lag_ms ?? 220,
  };
}

/** An effect that plays once: frames of w x h in a row; the point of a frame that stands on its place (trails: `at`, falls: `feet`). */
export interface FxArt {
  image: HTMLImageElement;
  w: number;
  h: number;
  frames: number;
  ms: number;
  atX: number;
  atY: number;
}

export function fxArt(id: string): FxArt | undefined {
  const raw = flItem(id);
  if (!raw || typeof raw.sheet !== 'object' || !raw.sheet.frames) return undefined;
  const sheet = raw.sheet;
  const image = got(sheet.file);
  if (!image) return undefined;
  const at = sheet.at ?? sheet.feet ?? [sheet.w / 2, sheet.h / 2];
  return { image, w: sheet.w, h: sheet.h, frames: sheet.frames!, ms: sheet.ms ?? 100, atX: at[0], atY: at[1] };
}

export interface DigitsArt {
  image: HTMLImageElement;
  w: number;
  h: number;
  glyphs: string;
  advance: number;
}

export function digitsArt(id: string): DigitsArt | undefined {
  const raw = flItem(id);
  if (!raw || typeof raw.sheet !== 'object' || !raw.sheet.glyphs) return undefined;
  const image = got(raw.sheet.file);
  return image ? { image, w: raw.sheet.w, h: raw.sheet.h, glyphs: raw.sheet.glyphs, advance: raw.sheet.advance ?? raw.sheet.w - 1 } : undefined;
}

export interface FireArt {
  flame: HTMLImageElement;
  frames: number;
  w: number;
  h: number;
  ms: number;
  logs: HTMLImageElement;
  /** Where the logs' picture stands, from the flame's feet (the flame is at FIRE - 6, FIRE - 17 in the camp). */
  logsAt: readonly [number, number];
  sparks: HTMLImageElement;
  sparkFrames: number;
  sparkW: number;
  sparkH: number;
  /** The colour of the camp's light. */
  light: string;
}

export function fireArt(id: string): FireArt | undefined {
  const raw = flItem(id);
  if (!raw?.flame || !raw.logs || !raw.sparks) return undefined;
  const flame = got(raw.flame.sheet);
  const logs = got(raw.logs);
  const sparks = got(raw.sparks.sheet);
  if (!flame || !logs || !sparks) return undefined;
  return {
    flame, frames: raw.flame.frames, w: raw.flame.w, h: raw.flame.h, ms: raw.flame.ms, logs, logsAt: raw.logsAt ?? [-8, -4], sparks,
    sparkFrames: raw.sparks.frames, sparkW: raw.sparks.w, sparkH: raw.sparks.h, light: raw.light ?? '#ff9a3a',
  };
}

export interface DecorArt {
  image: HTMLImageElement;
  glow?: HTMLImageElement;
  w: number;
  h: number;
  /** The bottom middle of the picture, on the camp's background. */
  feetX: number;
  feetY: number;
}

export function decorArt(id: string): DecorArt | undefined {
  const raw = flItem(id);
  if (!raw?.sprite || !raw.place) return undefined;
  const image = got(raw.sprite);
  if (!image) return undefined;
  const glow = got(typeof raw.glow === 'string' ? raw.glow : undefined);
  if (typeof raw.glow === 'string' && !glow) return undefined;
  return { image, ...(glow ? { glow } : {}), w: raw.w ?? image.width, h: raw.h ?? image.height, feetX: raw.place.feet[0], feetY: raw.place.feet[1] };
}

/** The icon of an item (a shelf's, a slot's, a card's), the picture to show when there is nothing livelier: its path, if the designer drew one. */
export function iconPath(item: Item): string | undefined {
  const raw = flItem(item.id);
  return raw?.icon ?? (typeof raw?.sprite === 'string' ? raw.sprite : undefined);
}

/** The picture at an icon's path, if it has come. */
export function iconImage(item: Item): HTMLImageElement | undefined {
  return got(iconPath(item));
}
