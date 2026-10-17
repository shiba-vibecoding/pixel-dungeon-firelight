/*
 * The daily dungeon's leaderboard: everyone plays the same seed, and each
 * player's best run of the day counts. Pure logic; the Durable Object stores
 * `entries()` and serves it over HTTP.
 */

export interface DailyResult {
  heroClass: string;
  depth: number;
  level: number;
  gold: number;
  won: boolean;
}

/**
 * How a player's hero looked on a board (catalogue item ids; absent fields: nothing worn, the classic fire). A snapshot the SERVER builds
 * from the wallet's owned and worn items (worn.ts), never from a client: `l` the look of the class played, `h` the hat, `p` the pet,
 * `f` the camp fire, `fr` the profile frame, `tt` the title, `nc` the name colour.
 */
export interface Worn {
  l?: string;
  h?: string;
  p?: string;
  f?: string;
  fr?: string;
  tt?: string;
  nc?: string;
  /** The tier of the armour worn at the end of the run (the row of the hero's sheet: 1 cloth ... 6 the class armour), from the verified final world. Absent: cloth. */
  a?: number;
  /** The weapon in the hero's hand at the end of the run (an item kind, `weapon.sword`, or a held `missile.*`), from the verified final world; drawn in the hand on the card. Absent: bare hands (and every entry from before it was kept). */
  wp?: string;
  /** The step of the weekly league the player stood on (league-rules.ts): the hero card's frame when no other is worn. Absent: the first league's. */
  lg?: string;
}

export interface DailyEntry extends DailyResult {
  id: string;
  name: string;
  score: number;
  at: number;
  /** Turns the run took: of equal scores, fewer turns rank higher; absent in entries from before it was kept. */
  turns?: number;
  /** The arena: monsters slain; anywhere, absent in boards from before it was kept. */
  kills?: number;
  /** A patron of the game (Pixel-Mart): a star by the name. */
  patron?: boolean;
  /** What the player wears for the boards (Pixel-Mart's catalogue): the name colour, the title and the portrait frame, by item id. Looks only. */
  nc?: string;
  tt?: string;
  fr?: string;
  /** The hero as the player wore it (the hero card on the board's row); absent from entries before it, which show the plain class. */
  w?: Worn;
  /** Who it is, privately: the player's account key, never served (see servedEntry). */
  owner?: string;
}

/** An entry as anyone may see it: without its owner. */
export function servedEntry(entry: DailyEntry): DailyEntry {
  const { owner: _owner, ...rest } = entry;
  return rest;
}

const HERO_CLASSES = new Set(['warrior', 'mage', 'rogue', 'huntress']);
export const BOARD_SIZE = 100;

/** The original's Rankings score: gold plus experience times depth, doubled for a win. */
export function score(result: DailyResult): number {
  return (result.gold + result.level * result.depth * 100) * (result.won ? 2 : 1);
}

/** The Amulet's depth: the deepest anyone can get, and the only place a run is won. */
const LAST_DEPTH = 26;

/** Checks a submitted result and clamps it to what the dungeon allows. */
export function parseResult(input: unknown): DailyResult | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  const int = (value: unknown, min: number, max: number): number | null =>
    Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? (value as number) : null;
  const depth = int(r.depth, 1, LAST_DEPTH);
  const level = int(r.level, 1, 30);
  const gold = int(r.gold, 0, 100_000);
  if (depth === null || level === null || gold === null || typeof r.won !== 'boolean') return null;
  if (typeof r.heroClass !== 'string' || !HERO_CLASSES.has(r.heroClass)) return null;
  return { heroClass: r.heroClass, depth, level, gold, won: r.won && depth === LAST_DEPTH };
}

/** Board order: higher score first; equal scores by fewer turns (an entry without the count goes after those with one), then who finished earlier. */
export function compareEntries(a: DailyEntry, b: DailyEntry): number {
  return b.score - a.score || (a.turns ?? Infinity) - (b.turns ?? Infinity) || a.at - b.at;
}

/** Who a put passed on the board: the player right behind the new entry now (they were just above it before), and the place they hold. */
export interface Passed {
  owner: string;
  name: string;
  rank: number;
}

export class Leaderboard {
  /** `order` ranks the list (the score list's by default; slices.ts has the others), `size` is how many it keeps. */
  constructor(
    private readonly board: DailyEntry[] = [],
    private readonly order: (a: DailyEntry, b: DailyEntry) => number = compareEntries,
    private readonly size: number = BOARD_SIZE,
  ) {}

  entries(): DailyEntry[] {
    return this.board;
  }

  /** Records a run if it beats the player's best; returns the player's place (1-based) or null. */
  submit(id: string, name: string, result: DailyResult, now: number): number | null {
    return this.put({ ...result, id, name: name.slice(0, 32), score: score(result), at: now });
  }

  /** Records an entry scored already (a checked run) if it beats the player's best; returns the player's place or null. */
  put(entry: DailyEntry): number | null {
    return this.place(entry).rank;
  }

  /**
   * Like put, and says who the entry passed: the player now directly behind it, when the entry came in or moved up (the one who was just
   * above it). `changed`: whether the list is different (nothing to write otherwise).
   */
  place(entry: DailyEntry): { rank: number | null; changed: boolean; passed?: Passed } {
    const id = entry.id;
    const previous = this.board.findIndex((e) => e.id === id);
    if (previous >= 0) {
      // A player's best run stands: the better by this list's order.
      if (this.order(entry, this.board[previous]!) >= 0) return { rank: this.rank(id), changed: false };
      this.board.splice(previous, 1);
    }
    this.board.push(entry);
    this.board.sort(this.order);
    this.board.length = Math.min(this.board.length, this.size);
    const index = this.board.findIndex((e) => e.id === id);
    const rank = index >= 0 ? index + 1 : null;
    const behind = index >= 0 ? this.board[index + 1] : undefined;
    // Passed only if the entry moved up (or came in) past someone who was above it: the one behind it now was ahead of it before.
    const moved = previous < 0 || index < previous;
    const passed = moved && behind?.owner && behind.owner !== entry.owner ? { owner: behind.owner, name: entry.name, rank: index + 2 } : undefined;
    return { rank, changed: true, ...(passed ? { passed } : {}) };
  }

  rank(id: string): number | null {
    const index = this.board.findIndex((e) => e.id === id);
    return index >= 0 ? index + 1 : null;
  }

  /** A player's entry by their account key, and its place. */
  ofOwner(owner: string): { rank: number; entry: DailyEntry } | null {
    const index = this.board.findIndex((e) => e.owner === owner);
    return index >= 0 ? { rank: index + 1, entry: this.board[index]! } : null;
  }

  /**
   * The player's entry shows what they wear now (equipment changed, a purchase refunded): `byClass` holds the snapshot for each class, and
   * the entry takes its own class's. Returns whether anything changed (nothing to write otherwise).
   */
  patchWorn(owner: string, byClass: Readonly<Record<string, Worn | undefined>>): boolean {
    let changed = false;
    for (const entry of this.board) {
      if (entry.owner !== owner) continue;
      // The armour is the run's own (the final world), not the wallet's: it stays.
      const armor = entry.w?.a;
      const weapon = entry.w?.wp;
      const base = byClass[entry.heroClass];
      const worn: Worn | undefined = base || armor !== undefined || weapon !== undefined
        ? { ...base, ...(armor !== undefined ? { a: armor } : {}), ...(weapon !== undefined ? { wp: weapon } : {}) } : undefined;
      // What the entry should say: `w`, and the old per-field values (a client of before `w` reads those).
      const want = { w: worn, nc: worn?.nc, tt: worn?.tt, fr: worn?.fr };
      if (JSON.stringify(want) === JSON.stringify({ w: entry.w, nc: entry.nc, tt: entry.tt, fr: entry.fr })) continue;
      delete entry.w;
      delete entry.nc;
      delete entry.tt;
      delete entry.fr;
      if (worn) entry.w = worn;
      if (worn?.nc) entry.nc = worn.nc;
      if (worn?.tt) entry.tt = worn.tt;
      if (worn?.fr) entry.fr = worn.fr;
      changed = true;
    }
    return changed;
  }

  /** The player's entries carry this name (they chose to be hidden on the boards, or came out of hiding). Returns whether anything changed. */
  patchName(owner: string, name: string): boolean {
    let changed = false;
    for (const entry of this.board) {
      if (entry.owner === owner && entry.name !== name) {
        entry.name = name;
        changed = true;
      }
    }
    return changed;
  }

  top(count: number): DailyEntry[] {
    return this.board.slice(0, count).map(servedEntry);
  }
}

/** How many results a player may send in a day; a real player finishes a handful of runs at most. */
export const MAX_SUBMISSIONS = 10;

/** Counts a player's result of the day: false, without counting, once they have sent MAX_SUBMISSIONS. */
export function countSubmission(counts: Record<string, number>, id: string, max = MAX_SUBMISSIONS): boolean {
  const sent = counts[id] ?? 0;
  if (sent >= max) return false;
  counts[id] = sent + 1;
  return true;
}

/** What the board shows for a player: an opaque id, the same all day, unlinkable across days. */
const PUBLIC_ID = /^p[0-9a-f]{16}$/;

export function isPublicId(id: string): boolean {
  return PUBLIC_ID.test(id);
}

/**
 * A player's id on one day's board: a keyed hash of the day and their account,
 * so the board never shows a Telegram id, and nobody can tell from two days'
 * boards that the same player is on both. `key` is a server secret.
 */
export async function publicId(key: string, date: string, playerId: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(`daily-board:${key}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`${date}\n${playerId}`)));
  return `p${[...mac.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
