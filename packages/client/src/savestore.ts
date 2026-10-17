import { act, type Action, fingerprint, RULES_VERSION, type World } from '@pd/core';
import type { RunMeta } from './checked';
import { GORE_PREFIX, goreKeyInfo } from './gore';

/*
 * How a run is kept on the device so that it survives any way of leaving the game: the Mini App closed or swiped away, the
 * webview killed in the background, the phone locked, the network lost, a crash. The rules:
 *
 *  - Two copies, never one. A snapshot of the run (the world, and for a checked run the server's id for it and the moves the
 *    server has not taken yet) is written under a checksum. Snapshots go alternately to `key` and `key~2`, each marked with
 *    a growing generation, so the one being written is never the one last written whole: a kill in the middle of a write
 *    leaves the previous snapshot as it was. A snapshot is read back after it is written, and only then is the journal cleared.
 *  - A turn costs a few hundred bytes, not the whole world. Between snapshots every action the world accepted goes to a small
 *    journal (the actions since the snapshot, the world's fingerprint and turn after the last one), written alternately to
 *    `key~j` and `key~k` so that a write cut short costs the turn in flight and no more. On load the newest journal is played
 *    on the snapshot (the core is deterministic: the server does the same) and must come to its fingerprint; else the one before
 *    it, or the snapshot alone, stands, and the player is told that a few moves were lost.
 *  - Loading validates: the text parses, its checksum and length agree, SAVE_VERSION fits (older ones are migrated or reported
 *    as too old), and a journal is only played when it belongs to that snapshot's generation and to these RULES. A damaged
 *    snapshot falls back to the other one; a damaged pair is reported (`damaged`), so that the caller can ask the server.
 *  - The save always wins the quota: a write that fails drops what is not the run, in a fixed order (evict), and tries again.
 *
 * The snapshot text is still one JSON object of the earlier shape ({ version, world, check }) with the checksum in a trailing
 * field, so a page of an older build that reads it still understands it.
 *
 * Pure but for the storage handed in (tests give a memory one, or one that throws when full).
 */

export const SAVE_VERSION = 40;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

/** A checked run's standing with the server: its run, and the moves not yet sent. */
export interface SavedCheck {
  meta: RunMeta;
  log: Action[];
}

interface SoloSave {
  version: number;
  rules?: number;
  world: World;
  check?: SavedCheck;
}

/** The hero's id in a solo run. */
const ME = 'me';

/** Snapshots to this key and its twin; the journal, alternately in two keys; the lease (instance.ts). */
export const twinKey = (key: string): string => `${key}~2`;
export const journalKey = (key: string): string => `${key}~j`;
export const journalKey2 = (key: string): string => `${key}~k`;
export const leaseKey = (key: string): string => `${key}~o`;
/** The slot a stored key belongs to (the key itself, or one of its companions). */
export const slotOfKey = (key: string): string => key.replace(/~[2jko]$/, '');
/** All of a slot's keys that hold the run (not the lease). */
const runKeys = (key: string): string[] => [key, twinKey(key), journalKey(key), journalKey2(key)];

/** A cheap 53-bit hash of a text (cyrb53): enough to tell a torn or damaged write from a whole one. */
export function checksum(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

/** How a run saved by an older version is brought up to date: each step takes a world of version N to N + 1 (a change that only adds optional fields needs none). */
const MIGRATIONS: Readonly<Record<number, (world: World) => void>> = {};

const TRAILER = ',"~":';

interface Trailer {
  gen: number;
  n: number;
  sum: string;
  at: number;
}

export function encodeSnapshot(world: World, check: SavedCheck | null | undefined, gen: number, now = Date.now()): string {
  const body = JSON.stringify({ version: SAVE_VERSION, rules: RULES_VERSION, world, ...(check ? { check } : {}) } satisfies SoloSave);
  const head = body.slice(0, -1);
  const trailer: Trailer = { gen, n: head.length, sum: checksum(head), at: now };
  return `${head}${TRAILER}${JSON.stringify(trailer)}}`;
}

export type Decoded =
  | { ok: true; save: SoloSave; gen: number; legacy: boolean; at: number }
  /** `gen` is the generation the damaged text still names, if its trailer can be read. */
  | { ok: false; gen?: number };

export function decodeSnapshot(raw: string): Decoded {
  try {
    const at = raw.lastIndexOf(TRAILER);
    if (at < 0) {
      // A save of an older build: no checksum to check, but a text cut short does not parse.
      const save = JSON.parse(raw) as SoloSave;
      return save && typeof save === 'object' && save.world ? { ok: true, save, gen: 0, legacy: true, at: 0 } : { ok: false };
    }
    let trailer: Trailer;
    try {
      trailer = JSON.parse(raw.slice(at + TRAILER.length, -1)) as Trailer;
    } catch {
      return { ok: false };
    }
    const head = raw.slice(0, at);
    if (!raw.endsWith('}') || head.length !== trailer.n || checksum(head) !== trailer.sum) return { ok: false, gen: trailer.gen };
    const save = JSON.parse(`${head}}`) as SoloSave;
    if (!save.world || typeof save.version !== 'number') return { ok: false, gen: trailer.gen };
    return { ok: true, save, gen: trailer.gen, legacy: false, at: trailer.at };
  } catch {
    return { ok: false };
  }
}

/** What the journal says: the snapshot it follows, the actions since, and where the world came to. */
interface Journal {
  /** The generation of the snapshot it follows. */
  g: number;
  /** The rules the actions were played under. */
  r: number;
  a: Action[];
  /** The world's turn and fingerprint after the last action (after the snapshot, with none). */
  t: number;
  f: string;
  /** The server's count of moves taken, if a checked run (the log's head up to it is sent). */
  s?: number;
  /** The run's id at the server, to be sure the log belongs to it. */
  i?: string;
  /** Which write of the session this is: of two journals with the same turn (the server took moves since), the later wins. */
  w?: number;
}

const encodeJournal = (journal: Journal): string => {
  const text = JSON.stringify(journal);
  return `${checksum(text)}|${text}`;
};

function decodeJournal(raw: string): Journal | null {
  try {
    const bar = raw.indexOf('|');
    if (bar < 0) return null;
    const text = raw.slice(bar + 1);
    if (checksum(text) !== raw.slice(0, bar)) return null;
    const journal = JSON.parse(text) as Journal;
    return Array.isArray(journal.a) && typeof journal.g === 'number' && typeof journal.f === 'string' ? journal : null;
  } catch {
    return null;
  }
}

/* ----- reading ----- */

export interface SlotRead {
  /** The run to carry on from: its world as of the last action the journal held, and the server's standing for it. */
  run: { world: World; check: SavedCheck | null; version: number } | null;
  /**
   * Something older stood in for what was lost: 'backup' the other snapshot (a damaged one may have been newer), 'journal' the
   * snapshot without the moves its journal held. Null when nothing was lost.
   */
  recovered: null | 'backup' | 'journal';
  /** Something was stored under the slot's keys but nothing of it can be used. */
  damaged: boolean;
  /** A run saved by an older version that cannot be carried on. */
  stale: { depth: number; heroClass: World['heroes'][number]['heroClass'] } | null;
  /** The highest generation seen, readable or not: what is written next goes above it. */
  gen: number;
  /** Actions played from the journal. */
  replayed: number;
}

function read(s: StorageLike, key: string): string | null {
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

/** Brings a decoded snapshot up to date. Returns its version afterwards. */
function upgrade(save: SoloSave): number {
  let version = save.version;
  for (; version < SAVE_VERSION && MIGRATIONS[version]; version++) MIGRATIONS[version]!(save.world);
  return version;
}

export function readSlot(s: StorageLike, key: string): SlotRead {
  const out: SlotRead = { run: null, recovered: null, damaged: false, stale: null, gen: 0, replayed: 0 };
  const raws = [read(s, key), read(s, twinKey(key))];
  const journalRaws = [read(s, journalKey(key)), read(s, journalKey2(key))].filter((raw): raw is string => raw !== null);
  const usable: Array<{ save: SoloSave; gen: number; raw: string }> = [];
  let invalid = 0;
  for (const raw of raws) {
    if (raw === null) continue;
    const decoded = decodeSnapshot(raw);
    if (!decoded.ok) {
      invalid++;
      if (decoded.gen !== undefined) out.gen = Math.max(out.gen, decoded.gen);
      continue;
    }
    out.gen = Math.max(out.gen, decoded.gen);
    const version = upgrade(decoded.save);
    if (version !== SAVE_VERSION) {
      // Saved by a version too old to carry on (or, after a downgrade, by a newer one): left where it is, and told of.
      const hero = decoded.save.world?.heroes?.[0];
      if (hero && !decoded.save.world.over && version < SAVE_VERSION && !out.stale) out.stale = { depth: hero.depth, heroClass: hero.heroClass };
      continue;
    }
    usable.push({ save: decoded.save, gen: decoded.gen, raw });
  }
  const decodedJournals = journalRaws.map(decodeJournal);
  const journals = decodedJournals
    .filter((j): j is Journal => j !== null)
    // Newest first: the later generation, then the later turn.
    .sort((a, b) => b.g - a.g || b.t - a.t || b.a.length - a.a.length || (b.w ?? 0) - (a.w ?? 0));
  for (const j of journals) out.gen = Math.max(out.gen, j.g);
  // The best snapshot is the one of the highest generation (a save of an older build counts as 0).
  usable.sort((a, b) => b.gen - a.gen);
  const best = usable[0];
  if (!best) {
    out.damaged = invalid > 0 || journalRaws.length > 0;
    return out;
  }
  let world = best.save.world;
  let check: SavedCheck | null = best.save.check ?? null;
  /*
   * A snapshot is followed at once by a journal of its generation (empty until a move is made), so the journal names the newest
   * snapshot that was ever whole: a newer one than the best is a loss (it cannot be read now), the same is the best that stands,
   * an older is what a kill left between the snapshot and the journal (nothing in it is new). A snapshot torn in the writing
   * never reached its journal, so it costs nothing: the journal of the one before it holds the moves.
   */
  if (journalRaws.length > 0) {
    const newest = journals[0];
    if (!newest) {
      // Nothing of the journal can be read: what it held is gone.
      out.recovered = 'journal';
    } else if (newest.g > best.gen) {
      out.recovered = 'backup';
    } else if (newest.g === best.gen) {
      // The newest journal of the snapshot; if it will not play, the one before it (a turn short), if that will not, the snapshot alone.
      const ofThisSnapshot = journals.filter((j) => j.g === best.gen);
      let played: { check: SavedCheck | null } | null = null;
      let used: Journal | null = null;
      for (const candidate of ofThisSnapshot) {
        // (A play changes the world: each try is on the snapshot read afresh.)
        const again = used === null && candidate === ofThisSnapshot[0] ? best.save : (decodeSnapshot(best.raw) as { ok: true; save: SoloSave }).save;
        played = replay(again, candidate);
        if (played) {
          used = candidate;
          world = again.world;
          check = played.check;
          out.replayed = candidate.a.length;
          break;
        }
        used = null;
      }
      if (!played) {
        out.recovered = 'journal';
        const again = decodeSnapshot(best.raw);
        if (again.ok) {
          world = again.save.world;
          check = again.save.check ?? null;
        }
      } else if (used !== ofThisSnapshot[0]) {
        out.recovered = 'journal';
      }
    }
  }
  out.run = { world, check, version: SAVE_VERSION };
  return out;
}

/** Plays the journal on the snapshot's world, in place; null if anything does not agree (the world is then not to be used). */
function replay(snapshot: SoloSave, journal: Journal): { check: SavedCheck | null } | null {
  if (journal.r !== RULES_VERSION) return null;
  const check = snapshot.check ?? null;
  if (journal.i !== undefined && check?.meta.id !== journal.i) return null;
  const world = snapshot.world;
  for (const action of journal.a) {
    if (!act(world, ME, action).ok) return null;
  }
  if (world.turn !== journal.t || fingerprint(world) !== journal.f) return null;
  if (!check) return { check: null };
  const log = [...check.log, ...journal.a];
  const meta = { ...check.meta };
  if (journal.s !== undefined && journal.s > meta.seq) {
    log.splice(0, Math.min(log.length, journal.s - meta.seq));
    meta.seq = journal.s;
  }
  return { check: { meta, log } };
}

/* ----- the quota ----- */

/** Keys that are caches of what the server holds: cheap to lose. */
const CACHES: readonly string[] = ['pd-shop2', 'pd-mart-owned', 'pd-mart-owned-patron', 'pd-window'];

let where: () => { run: string; depth: number } | null = () => null;
/** Tells the quota which run and depth are being played (the bodies and blood of those are the last to go). */
export function setEvictContext(fn: () => { run: string; depth: number } | null): void {
  where = fn;
}

function keysOf(s: StorageLike): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null) keys.push(k);
    }
  } catch {
    // Nothing to list.
  }
  return keys;
}

const size = (s: StorageLike, key: string): number => (read(s, key)?.length ?? 0) + key.length;

/**
 * What may be let go to make room, best first: the bodies and blood of other runs, then of other depths of this run (the farthest
 * from the depth being played first), then the caches of what the server holds, and last the bodies and blood of the depth being
 * played. Never a saved run (any slot's), never the badges, the rankings or the settings.
 */
export function evictable(s: StorageLike): string[] {
  const here = where();
  const keys = keysOf(s);
  const gore = keys.flatMap((key) => {
    const info = goreKeyInfo(key);
    return info ? [{ key, ...info }] : [];
  });
  const otherRuns = gore.filter((g) => here !== null && g.run !== here.run).sort((a, b) => size(s, b.key) - size(s, a.key));
  const sameRun = gore.filter((g) => here === null || g.run === here.run);
  const otherDepths = sameRun
    .filter((g) => here !== null && g.depth !== here.depth)
    .sort((a, b) => Math.abs(b.depth - here!.depth) - Math.abs(a.depth - here!.depth));
  // With no run known (nothing is bound yet), no record is spared but the order of size.
  const unknown = here === null ? gore.sort((a, b) => size(s, b.key) - size(s, a.key)) : [];
  const current = sameRun.filter((g) => here !== null && g.depth === here.depth);
  return [
    ...otherRuns.map((g) => g.key),
    ...otherDepths.map((g) => g.key),
    ...unknown.map((g) => g.key),
    ...CACHES.filter((key) => keys.includes(key)),
    ...current.map((g) => g.key),
  ];
}

/** Characters (UTF-16 units) the storage holds, keys and values. */
export function usage(s: StorageLike): number {
  let total = 0;
  for (const key of keysOf(s)) total += size(s, key);
  return total;
}

/** About 3 MB, counted as a browser does (two bytes a character): above it the start-up lets go of what is not the run. */
export const BUDGET_CHARS = 1_500_000;

/**
 * At start-up: when the device holds more than the budget, the bodies and blood of other runs and depths, and the caches, are
 * let go (best first, see evictable) until it is under. Returns the keys removed. A run's saves are never among them.
 */
export function trimToBudget(s: StorageLike, budget = BUDGET_CHARS): string[] {
  const removed: string[] = [];
  let total = usage(s);
  if (total <= budget) return removed;
  const here = where();
  for (const key of evictable(s)) {
    if (total <= budget) break;
    // The depth being played keeps its record unless nothing else will do.
    const info = goreKeyInfo(key);
    if (here && info && info.run === here.run && info.depth === here.depth) continue;
    total -= size(s, key);
    try {
      s.removeItem(key);
      removed.push(key);
    } catch {
      // Left.
    }
  }
  return removed;
}

/** Writes a value; when the storage refuses, lets go of what is not the run (evictable) one key at a time, and tries again. */
export function putWithRoom(s: StorageLike, key: string, value: string): boolean {
  try {
    s.setItem(key, value);
    return true;
  } catch {
    // Full (or blocked): make room.
  }
  for (const victim of evictable(s)) {
    if (victim === key) continue;
    try {
      s.removeItem(victim);
      s.setItem(key, value);
      return true;
    } catch {
      // Not enough yet.
    }
  }
  return false;
}

/* ----- writing ----- */

/** The most actions the journal holds before the next snapshot. */
export const JOURNAL_MAX = 60;

export class SlotKeeper {
  private gen: number;
  /** Actions since the last snapshot, as the journal holds them. */
  private actions: Action[] = [];
  /** A snapshot of this session is the base the journal follows. */
  private based = false;
  /** Journals written, to alternate the two keys. */
  private journals = 0;
  private lastFp = '';
  private lastTurn = 0;
  /** The size (characters) and time (ms) of the last write, for the tests and the diagnostics. */
  lastWriteMs = 0;
  lastBytes = 0;
  /** Turns to wait before a snapshot is tried again after storage refused one outright (it would only fail again, slowly, every turn). */
  private stuck = 0;

  constructor(private readonly s: StorageLike, readonly key: string, gen = 0) {
    this.gen = gen;
  }

  /** The journal holds moves the last snapshot does not. */
  get pending(): boolean {
    return this.actions.length > 0;
  }

  /** Writes the whole run as a new snapshot, to the twin that does not hold the last one. False if it could not be kept at all. */
  snapshot(world: World, check: SavedCheck | null, now = Date.now()): boolean {
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    const gen = this.gen + 1;
    // A snapshot's check is a copy: the log goes on growing in the session.
    const copy = check ? { meta: { ...check.meta }, log: [...check.log] } : null;
    const text = encodeSnapshot(world, copy, gen, now);
    const target = gen % 2 === 0 ? this.key : twinKey(this.key);
    let ok = this.write(target, text);
    if (!ok) {
      // The last resort: the older snapshot's own place is freed (the newest stays whole), then the write is tried again.
      try {
        this.s.removeItem(target);
      } catch {
        // Stays.
      }
      ok = this.write(target, text);
    }
    if (!ok) {
      this.stuck = 20;
      return false;
    }
    this.stuck = 0;
    this.gen = gen;
    this.actions = [];
    this.based = true;
    this.lastFp = fingerprint(world);
    this.lastTurn = world.turn;
    // The snapshot is whole and read back: its journal, empty, takes the place of the last one (which then is of an older generation, and ignored).
    this.writeJournal(copy);
    this.lastBytes = text.length;
    this.lastWriteMs = typeof performance !== 'undefined' ? performance.now() - started : 0;
    return true;
  }

  private write(target: string, text: string): boolean {
    if (!putWithRoom(this.s, target, text)) return false;
    return read(this.s, target) === text;
  }

  /** The world took an action: it goes to the journal (a few hundred bytes), or to a new snapshot when the journal is full. */
  note(action: Action, world: World, check: SavedCheck | null): boolean {
    if (!this.based || this.actions.length >= JOURNAL_MAX) return this.snapshot(world, check);
    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    this.actions.push(action);
    this.lastFp = fingerprint(world);
    this.lastTurn = world.turn;
    const ok = this.writeJournal(check);
    this.lastWriteMs = typeof performance !== 'undefined' ? performance.now() - started : 0;
    // A journal that cannot be written is made up for by a snapshot, which may fit where a few more bytes did not.
    if (ok) return true;
    if (this.stuck > 0) {
      this.stuck--;
      return false;
    }
    return this.snapshot(world, check);
  }

  /** The server took moves (or the standing changed without the world): the journal says how far. */
  ack(world: World, check: SavedCheck | null): boolean {
    if (!this.based) return this.snapshot(world, check);
    return this.writeJournal(check) || (this.stuck > 0 ? false : this.snapshot(world, check));
  }

  private writeJournal(check: SavedCheck | null): boolean {
    const journal: Journal = {
      g: this.gen, r: RULES_VERSION, a: this.actions, t: this.lastTurn, f: this.lastFp,
      ...(check ? { s: check.meta.seq, i: check.meta.id } : {}),
      w: this.journals,
    };
    const text = encodeJournal(journal);
    this.lastBytes = text.length;
    // Alternately in the two keys, each a whole journal: a write that is cut short leaves the one before it.
    return putWithRoom(this.s, this.journals++ % 2 === 0 ? journalKey(this.key) : journalKey2(this.key), text);
  }

  /** The run is over (or thrown away): nothing of it stays. */
  drop(): void {
    forgetSlot(this.s, this.key);
    this.actions = [];
    this.based = false;
  }
}

/** Removes a slot's saves (not its lease). */
export function forgetSlot(s: StorageLike, key: string): void {
  for (const k of runKeys(key)) {
    try {
      s.removeItem(k);
    } catch {
      // Storage is unavailable; nothing was saved either.
    }
  }
}

export { GORE_PREFIX };
