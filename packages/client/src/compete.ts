import { addFlItems, type FlRaw } from './flart';
import { type Lang, say } from './compete-text';
import { EXTRA } from './compete-words';

/*
 * The designer's data of the competitions (design part 7): assets/compete/compete.json (the boards' tabs and slices, the leagues, the
 * circles, the season, the honour titles, the share cards, and every word in both languages) and anchors.json (where each layer of a hero
 * card stands, in art pixels). Read once, on demand; every getter answers null until they have come, and `onCompeteChange` tells the
 * cards and windows that waited. The numbers the server judges by are the same file (the server imports it).
 */

declare const __BUILD__: { commit: string; date: string } | undefined;
const VERSION = typeof __BUILD__ !== 'undefined' ? __BUILD__.commit : 'dev';
const BASE = `${import.meta.env.BASE_URL}assets/`;

export interface TierData {
  key: string;
  tier: number;
  name: Record<Lang, string>;
  color: string;
  accent: string;
  frame: { sprite: string; slice: number; anim?: { sheet: string; frames: number; ms: number } };
  badge: string;
  mini: string;
}

export interface SeasonData {
  id: string;
  name: Record<Lang, string>;
  palette: readonly string[];
  cup: string;
  frame: { sprite: string; slice: number };
}

export interface TitleData {
  sku: string;
  kind: string;
  title: string;
  rarity: string;
  honour?: boolean;
  name: Record<Lang, string>;
  how: string;
  icon: string;
  plate: string;
}

/** The words of one language, as the designer wrote them: a string, a list of plural forms, or a group (n_overtaken ...). */
export type Strings = Record<string, string | readonly string[] | Record<string, string | readonly string[]>>;

export interface CompeteData {
  version: number;
  card: { animate: string[]; worn: Record<string, string> };
  boards: {
    tabs: Array<'day' | 'week' | 'all' | 'season'>;
    metrics: Array<'score' | 'speed' | 'depth'>;
    classes: string[];
    speed: { minDepth: number };
    top: number;
    rows: number;
    counter: Record<string, string | null>;
  };
  leagues: { tiers: TierData[]; room: number; promote: number; demote: number; start: string; beaconWeekMark: string };
  circles: { kinds: string[]; size: Record<string, number>; invite: string; champion: string };
  season: {
    seasons: SeasonData[];
    current: string;
    weeks: number;
    heat: Record<string, number>;
    template: { cup: string; frame: { sprite: string; slice: number } };
    hallOfFame: { top: number };
  };
  fire: { beacon: FlRaw & { honour?: boolean } };
  titles: TitleData[];
  share: { story: { size: [number, number] }; chat: { size: [number, number] }; circle: { size: [number, number] } };
  notify: { image: [number, number] };
  strings: Record<Lang, Strings>;
}

/** One layout of the hero card's scene (anchors.json → layouts). */
export interface SceneLayout {
  scene: [number, number];
  scale?: number | { phone: number; monitor: number };
  fire: [number, number];
  hero: [number, number];
  pet?: [number, number];
  light: number;
  frame?: { slice: number; scale: number };
  size?: [number, number];
  canvas?: [number, number];
  at?: [number, number];
  bg?: { sheet: string; crop: [number, number, number, number]; night: number };
}

export interface Anchors {
  hero: { cell: [number, number]; tiers: number; tierDefault: number; idle: { frames: number[]; seq: number[]; fps: number } };
  hat: { cell: [number, number]; heroAt: [number, number] };
  aura: { cell: [number, number]; feet: [number, number]; frames: number; ms: number };
  pet: { place: { dx: number; dy: number }; flyLift: number; shadow: { ground: [number, number]; fly: [number, number]; alpha: [number, number] } };
  fire: {
    logsAt: [number, number];
    flameAt: [number, number];
    sparksAt: Array<[number, number, number]>;
    light: { radius: number; stops: Array<[number, string]> };
  };
  layouts: Record<string, SceneLayout>;
}

let data: CompeteData | null = null;
let anchors: Anchors | null = null;
let loading: Promise<CompeteData | null> | null = null;
const listeners: Array<() => void> = [];

/** `listener` is called when the data arrives; the function it gives back stops that. */
export function onCompeteChange(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    const at = listeners.indexOf(listener);
    if (at >= 0) listeners.splice(at, 1);
  };
}

/** Fetches compete.json and anchors.json (once); null if they cannot be had. */
export function loadCompete(): Promise<CompeteData | null> {
  loading ??= Promise.all(
    ['compete/compete.json', 'compete/anchors.json'].map((path) => fetch(`${BASE}${path}?v=${VERSION}`).then((response) => (response.ok ? response.json() : null))),
  )
    .then(([compete, layers]) => {
      if (!compete || !layers) {
        loading = null;
        return null;
      }
      data = compete as CompeteData;
      anchors = layers as Anchors;
      // The Beacon fire is a style of the camp's fires: the card's art loader finds it with the shop's.
      addFlItems([
        { ...data.fire.beacon, stars: 0 } as FlRaw,
        // The honour titles' plates and icons, found the way the shop's are.
        ...data.titles.map((title) => ({ sku: title.sku, kind: 'title', stars: 0, name: title.name, rarity: title.rarity, plate: title.plate, icon: title.icon }) as FlRaw),
      ]);
      for (const listener of [...listeners]) listener();
      return data;
    })
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

/** The competitions' data, once it has come (and asked for if it has not). */
export function compete(): CompeteData | null {
  if (!data) void loadCompete();
  return data;
}

/** The hero card's anchors, once they have come. */
export function anchorsOf(): Anchors | null {
  if (!anchors) void loadCompete();
  return anchors;
}

/** The address of a picture in the art folder (a path inside assets/), for CSS and <img>. */
export const artUrl = (path: string): string => `${BASE}${path}?v=${VERSION}`;

export const tierOf = (key: string | undefined): TierData | undefined => {
  const all = data?.leagues.tiers;
  return all?.find((tier) => tier.key === key) ?? all?.find((tier) => tier.key === data?.leagues.start);
};

export const titleOf = (id: string | undefined): TitleData | undefined => (id ? data?.titles.find((title) => title.sku === id) : undefined);

/** The words under a path: the designer's (compete.json), else the ones this game added (compete-words.ts). */
function at(lang: Lang, path: string): unknown {
  for (const source of [data?.strings[lang], EXTRA[lang]]) {
    let found: unknown = source;
    for (const part of path.split('.')) found = (found as Record<string, unknown> | undefined)?.[part];
    if (found !== undefined) return found;
  }
  return undefined;
}

/** A word in a language (`.`-separated path); the key itself if it is not there. */
export function word(lang: Lang, path: string): string {
  const found = at(lang, path);
  return typeof found === 'string' ? found : path;
}

/** The plural forms found under a path, said for a number. */
export function sayWord(lang: Lang, path: string, n: number, extra: Readonly<Record<string, string | number>> = {}): string {
  const found = at(lang, path);
  return typeof found === 'string' || Array.isArray(found) ? say(found as string | readonly string[], n, lang, extra) : path;
}

/** The id of the designer's art that a season wears: the four palettes come round again after the fourth. */
export function artSeason(number: number): string {
  const seasons = data?.season.seasons ?? [];
  return seasons.length > 0 ? seasons[(Math.max(1, number) - 1) % seasons.length]!.id : 's1';
}
