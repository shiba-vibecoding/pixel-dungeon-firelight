import type { EffectId, SkinVariant } from '@pd/core';
import { audio } from './audio';
import { type DecorArt, decorArt, type DigitsArt, type FireArt, type FxArt } from './flart';
import { t } from './i18n';
import { quality } from './quality';
import { NOTHING, type Worn } from './wear';

/*
 * «Привал»: the home screen's live scene (design system v18, components/CampScreen, CampHero; the
 * reference runtime is PD.camp in bundle.js, ported here with types). A canvas of 94×203 pixels shown
 * ×4: background, stars, torches, the campfire, the hero and his shadow, the light ('lighter'), the
 * particles. Over it, in the `.pd-camp-layer`, the hero as a button, his phrase's bubble, and the class
 * name with its arrows.
 *
 * The scene draws when it is told to (frame(now)): the game's own frame loop drives the camp on the
 * home screen, so nothing runs behind a window and the dev clock (window.__pd.advance) moves it too;
 * a scene shown on its own can run itself (`own`).
 *
 * Firelight: the four heroes of the original Pixel Dungeon 1.9, drawn from their own sprite sheets (first armour, row 1) and the looks of
 * Pixel-Mart cut from the look's sheet; the scene is the gate (outdoor, with its seasons).
 */

export type CampScene = 'outdoor';
export type Season = 'summer' | 'autumn' | 'winter';

/** The heroes of the original, in the order of avatars.png and of `t.camp.cls`. */
export const CAMP_ORDER: readonly string[] = ['warrior', 'mage', 'rogue', 'huntress'];

/** The classes the camp offers. */
export const campClasses = (): string[] => [...CAMP_ORDER];

/** Each class's sprite sheet (the huntress's is the ranger's). */
export const SHEET: Readonly<Record<string, string>> = { warrior: 'warrior', mage: 'mage', rogue: 'rogue', huntress: 'ranger' };

/** The season the camp opens in: December to February winter, September to November autumn, else summer. */
export function seasonOf(date: Date): Season {
  const month = date.getMonth();
  return month === 11 || month <= 1 ? 'winter' : month >= 8 ? 'autumn' : 'summer';
}

const W = 94;
const H = 203;
/** Where the fire and the hero stand, in the background's pixels. */
const FIRE: readonly [number, number] = [24, 118];
const HERO: readonly [number, number] = [50, 119];

type LightSpec = readonly [x: number, y: number, r: number, color: string, pulse: number];

interface Place {
  torches: ReadonlyArray<readonly [number, number]>;
  lights: readonly LightSpec[];
  /** Dust in the air, and its colour. */
  motes?: string;
  /** Rows of sky, where stars are. */
  sky?: number;
}

const PLACES: Record<CampScene, Place> = {
  outdoor: { torches: [[33, 75], [61, 75]], lights: [], sky: 58 },
};

/** The armour tier the camp shows (the sheets' row 1: the first armour, as a new hero wears it). */
export const TIER_ROW = 1;
/** The hero's canvas: his frame at (6, 12) in it. */
const SIL_W = 24;
const SIL_H = 32;
const SIL_X = 6;
const SIL_Y = 12;

const BASE = `${import.meta.env.BASE_URL}assets/`;
const images = new Map<string, HTMLImageElement>();

export function image(path: string): HTMLImageElement {
  let img = images.get(path);
  if (!img) {
    img = new Image();
    img.src = `${BASE}${path}`;
    images.set(path, img);
  }
  return img;
}

export const ready = (img: HTMLImageElement): boolean => img.complete && img.naturalWidth > 0;

export const background = (_scene: CampScene, season: Season): string => `camp/camp-outdoor-${season}.png`;

/** Small seeded noise, so that the camp's sparks and stars are the same on every device. */
function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let a = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

const rgbOf = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Light as Pixel Dungeon draws it: stepped rings, dithered at the edge. */
export function lightCanvas(r: number, color: string): HTMLCanvasElement {
  const size = r * 2 + 1;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  const data = g.createImageData(size, size);
  const rgb = rgbOf(color);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - r) * (x - r) + (y - r) * (y - r) * 1.25) / r;
      const threshold = (BAYER[(y % 4) * 4 + (x % 4)]! + 0.5) / 16;
      let a = 0;
      if (dist < 0.34) a = 0.26;
      else if (dist < 0.4) a = threshold < 0.5 ? 0.26 : 0.15;
      else if (dist < 0.62) a = 0.15;
      else if (dist < 0.7) a = threshold < 0.5 ? 0.15 : 0.07;
      else if (dist < 0.94) a = 0.07;
      else if (dist < 1) a = threshold < 0.4 ? 0.07 : 0;
      const i = (y * size + x) * 4;
      data.data[i] = rgb[0];
      data.data[i + 1] = rgb[1];
      data.data[i + 2] = rgb[2];
      data.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(data, 0, 0);
  return canvas;
}

interface Light {
  x: number;
  y: number;
  /** 2: the fire's flicker; 1: slow pulse; 0: steady. */
  pulse: number;
  rings: [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement];
}

type ParticleKind = 'spark' | 'snow' | 'leaf' | 'shoot' | 'mote' | 'twinkle' | 'burst' | 'fly';

interface Particle {
  k: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Age and lifetime (ms). */
  a: number;
  l: number;
  s?: number;
  c?: string;
  ph?: number;
  r?: number;
  near?: boolean;
}

type Mode = 'idle' | 'tap' | 'sulk' | 'swipe' | 'blink';

/** A small picture drawn on the scene at scene pixels (the shop's try-on: placeholder icons for what the scene has no art of its own for). */
export interface CampExtra {
  img: CanvasImageSource;
  x: number;
  y: number;
  /** Bobs a little. */
  bob?: boolean;
  alpha?: number;
}

/**
 * What the scene wears on top of the plain camp, from Pixel-Mart's catalogue (catalog.ts, cosmetics.ts): never the rules, only looks.
 * Changed with `dress()` while the scene runs.
 */
export interface CampDress {
  /** A campfire style (the designer's art): the flame, the logs, the sparks and the colour of the light; null for the camp's own fire. */
  fire?: FireArt | null;
  /** The decorations that stand in the camp, by catalogue id: each at its own place on the ground, sorted by feet with the fire and the hero. */
  decor?: readonly string[];
  /** What a class's hero wears (flart look, hat, pet, trail): by the class's name. */
  wear?: (heroClass: string) => Worn;
  /** The try-on plays an effect or shows a number style on the spot (a kill's, a fall's, damage digits): these loop beside the hero. */
  demo?: { kill?: FxArt; death?: FxArt; digits?: DigitsArt } | null;
  extras?: readonly CampExtra[];
}

export interface CampOptions {
  scene: CampScene;
  season: Season;
  /** The hero's place in campClasses(). */
  hero: number;
  /** The look a class wears (a Pixel-Mart skin), by the class's name. */
  skinOf?: (heroClass: string) => SkinVariant | undefined;
  effect?: EffectId | null;
  /** Only this part of the scene, in background pixels, shown at `scale`. */
  crop?: readonly [x: number, y: number, w: number, h: number];
  /**
   * The scene runs on to the edges of its element (design v20, CampWide and CampTall): the sides go on as a reflection of
   * the scene's edges and darken, dithered, into the void; the top is the sky's darkest colour, the bottom the ground reflected.
   * Call `resize()` once it is on the page and whenever its size changes.
   */
  fill?: boolean;
  /** No class name with arrows under the hero. */
  label?: boolean;
  scale?: number;
  /** Name and arrows, and a tappable hero; off for a preview. */
  interactive?: boolean;
  /** The scene runs its own frames while it is on the page (a preview); the home screen is driven by the game's frame loop. */
  own?: boolean;
  /** The hero changed (a swipe or an arrow). */
  onHero?: (heroClass: string) => void;
}

/** One scene, on its element. */
export class Camp {
  readonly canvas = document.createElement('canvas');
  readonly layer = document.createElement('div');
  readonly classes = campClasses();
  private readonly ctx: CanvasRenderingContext2D;
  private crop: readonly [number, number, number, number];
  /** The extended backgrounds (fill), by scene and season, made once for the size they were made at. */
  private readonly extCache = new Map<string, HTMLCanvasElement>();
  private lastShift = 0;
  private scale: number;
  private scene: CampScene;
  private season: Season;
  private hero: number;
  private place: Place;
  private lights: Light[] = [];
  private stars: Array<[number, number, number]> = [];
  private parts: Particle[] = [];
  private readonly random = rng(7);
  private t0 = 0;
  private last = 0;
  private now = performance.now();
  private taps: number[] = [];
  private mode: Mode = 'idle';
  private modeAt = 0;
  private next: number | null = null;
  private face = 1;
  private bubbleUntil = 0;
  private said = 0;
  private lastSwipe = -1e9;
  private raf = 0;
  private readonly blinks = new Map<string, HTMLCanvasElement>();
  private dressing: CampDress = {};
  private fireScratch: HTMLCanvasElement | null = null;
  private readonly silhouette = document.createElement('canvas');
  private readonly heroButton = document.createElement('button');
  private readonly bubble = document.createElement('div');
  private readonly label = document.createElement('div');
  private readonly name = document.createElement('span');
  private readonly reduced = quality.reducedMotion;
  private readonly text = t.camp;

  constructor(readonly host: HTMLElement, private readonly options: CampOptions) {
    this.crop = options.crop ?? [0, 0, W, H];
    this.scale = options.scale ?? 4;
    this.scene = options.scene;
    this.season = options.season;
    this.hero = Math.max(0, Math.min(this.classes.length - 1, options.hero));
    this.place = PLACES[this.scene];
    this.canvas.className = 'pd-camp-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    // The hero's own pixels at (6, 12), with room round them for an aura (24 x 28) and a hat (16 x 22).
    this.silhouette.width = SIL_W;
    this.silhouette.height = SIL_H;
    this.layer.className = 'pd-camp-layer';
    this.size();
    host.classList.add('pd-camp');
    host.prepend(this.canvas, this.layer);

    if (options.interactive !== false) this.buildHero();
    this.setScene();
    for (const file of ['camp/fire.png', 'camp/torch.png', 'camp/sulk.png', ...Object.values(SHEET).map((sheet) => `${sheet}.png`)]) image(file);
    if (options.own) {
      const run = (now: number): void => {
        if (!this.canvas.isConnected) return;
        this.frame(now);
        this.raf = requestAnimationFrame(run);
      };
      this.raf = requestAnimationFrame(run);
    }
  }

  /** The canvas and its layer at the crop's size. */
  private size(): void {
    const [, , cw, ch] = this.crop;
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.canvas.style.width = `${cw * this.scale}px`;
    this.canvas.style.height = `${ch * this.scale}px`;
    this.layer.style.width = this.canvas.style.width;
    this.layer.style.height = this.canvas.style.height;
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * How far the scene may be lowered (px): what a filled scene has above its first row. A tall phone lowers it so the
   * hero's feet stand 16 px above the sheet (campui.ts), and the extended sky shows above.
   */
  get ext(): number {
    return this.options.fill ? -this.crop[1] * this.scale : 0;
  }

  /** Where the room itself lies across the screen (client x): a filled scene is wider, with dark dithered sides, which a photo leaves out. */
  roomSpan(): { left: number; right: number } {
    const box = this.canvas.getBoundingClientRect();
    const k = box.width / Math.max(1, this.canvas.width);
    return { left: box.left - this.crop[0] * k, right: box.left + (W - this.crop[0]) * k };
  }

  /** The scene's pixel size on screen: the home screen picks it from the room it has (campui.ts), so the hero is big. */
  setScale(scale: number): void {
    if (scale === this.scale || !(scale > 0)) return;
    this.scale = scale;
    this.extCache.clear();
    this.size();
    this.layout();
    this.resize();
    this.shift(this.lastShift);
  }

  /** A filled scene to the size its element has now (a turn of the phone, the keyboard, a window resized). */
  resize(): void {
    if (!this.options.fill) return;
    const { scale } = this;
    const ex = Math.max(0, Math.ceil(((this.host.clientWidth || W * scale) / scale - W) / 2));
    const et = Math.ceil((this.host.clientHeight || H * scale) / scale / 2);
    const next: [number, number, number, number] = [-ex, -et, W + 2 * ex, H + et + 24];
    if (next.every((value, i) => value === this.crop[i])) return;
    this.crop = next;
    this.extCache.clear();
    this.size();
    this.layout();
    this.shift(this.lastShift);
  }

  /** The hero's button, his bubble and the class name, where the crop puts them. */
  private layout(): void {
    const { scale } = this;
    const [hx, hy] = this.px(HERO[0] - 6, HERO[1] - 15);
    Object.assign(this.heroButton.style, { left: `${hx - 8}px`, top: `${hy - 8}px`, width: `${12 * scale + 16}px`, height: `${15 * scale + 12}px` });
    const [lx, ly] = this.px(HERO[0], HERO[1] + 2);
    Object.assign(this.label.style, { left: `${lx}px`, top: `${ly}px` });
    const [bx, by] = this.px(HERO[0], HERO[1] - 17);
    Object.assign(this.bubble.style, { left: `${bx}px`, top: `${by}px` });
  }

  /**
   * The background carried to the crop's edges: the sides reflect the scene's edges and, from 4 pixels out, darken over 26
   * into the void by an ordered 4×4 dither; the top is the darkest colour of the first row (sky, vault) with a few stars where
   * there is sky; the bottom reflects the ground.
   */
  private extBg(bg: HTMLImageElement): HTMLCanvasElement | null {
    if (!ready(bg)) return null;
    const key = `${this.scene}-${this.season}`;
    const cached = this.extCache.get(key);
    if (cached) return cached;
    const [cx, cy, cw, ch] = this.crop;
    const ox = -cx;
    const oy = -cy;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bg, ox, oy);
    const data = g.getImageData(0, 0, cw, ch);
    const a = data.data;
    const P = 2 * W;
    const rr = rng(11);
    let best = 0;
    let top: [number, number, number] = [11, 11, 9];
    for (let x = 0; x < W; x++) {
      const i = (oy * cw + ox + x) * 4;
      const lum = a[i]! + a[i + 1]! + a[i + 2]!;
      if (!x || lum < best) {
        best = lum;
        top = [a[i]!, a[i + 1]!, a[i + 2]!];
      }
    }
    for (let y = oy; y < oy + H; y++) {
      for (let x = 0; x < cw; x++) {
        const sx = x - ox;
        if (sx >= 0 && sx < W) continue;
        let m = ((sx % P) + P) % P;
        m = m < W ? m : P - 1 - m;
        const i = (y * cw + x) * 4;
        const j = (y * cw + ox + m) * 4;
        a[i] = a[j]!;
        a[i + 1] = a[j + 1]!;
        a[i + 2] = a[j + 2]!;
        a[i + 3] = 255;
      }
    }
    for (let y = 0; y < ch; y++) {
      if (y >= oy && y < oy + H) continue;
      for (let x = 0; x < cw; x++) {
        const i = (y * cw + x) * 4;
        if (y < oy) {
          const star = this.place.sky !== undefined && rr() < 0.012;
          a[i] = star ? 232 : top[0];
          a[i + 1] = star ? 226 : top[1];
          a[i + 2] = star ? 200 : top[2];
        } else {
          const j = ((2 * (oy + H) - 1 - y) * cw + x) * 4;
          a[i] = a[j]!;
          a[i + 1] = a[j + 1]!;
          a[i + 2] = a[j + 2]!;
        }
        a[i + 3] = 255;
      }
    }
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const dd = x < ox ? ox - x : x >= ox + W ? x - ox - W + 1 : 0;
        if (dd <= 4) continue;
        const k = Math.min(1, (dd - 4) / 26);
        const th = (BAYER[(y % 4) * 4 + (x % 4)]! + 0.5) / 16;
        const i = (y * cw + x) * 4;
        if (th < k) {
          a[i] = 11;
          a[i + 1] = 11;
          a[i + 2] = 9;
        } else {
          a[i] = Math.round(a[i]! * (1 - 0.4 * k));
          a[i + 1] = Math.round(a[i + 1]! * (1 - 0.4 * k));
          a[i + 2] = Math.round(a[i + 2]! * (1 - 0.35 * k));
        }
      }
    }
    g.putImageData(data, 0, 0);
    this.extCache.set(key, canvas);
    return canvas;
  }

  /** The class on the scene now. */
  get heroClass(): string {
    return this.classes[this.hero] ?? 'warrior';
  }

  private px(x: number, y: number): [number, number] {
    return [(x - this.crop[0]) * this.scale, (y - this.crop[1]) * this.scale];
  }

  private buildHero(): void {
    const button = this.heroButton;
    button.className = 'pd-camp-hero';
    button.type = 'button';
    this.label.className = 'pd-camp-name';
    const prev = document.createElement('button');
    prev.className = 'pd-camp-arrow prev';
    prev.type = 'button';
    prev.ariaLabel = this.text.prev;
    const next = document.createElement('button');
    next.className = 'pd-camp-arrow next';
    next.type = 'button';
    next.ariaLabel = this.text.next;
    this.label.append(prev, this.name, next);
    this.bubble.className = 'pd-camp-bubble';
    this.bubble.hidden = true;
    this.bubble.setAttribute('role', 'status');
    this.layer.append(button, this.bubble);
    if (this.options.label !== false) this.layer.append(this.label);
    this.layout();
    this.refreshName();
    button.addEventListener('click', () => {
      if (this.now - this.lastSwipe > 320) this.tap();
    });
    prev.addEventListener('click', () => this.swipe(-1));
    next.addEventListener('click', () => this.swipe(1));
    let from: number | null = null;
    this.host.addEventListener('pointerdown', (event) => {
      from = event.clientX;
    });
    this.host.addEventListener('pointerup', (event) => {
      const target = event.target as Element | null;
      if (from !== null && Math.abs(event.clientX - from) > 40 && !target?.closest('button:not(.pd-camp-hero)')) this.swipe(event.clientX < from ? 1 : -1);
      from = null;
    });
    this.host.addEventListener('pointercancel', () => {
      from = null;
    });
  }

  private refreshName(): void {
    const index = CAMP_ORDER.indexOf(this.heroClass);
    this.name.textContent = this.text.cls[index] ?? this.heroClass;
    this.heroButton.ariaLabel = this.name.textContent;
  }

  private setScene(): void {
    this.place = PLACES[this.scene];
    const specs: LightSpec[] = [
      [FIRE[0], FIRE[1] - 6, 30, '#ff9a3a', 2],
      ...this.place.torches.map((tc): LightSpec => [tc[0], tc[1] - 3, 9, '#ffb050', 2]),
      ...this.place.lights,
    ];
    if (this.dressing.fire) specs[0] = [FIRE[0], FIRE[1] - 6, 30, this.dressing.fire.light, 2];
    this.lights = specs.map((spec) => ({
      x: spec[0], y: spec[1], pulse: spec[4],
      rings: [lightCanvas(spec[2] - 1, spec[3]), lightCanvas(spec[2], spec[3]), lightCanvas(spec[2] + 1, spec[3])],
    }));
    this.stars = [];
    const bg = image(background(this.scene, this.season));
    if (ready(bg)) this.scanStars(bg);
    else bg.addEventListener('load', () => this.scanStars(bg), { once: true });
  }

  /** The stars are the background's pale pixels in the sky; they twinkle. */
  private scanStars(bg: HTMLImageElement): void {
    const sky = this.place.sky;
    if (!sky || image(background(this.scene, this.season)) !== bg) return;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bg, 0, 0);
    const data = g.getImageData(0, 0, W, sky).data;
    this.stars = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === 232 && data[i + 1] === 226 && data[i + 2] === 200) this.stars.push([(i / 4) % W, Math.floor(i / 4 / W), this.random() * 9]);
    }
  }

  /** Puts on (or takes off) a campfire style, tints and extras; the scene goes on running. */
  dress(patch: CampDress): void {
    const fireChanged = 'fire' in patch && (patch.fire?.flame ?? null) !== (this.dressing.fire?.flame ?? null);
    this.dressing = { ...this.dressing, ...patch };
    if (fireChanged) this.setScene();
  }

  /** The hero says a line in his bubble (the try-on shows a quip pack so). */
  speak(text: string, ms = 2600): void {
    this.say(text, ms);
  }

  /** The sheet and row a class is drawn from: its own sheet, or a Pixel-Mart look's (the sheets share their layout). */
  private source(index: number): { img: HTMLImageElement; row: number; key: string } {
    const name = this.classes[index] ?? 'warrior';
    const file = SHEET[name] ?? 'warrior';
    // A look of the shop's catalogue (the designer's sheet, the same layout): its own picture's address keys the blink.
    const look = this.dressing.wear?.(name).look;
    if (look) return { img: look.sheet, row: TIER_ROW, key: `${name}-${look.sheet.src}` };
    const skin = this.options.skinOf?.(name);
    if (skin) {
      const sheet = image(`skins/${file}-${skin}.png`);
      if (ready(sheet)) return { img: sheet, row: TIER_ROW, key: `${name}-${skin}` };
    }
    return { img: image(`${file}.png`), row: TIER_ROW, key: name };
  }

  /** The hero with his eyes shut: the dark eye pixels take the colour of the pixel above. */
  private blinkFrame(src: { img: HTMLImageElement; row: number; key: string }): HTMLCanvasElement | null {
    const cached = this.blinks.get(src.key);
    if (cached) return cached;
    if (!ready(src.img)) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 12;
    canvas.height = 15;
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(src.img, 0, src.row * 15, 12, 15, 0, 0, 12, 15);
    const d = g.getImageData(0, 0, 12, 15);
    for (let y = 1; y < 8; y++) {
      for (let x = 0; x < 12; x++) {
        const i = (y * 12 + x) * 4;
        if (d.data[i + 3] && !d.data[i] && !d.data[i + 1] && !d.data[i + 2]) {
          const j = ((y - 1) * 12 + x) * 4;
          d.data[i] = d.data[j]!;
          d.data[i + 1] = d.data[j + 1]!;
          d.data[i + 2] = d.data[j + 2]!;
        }
      }
    }
    g.putImageData(d, 0, 0);
    this.blinks.set(src.key, canvas);
    return canvas;
  }

  private drawHero(t: number, now: number): void {
    const { ctx } = this;
    let src = this.source(this.hero);
    let f = [0, 0, 0, 1, 0, 0, 1, 1][Math.floor(t / 1000) % 8]!;
    let dx = 0;
    let dark = 0;
    let flip = true;
    let blink = t % 4300 < 140 || (this.mode === 'blink' && t % 1200 < 160);
    if (this.mode === 'tap') {
      f = [13, 14, 15, 0][Math.min(3, Math.floor((now - this.modeAt) / 67))]!;
      blink = false;
    }
    if (this.mode === 'sulk') {
      flip = false;
      f = 1;
      blink = false;
    }
    if (this.mode === 'swipe') {
      const p = (now - this.modeAt) / (this.reduced ? 120 : 260);
      const shift = this.reduced ? 0 : 6;
      if (p < 1) {
        dark = Math.min(1, p * 1.4);
        dx = -this.face * Math.round(p * shift);
      } else if (p < 2) {
        if (this.next !== null) {
          this.hero = this.next;
          this.next = null;
          this.refreshName();
          this.options.onHero?.(this.heroClass);
          src = this.source(this.hero);
        }
        dark = Math.max(0, 1 - (p - 1) * 1.4);
        dx = this.face * Math.round((2 - p) * shift);
      } else {
        this.mode = 'idle';
      }
    }
    const x = HERO[0] - 6 + dx - this.crop[0];
    const y = HERO[1] - 15 - this.crop[1];
    const sg = this.silhouette.getContext('2d')!;
    sg.clearRect(0, 0, SIL_W, SIL_H);
    const worn = this.dressing.wear?.(this.classes[this.hero] ?? '') ?? NOTHING;
    // A legendary look's aura behind him (its feet at (12, 26), his at (6, 14)).
    const aura = worn.look?.aura;
    if (aura) sg.drawImage(aura.image, (Math.floor(now / aura.ms) % aura.frames) * aura.w, 0, aura.w, aura.h, SIL_X + 6 - aura.feetX, SIL_Y + 14 - aura.feetY, aura.w, aura.h);
    const blinked = blink && f === 0 ? this.blinkFrame(src) : null;
    if (blinked) sg.drawImage(blinked, SIL_X, SIL_Y);
    else if (ready(src.img)) sg.drawImage(src.img, f * 12, src.row * 15, 12, 15, SIL_X, SIL_Y, 12, 15);
    // The mask of what glows, added onto itself in a pulse.
    const look = worn.look;
    if (look?.glow && ready(look.glow)) {
      sg.globalCompositeOperation = 'lighter';
      sg.globalAlpha = look.pulse.min + (look.pulse.max - look.pulse.min) * (0.5 + 0.5 * Math.sin((now / 1000) * look.pulse.hz * Math.PI * 2));
      sg.drawImage(look.glow, f * 12, src.row * 15, 12, 15, SIL_X, SIL_Y, 12, 15);
      sg.globalAlpha = 1;
      sg.globalCompositeOperation = 'source-over';
    }
    // The hat: its cell (16 x 22, his frame at (2, 7) in it) of the same frame and armour.
    const hat = worn.hat;
    if (hat) {
      sg.drawImage(hat.image, f * hat.w, src.row * hat.h, hat.w, hat.h, SIL_X - hat.heroX, SIL_Y - hat.heroY, hat.w, hat.h);
      if (hat.glow) {
        sg.globalCompositeOperation = 'lighter';
        sg.globalAlpha = 0.7;
        sg.drawImage(hat.glow, f * hat.w, src.row * hat.h, hat.w, hat.h, SIL_X - hat.heroX, SIL_Y - hat.heroY, hat.w, hat.h);
        sg.globalAlpha = 1;
        sg.globalCompositeOperation = 'source-over';
      }
    }
    if (dark) {
      sg.globalCompositeOperation = 'source-atop';
      sg.fillStyle = `rgba(6,6,10,${Math.min(1, dark).toFixed(2)})`;
      sg.fillRect(0, 0, SIL_W, SIL_H);
      sg.globalCompositeOperation = 'source-over';
    }
    // A shadow under the feet.
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(x + 2, y + 14, 8, 1);
    ctx.fillRect(x + 3, y + 15, 6, 1);
    ctx.save();
    if (flip) {
      ctx.translate(x - SIL_X + SIL_W, y - SIL_Y);
      ctx.scale(-1, 1);
      ctx.drawImage(this.silhouette, 0, 0);
    } else {
      ctx.drawImage(this.silhouette, x - SIL_X, y - SIL_Y);
    }
    ctx.restore();
    if (this.mode === 'sulk') {
      const mark = image('camp/sulk.png');
      if (ready(mark) && Math.floor(t / 400) % 2) ctx.drawImage(mark, x + 8, y - 6);
    }
  }

  private spawn(dt: number): void {
    const { parts, random: R } = this;
    const { effect } = this.options;
    const calm = quality.light ? 0.5 : 1;
    const outdoor = this.scene === 'outdoor';
    // Sparks of the fire.
    if (R() < dt * 0.008) {
      parts.push({ k: 'spark', x: FIRE[0] + (R() * 6 - 3), y: FIRE[1] - 10, vx: (R() - 0.5) * 0.006, vy: -0.018 - R() * 0.012, a: 0, l: 700 + R() * 900 });
    }
    if (outdoor && this.season === 'winter' && R() < dt * 0.03 * calm) {
      parts.push({ k: 'snow', x: R() * W, y: -2, vx: (R() - 0.5) * 0.004, vy: 0.012 + R() * 0.01, a: 0, l: 20000, s: R() < 0.2 ? 2 : 1 });
    }
    if (outdoor && this.season === 'autumn' && R() < dt * 0.0025) {
      parts.push({
        k: 'leaf', x: R() * W, y: 40 + R() * 30, vx: 0.008 + R() * 0.006, vy: 0.006 + R() * 0.005, a: 0, l: 9000,
        c: ['#d8682a', '#b8402a', '#e0a030'][Math.floor(R() * 3)]!, ph: R() * 6,
      });
    }
    if (outdoor && this.season === 'summer' && !this.reduced && R() < dt * 0.00012) {
      parts.push({ k: 'shoot', x: 10 + R() * 50, y: 4 + R() * 16, vx: 0.07, vy: 0.025, a: 0, l: 420 });
    }
    if (this.place.motes && R() < dt * 0.004 * calm) {
      parts.push({ k: 'mote', x: R() * W, y: 60 + R() * 70, vx: (R() - 0.5) * 0.003, vy: -0.004 - R() * 0.004, a: 0, l: 3000 + R() * 3000, c: this.place.motes });
    }
    if (effect === 'sparks' && R() < dt * 0.006) {
      parts.push({ k: 'twinkle', x: HERO[0] - 7 + R() * 14, y: HERO[1] - 18 + R() * 16, vx: 0, vy: -0.002, a: 0, l: 520 });
    }
    if (effect === 'snow' && R() < dt * 0.012) {
      parts.push({ k: 'snow', x: HERO[0] - 8 + R() * 16, y: HERO[1] - 22, vx: (R() - 0.5) * 0.003, vy: 0.01 + R() * 0.006, a: 0, l: 1700, s: 1, near: true });
    }
    if (effect === 'fireflies' && !parts.some((p) => p.k === 'fly')) {
      for (let n = 0; n < 4; n++) parts.push({ k: 'fly', x: 0, y: 0, vx: 0, vy: 0, a: 0, l: 1e12, ph: n * 1.6, r: 7 + (n % 2) * 3 });
    }
  }

  private drawParts(now: number, dt: number): void {
    const { ctx, crop, random: R } = this;
    this.parts = this.parts.filter((p) => {
      p.a += dt;
      return p.a < p.l && p.y < H + 2;
    });
    for (const p of this.parts) {
      const q = p.a / p.l;
      if (p.k === 'fly') {
        const ph = p.ph ?? 0;
        const x = HERO[0] + Math.cos(now / 900 + ph) * (p.r ?? 8);
        const y = HERO[1] - 9 + Math.sin(now / 700 + ph * 1.3) * 5;
        if (Math.sin(now / 300 + ph * 3) > -0.4) {
          ctx.fillStyle = 'rgba(200,255,120,.6)';
          ctx.fillRect(Math.round(x) - 1 - crop[0], Math.round(y) - crop[1], 3, 1);
          ctx.fillRect(Math.round(x) - crop[0], Math.round(y) - 1 - crop[1], 1, 3);
          ctx.fillStyle = '#e8ff9a';
          ctx.fillRect(Math.round(x) - crop[0], Math.round(y) - crop[1], 1, 1);
        }
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.k === 'spark') {
        p.vx += (R() - 0.5) * 0.0006 * dt;
        const sparks = this.dressing.fire;
        if (sparks && ready(sparks.sparks)) {
          // The style's own sparks: four stages of 3 x 3, from the hot one to the cool.
          const stage = Math.min(sparks.sparkFrames - 1, Math.floor(q * sparks.sparkFrames));
          ctx.drawImage(sparks.sparks, stage * sparks.sparkW, 0, sparks.sparkW, sparks.sparkH, Math.round(p.x) - 1 - crop[0], Math.round(p.y) - 1 - crop[1], sparks.sparkW, sparks.sparkH);
          continue;
        }
        ctx.fillStyle = q < 0.3 ? '#fff3a0' : q < 0.65 ? '#ffb02e' : '#c0301a';
      } else if (p.k === 'snow') {
        p.x += Math.sin((now + p.l) / 700) * 0.01;
        ctx.fillStyle = p.near ? '#ffffff' : 'rgba(230,238,248,.9)';
        if (p.y > HERO[1] + 4 && p.near) p.a = p.l;
        if (!p.near && p.y > 98 + (p.x % 7) * 9) p.a = p.l;
      } else if (p.k === 'leaf') {
        p.x += Math.sin(now / 400 + (p.ph ?? 0)) * 0.02;
        ctx.fillStyle = p.c ?? '#d8682a';
        if (p.y > 100 + (p.ph ?? 0) * 9) {
          p.vx = 0;
          p.vy = 0;
        }
      } else if (p.k === 'mote') {
        ctx.fillStyle = p.c ?? '#fff';
        ctx.globalAlpha = Math.sin(q * Math.PI) * 0.9;
      } else if (p.k === 'twinkle') {
        ctx.fillStyle = '#ffeba4';
        const cx = Math.round(p.x) - crop[0];
        const cy = Math.round(p.y) - crop[1];
        if (q > 0.25 && q < 0.7) {
          ctx.fillRect(cx - 1, cy, 3, 1);
          ctx.fillRect(cx, cy - 1, 1, 3);
        }
        ctx.fillStyle = '#ffffff';
      } else if (p.k === 'shoot') {
        ctx.fillStyle = 'rgba(232,226,200,.5)';
        ctx.fillRect(Math.round(p.x - 2) - crop[0], Math.round(p.y - 1) - crop[1], 2, 1);
        ctx.fillStyle = '#ffffff';
      } else if (p.k === 'burst') {
        ctx.fillStyle = q < 0.5 ? '#ffeba4' : '#ffb02e';
      }
      ctx.fillRect(Math.round(p.x) - crop[0], Math.round(p.y) - crop[1], p.s ?? 1, p.s ?? 1);
      ctx.globalAlpha = 1;
    }
  }

  /** One frame, at `now` (ms, the game's frame clock). */
  frame(now: number): void {
    if (!this.t0) {
      this.t0 = now;
      this.last = now;
    }
    const dt = Math.max(0, Math.min(60, now - this.last));
    this.last = now;
    this.now = now;
    const t = now - this.t0;
    const { ctx, crop } = this;
    if (this.mode === 'tap' && now - this.modeAt > 280) this.mode = 'idle';
    if (this.mode === 'sulk' && now - this.modeAt > 3000) {
      this.mode = 'idle';
      this.bubble.hidden = true;
    }
    if (this.bubbleUntil && now > this.bubbleUntil) {
      this.bubble.hidden = true;
      this.bubbleUntil = 0;
    }
    this.spawn(dt);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const bg = image(background(this.scene, this.season));
    if (this.options.fill) {
      const extended = this.extBg(bg);
      if (extended) ctx.drawImage(extended, 0, 0);
    } else if (ready(bg)) {
      ctx.drawImage(bg, -crop[0], -crop[1]);
    }
    if (!this.reduced) {
      for (const s of this.stars) {
        const ph = (t / 1000 + s[2]) % 9;
        if (ph < 0.5) {
          ctx.fillStyle = '#5c628f';
          ctx.fillRect(s[0] - crop[0], s[1] - crop[1], 1, 1);
        } else if (ph > 8.4) {
          ctx.fillStyle = 'rgba(232,226,200,.45)';
          ctx.fillRect(s[0] - 1 - crop[0], s[1] - crop[1], 3, 1);
          ctx.fillRect(s[0] - crop[0], s[1] - 1 - crop[1], 1, 3);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(s[0] - crop[0], s[1] - crop[1], 1, 1);
        }
      }
    }
    const torch = image('camp/torch.png');
    const fire = image('camp/fire.png');
    this.place.torches.forEach((tc, i) => {
      if (ready(torch)) ctx.drawImage(torch, ((Math.floor(t / 130) + i * 2) % 4) * 5, 0, 5, 7, tc[0] - 2 - crop[0], tc[1] - 7 - crop[1], 5, 7);
    });
    this.drawStanding(fire, t, now);
    for (const extra of this.dressing.extras ?? []) {
      ctx.globalAlpha = extra.alpha ?? 1;
      ctx.drawImage(extra.img, Math.round(extra.x - crop[0]), Math.round(extra.y - crop[1] + (extra.bob ? Math.sin(t / 320) : 0)));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    this.lights.forEach((l, i) => {
      let v = l.pulse === 2 ? Math.floor((Math.sin(t / 97 + i) + Math.sin(t / 43 + i * 2)) * 0.8 + 1) : l.pulse ? Math.floor(Math.sin(t / 900 + i) * 1.5 + 1) : 1;
      v = Math.max(0, Math.min(2, v));
      const c = l.rings[v]!;
      ctx.drawImage(c, l.x - (c.width >> 1) - crop[0], l.y - (c.height >> 1) - crop[1]);
    });
    ctx.globalCompositeOperation = 'source-over';
    this.drawParts(now, dt);
  }

  /**
   * What stands on the ground, back to front by its feet: the decorations at the places the designer gave them, the fire (its logs, then its
   * flame), and the hero with his pet and footprints. All the pictures are whole pixels of the 94 x 203 scene.
   */
  private drawStanding(plain: HTMLImageElement, t: number, now: number): void {
    const order: Array<{ y: number; draw: () => void }> = [];
    for (const id of this.dressing.decor ?? []) {
      const art = decorArt(id);
      if (art) order.push({ y: art.feetY, draw: () => this.drawDecor(art, t) });
    }
    order.push({ y: FIRE[1], draw: () => this.drawFire(plain, t) });
    order.push({ y: HERO[1], draw: () => this.drawHeroAndFriends(t, now) });
    order.sort((a, b) => a.y - b.y);
    for (const standing of order) standing.draw();
    this.drawDemo(t);
  }

  private drawDecor(art: DecorArt, t: number): void {
    const { ctx, crop } = this;
    const x = Math.round(art.feetX - art.w / 2) - crop[0];
    const y = art.feetY - art.h + 1 - crop[1];
    ctx.drawImage(art.image, x, y);
    if (art.glow) {
      // The lantern's flame, the cauldron's brew: the mask of what glows, flickering.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t / 130 + art.feetX) * Math.sin(t / 47 + art.feetY);
      ctx.drawImage(art.glow, x, y);
      ctx.restore();
    }
  }

  /** The fire: the style's logs and flame and the colour of its light (the designer's), or the camp's own fire as it was. */
  private drawFire(plain: HTMLImageElement, t: number): void {
    const { ctx, crop } = this;
    const art = this.dressing.fire;
    if (art && ready(art.flame) && ready(art.logs)) {
      ctx.drawImage(art.logs, FIRE[0] + art.logsAt[0] - crop[0], FIRE[1] + art.logsAt[1] - crop[1]);
      ctx.drawImage(art.flame, (Math.floor(t / art.ms) % art.frames) * art.w, 0, art.w, art.h, FIRE[0] - 6 - crop[0], FIRE[1] - 18 - crop[1], art.w, art.h);
    } else if (ready(plain)) {
      ctx.drawImage(plain, (Math.floor(t / 100) % 6) * 13, 0, 13, 17, FIRE[0] - 6 - crop[0], FIRE[1] - 17 - crop[1], 13, 17);
    }
  }

  /** The hero, with the footprints of his trail by him and his pet at his feet. */
  private drawHeroAndFriends(t: number, now: number): void {
    const { ctx, crop } = this;
    const worn = this.dressing.wear?.(this.classes[this.hero] ?? '') ?? NOTHING;
    const trail = worn.trail;
    if (trail) {
      // Three footprints, the oldest the faintest.
      for (const [dx, k] of [[10, 3], [6, 2], [2, 1]] as const) {
        if (k < trail.frames) ctx.drawImage(trail.image, k * trail.w, 0, trail.w, trail.h, HERO[0] + dx - trail.atX - crop[0], HERO[1] + 1 - trail.atY - crop[1], trail.w, trail.h);
      }
    }
    this.drawHero(t, now);
    const pet = worn.pet;
    if (pet) {
      const [px, py] = [HERO[0] + 11, HERO[1] + 2];
      const frame = pet.idle[Math.floor(t / pet.ms) % pet.idle.length]!;
      const lift = pet.fly ? Math.round(5.6 + 0.96 * Math.sin((t / 1000) * 1.2 * Math.PI * 2)) : 0;
      ctx.fillStyle = `rgba(0,0,0,${pet.fly ? 0.3 : 0.45})`;
      const sw = Math.round(pet.w * (pet.fly ? 0.65 : 0.85));
      ctx.fillRect(px - (sw >> 1) - crop[0], py - crop[1], sw, 1);
      ctx.drawImage(pet.image, frame * pet.w, 0, pet.w, pet.h, px - pet.feetX - crop[0], py - pet.feetY - 1 - lift - crop[1], pet.w, pet.h);
      if (pet.glow) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(pet.glow, frame * pet.w, 0, pet.w, pet.h, px - pet.feetX - crop[0], py - pet.feetY - 1 - lift - crop[1], pet.w, pet.h);
        ctx.restore();
      }
    }
  }

  /** The shop's try-on of a kill effect, a fall or a number style: it plays by the hero again and again. */
  private drawDemo(t: number): void {
    const demo = this.dressing.demo;
    if (!demo) return;
    const { ctx, crop } = this;
    const cycle = 2400;
    const at = t % cycle;
    if (demo.kill) {
      const frame = Math.floor(at / demo.kill.ms);
      if (frame < demo.kill.frames) ctx.drawImage(demo.kill.image, frame * demo.kill.w, 0, demo.kill.w, demo.kill.h, HERO[0] - 26 - crop[0], HERO[1] - 20 - crop[1], demo.kill.w, demo.kill.h);
    }
    if (demo.death) {
      const frame = Math.min(demo.death.frames - 1, Math.floor(at / demo.death.ms));
      ctx.drawImage(demo.death.image, frame * demo.death.w, 0, demo.death.w, demo.death.h, HERO[0] - demo.death.atX - crop[0], HERO[1] - demo.death.atY - crop[1], demo.death.w, demo.death.h);
    }
    if (demo.digits) {
      const d = demo.digits;
      const text = at < 1200 ? '-12' : '+8';
      let x = HERO[0] - 6 - ((text.length * d.advance) >> 1) - crop[0];
      const y = HERO[1] - 28 - Math.floor((at % 1200) / 200) - crop[1];
      for (const ch of text) {
        const k = d.glyphs.indexOf(ch);
        if (k >= 0) ctx.drawImage(d.image, k * d.w, 0, d.w, d.h, x, y, d.w, d.h);
        x += d.advance;
      }
    }
  }

  private say(text: string, ms: number): void {
    this.bubble.textContent = text;
    this.bubble.hidden = false;
    this.bubbleUntil = ms > 0 ? this.now + ms : 0;
  }

  /** A tap on the hero: a swing, sparks, a phrase of his class; four in 2.5 s and he sulks for three seconds. */
  tap(): void {
    const { now } = this;
    const index = CAMP_ORDER.indexOf(this.heroClass);
    const sulks = this.text.sulk[index] ?? ['', ''];
    this.taps = this.taps.filter((x) => now - x < 2500);
    this.taps.push(now);
    if (this.mode === 'sulk') {
      this.say(sulks[1]!, 1500);
      return;
    }
    if (this.taps.length >= 4) {
      this.mode = 'sulk';
      this.modeAt = now;
      this.taps = [];
      this.say(sulks[0]!, 0);
      audio.play('hit', 0.8, 0.3);
      return;
    }
    this.mode = 'tap';
    this.modeAt = now;
    this.said = (this.said + 1) % 3;
    this.say(this.text.say[index]?.[this.said] ?? '', 1900);
    const R = this.random;
    for (let i = 0; i < 9; i++) {
      this.parts.push({ k: 'burst', x: HERO[0] - 7, y: HERO[1] - 8, vx: -(R() * 0.03 + 0.006), vy: (R() - 0.6) * 0.03, a: 0, l: 260 + R() * 260 });
    }
    // The swing, and the fire answering with a few crackles.
    audio.play('miss', 1.15, 0.7);
    audio.later(120, 'sizzle', 1.3, 0.35);
  }

  /** The next class (dir 1) or the last (-1) walks out of the shadow. */
  swipe(dir: 1 | -1): void {
    if (this.mode === 'swipe' || this.classes.length < 2) return;
    this.face = dir;
    this.next = (this.hero + dir + this.classes.length) % this.classes.length;
    this.mode = 'swipe';
    this.modeAt = this.now;
    this.lastSwipe = this.now;
    this.bubble.hidden = true;
    this.taps = [];
    audio.play('step', 0.9, 0.5);
  }

  /**
   * Moves the scene: up on a low screen, so that the hero's feet still stand above the sheet; down (to `ext`) on a tall one, where a
   * filled scene's extended sky shows above. 0 puts the scene's own first row at the top of its element.
   */
  shift(y: number): void {
    this.lastShift = y;
    const top = y + (this.options.fill ? this.crop[1] * this.scale : 0);
    this.canvas.style.top = `${top}px`;
    this.layer.style.top = `${top}px`;
  }

  /** Puts the hero on the scene by his class, without the walk. */
  setHero(name: string): void {
    const index = this.classes.indexOf(name);
    if (index < 0) return;
    this.hero = index;
    this.refreshName();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}


/**
 * The banner of «What's new» (newsui.ts): a piece of the gate's ground with the fire in the middle and the four heroes of the
 * original round it, turned to it, drawn once on a canvas of 94×56 scene pixels.
 */
export function newsBanner(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = 56;
  canvas.className = 'pd-news-art';
  const top = 100;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const bg = image(background('outdoor', 'autumn'));
  const fire = image('camp/fire.png');
  const sheets = CAMP_ORDER.map((name) => image(`${SHEET[name]!}.png`));
  // Each hero: the sheet's index, the place of his feet, and whether he stands right of the fire (so faces left).
  const stand: ReadonlyArray<readonly [number, number, number, boolean]> = [[0, 25, 50, false], [1, 37, 53, false], [2, 59, 53, true], [3, 71, 50, true]];
  const paint = (): void => {
    g.clearRect(0, 0, W, 56);
    if (ready(bg)) g.drawImage(bg, 0, -top);
    if (ready(fire)) g.drawImage(fire, 2 * 13, 0, 13, 17, 41, 33, 13, 17);
    for (const [index, x, y, flip] of stand) {
      const sheet = sheets[index]!;
      if (!ready(sheet)) continue;
      g.save();
      if (flip) {
        g.translate(x + 6, y - 15);
        g.scale(-1, 1);
        g.drawImage(sheet, 0, TIER_ROW * 15, 12, 15, 0, 0, 12, 15);
      } else {
        g.drawImage(sheet, 0, TIER_ROW * 15, 12, 15, x - 6, y - 15, 12, 15);
      }
      g.restore();
    }
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,154,58,.12)';
    g.fillRect(25, 26, 44, 28);
    g.globalCompositeOperation = 'source-over';
  };
  for (const img of [bg, fire, ...sheets]) if (!ready(img)) img.addEventListener('load', paint, { once: true });
  paint();
  return canvas;
}
