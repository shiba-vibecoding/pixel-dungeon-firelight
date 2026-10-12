import type { HeroClass } from '@pd/core';

/* The daily dungeon's leaderboard on the co-op server. */

export interface DailyResult {
  heroClass: HeroClass;
  depth: number;
  level: number;
  gold: number;
  won: boolean;
}

export interface DailyEntry extends DailyResult {
  id: string;
  name: string;
  score: number;
}

export interface DailyBoard {
  rank: number | null;
  top: DailyEntry[];
  /** My id on the board, when known. */
  you?: string;
}

export interface Identity {
  initData?: string;
  id: string;
  name: string;
}

/** The server's HTTP address, from its WebSocket one. */
function httpBase(server: string): string {
  return server.replace(/^ws(s?):/, 'http$1:');
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function submitDaily(server: string, identity: Identity, result: DailyResult): Promise<DailyBoard | null> {
  try {
    const response = await fetch(`${httpBase(server)}/daily/${today()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...identity, hero: result.heroClass, result }),
    });
    return response.ok ? ((await response.json()) as DailyBoard) : null;
  } catch {
    return null;
  }
}

export async function fetchDaily(server: string, me?: string): Promise<DailyBoard | null> {
  try {
    const query = me ? `?me=${encodeURIComponent(me)}` : '';
    const response = await fetch(`${httpBase(server)}/daily/${today()}${query}`);
    return response.ok ? ((await response.json()) as DailyBoard) : null;
  } catch {
    return null;
  }
}
