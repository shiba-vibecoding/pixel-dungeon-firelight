import type { HeroClass } from '@pd/core';
import type { Profile } from './checked';

/*
 * What a hero card needs to know of a hero, and the pure parts of drawing it (no DOM, so they are tested): which look a board entry
 * stands for, the key a composed card is kept under, and the least-recently-used store those are kept in (herocard.ts).
 */

/** The class and what is worn (catalogue item ids, as the board's `w`). */
export interface CardLook {
  heroClass: HeroClass | string;
  /** The tier of the armour worn at the end of the run: the row of the hero's sheet (0 none, 1 cloth ... 5 plate, 6 the class armour). Absent: cloth, what every hero sets out in. */
  a?: number;
  /** The weapon in the hand at the end of the run (an item kind, `weapon.sword`); drawn in the hand on the idle frame, side view (held.ts). Absent: bare hands. */
  wp?: string;
  /** The look for this class, the hat, the pet, the camp fire, the profile frame. */
  l?: string;
  h?: string;
  p?: string;
  f?: string;
  fr?: string;
  /** The league's step (spark ... beacon): its frame is the card's when no other frame is worn. */
  lg?: string;
}

/** What a board entry says of the hero (server worn.ts Worn): everything the card reads, and the name colour and title the row reads. */
export interface WornShape {
  a?: number;
  wp?: string;
  l?: string;
  h?: string;
  p?: string;
  f?: string;
  fr?: string;
  tt?: string;
  nc?: string;
  lg?: string;
}

/** A board entry's hero: its class and the server's snapshot of what the player wore (`w`; absent from older entries: the plain class). */
export function lookOfEntry(entry: { heroClass: string; w?: WornShape }): CardLook {
  const w = entry.w;
  return { heroClass: entry.heroClass, ...(isTier(w?.a) ? { a: w!.a! } : {}), ...(isKind(w?.wp) ? { wp: w!.wp! } : {}), ...(w?.l ? { l: w.l } : {}), ...(w?.h ? { h: w.h } : {}), ...(w?.p ? { p: w.p } : {}), ...(w?.f ? { f: w.f } : {}), ...(w?.fr ? { fr: w.fr } : {}), ...(w?.lg ? { lg: w.lg } : {}) };
}

/** A weapon's kind as a board says it (checked against what the hand sheets know when it is drawn). */
const isKind = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 48;

/** The rows of a hero's sheet (the armour tiers). */
export const MAX_TIER = 6;
/** The tier a hero without one is drawn in: cloth, the armour every hero sets out in (and the camp's). */
export const DEFAULT_TIER = 1;

const isTier = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_TIER;

/** The row of the hero's sheet a card is drawn from: its armour tier, or cloth. */
export const tierOf = (look: CardLook): number => (isTier(look.a) ? look.a : DEFAULT_TIER);

/** The key a composed card is kept under: `class|tier|look|hat|pet|fire|weapon`. The frame is drawn over the kept picture, so it is not in the key. */
export const cardKey = (look: CardLook): string => `${look.heroClass}|${tierOf(look)}|${look.l ?? ''}|${look.h ?? ''}|${look.p ?? ''}|${look.f ?? ''}|${look.wp ?? ''}`;

/** A store of at most `size` things, the one used least recently going first. */
export class Lru<V> {
  private readonly map = new Map<string, V>();

  constructor(readonly size: number) {}

  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.size) this.map.delete(this.map.keys().next().value!);
  }

  clear(): void {
    this.map.clear();
  }

  get count(): number {
    return this.map.size;
  }
}

/** The size of a card in CSS pixels: the scene at its scale inside a frame (slice art pixels thick, at the frame's own scale). The board's row is 80 x 56. */
export function cardSize(scene: readonly [number, number], scale: number, slice: number, frameScale: number): [number, number] {
  return [scene[0] * scale + 2 * slice * frameScale, scene[1] * scale + 2 * slice * frameScale];
}

/** The hero's idle frame at a time (PD 1.9: a sequence of frames at a rate, looping). */
export function idleFrame(seq: readonly number[], fps: number, t: number): number {
  return seq[Math.floor((t / 1000) * fps) % seq.length] ?? 0;
}

/** A spark of the fire at a time: how far it has risen (art pixels) and which of the spark's frames it shows; undefined once it is out of the card. */
export function sparkState(dy: number, k: number, t: number, fireY: number): { rise: number; frame: number } | undefined {
  const rise = Math.floor((t / 120 + k * 1.7) % 6);
  if (dy - rise < -fireY + 1) return undefined;
  return { rise, frame: (k + rise) % 4 };
}

/** How the card's own draw scales: whole device pixels to an art pixel (so the art stays crisp), at least 1. */
export const wholeScale = (scale: number, dpr: number): number => Math.max(1, Math.floor(scale * Math.max(1, dpr)));

/** The player's last run (of this class, else of the last at all that kept its armour): he is shown in what he died or finished in. */
export function lastRun(profile: Profile | null, heroClass: string): Profile['history'][number] | undefined {
  const runs = profile?.history ?? [];
  return runs.find((run) => run.heroClass === heroClass && run.armor !== undefined) ?? runs.find((run) => run.armor !== undefined);
}

/** The armour of that run. */
export const lastArmor = (profile: Profile | null, heroClass: string): number | undefined => lastRun(profile, heroClass)?.armor;

/** The weapon in the hand at the end of that run (undefined: bare hands, or a run from before it was kept). */
export const lastWeapon = (profile: Profile | null, heroClass: string): string | undefined => lastRun(profile, heroClass)?.weapon;

