import type { HeroClass } from '@pd/core';
import { mergeWith } from './cloud';

/*
 * Rankings: the best runs played on this device, as in the original
 * (Rankings.TABLE_SIZE records, scored by gold collected and level times the
 * deepest depth, doubled for a win). Kept in local storage.
 */

export interface RunRecord {
  /** One record per run and hero, however often its end is shown. */
  key: string;
  score: number;
  name: string;
  heroClass: HeroClass;
  lvl: number;
  /** The deepest depth reached. */
  depth: number;
  gold: number;
  won: boolean;
  /** What ended the run, as shown at its end. */
  cause: string;
  mode: 'solo' | 'daily' | 'coop';
  /** The tier of the armour the hero wore at the end (the row of his sheet: 1 cloth ... 6 class armour); records from before it was kept draw cloth. */
  armor?: number;
  /** The server checked the run (checked.ts), so it stands on the boards too; runs of before checked runs have none. */
  checked?: boolean;
  date: number;
}

const KEY = 'pd-rankings';

/** A record of a kind this build still has: the arena of waves' runs, kept by an earlier edition, are not shown, counted or ranked. */
const current = (record: RunRecord): boolean => (record.mode as string) !== 'arena';
const TABLE_SIZE = 11;

/** Rankings.score: gold collected plus level times the deepest depth times a hundred, twice that for a win. */
export const runScore = (gold: number, lvl: number, depth: number, won: boolean): number => (gold + lvl * depth * 100) * (won ? 2 : 1);

// Two devices' tables become one: every run once, the best first.
mergeWith(KEY, (here, cloud) => {
  try {
    const list = [...(JSON.parse(here ?? '[]') as RunRecord[]), ...(JSON.parse(cloud) as RunRecord[])].filter(current);
    const runs = [...new Map(list.map((r) => [r.key, r])).values()];
    runs.sort((a, b) => b.score - a.score || a.date - b.date);
    return JSON.stringify(runs.slice(0, TABLE_SIZE));
  } catch {
    return here;
  }
});

export function rankings(): RunRecord[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RunRecord[];
    return Array.isArray(list) ? list.filter(current) : [];
  } catch {
    return [];
  }
}

/**
 * Enters a finished run in the table; returns its place (1 for the best), or
 * null if it did not make the table. A run already entered keeps its place.
 */
export function recordRun(record: RunRecord): number | null {
  const list = rankings();
  const known = list.findIndex((r) => r.key === record.key);
  if (known >= 0) return known + 1;
  list.push(record);
  // Higher scores first; among equal ones, the earlier run stays ahead.
  list.sort((a, b) => b.score - a.score || a.date - b.date);
  const kept = list.slice(0, TABLE_SIZE);
  try {
    localStorage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Not kept; the place is still worth telling.
  }
  const place = kept.findIndex((r) => r.key === record.key);
  return place >= 0 ? place + 1 : null;
}
