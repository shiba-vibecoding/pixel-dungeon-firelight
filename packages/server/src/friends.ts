/*
 * The people a player is connected to through the game, and the note that goes with a gift.
 *
 * A Mini App cannot read anybody's contacts, so «friends who play» are only those the game itself has joined, by a real link or a
 * real gift (the wallet's `connections`, wallet.ts):
 *   - a gift link opened: the giver and whoever opened it (shopapi.ts acceptGift);
 *   - a gift delivered: the giver and the friend (payments.ts deliverGift);
 *   - an invite or share link (`startapp=ref_<id>`, or `daily_r<id>`) opened by another player (shopapi.ts connectByRef).
 * Nothing else makes a connection. The list shows a name and a class, never an id: each connection has an opaque handle (`h`) that
 * names the friend to the gift flow, and only to the player it belongs to.
 */

import type { Wallets } from './payments';

/** The longest gift note, in characters (code points), after cleaning. */
export const NOTE_MAX = 80;
/** What is read of a note before cleaning: a longer one is no honest note. */
const NOTE_RAW_MAX = 400;
/** How many connections a player keeps; a full list takes no more (so a flood of forged links cannot push real friends out). */
export const CONNECTIONS_MAX = 60;
/** How many friends the gift screen lists. */
export const FRIENDS_SHOWN = 30;

/**
 * Control characters, and the invisible ones that reorder or hide text (bidi marks and overrides, zero-width characters, the byte-order
 * mark, the soft hyphen), as code point ranges: all but tab, line feed and carriage return, which become spaces first.
 */
const STRIPPED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08], [0x0b, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e], [0x200b, 0x200f], [0x202a, 0x202e],
  [0x2060, 0x2064], [0x2066, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb],
];
const chars = (codes: readonly number[]): string => codes.map((code) => String.fromCodePoint(code)).join('');
const STRIPPED = new RegExp(`[${STRIPPED_RANGES.map(([from, to]) => chars(from === to ? [from] : [from, 0x2d, to])).join('')}]`, 'g');
/** Line breaks (the Unicode ones too) and tabs: spaces. */
const BREAKS = new RegExp(`[${chars([0x0a, 0x0d, 0x09, 0x85, 0x2028, 0x2029])}]`, 'g');

export type NoteResult = { ok: true; note?: string } | { ok: false; error: string };

/**
 * A gift note as the shop takes it: plain text, line breaks and tabs as spaces, control and invisible characters out, runs of
 * spaces as one, trimmed; at most NOTE_MAX characters (a longer note is refused, never cut in the middle of what was written).
 * Nothing (or only blanks) is no note.
 */
export function cleanNote(raw: unknown): NoteResult {
  if (raw === undefined || raw === null) return { ok: true };
  if (typeof raw !== 'string') return { ok: false, error: 'bad note' };
  if (raw.length > NOTE_RAW_MAX) return { ok: false, error: 'note too long' };
  const note = raw.normalize('NFC').replace(BREAKS, ' ').replace(STRIPPED, '').replace(/\s+/g, ' ').trim();
  if (note === '') return { ok: true };
  if ([...note].length > NOTE_MAX) return { ok: false, error: 'note too long' };
  return { ok: true, note };
}

/** How a connection came about. */
export type Via = 'gift' | 'invite';

/** One connection, kept in a player's wallet under the other player's id. */
export interface Connection {
  at: number;
  via: Via;
  /** An opaque handle, so the client can name this friend to the gift flow without ever holding their id. */
  h: string;
}

/** A fresh handle for a connection. */
export const newHandle = (): string => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The friend as the gift screen sees them: a handle, a name and a class; nothing private. */
export interface Friend {
  h: string;
  name: string;
  heroClass?: string;
}

/** What a player's own object tells of them to a friend: their name and the class of their latest run. */
export interface PlayerCard {
  name: string;
  heroClass?: string;
}

const HANDLE = /^[0-9a-f]{12}$/;
export const isHandle = (value: unknown): value is string => typeof value === 'string' && HANDLE.test(value);

/** The inviter in a launch's start parameter: `ref_<id>`, or a share link's `daily_r<id>`; null for any other. */
export function refOfStart(start: unknown): number | null {
  if (typeof start !== 'string') return null;
  const match = /^(?:ref_|daily_r)(\d{1,15})$/.exec(start);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** The friend a handle names among a player's connections, if it names one. */
export function friendByHandle(connections: Readonly<Record<string, Connection>> | undefined, handle: string): number | null {
  for (const [id, connection] of Object.entries(connections ?? {})) if (connection.h === handle) return Number(id);
  return null;
}

/**
 * The list of friends who play: the connections, newest first, each with the card their own object gives; one whose player is not
 * known (no card) is left out.
 */
export async function friendList(
  connections: Readonly<Record<string, Connection>> | undefined, card: (user: number) => Promise<PlayerCard | null>,
): Promise<Friend[]> {
  const newest = Object.entries(connections ?? {}).sort((a, b) => b[1].at - a[1].at).slice(0, FRIENDS_SHOWN);
  const cards = await Promise.all(newest.map(([id]) => card(Number(id)).catch(() => null)));
  const friends: Friend[] = [];
  newest.forEach(([, connection], i) => {
    const found = cards[i];
    if (found && found.name) friends.push({ h: connection.h, name: found.name, ...(found.heroClass ? { heroClass: found.heroClass } : {}) });
  });
  return friends;
}

/** Records that two players are connected, at both ends; a wallet that cannot be reached is left for the next real link. */
export async function connect(deps: { wallets: Wallets; now: number }, a: number, b: number, via: 'gift' | 'invite'): Promise<void> {
  if (a === b || !Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a <= 0 || b <= 0) return;
  await Promise.all([
    deps.wallets.apply(a, { kind: 'connect', with: b, via, at: deps.now, h: newHandle() }),
    deps.wallets.apply(b, { kind: 'connect', with: a, via, at: deps.now, h: newHandle() }),
  ].map((done) => done.catch(() => undefined)));
}
