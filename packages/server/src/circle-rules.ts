import compete from '../../client/public/assets/compete/compete.json';
import type { DailyEntry } from './leaderboard';

/*
 * Circles (design part 7): friends (up to 50) or a Telegram group (up to 200) with a board of their own for the week; whoever is first at
 * the week's end is the circle's champion (the title «Чемпион круга», and +30 Heat). A circle is made by a player and joined by its code
 * (the invite link `?startapp=c_<code>`), or, for a group, by opening the game from that group's chat (the chat's `chat_instance` in the
 * signed init data names the circle: nothing a device says). A player may be in 2 circles. Pure rules; the objects are in circle.ts.
 */

export type CircleKind = 'friends' | 'group';
export const KINDS: readonly CircleKind[] = ['friends', 'group'];
/** The most players a circle holds, by kind (compete.json → circles.size). */
export const CAPS: Readonly<Record<CircleKind, number>> = compete.circles.size as Record<CircleKind, number>;
/** The most circles a player is in at once: each is one more call at a run's end, so the number is small. */
export const MAX_CIRCLES = 2;
/** A circle's champion needs a rival: a week with fewer players on the board has none. */
export const MIN_PLAYERS = 2;
export const NAME_MAX = 24;

/** A circle's code: ten lower-case letters and digits (a group's starts with g, from its chat). */
export const CODE = /^[a-z0-9]{10}$/;
export const isCode = (value: unknown): value is string => typeof value === 'string' && CODE.test(value);

/** Letters that are not mistaken for one another when read aloud or typed. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A new code for friends from random bytes (the first letter is never g: that one is for groups). */
export function newCode(bytes: Uint8Array): string {
  let code = '';
  for (let i = 0; i < 10; i++) {
    const letter = ALPHABET[bytes[i]! % ALPHABET.length]!;
    code += i === 0 && letter === 'g' ? 'h' : letter;
  }
  return code;
}

/** The code of a group's circle: from the chat's own mark in the signed init data, the same for everyone in that chat, and no one's guess. */
export async function groupCode(chatInstance: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`circle-group:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(chatInstance)));
  return `g${[...mac.slice(0, 5)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 9)}`;
}

/** A name a player gives a circle: trimmed, one space between words, no control or invisible characters; null if nothing is left. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\p{C}\p{Z}]+/gu, ' ').trim().slice(0, NAME_MAX).trim();
  return name.length > 0 ? name : null;
}

/** A circle as it is told: its name, kind and how many are in it. */
export interface CircleMeta {
  name: string;
  kind: CircleKind;
  size: number;
  cap: number;
}

export type JoinVerdict = 'ok' | 'already' | 'full' | 'limit' | 'bad code' | 'no such circle';

/** Whether a player may join a circle: the code is one, they are not in it, not in too many, and there is room. `meta` is null for a circle that does not exist. */
export function joinVerdict(code: unknown, mine: readonly string[], meta: Pick<CircleMeta, 'kind' | 'size'> | null): JoinVerdict {
  if (!isCode(code)) return 'bad code';
  if (mine.includes(code)) return 'already';
  if (mine.length >= MAX_CIRCLES) return 'limit';
  if (!meta) return 'no such circle';
  return meta.size >= CAPS[meta.kind] ? 'full' : 'ok';
}

/** The champion of a week's board: its first, if at least two played. */
export function championOf(first: Pick<DailyEntry, 'owner' | 'name' | 'score'> | null | undefined, played: number): { owner: string; name: string; score: number } | null {
  if (!first?.owner || played < MIN_PLAYERS) return null;
  return { owner: first.owner, name: first.name, score: first.score };
}
