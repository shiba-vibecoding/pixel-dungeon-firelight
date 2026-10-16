import { image as campImage, ready as campReady, SHEET } from './camp';
import { itemById, type Slot } from './catalog';
import { cosmetics } from './cosmetics';
import { type CardLook, cardKey, cardSize, idleFrame, Lru, sparkState, wholeScale } from './cardlook';
import { type Anchors, anchorsOf, compete, onCompeteChange, type SceneLayout, tierOf } from './compete';
import { type FireArt, fireArt, flCatalog, flImage, flItem, flReady, hatArt, lookArt, onFlChange, petArt } from './flart';
import './herocard.css';
import { quality } from './quality';

/*
 * The hero card: a player's hero as they look, in one small canvas (design part 7). It is shown on every row of every board, on the
 * profile, on the share pictures, wherever a hero stands for a player. A little scene, back to front: night and the ground, the glow of
 * the camp fire the player chose, the fire (logs, flame, sparks), his shadow, the aura of a legendary look, the hero in the look worn
 * for the class (or the class's own sheet) with the hat over him, the glow of a legendary look, the pet facing him; round it the frame:
 * the profile frame worn, or the frame of his league (the Spark's when the league is not told).
 *
 * Where each layer stands, and how big each card is, is the designer's anchors.json (layouts `row` 80 x 56, `big` 216 x 156, `podium`
 * 96 x 96, and the share pictures' own). The layers are the shop's own art (flart.ts), at the same pixels as the camp:
 * no atlases of its own. Cheap enough for a hundred rows:
 *  - a row's card is drawn once and kept (LRU, `layout|scale|class|look|hat|pet|fire`), so the next row of the same look is one drawImage;
 *  - only the top three, the player's own row and the profile move, from ONE clock (about 12 frames a second, stopped while the page is
 *    hidden or when reduced motion is asked for); every other row is a still frame;
 *  - the canvas holds whole device pixels to an art pixel, so the art stays crisp on any screen;
 *  - a layer whose art is not here yet is left out and the card drawn again when it arrives; an id the art does not know is skipped.
 */

export { type CardLook, lookOfEntry } from './cardlook';

/** This player's own hero of a class, as they wear it now (owned things only: cosmetics.ts). */
export function myLook(heroClass: string): CardLook {
  const id = (slot: Slot): string | undefined => cosmetics.inSlot(slot)?.id;
  const look = id(`look.${heroClass}` as Slot);
  const [hat, pet, fire, frame] = [id('hat'), id('pet'), id('campfire'), id('frame')];
  return { heroClass, ...(look ? { l: look } : {}), ...(hat ? { h: hat } : {}), ...(pet ? { p: pet } : {}), ...(fire ? { f: fire } : {}), ...(frame ? { fr: frame } : {}) };
}

/* ---- What is shown less on a phone that saves data, and when nothing moves ---- */

const saveData = (): boolean => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
const reduced = (): boolean => quality.reducedMotion;

/* ---- Layers: ready, still coming, or not to be drawn ---- */

interface Layer<T> {
  art?: T;
  /** The art is on its way: draw what there is now, and again later. */
  pending: boolean;
}

/** An id's art once it has come; an id the art does not know is skipped (pending false), the catalogue not yet read is waited for. */
function layer<T>(id: string | undefined, category: string, get: () => T | undefined): Layer<T> {
  if (!id || itemById(id)?.category !== category) return { pending: false };
  if (!flCatalog()) {
    flItem(id);
    return { pending: true };
  }
  if (!flItem(id)) return { pending: false };
  const art = get();
  return art ? { art, pending: false } : { pending: true };
}

/** A picture of the art folder: drawn when it is there, waited for when not. */
function picture(path: string): { img: HTMLImageElement; ok: boolean } {
  const img = flImage(path);
  return { img, ok: flReady(img) };
}

/** Things waiting for art to come (the share pictures): told whenever a picture of the camp's has loaded. */
const waiters = new Set<() => void>();

/** A piece of the camp's art (its own loader: the camp and the cards share the pictures); redrawn when it has come. */
function camp(path: string): { img: HTMLImageElement; ok: boolean } {
  const img = campImage(path);
  const ok = campReady(img);
  if (!ok) watch(img);
  return { img, ok };
}

const watched = new WeakSet<HTMLImageElement>();
function watch(img: HTMLImageElement): void {
  if (watched.has(img)) return;
  watched.add(img);
  img.addEventListener('load', () => {
    redrawPending();
    for (const waiter of [...waiters]) waiter();
  }, { once: true });
}

/** The colour of the camp's light for a look: its fire's (the classic orange when it is not known yet). */
export function fireColour(look: CardLook): string {
  const id = look.f && itemById(look.f)?.category === 'campfire' ? look.f : 'fire.classic';
  return flItem(id)?.light ?? '#ff9a3a';
}

/* ---- Composing ---- */

/** The hero's class sheet; a class this build does not know has none. */
const sheetOf = (heroClass: string): string | undefined => (SHEET[heroClass] ? `${SHEET[heroClass]}.png` : undefined);

interface Composed {
  /** Everything the card wants is drawn (nothing is still on its way). */
  complete: boolean;
}

const layoutOf = (name: string): SceneLayout | undefined => anchorsOf()?.layouts[name];

/** The fire's glow: a radial light of the style's colour at the fire, added over what is behind the figures. */
function light(g: CanvasRenderingContext2D, a: Anchors, layout: SceneLayout, colour: string): void {
  const [fx, fy] = layout.fire;
  const radius = layout.light || a.fire.light.radius;
  const gradient = g.createRadialGradient(fx, fy - 4, 0, fx, fy - 4, radius);
  for (const [at, alpha] of a.fire.light.stops) gradient.addColorStop(at, `${colour}${alpha}`);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = gradient;
  g.fillRect(0, 0, layout.scene[0], layout.scene[1]);
  g.globalCompositeOperation = 'source-over';
}

/** Night and the ground, or the camp's own picture behind (the share pictures). */
function backdrop(g: CanvasRenderingContext2D, layout: SceneLayout): boolean {
  const [w, h] = layout.scene;
  if (layout.bg) {
    const [cx, cy, cw, ch] = layout.bg.crop;
    const ground = camp(layout.bg.sheet.replace(/^camp\//, 'camp/'));
    if (ground.ok) g.drawImage(ground.img, cx, cy, cw, ch, 0, 0, cw, ch);
    g.fillStyle = `rgba(8,10,24,${layout.bg.night})`;
    g.fillRect(0, 0, w, h);
    return ground.ok;
  }
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0f100d');
  sky.addColorStop(1, '#1d1e19');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  const ground = layout.hero[1] - 2;
  g.fillStyle = '#16130e';
  g.fillRect(0, ground, w, h - ground);
  g.fillStyle = '#2a241a';
  g.fillRect(0, ground, w, 1);
  return true;
}

/**
 * Draws the scene of a layout at art pixels onto `g` (the origin at the scene's corner), `t` ms into the animation (a still: 0, `moving`
 * false). What is not here yet is left out and reported as not complete.
 */
function compose(g: CanvasRenderingContext2D, look: CardLook, layout: SceneLayout, a: Anchors, t: number, moving: boolean): Composed {
  let complete = true;
  const lite = saveData();
  const cls = String(look.heroClass);
  g.imageSmoothingEnabled = false;
  if (!backdrop(g, layout)) complete = false;

  // The camp fire the player chose (an id the art does not know, and the classic one: the classic fire).
  const fireId = look.f && itemById(look.f)?.category === 'campfire' ? look.f : 'fire.classic';
  const fire = layer<FireArt>(fireId, 'campfire', () => fireArt(fireId));
  const [fx, fy] = layout.fire;
  if (!lite) {
    if (fire.pending) complete = false;
    light(g, a, layout, fire.art?.light ?? '#ff9a3a');
    const art = fire.art;
    if (art) {
      g.drawImage(art.logs, fx + a.fire.logsAt[0], fy + a.fire.logsAt[1]);
      g.drawImage(art.flame, (Math.floor(t / art.ms) % art.frames) * art.w, 0, art.w, art.h, fx + a.fire.flameAt[0], fy + a.fire.flameAt[1], art.w, art.h);
      for (const [dx, dy, k] of a.fire.sparksAt) {
        const spark = sparkState(dy, k, t, fy);
        if (!spark) continue;
        // The Beacon's sparks rise in a straight column; the others drift a pixel to the side.
        const drift = fireId === 'fire.beacon' ? 0 : spark.rise % 2;
        g.drawImage(art.sparks, spark.frame * art.sparkW, 0, art.sparkW, art.sparkH, fx + dx + drift, fy + dy - spark.rise, art.sparkW, art.sparkH);
      }
    } else if (!fire.pending) {
      const plain = camp('camp/fire.png');
      if (plain.ok) g.drawImage(plain.img, (Math.floor(t / 100) % 6) * 13, 0, 13, 17, fx - 6, fy - 17, 13, 17);
      else complete = false;
    }
  }

  // The hero: the look worn for his class, else the class's own sheet, in the armour's row.
  const [hx, hy] = layout.hero;
  const [cellW, cellH] = a.hero.cell;
  const row = Math.max(0, Math.min(a.hero.tiers - 1, Math.floor(look.ar ?? a.hero.tierDefault)));
  const frame = moving ? idleFrame(a.hero.idle.seq, a.hero.idle.fps, t) : 0;
  const lookItem = look.l ? itemById(look.l) : undefined;
  const worn = layer(look.l && lookItem?.category === 'look' && lookItem.heroClass === cls ? look.l : undefined, 'look', () => lookArt(look.l!));
  const own = sheetOf(cls);
  const sheet = worn.art?.sheet ?? (own ? camp(own).img : undefined);
  if (worn.pending) complete = false;
  if (sheet && campReady(sheet)) {
    // A legendary look's aura behind him.
    const aura = worn.art?.aura;
    if (aura) g.drawImage(aura.image, (moving ? Math.floor(t / aura.ms) % aura.frames : 0) * aura.w, 0, aura.w, aura.h, hx - aura.feetX, hy - aura.feetY, aura.w, aura.h);
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.fillRect(hx - 4, hy, 8, 1);
    g.drawImage(sheet, frame * cellW, row * cellH, cellW, cellH, hx - cellW / 2, hy - cellH, cellW, cellH);
    const hat = layer(look.h, 'hat', () => hatArt(look.h!, cls));
    if (hat.pending) complete = false;
    if (hat.art) {
      const h = hat.art;
      g.drawImage(h.image, frame * h.w, row * h.h, h.w, h.h, hx - cellW / 2 - h.heroX, hy - cellH - h.heroY, h.w, h.h);
      if (h.glow) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.7;
        g.drawImage(h.glow, frame * h.w, row * h.h, h.w, h.h, hx - cellW / 2 - h.heroX, hy - cellH - h.heroY, h.w, h.h);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    }
    const glow = worn.art?.glow;
    if (glow && flReady(glow)) {
      const pulse = worn.art!.pulse;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = (pulse.min + (pulse.max - pulse.min) * (moving ? 0.5 + 0.5 * Math.sin((t / 1000) * pulse.hz * Math.PI * 2) : 0.75)) * 0.7;
      g.drawImage(glow, frame * cellW, row * cellH, cellW, cellH, hx - cellW / 2, hy - cellH, cellW, cellH);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
  } else if (own) {
    complete = false;
  }

  // The pet at his feet, facing him (a flyer hangs above the floor and bobs).
  if (!lite && layout.pet) {
    const pet = layer(look.p, 'pet', () => petArt(look.p!));
    if (pet.pending) complete = false;
    if (pet.art) {
      const p = pet.art;
      const [px, py] = layout.pet;
      const frameAt = p.idle[moving ? Math.floor(t / p.ms) % p.idle.length : 0] ?? 0;
      const lift = p.fly ? a.pet.flyLift + (moving ? Math.floor(t / 400) % 2 : 0) : 0;
      const sw = p.fly ? a.pet.shadow.fly[0] : a.pet.shadow.ground[0];
      g.fillStyle = `rgba(0,0,0,${p.fly ? a.pet.shadow.alpha[1] : a.pet.shadow.alpha[0]})`;
      g.fillRect(px - sw / 2, py, sw, 1);
      g.save();
      g.translate(px + p.feetX, 0);
      g.scale(-1, 1);
      g.drawImage(p.image, frameAt * p.w, 0, p.w, p.h, 0, py - p.feetY - lift, p.w, p.h);
      if (p.glow) {
        g.globalCompositeOperation = 'lighter';
        g.drawImage(p.glow, frameAt * p.w, 0, p.w, p.h, 0, py - p.feetY - lift, p.w, p.h);
      }
      g.restore();
    }
  }
  return { complete };
}

/* ---- Frames ---- */

/** A frame's picture: where it is, the nine-slice's border, and its moving sheet if it has one. */
interface FrameArt {
  sprite?: string;
  slice: number;
  anim?: { sheet: string; frames: number; ms: number };
  /** No picture (an earn-only frame the designer did not draw): a rim in these tones. */
  tones?: readonly string[];
}

/** The frame of a card: the profile frame worn (the shop's, a league's `frame.league.<tier>`, a season's `frame.season.<id>`), else the league's. */
function frameArt(look: CardLook): FrameArt | undefined {
  const c = compete();
  const worn = look.fr;
  if (worn) {
    const league = /^(?:frame\.)?league\.(\w+)$/.exec(worn)?.[1];
    if (league) {
      const tier = tierOf(league);
      if (tier) return { sprite: tier.frame.sprite, slice: tier.frame.slice, ...(tier.frame.anim ? { anim: tier.frame.anim } : {}) };
    }
    const season = /^(?:frame\.)?season\.(\w+)$/.exec(worn)?.[1];
    if (season) {
      const found = c?.season.seasons.find((s) => s.id === season);
      if (found) return { sprite: found.frame.sprite, slice: found.frame.slice };
    }
    const item = itemById(worn);
    if (item?.category === 'frame') {
      if (!flCatalog()) {
        flItem(worn);
        return undefined;
      }
      const raw = flItem(worn);
      if (raw?.sprite) return { sprite: raw.sprite, slice: raw.slice ?? 4, ...(raw.anim ? { anim: raw.anim } : {}) };
      return { slice: 2, tones: raw?.color ? [raw.color] : item.tones ?? ['#c8c8c8', '#444444'] };
    }
  }
  const tier = tierOf(look.lg);
  return tier ? { sprite: tier.frame.sprite, slice: tier.frame.slice, ...(tier.frame.anim ? { anim: tier.frame.anim } : {}) } : undefined;
}

/**
 * Draws the frame round a card of `w` x `h` device pixels: the picture as a nine-slice (`slice` art pixels of border at `k` device pixels
 * each), moving if it has a sheet and the card moves. Returns whether its picture is still to come.
 */
function drawFrame(g: CanvasRenderingContext2D, art: FrameArt | undefined, w: number, h: number, k: number, t: number, moving: boolean): boolean {
  if (!art) return !compete();
  if (!art.sprite) {
    const [tone, rim] = [art.tones?.[0] ?? '#c8c8c8', art.tones?.[1] ?? art.tones?.[0] ?? '#444444'];
    const b = art.slice * k;
    g.fillStyle = rim;
    g.fillRect(0, 0, w, b);
    g.fillRect(0, h - b, w, b);
    g.fillRect(0, 0, b, h);
    g.fillRect(w - b, 0, b, h);
    g.fillStyle = tone;
    g.fillRect(0, 0, w, k);
    g.fillRect(0, h - k, w, k);
    g.fillRect(0, 0, k, h);
    g.fillRect(w - k, 0, k, h);
    return false;
  }
  const still = picture(art.sprite);
  const sliding = moving && art.anim ? picture(art.anim.sheet) : undefined;
  const sheet = sliding?.ok ? sliding.img : still.img;
  if (!(sliding?.ok || still.ok)) return true;
  const frame = sliding?.ok && art.anim ? Math.floor(t / art.anim.ms) % art.anim.frames : 0;
  const s = art.slice;
  const size = 14;
  const x0 = frame * size;
  const mid = size - 2 * s;
  const b = s * k;
  g.imageSmoothingEnabled = false;
  // The corners, then the four edges stretched between them.
  g.drawImage(sheet, x0, 0, s, s, 0, 0, b, b);
  g.drawImage(sheet, x0 + size - s, 0, s, s, w - b, 0, b, b);
  g.drawImage(sheet, x0, size - s, s, s, 0, h - b, b, b);
  g.drawImage(sheet, x0 + size - s, size - s, s, s, w - b, h - b, b, b);
  g.drawImage(sheet, x0 + s, 0, mid, s, b, 0, w - 2 * b, b);
  g.drawImage(sheet, x0 + s, size - s, mid, s, b, h - b, w - 2 * b, b);
  g.drawImage(sheet, x0, s, s, mid, 0, b, b, h - 2 * b);
  g.drawImage(sheet, x0 + size - s, s, s, mid, w - b, b, b, h - 2 * b);
  return false;
}

/* ---- Kept compositions ---- */

const kept = new Lru<HTMLCanvasElement>(80);

/** A still composition of a scene, at `k` device pixels to an art pixel: kept once it is whole (the next row of the same look is one drawImage). */
function still(look: CardLook, name: string, layout: SceneLayout, a: Anchors, k: number): { canvas: HTMLCanvasElement; complete: boolean } {
  const key = `${name}|${k}|${cardKey(look)}`;
  const had = kept.get(key);
  if (had) return { canvas: had, complete: true };
  const canvas = Object.assign(document.createElement('canvas'), { width: layout.scene[0] * k, height: layout.scene[1] * k });
  const g = canvas.getContext('2d')!;
  g.scale(k, k);
  const { complete } = compose(g, look, layout, a, 0, false);
  if (complete) kept.set(key, canvas);
  return { canvas, complete };
}

/** Forgets the kept compositions (after a change of art). */
export function forgetCards(): void {
  kept.clear();
}

/* ---- Cards on the page ---- */

/** The card's size: `row` (a board's row, 80 x 56), `big` (the profile, 216 x 156), `podium` (the top three, the hall of fame, 96 x 96). */
export type CardKind = 'row' | 'big' | 'podium';

export interface CardOptions {
  /** Which layout of the designer's (default `row`). */
  kind?: CardKind;
  /** Moves (the flame, the pet, the frame): the top three, the player's own row, the profile. Everything else is a still. */
  animate?: boolean;
  /** Screen pixels to an art pixel of the scene, a whole number (default: the layout's own). */
  scale?: number;
  className?: string;
}

export interface CardHandle {
  canvas: HTMLCanvasElement;
  /** Draws it again (the look given as a function may have changed). */
  refresh(): void;
  /** Stops moving; the canvas may then go. */
  dispose(): void;
}

/** The scale the layout asks for here: a phone's or a monitor's. */
function layoutScale(layout: SceneLayout): number {
  const scale = layout.scale;
  if (typeof scale === 'number') return scale;
  return scale ? (innerWidth >= 900 ? scale.monitor : scale.phone) : 2;
}

class HeroCard implements CardHandle {
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null = null;
  private k = 1;
  private kf = 1;
  private w = 0;
  private h = 0;
  private pending = true;
  private disposed = false;
  private sized = false;
  /** A class this build has no sheet for: only the frame is drawn, over the old portrait. */
  private plain = false;
  readonly born = performance.now();
  private readonly dpr = Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);

  constructor(private readonly source: CardLook | (() => CardLook), readonly animate: boolean, private readonly kind: CardKind, private readonly scale: number | undefined, className: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = `pd-card ${className}`.trim();
    this.canvas.setAttribute('aria-hidden', 'true');
    this.g = this.canvas.getContext('2d')!;
    // The size is known once the anchors have come; until then a row's own size is held so that the page does not jump.
    this.holdSpace();
    this.draw(0);
    pendingCards.add(this);
    if (typeof this.source === 'function') functional.add(this);
    if (animate && !reduced()) {
      movers.add(this);
      ensureTicker();
    }
  }

  private holdSpace(): void {
    const fallback: Record<CardKind, [number, number]> = { row: [80, 56], big: [216, 156], podium: [96, 96] };
    const [w, h] = fallback[this.kind];
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  private look(): CardLook {
    return typeof this.source === 'function' ? this.source() : this.source;
  }

  /** Sizes the canvas to its layout: the scene at a whole scale inside the frame at its own. */
  private size(layout: SceneLayout): void {
    const scale = this.scale ?? layoutScale(layout);
    const frame = layout.frame ?? { slice: 4, scale: 1 };
    this.k = wholeScale(scale, this.dpr);
    this.kf = wholeScale(frame.scale, this.dpr);
    const [cssW, cssH] = cardSize(layout.scene, scale, frame.slice, frame.scale);
    this.w = layout.scene[0] * this.k + 2 * frame.slice * this.kf;
    this.h = layout.scene[1] * this.k + 2 * frame.slice * this.kf;
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.sized = true;
  }

  /** Draws the card; `t` is the time of the animation. */
  draw(t: number): void {
    if (this.disposed) return;
    const a = anchorsOf();
    const layout = a?.layouts[this.kind];
    const look = this.look();
    const first = String(look.heroClass);
    if (!a || !layout) {
      this.pending = true;
      return;
    }
    if (!this.sized) this.size(layout);
    // A class this build has no sheet for keeps the old portrait (avatars.png), shown through the canvas's own background.
    this.plain = !sheetOf(first);
    this.canvas.classList.toggle('fb', this.plain);
    if (this.plain) this.canvas.style.setProperty('--av', String(Math.max(0, ['warrior', 'mage', 'rogue', 'huntress'].indexOf(first))));
    const moving = this.animate && !reduced();
    const g = this.g!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.imageSmoothingEnabled = false;
    let waiting = false;
    const slice = (layout.frame ?? { slice: 4 }).slice;
    const border = slice * this.kf;
    if (!this.plain) {
      if (moving) {
        g.translate(border, border);
        g.scale(this.k, this.k);
        waiting = !compose(g, look, layout, a, t, true).complete;
        g.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        const picture = still(look, this.kind, layout, a, this.k);
        g.drawImage(picture.canvas, border, border);
        waiting = !picture.complete;
      }
    }
    if (drawFrame(g, frameArt(look), this.w, this.h, this.kf, t, moving)) waiting = true;
    this.pending = waiting;
  }

  refresh(): void {
    this.draw(performance.now());
  }

  get waiting(): boolean {
    return this.pending;
  }

  dispose(): void {
    this.disposed = true;
    movers.delete(this);
    pendingCards.delete(this);
    functional.delete(this);
  }

  get gone(): boolean {
    return !this.canvas.isConnected && performance.now() - this.born > 3000;
  }
}

/** Cards that move, cards whose art is still coming (or may), and cards whose look is a function of what is worn now. */
const movers = new Set<HeroCard>();
const pendingCards = new Set<HeroCard>();
const functional = new Set<HeroCard>();

/** Art has arrived: the cards that waited for it are drawn again (and those that were taken off the page are forgotten). */
function redrawPending(): void {
  for (const card of pendingCards) {
    if (card.gone) {
      card.dispose();
      continue;
    }
    if (card.waiting) card.refresh();
  }
}

let listening = false;
function listen(): void {
  if (listening) return;
  listening = true;
  onFlChange(redrawPending);
  onCompeteChange(redrawPending);
  // Wearing something new changes the profile's card, and every card made from what is worn now.
  cosmetics.onChange(() => {
    for (const card of functional) if (card.gone) card.dispose(); else card.refresh();
  });
}

/** The one clock: about twelve frames a second, only while something moves and the page is shown. */
const FRAME_MS = 1000 / 12;
let timer = 0;
let lastFrame = 0;
function ensureTicker(): void {
  if (timer !== 0 || movers.size === 0) return;
  const step = (now: number): void => {
    timer = requestAnimationFrame(step);
    if (document.hidden || now - lastFrame < FRAME_MS) return;
    lastFrame = now;
    for (const card of movers) {
      if (card.gone) card.dispose();
      else card.draw(now);
    }
    if (movers.size === 0) {
      cancelAnimationFrame(timer);
      timer = 0;
    }
  };
  timer = requestAnimationFrame(step);
}

/**
 * A hero card: a canvas to put on the page. `look` may be a function (the profile's: what is worn now), asked again at every draw.
 * It draws itself at once, and again whenever art it was waiting for arrives.
 */
export function heroCard(look: CardLook | (() => CardLook), options: CardOptions = {}): CardHandle {
  listen();
  void compete();
  return new HeroCard(look, options.animate === true, options.kind ?? 'row', options.scale, options.className ?? '');
}

/* ---- Scenes on a canvas of their own (the share pictures) ---- */

/**
 * Draws a layout's scene (`story`, `chat`, `notify` ...) onto `g` at `x`, `y` at a whole `scale`: the share pictures'. Returns whether it
 * is whole (false while art is still coming: the caller waits with `whenWhole` and draws it again).
 */
export function drawScene(g: CanvasRenderingContext2D, look: CardLook, name: string, x: number, y: number, scale: number, t = 0): boolean {
  const a = anchorsOf();
  const layout = a?.layouts[name];
  if (!a || !layout) return false;
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.rect(0, 0, layout.scene[0] * scale, layout.scene[1] * scale);
  g.clip();
  g.scale(scale, scale);
  const { complete } = compose(g, look, layout, a, t, false);
  g.restore();
  return complete;
}

/** The layout of a share picture (its canvas, where the scene stands on it and at what scale). */
export const sceneLayout = (name: string): SceneLayout | undefined => layoutOf(name);

/** Resolves once `attempt` says it is whole, trying again whenever more art has come; gives up after `limit` ms (and then resolves false). */
export function whenWhole(attempt: () => boolean, limit = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    if (attempt()) {
      resolve(true);
      return;
    }
    let done = false;
    const finish = (whole: boolean): void => {
      if (done) return;
      done = true;
      stopFl();
      stopCompete();
      waiters.delete(check);
      window.clearTimeout(timeout);
      resolve(whole);
    };
    const check = (): void => {
      if (attempt()) finish(true);
    };
    const stopFl = onFlChange(check);
    const stopCompete = onCompeteChange(check);
    waiters.add(check);
    const timeout = window.setTimeout(() => finish(false), limit);
    void compete();
  });
}
