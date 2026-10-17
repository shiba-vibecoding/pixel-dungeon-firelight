/*
 * Which way a character faces on screen (design part 8, "character directions"). The pictures of the original face the side, right,
 * and the left is their mirror. Part 8 adds the view from the front (walking towards the camera, down the screen) and from the back
 * (away from it). This file is the rule that picks the view, and the lazy loading of the pictures for the views other than the side;
 * the renderers (r3d/world3d.ts and the 2D render.ts) ask `figureOf` what to draw and draw it.
 *
 * The rule (assets/dirs/dirs.json):
 *  - a step with any sideways part (left, right, the diagonals) shows the side view, mirrored when it goes left (as before);
 *  - a step straight down the screen shows the front, straight up the back;
 *  - standing keeps the last direction (a hero who has not moved yet faces the front);
 *  - an attack, a zap or a throw turns to face its target by the same rule;
 *  - a view holds at least FACING_HOLD_MS, so a zigzag of one-cell steps does not flicker;
 *  - the dead are the same from every side (the tomb), and are always drawn from the side.
 *
 * Nothing here is a rule of the game: it is only how the picture is chosen.
 */
import type { Puppet } from './view';

export type Facing = 'side' | 'front' | 'back';

/** A view holds this long (ms) before another replaces it: one step at 20 fps. */
export const FACING_HOLD_MS = 120;

/** What a thing that turns carries: the way it looks now, the way it wants to look, and when the view last changed. */
export interface Turnable {
  /** The side view is mirrored (it looks left). Set at once by any sideways step; only the side view uses it. */
  flip: boolean;
  facing: Facing;
  /** The view the last step or blow asked for; it takes over once the held one has had its time. */
  facingWant: Facing;
  facingAt: number;
}

/**
 * The view a new figure starts in: a hero (and a mirror image of one) faces the front, a monster the side, as the original draws it,
 * until it moves.
 */
export const initialFacing = (isHero: boolean, kind: string): Facing => (isHero || kind === 'mirror' ? 'front' : 'side');

/** A fresh turnable: it faces the front (a new level, a load) unless told otherwise. */
export const turnable = (facing: Facing = 'front'): Turnable => ({ flip: false, facing, facingWant: facing, facingAt: -1e9 });

/** The view for a step of (dx, dy) cells (y grows down the screen), `current` when it is no step at all. */
export const facingFor = (dx: number, dy: number, current: Facing): Facing => (dx !== 0 ? 'side' : dy > 0 ? 'front' : dy < 0 ? 'back' : current);

/** Settles a view that has waited out its hold. Call it where the thing is drawn; it makes no garbage. */
export function settle(t: Turnable, now: number): void {
  if (t.facing !== t.facingWant && now - t.facingAt >= FACING_HOLD_MS) {
    t.facing = t.facingWant;
    t.facingAt = now;
  }
}

/** It steps, or strikes towards, a cell (dx, dy) away (cells). A step that goes nowhere changes nothing. */
export function turn(t: Turnable, dx: number, dy: number, now: number): void {
  if (dx !== 0) t.flip = dx < 0;
  t.facingWant = facingFor(dx, dy, t.facingWant);
  settle(t, now);
}

/**
 * It strikes, zaps or throws at a target (dx, dy) cells off: it turns as for the first step of the straight way there, so a target one
 * column off but eight rows down is straight down, not sideways. For a neighbouring cell that is just the step to it.
 */
export function turnToward(t: Turnable, dx: number, dy: number, now: number): void {
  turn(t, 2 * Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : 0, 2 * Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy) : 0, now);
}

/** The cell's column and row on a level of this width. */
const X = (cell: number, width: number): number => cell % width;
const Y = (cell: number, width: number): number => Math.trunc(cell / width);

/** It steps from one cell to another (a level `width` cells across). */
export function turnBetween(t: Turnable, from: number, to: number, width: number, now: number): void {
  turn(t, X(to, width) - X(from, width), Y(to, width) - Y(from, width), now);
}

/** It strikes, zaps or throws from one cell at another. */
export function turnAt(t: Turnable, from: number, to: number, width: number, now: number): void {
  turnToward(t, X(to, width) - X(from, width), Y(to, width) - Y(from, width), now);
}

/* ---- the pictures of the other views ---- */

/** Where the pictures of one view lie (paths inside assets/), and the images once they have come. */
export interface Face {
  image: string;
  glow?: string;
  img?: HTMLImageElement;
  glowImg?: HTMLImageElement;
  /** Gave up on it (the file is not there): the side view stands in for good. */
  failed?: boolean;
}

/** The views of one picture other than the side. A view that is missing (or has failed) is drawn from the side. */
export interface Faces {
  front?: Face;
  back?: Face;
}

declare const __BUILD__: { commit: string; date: string } | undefined;
/** The build's mark on every picture's address, as sprites.ts does: a new build's art is fetched, never an old one kept by the webview. */
const VERSION = typeof __BUILD__ !== 'undefined' ? __BUILD__.commit : 'dev';
const BASE = `${import.meta.env?.BASE_URL ?? '/'}assets/`;

const loaded = new Map<string, { img: HTMLImageElement | null; failed: boolean }>();

/** The picture at a path inside assets/, once it has come; it is fetched the first time it is asked for (and tried again a few times). */
export function picture(path: string, attempt = 0): HTMLImageElement | undefined {
  let entry = loaded.get(path);
  if (!entry) {
    entry = { img: null, failed: false };
    loaded.set(path, entry);
    fetchPicture(path, entry, attempt);
  }
  return entry.img ?? undefined;
}

function fetchPicture(path: string, entry: { img: HTMLImageElement | null; failed: boolean }, attempt: number): void {
  if (typeof Image === 'undefined') return;
  const image = new Image();
  image.onload = () => {
    entry.img = image;
  };
  image.onerror = () => {
    if (attempt >= 2) {
      entry.failed = true;
      return;
    }
    setTimeout(() => fetchPicture(path, entry, attempt + 1), 600 * (attempt + 1));
  };
  image.src = `${BASE}${path}?v=${VERSION}${attempt > 0 ? `&retry=${attempt}` : ''}`;
}

/** Whether a path's picture has been given up on. */
const gaveUp = (path: string): boolean => loaded.get(path)?.failed === true;

/**
 * Asks for a view's pictures (all at once, so they come together) and says whether they are all here. A view whose file is not there
 * is marked failed and the side view stands in. Makes no garbage once the pictures have come.
 */
export function faceReady(face: Face | undefined): face is Face {
  if (!face || face.failed) return false;
  if (!face.img) face.img = picture(face.image);
  if (face.glow && !face.glowImg) face.glowImg = picture(face.glow);
  if (gaveUp(face.image) || (face.glow !== undefined && gaveUp(face.glow))) {
    face.failed = true;
    return false;
  }
  return face.img !== undefined && (face.glow === undefined || face.glowImg !== undefined);
}

/** The view's pictures of a thing, if the thing has them and they have come. */
export function faceOf(faces: Faces | undefined, facing: Facing): Face | undefined {
  if (!faces || facing === 'side') return undefined;
  const face = facing === 'front' ? faces.front : faces.back;
  return faceReady(face) ? face : undefined;
}

/** `path` with `-<suffix>` before the extension: assets/mart/fl/hats/mage-straw.png → mage-straw-front.png. */
export const withView = (path: string, view: 'front' | 'back'): string => path.replace(/\.png$/, `-${view}.png`);

/** The views of a picture named by the designer's convention (<name>-front.png, <name>-back.png), and of its glow (<name>-glow-front.png). */
export function conventionFaces(image: string, glow?: string, views: { front?: boolean; back?: boolean } = { front: true, back: true }): Faces {
  const faces: Faces = {};
  if (views.front) faces.front = { image: withView(image, 'front'), ...(glow ? { glow: withView(glow, 'front') } : {}) };
  if (views.back) faces.back = { image: withView(image, 'back'), ...(glow ? { glow: withView(glow, 'back') } : {}) };
  return faces;
}

/**
 * The views of each kind of sprite whose sheets exist, by the name of its picture (a hero's class sheet or a monster's). A kind that is
 * not here is drawn from the side in every direction. Stage 2 and 3 of part 8 (the monsters) only add to this list: a sheet has the
 * layout of the side one (same frame size, same frame numbers), so nothing else changes.
 */
export const SPRITE_VIEWS: Readonly<Record<string, Faces>> = {
  warrior: conventionFaces('dirs/warrior.png'),
  mage: conventionFaces('dirs/mage.png'),
  rogue: conventionFaces('dirs/rogue.png'),
  ranger: conventionFaces('dirs/ranger.png'),
  // Stage 2 (the monsters of the first depths). The albino and the fetid rat use the rat's sheets, the bandit the thief's.
  rat: conventionFaces('dirs/rat.png'),
  gnoll: conventionFaces('dirs/gnoll.png'),
  shaman: conventionFaces('dirs/shaman.png'),
  skeleton: conventionFaces('dirs/skeleton.png'),
  thief: conventionFaces('dirs/thief.png'),
  bee: conventionFaces('dirs/bee.png'),
  sheep: conventionFaces('dirs/sheep.png'),
  // Drawn facing the camera already: the front is the side picture, only the back is new.
  spinner: conventionFaces('dirs/spinner.png', undefined, { back: true }),
  bat: conventionFaces('dirs/bat.png', undefined, { back: true }),
};

/**
 * The pets whose pictures have views of their own, by the name of the file (assets/mart/fl/pets/<name>.png): the rat has both; the slime, the
 * bat, the skull and the ember are drawn facing the camera already (front = the picture they have) and only add a faceless back; the firefly
 * is the same from every side. A back keeps the pet's glow mask (the same place on a faceless body).
 */
export const PET_VIEWS: Readonly<Record<string, { front?: boolean; back?: boolean }>> = {
  rat: { front: true, back: true },
  slime: { back: true },
  bat: { back: true },
  skull: { back: true },
  ember: { back: true },
};

/* ---- what to draw ---- */

/** The pictures to draw for a character now: written in place by `figureOf` (read them before asking again). */
export interface Figure {
  /** The view the pictures are of: side, or a view whose pictures have all come. */
  facing: Facing;
  /** The side view is mirrored; the others never are. */
  flip: boolean;
  /** The body's sheet: the same layout as the side sheet. */
  image: HTMLImageElement;
  /** A legendary look's glow mask in the same layout; the hat and its glow in a cell of the hat's. */
  glow: HTMLImageElement | undefined;
  hat: HTMLImageElement | undefined;
  hatGlow: HTMLImageElement | undefined;
}

const FIGURE: Figure = { facing: 'side', flip: false, image: undefined as unknown as HTMLImageElement, glow: undefined, hat: undefined, hatGlow: undefined };

/**
 * What a character is drawn from now: its view by the rule, with every picture that follows the view (the look, its glow, the hat and
 * its glow) taken from that view. If any of them has not come yet, the whole figure stays on the side view: nothing pops in half
 * dressed. The one object is reused: no garbage.
 */
export function figureOf(puppet: Puppet, now: number): Figure {
  settle(puppet, now);
  const worn = puppet.worn;
  const look = worn?.look;
  const hat = worn?.hat;
  const out = FIGURE;
  out.facing = 'side';
  out.image = puppet.sprite.sheet.image;
  out.glow = look?.glow;
  out.hat = hat?.image;
  out.hatGlow = hat?.glow;
  const want = puppet.alive ? puppet.facing : 'side';
  if (want !== 'side') {
    const body = faceOf(look ? look.faces : puppet.sprite.faces, want);
    const hatFace = hat ? faceOf(hat.faces, want) : undefined;
    if (body && (!hat || hatFace)) {
      out.facing = want;
      out.image = body.img!;
      out.glow = look?.glow ? body.glowImg : undefined;
      if (hat) {
        out.hat = hatFace!.img;
        out.hatGlow = hat.glow ? hatFace!.glowImg : undefined;
      }
    }
  }
  out.flip = out.facing === 'side' && puppet.flip;
  return out;
}
