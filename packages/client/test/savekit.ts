import { act, type Action, addHero, createWorld, fingerprint, type HeroClass, type World } from '@pd/core';
import { step } from '../../core/test/runner';
import type { StorageLike } from '../src/savestore';

/*
 * What the save tests share: a storage in memory that can be made to run out of room, to fail on a given write, or to be
 * "killed" in the middle of one; and a bot that plays a sturdy hero down the dungeon, one action at a time.
 */

/** Thrown out of a write to stand for the page being killed there. */
export class Killed extends Error {}

export class MemStorage implements StorageLike {
  readonly data = new Map<string, string>();
  /** Characters the keys and values may take together; a write that would pass it throws QuotaExceededError. */
  capacity: number;
  /** Counts every setItem call (failed ones too). */
  writes = 0;
  /** Called before each write; may throw (Killed) or return 'torn' (the text is cut short and stored, then the page dies) or 'drop' (the page dies before the write). */
  fault: ((key: string, value: string, nth: number) => void | 'torn' | 'drop' | 'after' | 'quota') | null = null;
  /** The page that wrote here was killed: it reads nothing, writes nothing, and removes nothing from now on. */
  dead = false;
  /** A fault that kills ('drop', 'torn', 'after') kills the page quietly (dead) instead of throwing Killed out of the write. */
  quiet = false;

  constructor(capacity = Infinity) {
    this.capacity = capacity;
  }

  get length(): number {
    return this.data.size;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.dead ? null : (this.data.get(key) ?? null);
  }

  total(): number {
    let n = 0;
    for (const [k, v] of this.data) n += k.length + v.length;
    return n;
  }

  setItem(key: string, value: string): void {
    if (this.dead) return;
    const nth = this.writes++;
    const verdict = this.fault?.(key, value, nth);
    if (verdict === 'drop' || verdict === 'torn' || verdict === 'after') {
      if (verdict === 'torn') this.data.set(key, value.slice(0, Math.floor(value.length / 2)));
      if (verdict === 'after') this.data.set(key, value);
      if (this.quiet) {
        this.dead = true;
        return;
      }
      throw new Killed(`killed ${verdict} ${key}`);
    }
    const old = this.data.get(key);
    const after = this.total() - (old === undefined ? 0 : key.length + old.length) + key.length + value.length;
    if (verdict === 'quota' || after > this.capacity) {
      const error = new Error('The quota has been exceeded.');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    if (!this.dead) this.data.delete(key);
  }

  /** A copy of what is stored now: what a reloaded page finds. */
  clone(): MemStorage {
    const copy = new MemStorage(this.capacity);
    for (const [k, v] of this.data) copy.data.set(k, v);
    return copy;
  }
}

/** A world with one sturdy hero ('me'), as a solo session makes it. */
export function newWorld(seed: number, heroClass: HeroClass = 'warrior', sturdy = true): World {
  const world = createWorld(seed);
  const hero = addHero(world, { id: 'me', name: 'H', heroClass });
  if (sturdy) Object.assign(hero, { attackSkill: 600, defenseSkill: 80, ht: 5000, hp: 5000, str: 22 });
  return world;
}

/** The next action the bot takes, and the world's fingerprint stays the world's own business. */
export const botStep = (world: World): Action => step(world, 'me');

/** Plays one action of the bot on a world as a session does (a refused one is no action). Returns the action taken, or null. */
export function play(world: World): Action | null {
  const action = botStep(world);
  if (act(world, 'me', action).ok) return action;
  // (Refused: the bot waits a turn, as the marathon does.)
  const wait: Action = { type: 'wait' };
  return act(world, 'me', wait).ok ? wait : null;
}

/** The world as a save keeps it: through JSON. */
export const viaJson = (world: World): World => JSON.parse(JSON.stringify(world)) as World;

/** Two worlds are the same run to the last cell: the fingerprint, and the whole of it through JSON. */
export function sameWorld(a: World, b: World): boolean {
  return fingerprint(a) === fingerprint(b) && JSON.stringify(a) === JSON.stringify(b);
}
