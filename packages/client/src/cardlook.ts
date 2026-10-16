import type { HeroClass } from '@pd/core';

/*
 * What a hero card needs to know of a hero, and the pure parts of drawing it (no DOM, so they are tested): which look a board entry
 * stands for, the key a composed card is kept under, and the least-recently-used store those are kept in (herocard.ts).
 */

/** The class and what is worn (catalogue item ids, as the board's `w`). */
export interface CardLook {
  heroClass: HeroClass | string;
  /** The tier of the armour worn at the end of the run: the row of the hero's sheet (0 none, 1 cloth ... 5 plate, 6 the class armour). Absent: cloth, what every hero sets out in. */
  a?: number;
  /** The look for this class, the hat, the pet, the camp fire, the profile frame. */
  l?: string;
  h?: string;
  p?: string;
  f?: string;
  fr?: string;
}

/** A board entry's hero: its class and the server's snapshot of what the player wore (`w`; absent from older entries: the plain class). */
export function lookOfEntry(entry: { heroClass: string; w?: { a?: number; l?: string; h?: string; p?: string; f?: string; fr?: string; tt?: string; nc?: string } }): CardLook {
  const w = entry.w;
  return { heroClass: entry.heroClass, ...(isTier(w?.a) ? { a: w!.a! } : {}), ...(w?.l ? { l: w.l } : {}), ...(w?.h ? { h: w.h } : {}), ...(w?.p ? { p: w.p } : {}), ...(w?.f ? { f: w.f } : {}), ...(w?.fr ? { fr: w.fr } : {}) };
}

/** The rows of a hero's sheet (the armour tiers). */
export const MAX_TIER = 6;
/** The tier a hero without one is drawn in: cloth, the armour every hero sets out in (and the camp's). */
export const DEFAULT_TIER = 1;

const isTier = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_TIER;

/** The row of the hero's sheet a card is drawn from: its armour tier, or cloth. */
export const tierOf = (look: CardLook): number => (isTier(look.a) ? look.a : DEFAULT_TIER);

/** The key a composed card is kept under: `class|tier|look|hat|pet|fire`. The frame is drawn over the kept picture, so it is not in the key. */
export const cardKey = (look: CardLook): string => `${look.heroClass}|${tierOf(look)}|${look.l ?? ''}|${look.h ?? ''}|${look.p ?? ''}|${look.f ?? ''}`;

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
