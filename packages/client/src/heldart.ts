/*
 * The weapon in the hand (design part 9) as the renderers use it: held.json is fetched once, a weapon's sheet when it is first drawn (with
 * the build's mark on the address, as every picture of dirs.ts), and until they have come nothing is drawn. The pure rules are in held.ts;
 * this is the loading, and the one question both renderers ask: what does this figure hold in this frame?
 */
import type { Facing, Figure } from './dirs';
import { flChanged, flImage, flReady } from './flart';
import { type Held, type HeldData, heldOf } from './held';
import type { Puppet } from './view';

declare const __BUILD__: { commit: string; date: string } | undefined;
const VERSION = typeof __BUILD__ !== 'undefined' ? __BUILD__.commit : 'dev';
const BASE = `${import.meta.env?.BASE_URL ?? '/'}assets/`;

let data: HeldData | undefined;
let loading = false;
let failures = 0;
let failedAt = 0;

/** held.json, once it has come; it is fetched the first time it is asked for (and again, a few times, a little later, if it fails). */
export function heldData(): HeldData | undefined {
  if (data || loading || typeof fetch === 'undefined') return data;
  if (failures > 0 && (failures > 3 || Date.now() - failedAt < 1500 * failures)) return undefined;
  loading = true;
  fetch(`${BASE}weapons/held/held.json?v=${VERSION}`)
    .then((response) => (response.ok ? (response.json() as Promise<HeldData>) : Promise.reject(new Error(String(response.status)))))
    .then((json) => {
      data = json;
      // The cards and the 2D loop draw again when it arrives.
      flChanged();
    })
    .catch(() => {
      failures++;
      failedAt = Date.now();
    })
    .finally(() => {
      loading = false;
    });
  return undefined;
}

/** A weapon's sheet (a path inside assets/), once it has come; it is fetched the first time it is asked for, with the build's mark. */
export function heldSheet(path: string): HTMLImageElement | undefined {
  const image = flImage(path);
  return flReady(image) ? image : undefined;
}

/** What a figure holds in a frame: the weapon's cell (held.ts) and its sheet. One object, reused. */
export interface HeldFigure {
  held: Held;
  image: HTMLImageElement;
}

/**
 * The weapon a hero holds in this frame of its sheet, drawn in the view `facing` (dirs.ts figureOf): null for anyone else, the dead, empty
 * hands, a weapon thrown and not yet back (a boomerang in flight), and a frame with the hands busy. The pictures are not looked at here.
 */
export function heldFor(data: HeldData, puppet: Puppet, facing: Facing, frame: number, now: number): Held | null {
  const kind = puppet.weapon;
  if (!kind || !puppet.isHero || !puppet.alive) return null;
  if (puppet.heldAwayUntil !== undefined && now < puppet.heldAwayUntil && now >= (puppet.heldAwayFrom ?? 0)) return null;
  return heldOf(data, puppet.kind, facing, puppet.row, frame, kind, puppet.anim === 'attack');
}

const OUT = { held: undefined as unknown as Held, image: undefined as unknown as HTMLImageElement };

/** `heldFor` with the loading: null until held.json and the weapon's sheet have come. The one object is reused. */
export function heldFigure(puppet: Puppet, fig: Figure, frame: number, now: number): HeldFigure | null {
  if (!puppet.weapon) return null;
  const data = heldData();
  if (!data) return null;
  const held = heldFor(data, puppet, fig.facing, frame, now);
  if (!held) return null;
  const image = heldSheet(held.sheet);
  if (!image) return null;
  OUT.held = held;
  OUT.image = image;
  return OUT;
}

/** The weapon on a hero card: what is held in the idle frame of the side view, and whether it is still on its way. */
export interface CardHeld {
  figure: HeldFigure | null;
  /** held.json or the weapon's sheet has not come yet: draw what there is, and again when it arrives. */
  pending: boolean;
}

const CARD: CardHeld = { figure: null, pending: false };

/**
 * The weapon in the hand of a card's hero (design part 9): frame `frame` of his sheet in the armour's row `tier`, in the side view the cards
 * keep, at rest. A kind the hand sheets do not know (an old record, a device's word) is simply not drawn. One object, reused.
 */
export function heldOnCard(heroClass: string, tier: number, frame: number, kind: string | undefined, attack = false): CardHeld {
  CARD.figure = null;
  CARD.pending = false;
  if (!kind) return CARD;
  const data = heldData();
  if (!data) {
    CARD.pending = typeof fetch !== 'undefined';
    return CARD;
  }
  const held = heldOf(data, heroClass, 'side', tier, frame, kind, attack);
  if (!held) return CARD;
  const image = heldSheet(held.sheet);
  if (!image) {
    CARD.pending = true;
    return CARD;
  }
  OUT.held = held;
  OUT.image = image;
  CARD.figure = OUT;
  return CARD;
}
