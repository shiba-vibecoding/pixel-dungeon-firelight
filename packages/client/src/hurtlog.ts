import type { Hero } from '@pd/core';
import type { Conditions, Source } from './hurtsrc';

/*
 * The last wounds the hero took, for the «what happened» feed: how much, from what, on which turn. A ring of a couple of dozen; the
 * feed shows the newest dozen. Cleared when a run starts. Pure: main.ts fills it from the effects of each batch.
 */

export interface HurtEntry {
  /** The world's turn counter when it happened. */
  turn: number;
  depth: number;
  amount: number;
  source: Source;
}

/** How many wounds the feed shows. */
export const FEED_SHOWN = 12;
const KEPT = 24;

export class HurtLog {
  private list: HurtEntry[] = [];

  /** The newest first. */
  recent(count = FEED_SHOWN): readonly HurtEntry[] {
    return this.list.slice(-count).reverse();
  }

  get size(): number {
    return this.list.length;
  }

  push(entry: HurtEntry): void {
    this.list.push(entry);
    if (this.list.length > KEPT) this.list.splice(0, this.list.length - KEPT);
  }

  reset(): void {
    this.list = [];
  }
}

/** What hurts the hero in their state (hurtsrc.ts Conditions); `gas` is whether they stand in a cloud that harms. */
export function conditionsOf(hero: Hero, starving: boolean, gas: boolean): Conditions {
  return {
    burning: hero.burning > 0,
    poison: hero.poison > 0,
    bleeding: Math.max(0, hero.bleeding ?? 0),
    ooze: hero.ooze >= 0,
    deferred: (hero.deferred ?? 0) > 0,
    starving,
    gas,
  };
}
