/*
 * The designer's effects (part 6): one data file, packages/client/public/assets/fx/fx.json, and the frame sheets it names. This module
 * only knows the data: it parses and checks fx.json, loads the sheets once (the same address scheme as the sprites: `?v=<commit>`, so
 * a new build never shows an old sheet from the webview's cache), and holds the small pure rules that turn a game event into the key
 * fx.json looks it up by. Nothing here draws or touches the world; fxplayer.ts plays the effects and the two renderers draw them.
 *
 * Every id that is not in fx.json is simply not played: the older effects (fx-events.ts) go on working until a sheet replaces them.
 */

import type { Effect, MobKind } from '@pd/core';

export type Blend = 'add' | 'normal';
export type Anchor = 'center' | 'head' | 'feet' | 'floor' | 'feet-floor';
export type Behaviour = 'fly' | 'drop' | 'beam' | 'arc' | 'flash' | 'splat' | 'wave' | 'tile' | 'hang' | 'particle';
export type LightCurve = 'flash' | 'follow' | 'along' | 'pulse' | 'flicker' | 'steady';

export const BEHAVIOURS: readonly Behaviour[] = ['fly', 'drop', 'beam', 'arc', 'flash', 'splat', 'wave', 'tile', 'hang', 'particle'];
const ANCHORS: readonly Anchor[] = ['center', 'head', 'feet', 'floor', 'feet-floor'];
const CURVES: readonly LightCurve[] = ['flash', 'follow', 'along', 'pulse', 'flicker', 'steady'];

export interface FxLight {
  color: string;
  /** 0..255. */
  rgb: readonly [number, number, number];
  /** 'r, g, b', for the 2D canvas. */
  css: string;
  /** Linear 0..1, for the 3D scene. */
  lin: readonly [number, number, number];
  hex: number;
  intensity: number;
  /** Cells. */
  radius: number;
  /** How long it burns, ms; 0 for as long as the effect lasts. */
  ms: number;
  curve: LightCurve;
}

export interface FxShake {
  px: number;
  ms: number;
}

export interface FxTint {
  rgb: string;
  alpha: number;
  ms: number;
}

export interface FxDef {
  id: string;
  /** Relative to assets/ ('fx/bolts/magic-fly.png'). */
  sheet: string;
  /** One frame, art pixels. */
  w: number;
  h: number;
  /** The row of the sheet, in frames of `h` (a sheet may hold several effects). */
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
  behaviour: Behaviour;
  blend: Blend;
  anchor: Anchor;
  light?: FxLight;
  shake?: FxShake;
  tint?: FxTint;
  name?: { en: string; ru: string };
  /** Turned along its path. */
  orient?: boolean;
  /** Cells a second; null for a fall. */
  speed?: number | null;
  hit?: string;
  fall?: number;
  start?: string;
  end?: string;
  ms?: number;
  reroll?: boolean;
  returns?: boolean;
  /** The frame is picked by the heading (E NE N NW W SW S SE), not by the clock. */
  directions?: boolean;
  radius?: number;
  scaleSteps?: readonly number[];
  rings?: number;
  stagger?: number;
  specks?: { id: string; count: number };
  tintOnlyForReader?: boolean;
  life?: readonly [number, number];
  rise?: number;
  stay?: { frame: number; ms: number };
  rows?: { thin: number; mid: number; thick: number };
  volume?: { thin: readonly [number, number | null]; mid: readonly [number, number | null]; thick: readonly [number, number | null] };
  lift?: number;
  then?: string | null;
  hold?: number;
}

export interface BossCardDef {
  portrait: string;
  accent: string;
  name: { en: string; ru: string };
  sub: { en: string; ru: string };
  depth: number;
}

export interface BossCards {
  timeline: { dur: number; band: readonly [number, number]; portrait: readonly [number, number]; name: readonly [number, number]; sub: readonly [number, number]; hold: readonly [number, number]; out: readonly [number, number] };
  light: FxLight;
  shake: FxShake;
  bosses: Record<string, BossCardDef>;
}

export interface FxLib {
  version: number;
  fx: Record<string, FxDef>;
  /** Event key -> effect id (or `boss.<kind>`, which is a card in `bossCards`). */
  events: Record<string, string>;
  bossCards: BossCards;
}

const fail = (path: string, what: string): never => {
  throw new Error(`fx.json: ${path} ${what}`);
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, path: string, min = -Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) fail(path, `must be a number${min > -Infinity ? ` >= ${min}` : ''}`);
  return v as number;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') fail(path, 'must be a non-empty string');
  return v as string;
}

function hex(v: unknown, path: string): [number, number, number] {
  const s = str(v, path);
  const m = /^#([0-9a-f]{6})$/i.exec(s);
  if (!m) return fail(path, `must be #rrggbb, got ${s}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

function light(v: unknown, path: string): FxLight {
  if (!isObject(v)) return fail(path, 'must be an object');
  const rgb = hex(v.color, `${path}.color`);
  const curve = v.curve as LightCurve;
  if (!CURVES.includes(curve)) fail(`${path}.curve`, `unknown curve ${String(v.curve)}`);
  return {
    color: v.color as string,
    rgb,
    css: `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`,
    lin: [lin(rgb[0]), lin(rgb[1]), lin(rgb[2])],
    hex: (rgb[0] << 16) | (rgb[1] << 8) | rgb[2],
    intensity: num(v.intensity, `${path}.intensity`, 0),
    radius: num(v.radius, `${path}.radius`, 0),
    ms: num(v.ms, `${path}.ms`, 0),
    curve,
  };
}

function range(v: unknown, path: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) return fail(path, 'must be [min, max]');
  return [num(v[0], `${path}[0]`), num(v[1], `${path}[1]`)];
}

function def(id: string, v: unknown): FxDef {
  const path = `fx.${id}`;
  if (!isObject(v)) return fail(path, 'must be an object');
  const behaviour = v.behaviour as Behaviour;
  if (!BEHAVIOURS.includes(behaviour)) fail(`${path}.behaviour`, `unknown behaviour ${String(v.behaviour)}`);
  const anchor = v.anchor as Anchor;
  if (!ANCHORS.includes(anchor)) fail(`${path}.anchor`, `unknown anchor ${String(v.anchor)}`);
  if (v.blend !== 'add' && v.blend !== 'normal') fail(`${path}.blend`, `unknown blend ${String(v.blend)}`);
  const d: FxDef = {
    id,
    sheet: str(v.sheet, `${path}.sheet`),
    w: num(v.w, `${path}.w`, 1),
    h: num(v.h, `${path}.h`, 1),
    row: num(v.row ?? 0, `${path}.row`, 0),
    frames: num(v.frames, `${path}.frames`, 1),
    fps: num(v.fps, `${path}.fps`, 0.1),
    loop: v.loop === true,
    behaviour,
    blend: v.blend as Blend,
    anchor,
  };
  if (v.light !== undefined) d.light = light(v.light, `${path}.light`);
  if (isObject(v.shake)) d.shake = { px: num(v.shake.px, `${path}.shake.px`, 0), ms: num(v.shake.ms, `${path}.shake.ms`, 0) };
  if (isObject(v.tint)) {
    const rgb = hex(v.tint.color, `${path}.tint.color`);
    d.tint = { rgb: `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`, alpha: num(v.tint.alpha, `${path}.tint.alpha`, 0), ms: num(v.tint.ms, `${path}.tint.ms`, 0) };
  }
  if (isObject(v.name)) d.name = { en: String(v.name.en ?? ''), ru: String(v.name.ru ?? '') };
  if (typeof v.orient === 'boolean') d.orient = v.orient;
  if (v.speed === null || typeof v.speed === 'number') d.speed = v.speed as number | null;
  if (typeof v.hit === 'string') d.hit = v.hit;
  if (typeof v.fall === 'number') d.fall = v.fall;
  if (typeof v.start === 'string') d.start = v.start;
  if (typeof v.end === 'string') d.end = v.end;
  if (typeof v.ms === 'number') d.ms = v.ms;
  if (typeof v.reroll === 'boolean') d.reroll = v.reroll;
  if (typeof v.returns === 'boolean') d.returns = v.returns;
  if (Array.isArray(v.directions)) d.directions = true;
  if (typeof v.radius === 'number') d.radius = v.radius;
  if (Array.isArray(v.scaleSteps)) d.scaleSteps = v.scaleSteps.map((n, i) => num(n, `${path}.scaleSteps[${i}]`, 1));
  if (typeof v.rings === 'number') d.rings = v.rings;
  if (typeof v.stagger === 'number') d.stagger = v.stagger;
  if (isObject(v.specks)) d.specks = { id: str(v.specks.id, `${path}.specks.id`), count: num(v.specks.count, `${path}.specks.count`, 0) };
  if (typeof v.tintOnlyForReader === 'boolean') d.tintOnlyForReader = v.tintOnlyForReader;
  if (v.life !== undefined) d.life = range(v.life, `${path}.life`);
  if (typeof v.rise === 'number') d.rise = v.rise;
  if (isObject(v.stay)) d.stay = { frame: num(v.stay.frame, `${path}.stay.frame`, 0), ms: num(v.stay.ms, `${path}.stay.ms`, 0) };
  if (isObject(v.rows)) d.rows = { thin: num(v.rows.thin, `${path}.rows.thin`, 0), mid: num(v.rows.mid, `${path}.rows.mid`, 0), thick: num(v.rows.thick, `${path}.rows.thick`, 0) };
  if (isObject(v.volume)) {
    const part = (k: string): [number, number | null] => {
      const r = (v.volume as Record<string, unknown>)[k];
      if (!Array.isArray(r) || r.length !== 2) return fail(`${path}.volume.${k}`, 'must be [min, max|null]');
      return [num(r[0], `${path}.volume.${k}[0]`, 0), r[1] === null ? null : num(r[1], `${path}.volume.${k}[1]`, 0)];
    };
    d.volume = { thin: part('thin'), mid: part('mid'), thick: part('thick') };
  }
  if (typeof v.lift === 'number') d.lift = v.lift;
  if (v.then === null || typeof v.then === 'string') d.then = v.then as string | null;
  if (typeof v.hold === 'number') d.hold = v.hold;
  return d;
}

function bossCards(v: unknown): BossCards {
  if (!isObject(v) || !isObject(v.timeline) || !isObject(v.bosses)) return fail('bossCards', 'is missing its timeline or bosses');
  const step = (k: string): [number, number] => range((v.timeline as Record<string, unknown>)[k], `bossCards.timeline.${k}`);
  const bosses: Record<string, BossCardDef> = {};
  for (const [kind, b] of Object.entries(v.bosses)) {
    if (!isObject(b) || !isObject(b.name) || !isObject(b.sub)) return fail(`bossCards.bosses.${kind}`, 'is malformed');
    hex(b.accent, `bossCards.bosses.${kind}.accent`);
    bosses[kind] = {
      portrait: str(b.portrait, `bossCards.bosses.${kind}.portrait`),
      accent: b.accent as string,
      name: { en: str(b.name.en, `bossCards.bosses.${kind}.name.en`), ru: str(b.name.ru, `bossCards.bosses.${kind}.name.ru`) },
      sub: { en: str(b.sub.en, `bossCards.bosses.${kind}.sub.en`), ru: str(b.sub.ru, `bossCards.bosses.${kind}.sub.ru`) },
      depth: num(b.depth, `bossCards.bosses.${kind}.depth`, 1),
    };
  }
  return {
    timeline: {
      dur: num((v.timeline as Record<string, unknown>).dur, 'bossCards.timeline.dur', 1),
      band: step('band'), portrait: step('portrait'), name: step('name'), sub: step('sub'), hold: step('hold'), out: step('out'),
    },
    light: light(v.light, 'bossCards.light'),
    shake: isObject(v.shake) ? { px: num(v.shake.px, 'bossCards.shake.px', 0), ms: num(v.shake.ms, 'bossCards.shake.ms', 0) } : { px: 0, ms: 0 },
    bosses,
  };
}

/** Parses fx.json, throwing a message that names the field when its shape is wrong. */
export function parseFx(raw: unknown): FxLib {
  if (!isObject(raw)) return fail('(root)', 'must be an object');
  if (!isObject(raw.fx)) return fail('fx', 'must be an object');
  if (!isObject(raw.events)) return fail('events', 'must be an object');
  const fx: Record<string, FxDef> = {};
  for (const [id, v] of Object.entries(raw.fx)) fx[id] = def(id, v);
  const events: Record<string, string> = {};
  for (const [key, id] of Object.entries(raw.events)) events[key] = str(id, `events.${key}`);
  return { version: num(raw.version, 'version', 1), fx, events, bossCards: bossCards(raw.bossCards) };
}

/** The effect ids a def points to (its hit, the ends of a beam, the specks a wave throws, what follows a trap). */
export function linksOf(d: FxDef): string[] {
  const out: string[] = [];
  if (d.hit) out.push(d.hit);
  if (d.start) out.push(d.start);
  if (d.end) out.push(d.end);
  if (d.specks) out.push(d.specks.id);
  if (d.then) out.push(d.then);
  return out;
}

/**
 * Everything wrong with the data as a list of lines (empty when it is whole): events pointing nowhere, links to missing effects,
 * a frame row outside its sheet (when the sheet's size is known), a boss with no card.
 */
export function problems(lib: FxLib, sizeOf?: (sheet: string) => { w: number; h: number } | null): string[] {
  const out: string[] = [];
  for (const [key, id] of Object.entries(lib.events)) {
    if (id.startsWith('boss.')) {
      if (!lib.bossCards.bosses[id.slice(5)]) out.push(`event ${key}: no boss card ${id}`);
    } else if (!lib.fx[id]) out.push(`event ${key}: no effect ${id}`);
  }
  for (const d of Object.values(lib.fx)) {
    for (const link of linksOf(d)) if (!lib.fx[link]) out.push(`${d.id}: links to missing ${link}`);
    if (d.behaviour === 'tile' && (!d.rows || !d.volume)) out.push(`${d.id}: a cloud with no rows or volume`);
    if (d.behaviour === 'wave' && (!d.scaleSteps || !d.rings || !d.radius)) out.push(`${d.id}: a wave with no scale steps, rings or radius`);
    if (d.behaviour === 'fly' && typeof d.speed !== 'number') out.push(`${d.id}: a flight with no speed`);
    const size = sizeOf?.(d.sheet);
    if (sizeOf && !size) out.push(`${d.id}: sheet ${d.sheet} is missing`);
    else if (size) {
      const rows = d.rows ? Math.max(d.rows.thin, d.rows.mid, d.rows.thick) : 0;
      if ((d.row + rows + 1) * d.h > size.h) out.push(`${d.id}: row ${d.row + rows} is outside ${d.sheet}`);
      if (d.frames * d.w > size.w) out.push(`${d.id}: ${d.frames} frames of ${d.w} px do not fit in ${d.sheet}`);
    }
  }
  for (const [kind, b] of Object.entries(lib.bossCards.bosses)) if (!b.portrait) out.push(`boss ${kind}: no portrait`);
  return out;
}

// ---- what the game adds to the designer's data ---------------------------------------------------------------------------------

/**
 * The thrown stones (docs/design/stones): the dart, the curare dart and the incendiary dart are stones in Firelight, and their flight
 * and hit frames are in assets/stones-fx.png (8x8 frames: rows 0..2 the three in flight, 3 the shards of a stone, 4 the sparks of a
 * flint). They are described here in fx.json's own terms so that one player draws every thrown thing.
 */
const STONE_SHEET = 'stones-fx.png';
const STONES: ReadonlyArray<readonly [item: string, id: string, row: number, hit: string, turn: boolean]> = [
  ['missile.dart', 'stone.dart', 0, 'stone.hit', false],
  ['missile.curare', 'stone.curare', 1, 'stone.hit', false],
  ['missile.incendiary', 'stone.incendiary', 2, 'stone.sparks', true],
];

function stoneDefs(): FxDef[] {
  const base = { sheet: STONE_SHEET, w: 8, h: 8, frames: 4, blend: 'normal' as Blend, anchor: 'center' as Anchor };
  const defs: FxDef[] = STONES.map(([, id, row, hit, turn]) => ({
    ...base, id, row, fps: 14, loop: true, behaviour: 'fly', speed: 12, hit, ...(turn ? { orient: true } : {}),
  }));
  defs.push({ ...base, id: 'stone.hit', row: 3, fps: 12, loop: false, behaviour: 'flash', blend: 'add' });
  defs.push({
    ...base, id: 'stone.sparks', row: 4, fps: 12, loop: false, behaviour: 'flash', blend: 'add',
    light: light({ color: '#ff9a40', intensity: 1.5, radius: 2, ms: 160, curve: 'flash' }, 'stone.sparks.light'),
  });
  return defs;
}

/** What a hero's throw is in fx.json's keys, beyond the designer's own (their darts are the stones). */
const EXTRA_EVENTS: Readonly<Record<string, string>> = Object.fromEntries(STONES.map(([item, id]) => [`thrown.${item}`, id]));

/** fx.json with the game's own additions (the stones) merged in; the designer's file is not touched. */
export function withExtras(lib: FxLib): FxLib {
  const fx = { ...lib.fx };
  for (const d of stoneDefs()) fx[d.id] ??= d;
  return { ...lib, fx, events: { ...EXTRA_EVENTS, ...lib.events } };
}

/** Every sheet the data needs, once each. */
export function sheetPaths(lib: FxLib): string[] {
  return [...new Set(Object.values(lib.fx).map((d) => d.sheet))];
}

// ---- event -> key -------------------------------------------------------------------------------------------------------------

/** A hit is a crit when it takes this share of the target's greatest health: the core has no crit flag, so the designer's rule stands. */
export const CRIT_SHARE = 0.3;

export type AttackKey = 'attack.hit' | 'attack.crit' | 'attack.miss';

export function attackKey(hit: boolean, damage: number, targetMaxHp: number): AttackKey {
  if (!hit) return 'attack.miss';
  return targetMaxHp > 0 && damage >= CRIT_SHARE * targetMaxHp ? 'attack.crit' : 'attack.hit';
}

/** What an event looks up in fx.json's `events`, or null for the events with no look of their own. `colour` is the shattered potion's. */
export function eventKey(e: Effect, colour?: string, ht?: number): string | null {
  switch (e.type) {
    case 'zapped': return `zapped.${e.bolt ?? 'magic'}`;
    case 'thrown': return `thrown.${e.item}`;
    case 'missile': return 'missile';
    case 'scroll': return `scroll.${e.kind}`;
    case 'shattered': return colour ? `shattered.${colour}` : null;
    case 'trap': return `trap.${e.kind}`;
    case 'burst': return `burst.${e.kind}`;
    case 'special': return `special.${e.ability}`;
    case 'yell': return e.line === 'notice' ? `yell.notice.${e.kind}` : null;
    case 'attack': return attackKey(e.hit, e.damage, ht ?? 0);
    case 'levelUp': case 'resurrected': case 'amulet': case 'healed': return e.type;
    default: return null;
  }
}

/** The sprite of a monster's own missile that the game draws as a shuriken (items.png cell 15); the rest are arrows. */
export const SHURIKEN_SPRITE = 15;

// ---- frames and timing --------------------------------------------------------------------------------------------------------

/** Which frame of a sheet at `ms` since the effect began: looping ones wrap, the rest hold their last. */
export function frameAt(d: Pick<FxDef, 'frames' | 'fps' | 'loop'>, ms: number): number {
  const i = Math.floor((ms * d.fps) / 1000);
  if (i < 0) return 0;
  return d.loop ? i % d.frames : Math.min(i, d.frames - 1);
}

/** How long a one-shot effect plays its frames, ms. */
export const playMs = (d: Pick<FxDef, 'frames' | 'fps'>): number => (d.frames * 1000) / d.fps;

/** The frame of an 8-way sheet (E NE N NW W SW S SE) for a heading on the map (dx right, dy down, cells). */
export function headingFrame(dx: number, dy: number): number {
  const a = Math.atan2(-dy, dx);
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}

/** The row of a cloud's sheet for how much gas lies in the cell (thin, middle, thick). */
export function gasRow(d: FxDef, volume: number): number {
  const rows = d.rows ?? { thin: 0, mid: 1, thick: 2 };
  const v = d.volume;
  if (v) {
    if (v.thick[0] <= volume) return d.row + rows.thick;
    if (v.mid[0] <= volume) return d.row + rows.mid;
  } else if (volume >= 16) return d.row + rows.thick;
  return d.row + rows.thin;
}

/** The whole scale of a wave's ring (from `scaleSteps`) that reaches its radius, or the largest if none does (a 48 px ring spans 3 cells a step). */
export function waveScale(d: Pick<FxDef, 'w' | 'radius' | 'scaleSteps'>): number {
  const steps = d.scaleSteps ?? [1];
  const reach = (s: number): number => (d.w * s) / 32;
  for (const s of steps) if (reach(s) >= (d.radius ?? 0)) return s;
  return steps[steps.length - 1]!;
}

/**
 * How bright a light is at `ms` after it was lit, 0 to 1: `flash` rises over the first 15 % of its time and then dies away; `pulse`
 * beats at 1.5 Hz; `flicker` shakes like a fire; `steady`, `follow` and `along` burn evenly, easing out over the last fifth. `life` is
 * how long the light lasts, ms.
 */
export function lightLevel(curve: LightCurve, ms: number, life: number): number {
  if (ms < 0 || ms >= life) return 0;
  const k = ms / life;
  switch (curve) {
    case 'flash': {
      const up = 0.15;
      return k < up ? k / up : (1 - k) / (1 - up);
    }
    case 'pulse': return (0.65 + 0.35 * Math.sin((ms / 1000) * Math.PI * 3)) * Math.min(1, (1 - k) * 5, k * 8 + 0.2);
    case 'flicker': return (0.8 + 0.2 * Math.sin(ms / 70) * Math.sin(ms / 23 + 1)) * Math.min(1, (1 - k) * 5);
    default: return Math.min(1, (1 - k) * 5);
  }
}

// ---- loading ------------------------------------------------------------------------------------------------------------------

declare const __BUILD__: { commit: string; date: string } | undefined;
const VERSION = typeof __BUILD__ !== 'undefined' ? __BUILD__.commit : 'dev';

export interface LoadedFx {
  lib: FxLib;
  images: ReadonlyMap<string, HTMLImageElement>;
}

let state: LoadedFx | null = null;
let loading: Promise<LoadedFx | null> | null = null;
const waiting: Array<(loaded: LoadedFx) => void> = [];

/** The data and the sheets, once they have come; null before that (and if they never do: the older effects stay). */
export const fxState = (): LoadedFx | null => state;

/** Calls `fn` when the sheets are loaded (at once if they are). */
export function whenFx(fn: (loaded: LoadedFx) => void): void {
  if (state) fn(state);
  else waiting.push(fn);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${url}`));
    image.src = url;
  });
}

/** Installs data already in hand (tests, a preview page). */
export function setFx(loaded: LoadedFx | null): void {
  state = loaded;
  if (loaded) for (const fn of waiting.splice(0)) fn(loaded);
}

/** Fetches fx.json and its sheets, once. `base` is the assets address ('/pixel-dungeon-firelight/assets/'). Resolves null on any failure. */
export function loadFx(base: string): Promise<LoadedFx | null> {
  loading ??= (async () => {
    try {
      const response = await fetch(`${base}fx/fx.json?v=${VERSION}`);
      if (!response.ok) throw new Error(`fx.json: ${response.status}`);
      const lib = withExtras(parseFx(await response.json()));
      const paths = sheetPaths(lib);
      const loaded = await Promise.all(paths.map((path) => loadImage(`${base}${path}?v=${VERSION}`)));
      const images = new Map(paths.map((path, i) => [path, loaded[i]!] as const));
      setFx({ lib, images });
      return state;
    } catch (error) {
      console.warn('effects: not loaded, the older ones stay', error);
      return null;
    }
  })();
  return loading;
}

/** The kinds of boss that have a card. */
export const isBossKind = (lib: FxLib, kind: MobKind | string): boolean => lib.bossCards.bosses[kind] !== undefined;

// ---- the 3D atlas -------------------------------------------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The 3D effects atlas: 1024 x 768, whose top-left 256 x 256 corner the older effects keep (particles, ripples, soft shapes). The rest is
 * free for the designer's sheets (about 350 000 of the 524 000 free pixels).
 */
export const ATLAS = {
  w: 1024,
  h: 768,
  /**
   * The corner kept for part 11's effects sheet (ui/growth/growth-fx.png, 64 x 128: sparks, runes, wisps, the mastery sigil): the bottom of
   * the left strip, which the designer's sheets are not packed into. r3d/growth3d.ts puts the sheet there once it has loaded.
   */
  growth: { x: 0, y: 640, w: 64, h: 128 } as Rect,
  free: [{ x: 256, y: 0, w: 768, h: 768 }, { x: 0, y: 256, w: 256, h: 384 }, { x: 64, y: 640, w: 192, h: 128 }] as readonly Rect[],
};

/**
 * Lays sheets out in free rectangles of an atlas (best short side fit), one pixel apart, tallest first. Returns where each went, or null
 * if they do not all fit. The 3D view puts the sheets into the effects atlas beside what it already holds, so every effect is one more
 * instance of the same two draws.
 */
export function packSheets(sheets: ReadonlyArray<{ path: string; w: number; h: number }>, regions: readonly Rect[], gap = 1): Map<string, Rect> | null {
  const free: Rect[] = regions.map((r) => ({ ...r }));
  const placed = new Map<string, Rect>();
  const order = [...sheets].sort((a, b) => b.h - a.h || b.w - a.w || (a.path < b.path ? -1 : 1));
  for (const sheet of order) {
    const w = sheet.w + gap;
    const h = sheet.h + gap;
    let best = -1;
    let bestShort = Infinity;
    let bestLong = Infinity;
    for (let i = 0; i < free.length; i++) {
      const f = free[i]!;
      if (f.w < w || f.h < h) continue;
      const short = Math.min(f.w - w, f.h - h);
      const long = Math.max(f.w - w, f.h - h);
      if (short < bestShort || (short === bestShort && long < bestLong)) {
        best = i;
        bestShort = short;
        bestLong = long;
      }
    }
    if (best < 0) return null;
    const at = free[best]!;
    const spot: Rect = { x: at.x, y: at.y, w: sheet.w, h: sheet.h };
    placed.set(sheet.path, spot);
    // Every free rectangle the new one overlaps is cut into what is left round it.
    const used: Rect = { x: spot.x, y: spot.y, w, h };
    for (let i = free.length - 1; i >= 0; i--) {
      const f = free[i]!;
      if (used.x >= f.x + f.w || used.x + used.w <= f.x || used.y >= f.y + f.h || used.y + used.h <= f.y) continue;
      free.splice(i, 1);
      if (used.x > f.x) free.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
      if (used.x + used.w < f.x + f.w) free.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - used.x - used.w, h: f.h });
      if (used.y > f.y) free.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
      if (used.y + used.h < f.y + f.h) free.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - used.y - used.h });
    }
    // Drop the free rectangles that lie wholly inside another.
    for (let i = free.length - 1; i >= 0; i--) {
      const a = free[i]!;
      for (let j = 0; j < free.length; j++) {
        const b = free[j]!;
        if (i !== j && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
          free.splice(i, 1);
          break;
        }
      }
    }
  }
  return placed;
}
