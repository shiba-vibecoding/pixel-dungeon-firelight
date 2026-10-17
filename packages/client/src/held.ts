/*
 * The weapon in the hand (design part 9). PD 1.9 draws no weapon on the hero; here the weapon in hand is a second small picture at the
 * hand, frame by frame, in each of part 8's three views (dirs.ts). Everything is in assets/weapons/held/held.json:
 *  - a sheet per weapon (assets/weapons/held/<weapon>.png): cells of 17 x 17 with the grip at the middle pixel (8, 8); row 0 the weapon at
 *    eight angles (0 = up the screen, clockwise), row 1 the trail of the blow (column 0 side, 1 front, 2 back);
 *  - the hand that holds it in each of the 21 frames of a hero sheet, by class, view and armour tier;
 *  - for each way of fighting (style: slash, blunt, stab, staff, throw, fist) the angle, the layer (in front of the body or behind it) and
 *    a small shift, frame by frame, for the attack and for every other animation (hold).
 * Drawing order: the weapon behind (layer 'back'), the body, the hat, the weapon in front (layer 'front'). The grip pixel is clear, so the
 * hand of the body (in any Pixel-Mart look) shows round the handle. The tomb, operate and read frames carry no weapon.
 *
 * Nothing here is a rule of the game: it is only what is drawn.
 */
import type { Facing } from './dirs';

export type HeldStyle = 'slash' | 'blunt' | 'stab' | 'staff' | 'throw' | 'fist';

export interface HeldPose {
  /** Angle, degrees: 0 up the screen, clockwise; one of `angles`. */
  a: number;
  l: 'front' | 'back';
  dx: number;
  dy: number;
  trail?: boolean;
}

export interface HeldData {
  cell: [number, number];
  grip: [number, number];
  angles: number[];
  weapons: Record<string, { kind: string; style: HeldStyle; reach: number; flat: boolean; sheet: string }>;
  poses: Record<HeldStyle, Record<Facing, { attack: Array<HeldPose | null>; hold: Array<HeldPose | null> }>>;
  /** By the class's sheet name, view, armour tier: the hand in each frame, [x, y] in the 12 x 15 frame, or null (no weapon then). */
  hands: Record<string, Record<Facing, Array<Array<[number, number] | null>>>>;
}

/** What to draw for the weapon now: written in place by `heldOf` (read it before asking again). */
export interface Held {
  /** The weapon's sheet (a path inside assets/). */
  sheet: string;
  /** The cell of the weapon in its sheet. */
  sx: number;
  sy: number;
  /** The trail's cell in the same sheet, or -1 for none. */
  trailSx: number;
  trailSy: number;
  w: number;
  h: number;
  /** The cell's top left in the hero's frame (pixels from the frame's top left, before the side view is mirrored). */
  left: number;
  top: number;
  layer: 'front' | 'back';
}

/** The hero sheet a class is drawn from (the huntress's is PD's ranger.png). */
export const HELD_SHEET: Readonly<Record<string, string>> = { warrior: 'warrior', mage: 'mage', rogue: 'rogue', huntress: 'ranger' };

const VIEW_COLUMN: Readonly<Record<Facing, number>> = { side: 0, front: 1, back: 2 };

let byKind: Map<string, string> | undefined;
let byKindOf: HeldData | undefined;

/** The weapon's name in held.json for an item kind ('weapon.sword' -> 'sword'), if it has a picture in the hand. */
export function heldKey(data: HeldData, itemKind: string): string | undefined {
  if (byKindOf !== data) {
    byKind = new Map(Object.entries(data.weapons).map(([key, w]) => [w.kind, key]));
    byKindOf = data;
  }
  return byKind!.get(itemKind);
}

const OUT: Held = { sheet: '', sx: 0, sy: 0, trailSx: -1, trailSy: -1, w: 17, h: 17, left: 0, top: 0, layer: 'front' };

/**
 * The weapon to draw with a hero's frame: its cell, the trail's, where the cell goes and on which side of the body; null when nothing is
 * drawn (no weapon in hand, one without a picture, a frame with the hands busy or the tomb). `attack` is true while the attack animation
 * plays (a blow, or the throw of the weapon in hand); every other animation holds the weapon still in the hand of its frame. The one
 * object is reused: no garbage.
 */
export function heldOf(
  data: HeldData, heroClass: string, facing: Facing, tier: number, frame: number, itemKind: string | undefined, attack: boolean,
): Held | null {
  if (!itemKind) return null;
  const key = heldKey(data, itemKind);
  if (!key) return null;
  const weapon = data.weapons[key]!;
  const pose = data.poses[weapon.style]?.[facing]?.[attack ? 'attack' : 'hold']?.[frame];
  const hand = data.hands[HELD_SHEET[heroClass] ?? heroClass]?.[facing]?.[tier]?.[frame];
  if (!pose || !hand) return null;
  const [w, h] = data.cell;
  const out = OUT;
  out.sheet = weapon.sheet;
  out.sx = data.angles.indexOf(pose.a) * w;
  out.sy = 0;
  out.trailSx = pose.trail ? VIEW_COLUMN[facing] * w : -1;
  out.trailSy = pose.trail ? h : -1;
  out.w = w;
  out.h = h;
  out.left = hand[0] + pose.dx - data.grip[0];
  out.top = hand[1] + pose.dy - data.grip[1];
  out.layer = pose.l;
  return out;
}

/**
 * Where the weapon's cell stands relative to the hero's: pixels to the right of the frame's bottom middle (mirrored with the side view)
 * and up from its bottom edge, to the cell's own bottom middle. Multiply by the figure's scale over the tile size, and lean the "up" the
 * way the figure is leaned (world3d: y += up cos LEAN x LEAN_STRETCH, z -= up sin LEAN x LEAN_STRETCH).
 */
export function heldOffset(held: Held, frameW: number, frameH: number, flip: boolean): { right: number; up: number } {
  const right = held.left + held.w / 2 - frameW / 2;
  return { right: flip ? -right : right, up: frameH - (held.top + held.h) };
}
