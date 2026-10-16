import { background, image as campImage, lightCanvas, ready as campReady, SHEET, seasonOf } from './camp';
import { itemById, type Slot } from './catalog';
import { cosmetics } from './cosmetics';
import { type CardLook, cardKey, Lru, tierOf } from './cardlook';
import { fireArt, flCatalog, flImage, flItem, flReady, hatArt, lookArt, onFlChange, petArt } from './flart';
import './herocard.css';
import { quality } from './quality';

/*
 * The hero card: a player's hero as they look, in one small canvas. It is shown on every row of every board, on the profile and
 * wherever else a hero stands for a player. Layers, back to front: the camp's ground, the glow of the camp fire the player chose,
 * the fire (logs and flame), the hero in the look worn for the class (or the class's own sheet) in the armour he ended the run in, the hat over it, the pet at his feet,
 * and the profile frame round the whole card. The name colour and the title stay DOM text beside it (rankui.ts).
 *
 * It composes the same layers as the camp and the shop's try-on (camp.ts, wear.ts, flart.ts), from the same art, at the same pixels:
 * no atlases of its own. Cheap enough for a hundred rows:
 *  - one canvas per visible row (rankui.ts mounts only the rows on screen): the stage of 36 x 24 art pixels at x2 in the frame's border (80 x 56);
 *  - the composed picture of a combination is kept (LRU, key `class|armour tier|look|hat|pet|fire`) and drawn again with one drawImage;
 *  - only the top three, the player's own row and the profile move, from ONE ticker (about 6 frames a second, stopped while the
 *    page is hidden or when reduced motion is asked for); every other row is a still frame;
 *  - the canvas holds whole device pixels per art pixel (an integer scale), so the art stays crisp on any screen;
 *  - a layer whose art is not here yet is left out, and the card is drawn again when it arrives; an id the art does not know is skipped.
 */

/**
 * The scene in art pixels (the designer's row layout, compete/anchors.json `row`): the stage is 36 x 24, shown at x2 (72 x 48) inside
 * a frame of 14 x 14 (4 pixels of border) at x1: a card of 80 x 56 on a phone. Nothing is drawn under the frame's border.
 */
export const STAGE_W = 36;
export const STAGE_H = 24;
/** The frame's border, in the frame's own pixels (one frame pixel is half a stage pixel). */
const BORDER = 4;
/** Where the hero's feet stand, the fire's, and the pet's, in the stage: the hero the subject, the fire behind him on the left, the pet at his feet. */
const HERO_X = 19;
const FEET_Y = 23;
const FIRE_X = 8;
const FIRE_Y = 21;
const PET_X = 30;
/** The fire's light, in stage pixels. */
const LIGHT = 22;
/** The ground's corner in the camp's background (a piece of the dirt path, with no wall and no fire pit). */
const GROUND: readonly [number, number] = [36, 104];
/** The hero's own 12 x 15 frame, and the hat's cell (16 x 22, the frame at (2, 7) in it): see camp.ts. */
const HERO_W = 12;
const HERO_H = 15;

export { type CardLook, lookOfEntry } from './cardlook';

/** This player's own hero of a class, as they wear it now (owned things only: cosmetics.ts). */
export function myLook(heroClass: string, armor?: number): CardLook {
  const id = (slot: Slot): string | undefined => cosmetics.inSlot(slot)?.id;
  const look = id(`look.${heroClass}` as Slot);
  const [hat, pet, fire, frame] = [id('hat'), id('pet'), id('campfire'), id('frame')];
  return { heroClass, ...(armor !== undefined ? { a: armor } : {}), ...(look ? { l: look } : {}), ...(hat ? { h: hat } : {}), ...(pet ? { p: pet } : {}), ...(fire ? { f: fire } : {}), ...(frame ? { fr: frame } : {}) };
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

/** A piece of the camp's art (its own loader: the camp and the cards share the pictures). */
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
  img.addEventListener('load', redrawPending, { once: true });
}

/* ---- Composing ---- */

const ringCache = new Map<string, HTMLCanvasElement[]>();
/** The fire's light as the camp lays it (stepped, dithered rings): three strengths for the flicker. */
function rings(color: string): HTMLCanvasElement[] {
  let set = ringCache.get(color);
  if (!set) {
    set = [lightCanvas(LIGHT - 1, color), lightCanvas(LIGHT, color), lightCanvas(LIGHT + 1, color)];
    ringCache.set(color, set);
  }
  return set;
}

interface Composed {
  /** Everything the card wants is drawn (nothing is still on its way). */
  complete: boolean;
}

/** The hero's class sheet; a class this build does not know has none. */
const sheetOf = (heroClass: string): string | undefined => SHEET[heroClass] ? `${SHEET[heroClass]}.png` : undefined;

/**
 * Draws the card (everything but the frame) at art pixels onto `g`, `t` ms into the animation (still frames: 0, `moving` false).
 * What is not here yet is left out and reported as not complete.
 */
function compose(g: CanvasRenderingContext2D, look: CardLook, t: number, moving: boolean): Composed {
  let complete = true;
  const lite = saveData();
  /** The row of the sheets: the armour worn at the end of the run (hero, hat and glow have the same rows). */
  const row = tierOf(look);
  const cls = String(look.heroClass);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, STAGE_W, STAGE_H);
  // The ground, darkened so that the fire's light is what lights it.
  g.fillStyle = '#1a1511';
  g.fillRect(0, 0, STAGE_W, STAGE_H);
  const ground = camp(background('outdoor', seasonOf(new Date())));
  if (ground.ok) g.drawImage(ground.img, GROUND[0], GROUND[1], STAGE_W, STAGE_H, 0, 0, STAGE_W, STAGE_H);
  else complete = false;
  g.fillStyle = 'rgba(10,8,6,.5)';
  g.fillRect(0, 0, STAGE_W, STAGE_H);

  // The camp fire the player chose (unknown ids and the classic one: the camp's own).
  const fireId = look.f && itemById(look.f)?.category === 'campfire' ? look.f : 'fire.classic';
  const fire = layer(fireId, 'campfire', () => fireArt(fireId));
  const art = fire.art;
  if (!lite) {
    if (fire.pending) complete = false;
    const light = art?.light ?? '#ff9a3a';
    const flicker = moving ? Math.max(0, Math.min(2, Math.floor((Math.sin(t / 97) + Math.sin(t / 43 + 2)) * 0.8 + 1))) : 1;
    g.globalCompositeOperation = 'lighter';
    const ring = rings(light)[flicker]!;
    // Twice: the camp's light is laid over a lit ground; here the ground is darkened, and the fire must glow behind him.
    g.drawImage(ring, FIRE_X - (ring.width >> 1), FIRE_Y - 6 - (ring.height >> 1));
    g.drawImage(ring, FIRE_X - (ring.width >> 1), FIRE_Y - 6 - (ring.height >> 1));
    g.globalCompositeOperation = 'source-over';
    if (art && flReady(art.flame) && flReady(art.logs)) {
      g.drawImage(art.logs, FIRE_X + art.logsAt[0], FIRE_Y + art.logsAt[1]);
      g.drawImage(art.flame, (Math.floor(t / art.ms) % art.frames) * art.w, 0, art.w, art.h, FIRE_X - 6, FIRE_Y - 18, art.w, art.h);
    } else {
      const plain = camp('camp/fire.png');
      if (plain.ok) g.drawImage(plain.img, (Math.floor(t / 100) % 6) * 13, 0, 13, 17, FIRE_X - 6, FIRE_Y - 17, 13, 17);
      else complete = false;
    }
  }

  // The hero: the look worn for his class, else the class's own sheet (first armour, as in the camp).
  const heroX = HERO_X - HERO_W / 2;
  const heroY = FEET_Y - HERO_H;
  const lookItem = look.l ? itemById(look.l) : undefined;
  const worn = layer(look.l && lookItem?.category === 'look' && lookItem.heroClass === cls ? look.l : undefined, 'look', () => lookArt(look.l!));
  const own = sheetOf(cls);
  const sheet = worn.art?.sheet ?? (own ? camp(own).img : undefined);
  if (worn.pending) complete = false;
  if (sheet && campReady(sheet)) {
    // A legendary look's aura behind him (its feet at (12, 26), his at (6, 14)).
    const aura = worn.art?.aura;
    if (aura) g.drawImage(aura.image, (moving ? Math.floor(t / aura.ms) % aura.frames : 0) * aura.w, 0, aura.w, aura.h, heroX + 6 - aura.feetX, heroY + 14 - aura.feetY, aura.w, aura.h);
    // A shadow under the feet, then him.
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(heroX + 2, heroY + 14, 8, 1);
    g.fillRect(heroX + 3, heroY + 15, 6, 1);
    g.drawImage(sheet, 0, row * HERO_H, HERO_W, HERO_H, heroX, heroY, HERO_W, HERO_H);
    const glow = worn.art?.glow;
    if (glow && flReady(glow)) {
      const pulse = worn.art!.pulse;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = pulse.min + (pulse.max - pulse.min) * (moving ? 0.5 + 0.5 * Math.sin((t / 1000) * pulse.hz * Math.PI * 2) : 0.75);
      g.drawImage(glow, 0, row * HERO_H, HERO_W, HERO_H, heroX, heroY, HERO_W, HERO_H);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    const hat = layer(look.h, 'hat', () => hatArt(look.h!, cls));
    if (hat.pending) complete = false;
    if (hat.art) {
      const h = hat.art;
      g.drawImage(h.image, 0, row * h.h, h.w, h.h, heroX - h.heroX, heroY - h.heroY, h.w, h.h);
      if (h.glow) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.7;
        g.drawImage(h.glow, 0, row * h.h, h.w, h.h, heroX - h.heroX, heroY - h.heroY, h.w, h.h);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    }
  } else if (own) {
    complete = false;
  }

  // The pet at his feet (it stands, or hovers when it flies).
  if (!lite) {
    const pet = layer(look.p, 'pet', () => petArt(look.p!));
    if (pet.pending) complete = false;
    if (pet.art) {
      const p = pet.art;
      const frame = p.idle[moving ? Math.floor(t / p.ms) % p.idle.length : 0]!;
      const lift = p.fly ? Math.round(5.6 + (moving ? 0.96 * Math.sin((t / 1000) * 1.2 * Math.PI * 2) : 0)) : 0;
      const py = FEET_Y + 1;
      g.fillStyle = `rgba(0,0,0,${p.fly ? 0.3 : 0.45})`;
      const sw = Math.round(p.w * (p.fly ? 0.65 : 0.85));
      g.fillRect(PET_X - (sw >> 1), py, sw, 1);
      g.drawImage(p.image, frame * p.w, 0, p.w, p.h, PET_X - p.feetX, py - p.feetY - 1 - lift, p.w, p.h);
      if (p.glow) {
        g.globalCompositeOperation = 'lighter';
        g.drawImage(p.glow, frame * p.w, 0, p.w, p.h, PET_X - p.feetX, py - p.feetY - 1 - lift, p.w, p.h);
        g.globalCompositeOperation = 'source-over';
      }
    }
  }
  return { complete };
}

/** The border of a card with no frame of the designer's picture: a rim in the tones given (an earn-only frame's), or the plain dark edge every card has. */
function rim(g: CanvasRenderingContext2D, w: number, h: number, kf: number, tones: readonly string[] | null): void {
  const edge = BORDER * kf;
  g.fillStyle = tones ? (tones[1] ?? tones[0]!) : '#14110e';
  g.fillRect(0, 0, w, edge);
  g.fillRect(0, h - edge, w, edge);
  g.fillRect(0, 0, edge, h);
  g.fillRect(w - edge, 0, edge, h);
  g.fillStyle = tones ? tones[0]! : '#2c261f';
  // The outer pixel's line, and (plain) the inner one: a rim of two pixels is a frame at this size.
  g.fillRect(0, 0, w, kf);
  g.fillRect(0, h - kf, w, kf);
  g.fillRect(0, 0, kf, h);
  g.fillRect(w - kf, 0, kf, h);
}

/**
 * The frame round the card: the designer's 14 x 14 picture as a nine-slice (4 pixels of border), at `kf` device pixels to a frame
 * pixel, over the border the stage leaves free (so it hides nothing of the scene), moving if it has frames. Returns whether it is
 * still to come.
 */
function framed(g: CanvasRenderingContext2D, frameId: string | undefined, t: number, moving: boolean, w: number, h: number, kf: number): boolean {
  const item = frameId ? itemById(frameId) : undefined;
  if (!frameId || item?.category !== 'frame') {
    rim(g, w, h, kf, null);
    return false;
  }
  if (!flCatalog()) {
    flItem(frameId);
    rim(g, w, h, kf, null);
    return true;
  }
  const raw = flItem(frameId);
  if (!raw?.sprite) {
    // No picture of the designer's (a streak's or a board's reward): a rim in its tones.
    rim(g, w, h, kf, raw?.color ? [raw.color] : item.tones ?? ['#c8c8c8', '#444444']);
    return false;
  }
  const still = flImage(raw.sprite);
  const sliding = moving && raw.anim ? flImage(raw.anim.sheet) : undefined;
  const sheet = sliding && flReady(sliding) ? sliding : still;
  if (!flReady(sheet)) {
    rim(g, w, h, kf, null);
    return true;
  }
  const frame = sheet === sliding && raw.anim ? Math.floor(t / raw.anim.ms) % raw.anim.frames : 0;
  const s = raw.slice ?? BORDER;
  const size = 14;
  const x0 = frame * size;
  const mid = size - 2 * s;
  const edge = s * kf;
  g.imageSmoothingEnabled = false;
  // Corners, then the four edges stretched between them.
  g.drawImage(sheet, x0, 0, s, s, 0, 0, edge, edge);
  g.drawImage(sheet, x0 + size - s, 0, s, s, w - edge, 0, edge, edge);
  g.drawImage(sheet, x0, size - s, s, s, 0, h - edge, edge, edge);
  g.drawImage(sheet, x0 + size - s, size - s, s, s, w - edge, h - edge, edge, edge);
  g.drawImage(sheet, x0 + s, 0, mid, s, edge, 0, w - 2 * edge, edge);
  g.drawImage(sheet, x0 + s, size - s, mid, s, edge, h - edge, w - 2 * edge, edge);
  g.drawImage(sheet, x0, s, s, mid, 0, edge, edge, h - 2 * edge);
  g.drawImage(sheet, x0 + size - s, s, s, mid, w - edge, edge, edge, h - 2 * edge);
  return false;
}

/* ---- Kept compositions ---- */

const kept = new Lru<HTMLCanvasElement>(80);

/** A still composition of a look: kept once it is whole (so that the next row of the same look is one drawImage). */
function still(look: CardLook): { canvas: HTMLCanvasElement; complete: boolean } {
  const key = cardKey(look);
  const had = kept.get(key);
  if (had) return { canvas: had, complete: true };
  const canvas = Object.assign(document.createElement('canvas'), { width: STAGE_W, height: STAGE_H });
  const { complete } = compose(canvas.getContext('2d')!, look, 0, false);
  if (complete) kept.set(key, canvas);
  return { canvas, complete };
}

/** Forgets the kept compositions (after a change of art). */
export function forgetCards(): void {
  kept.clear();
}

/**
 * The stage of a card (without the frame) drawn onto any canvas: for a picture made in one go (the card for sharing). `scale` pixels
 * of the target to a stage pixel; false while some of the art has not come (the picture is then not whole: ask again).
 */
export function paintHeroCard(g: CanvasRenderingContext2D, look: CardLook, x: number, y: number, scale: number): boolean {
  const picture = still(look);
  const smoothing = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(picture.canvas, 0, 0, STAGE_W, STAGE_H, x, y, STAGE_W * scale, STAGE_H * scale);
  g.imageSmoothingEnabled = smoothing;
  return picture.complete;
}

/* ---- Cards on the page ---- */

export interface CardOptions {
  /** Moves (the flame, the pet, the frame): the top three, the player's own row, the profile. Everything else is a still. */
  animate?: boolean;
  /** Screen pixels to an art pixel, a whole number (default 2: a card of 80 x 56). */
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

class HeroCard implements CardHandle {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  /** Device pixels to a stage pixel, and to a frame pixel (half that: the frame is drawn at x1 where the stage is at x2). */
  private readonly k: number;
  private readonly kf: number;
  /** The scene for a card that moves (a still one is drawn from the kept picture). */
  private readonly stage: HTMLCanvasElement | null;
  private pending = false;
  private disposed = false;
  /** A class this build has no sheet for: only the frame is drawn, over the old portrait. */
  private readonly plain: boolean;
  readonly born = performance.now();

  constructor(private readonly source: CardLook | (() => CardLook), readonly animate: boolean, scale: number, className: string) {
    const dpr = Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    // Whole device pixels to a stage pixel, and to a frame pixel (so the art stays crisp): `scale` screen pixels' worth, rounded down.
    this.k = Math.max(2, Math.floor(scale * dpr));
    this.kf = Math.max(1, Math.floor(this.k / 2));
    this.stage = animate ? Object.assign(document.createElement('canvas'), { width: STAGE_W, height: STAGE_H }) : null;
    this.canvas = document.createElement('canvas');
    this.canvas.width = STAGE_W * this.k + 2 * BORDER * this.kf;
    this.canvas.height = STAGE_H * this.k + 2 * BORDER * this.kf;
    this.canvas.className = `pd-card ${className}`.trim();
    this.canvas.style.width = `${this.canvas.width / dpr}px`;
    this.canvas.style.height = `${this.canvas.height / dpr}px`;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.g = this.canvas.getContext('2d')!;
    // A class this build has no sheet for keeps the old portrait (avatars.png), shown through the canvas's own background.
    const first = String(this.look().heroClass);
    this.plain = !sheetOf(first);
    if (this.plain) {
      this.canvas.classList.add('fb');
      this.canvas.style.setProperty('--av', String(Math.max(0, ['warrior', 'mage', 'rogue', 'huntress'].indexOf(first))));
    }
    this.draw(0);
    pendingCards.add(this);
    if (typeof this.source === 'function') functional.add(this);
    if (animate && !reduced()) {
      movers.add(this);
      ensureTicker();
    }
  }

  private look(): CardLook {
    return typeof this.source === 'function' ? this.source() : this.source;
  }

  /** Draws the card; `t` is the time of the animation. */
  draw(t: number): void {
    if (this.disposed) return;
    const look = this.look();
    const moving = this.animate && !reduced();
    const { g, k, kf } = this;
    const { width, height } = this.canvas;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, width, height);
    g.imageSmoothingEnabled = false;
    let waiting = false;
    if (!this.plain) {
      // The stage (36 x 24 art pixels) inside the border the frame owns.
      let scene: HTMLCanvasElement;
      if (moving && this.stage) {
        waiting = !compose(this.stage.getContext('2d')!, look, t, true).complete;
        scene = this.stage;
      } else {
        const picture = still(look);
        scene = picture.canvas;
        waiting = !picture.complete;
      }
      g.drawImage(scene, 0, 0, STAGE_W, STAGE_H, BORDER * kf, BORDER * kf, STAGE_W * k, STAGE_H * k);
    }
    if (framed(g, look.fr, t, moving, width, height, kf)) waiting = true;
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

/** Cards that moves, cards whose art is still coming (or may), and cards whose look is a function of what is worn now. */
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
  // Wearing something new changes the profile's card, and every card made from what is worn now.
  cosmetics.onChange(() => {
    for (const card of functional) if (card.gone) card.dispose(); else card.refresh();
  });
}

/** The one ticker: about six frames a second, only while something moves and the page is shown. */
const FRAME_MS = 1000 / 6;
let timer = 0;
function ensureTicker(): void {
  if (timer !== 0 || movers.size === 0) return;
  timer = window.setInterval(() => {
    if (document.hidden) return;
    const now = performance.now();
    for (const card of movers) {
      if (card.gone) card.dispose();
      else card.draw(now);
    }
    if (movers.size === 0) {
      window.clearInterval(timer);
      timer = 0;
    }
  }, FRAME_MS);
}

/**
 * A hero card: a canvas to put on the page. `look` may be a function (the profile's: what is worn now), asked again at every draw.
 * It draws itself at once, and again whenever art it was waiting for arrives.
 */
export function heroCard(look: CardLook | (() => CardLook), options: CardOptions = {}): CardHandle {
  listen();
  return new HeroCard(look, options.animate === true, options.scale ?? 2, options.className ?? '');
}
