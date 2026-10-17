/*
 * What the hero does while the player waits and searches: all of it only to look at (the rules, the core and the turns are as they were).
 *
 *  - A wait (the clock button, Space): the turn's hourglass flips once over the head, a quiet tick-tock, a glance to one side and back and
 *    a puff of breath; about 400 ms, and the next key is taken at once.
 *  - A rest (the held wait): the hero settles lower and breathes slowly, a «z» drifts up from the head every 1.2 s, a little warm sparkle
 *    shows when health comes back, ripples run in water instead of the sitting. Anything that breaks it (a monster in sight, a blow) makes
 *    the hero start, a «!» pops over the head and they stand up.
 *  - A search (the magnifier, F): a ring of lantern light sweeps out over the eight cells round the hero in about 350 ms, lighting each
 *    in turn, a short crouch and a look about, dust off the walls that are tapped; if something is found its cell flashes and the
 *    sparkle of the discovery rises (view.ts), and the chime is the found one; if not, a faint fizzle.
 *
 * Pooled: the little pictures over the head (`marks`) and the things that happen a moment later (`tasks`) are fixed arrays; a frame only
 * walks them. With reduced motion there is no shake, no glance and no crouch and the pictures are shorter.
 */
import { WIDTH } from '@pd/core';
import { audio } from './audio';
import { fx } from './fx';
import { quality } from './quality';
import type { Puppet, View } from './view';

const TILE = 16;

/** The little pictures drawn over a head (render.ts): the hourglass, a drifting «z», the start's «!». */
export const MARK_HOURGLASS = 0;
export const MARK_Z = 1;
export const MARK_START = 2;

export interface Mark {
  used: boolean;
  id: string;
  kind: number;
  start: number;
  ms: number;
  /** Where it drifts to (art pixels sideways), for a «z». */
  drift: number;
}

enum Do { Flip, Squash, Fizzle }

interface Task {
  used: boolean;
  at: number;
  what: Do;
  id: string;
  a: number;
}

const MARKS = 14;
const TASKS = 24;
const WAIT_MS = 400;
const SEARCH_MS = 350;
const Z_EVERY_MS = 1200;
const SETTLE = 0.9;
/** The eight cells round a hero, clockwise from the north, as (dx, dy). */
const AROUND: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
const DUST = ['#b8ad8f', '#8f866c', '#d6ccae'];

export class IdleFx {
  readonly marks: Mark[] = Array.from({ length: MARKS }, () => ({ used: false, id: '', kind: 0, start: 0, ms: 0, drift: 0 }));
  private readonly tasks: Task[] = Array.from({ length: TASKS }, () => ({ used: false, at: 0, what: Do.Flip, id: '', a: 0 }));
  private resting = false;
  private restSince = 0;
  private nextZ = 0;
  private nextRipple = 0;
  private lastHp = -1;
  private lastBreath = 0;
  /** When the last search began, and whether it found anything since (view.ts tells us). */
  private searchedAt = -1e9;
  private foundAt = -1e9;
  /** A figure's own facing before a glance, to put back. */
  private facing = false;
  /** A wall stood among the cells of the last search (so a search that found nothing is answered by a solid knock). */
  private wallNear = false;

  // ---- what the game tells us ---------------------------------------------------------------------------------------------------

  /** A search found something (a secret, a trap): it was not a fizzle. */
  noteFound(now: number): void {
    this.foundAt = now;
  }

  /** Whether the hero's search a moment ago was mine and found something (the chime to play). */
  foundByHere(now: number): boolean {
    return now - this.searchedAt < 1500;
  }

  /** One turn of waiting. */
  wait(now: number, view: View, myId: string): void {
    const p = view.puppets.get(myId);
    if (!p?.alive) return;
    const calm = quality.reducedMotion;
    audio.play('watch', 1, 0.7);
    this.mark(myId, MARK_HOURGLASS, now, calm ? 260 : WAIT_MS, 0);
    if (!calm) {
      // A glance to one side and back.
      this.facing = p.flip;
      this.task(now + 110, Do.Flip, myId, this.facing ? 0 : 1);
      this.task(now + 290, Do.Flip, myId, this.facing ? 1 : 0);
    }
    // A puff of breath, drifting off in the way the hero faces.
    const { x, y } = view.position(p, now);
    const dir = p.flip ? -1 : 1;
    fx.burst(x + TILE / 2 + dir * 4, y + 5, now + 60, {
      count: quality.light ? 2 : 4, colors: ['#e8f0f4', '#cfdbe0'], speed: [4, 9], life: [350, 520], angle: dir > 0 ? -0.5 : Math.PI + 0.5, cone: 0.5, rise: 6, drag: 0.5, size: [1, 2], spread: 1,
    });
  }

  /** A search: the ring of lantern light, the cells lit in turn, the crouch and the look about, dust off the walls. */
  search(now: number, view: View, myId: string, map: ArrayLike<number> | null, solid: (cell: number) => boolean): void {
    const p = view.puppets.get(myId);
    if (!p?.alive) return;
    this.searchedAt = now;
    const calm = quality.reducedMotion;
    const ms = calm ? 200 : SEARCH_MS;
    audio.play('swish', 1, 0.8);
    const { x, y } = view.position(p, now);
    const cx = x + TILE / 2;
    const cy = y + TILE - 4;
    const cell = Math.round(x / TILE) + Math.round(y / TILE) * WIDTH;
    this.wallNear = false;
    // The ring: out over the cells round, a soft lantern's sweep, lighting each in its turn as it passes.
    fx.wave(cx, cy, now, { colors: ['#ffe9a0'], rings: 1, tiles: 1.9, duration: ms, width: 1.5 });
    fx.pulse(cx, cy - 2, now, '255, 220, 140', 3, ms + 40);
    for (let i = 0; i < AROUND.length; i++) {
      const [dx, dy] = AROUND[i]!;
      const at = cell + dx + dy * WIDTH;
      if (at < 0 || at >= (map?.length ?? 0)) continue;
      const delay = (i / AROUND.length) * ms * 0.8;
      if (solid(at)) {
        this.wallNear = true;
        // A wall that is tapped: dust rises off it.
        const wx = (at % WIDTH) * TILE + TILE / 2;
        const wy = Math.trunc(at / WIDTH) * TILE + TILE / 2;
        fx.burst(wx, wy, now + delay, { count: quality.light ? 1 : 3, colors: DUST, speed: [3, 10], life: [450, 800], rise: 10, drag: 0.5, size: [1, 1], spread: 5 });
      } else {
        view.flashes.push({ cell: at, start: now + delay, color: '255, 232, 160', duration: 380 });
      }
    }
    if (!calm) {
      // A short crouch and a look about.
      this.task(now, Do.Squash, myId, 0.88);
      this.task(now + 200, Do.Squash, myId, 1);
      this.facing = p.flip;
      this.task(now + 90, Do.Flip, myId, this.facing ? 0 : 1);
      this.task(now + 230, Do.Flip, myId, this.facing ? 1 : 0);
    }
    // Nothing found by the time the ring is out: a faint fizzle.
    this.task(now + ms + 60, Do.Fizzle, myId, now);
  }

  // ---- every frame --------------------------------------------------------------------------------------------------------------

  /**
   * Called every game frame: the little things that happen a moment after, the rest (`resting` is the walk's flag, `threatened` a monster
   * in sight or a blow taken), and the hero's health for the sparkle of healing. `inWater` is whether the hero stands in water.
   */
  frame(now: number, view: View, myId: string, resting: boolean, threatened: boolean, hp: number, inWater: boolean): void {
    const p = view.puppets.get(myId);
    for (const t of this.tasks) {
      if (!t.used || t.at > now) continue;
      t.used = false;
      this.run(t, now, view);
    }
    if (!p?.alive) {
      this.resting = false;
      this.lastHp = hp;
      return;
    }
    const calm = quality.reducedMotion;
    if (resting && !this.resting) {
      this.resting = true;
      this.restSince = now;
      this.nextZ = now + 500;
      this.nextRipple = now + 300;
      this.lastBreath = now;
    } else if (!resting && this.resting) {
      this.resting = false;
      // Disturbed: a start, a «!» over the head, and up (a hop as it stands).
      if (threatened || hp < this.lastHp) {
        this.mark(myId, MARK_START, now, calm ? 450 : 750, 0);
        if (!calm) {
          this.task(now, Do.Squash, myId, 1.07);
          this.task(now + 130, Do.Squash, myId, 1);
        } else p.squash = 1;
        audio.play('tick', 1.3, 0.6);
      } else p.squash = 1;
    }
    if (this.resting) {
      const t = now - this.restSince;
      // Settling lower over a fifth of a second, and breathing slowly (nothing of it with reduced motion).
      const settle = inWater ? 1 : 1 - (1 - SETTLE) * Math.min(1, t / 200);
      p.squash = settle + (calm || inWater ? 0 : 0.012 * Math.sin(t / 650));
      if (now >= this.nextZ) {
        this.nextZ = now + Z_EVERY_MS;
        this.mark(myId, MARK_Z, now, calm ? 700 : 1500, (this.marksMade++ % 2 === 0 ? 1 : -1) * 3);
        if (now - this.lastBreath > 3600) {
          this.lastBreath = now;
          audio.play('breath', 1, 0.45);
        }
      }
      if (inWater && now >= this.nextRipple) {
        // In water: ripples running out from the feet in place of the sitting.
        this.nextRipple = now + 1400;
        const { x, y } = view.position(p, now);
        fx.wave(x + TILE / 2, y + TILE - 3, now, { colors: ['#bfe0ff'], rings: 1, tiles: 1.2, duration: 1000, width: 1 });
      }
      // Health coming back: a faint warm sparkle.
      if (hp > this.lastHp && this.lastHp >= 0) {
        const { x, y } = view.position(p, now);
        fx.burst(x + TILE / 2, y + 8, now, { count: quality.light ? 2 : 5, colors: ['#ffe9a0', '#ffcc66', '#fff6c8'], glow: true, speed: [3, 10], life: [600, 1000], rise: 16, drag: 0.4, size: [1, 1], spread: 5 });
      }
    }
    this.lastHp = hp;
  }

  private marksMade = 0;

  private run(t: Task, now: number, view: View): void {
    const p = view.puppets.get(t.id);
    if (!p) return;
    switch (t.what) {
      case Do.Flip: p.flip = t.a === 1; break;
      case Do.Squash: p.squash = t.a === 1 ? undefined : t.a; break;
      case Do.Fizzle:
        // The search found nothing (view.ts would have told us by now): a faint grey wisp over the hero.
        if (this.foundAt < t.a) {
          // Only now, with the result in: a wall that was tapped and gave nothing up sounds solid (a find has already knocked hollow, view.ts).
          if (this.wallNear) audio.play('knockSolid', 1, 0.8);
          const { x, y } = view.position(p, now);
          fx.burst(x + TILE / 2, y + 6, now, { count: quality.light ? 2 : 4, colors: ['#9a9a9a', '#b8b8b8'], speed: [3, 9], life: [350, 600], rise: 12, drag: 0.5, size: [1, 1], spread: 5 });
        }
        break;
      default: break;
    }
  }

  private mark(id: string, kind: number, start: number, ms: number, drift: number): void {
    const m = this.marks.find((x) => !x.used) ?? this.marks[0]!;
    m.used = true;
    m.id = id;
    m.kind = kind;
    m.start = start;
    m.ms = ms;
    m.drift = drift;
  }

  private task(at: number, what: Do, id: string, a: number): void {
    const t = this.tasks.find((x) => !x.used);
    if (!t) return;
    t.used = true;
    t.at = at;
    t.what = what;
    t.id = id;
    t.a = a;
  }

  /** Whether the hero is resting now (for the picture of the settled pose). */
  get settled(): boolean {
    return this.resting;
  }

  /** Whether anything is under way (the picture must be drawn at full pace). */
  busy(now: number): boolean {
    for (const m of this.marks) if (m.used && now < m.start + m.ms) return true;
    for (const t of this.tasks) if (t.used) return true;
    return this.resting;
  }

  /** Lets the dead marks go, and the puppets' poses (a new floor). */
  clear(): void {
    for (const m of this.marks) m.used = false;
    for (const t of this.tasks) t.used = false;
    this.resting = false;
    this.lastHp = -1;
  }

  /**
   * The marks over one puppet now, as (kind, rise in art pixels, sideways, alpha, scale across, scale up) to `draw`; a finished mark is let go.
   * The hourglass flips once (it narrows to nothing and opens the other way up), a «z» drifts up and thins, the «!» pops big and settles.
   */
  marksOf(id: string, now: number, draw: (kind: number, rise: number, side: number, alpha: number, sx: number, sy: number) => void): void {
    for (const m of this.marks) {
      if (!m.used || m.id !== id) continue;
      const k = (now - m.start) / m.ms;
      if (k >= 1) {
        m.used = false;
        continue;
      }
      if (k < 0) continue;
      if (m.kind === MARK_HOURGLASS) {
        const flip = k < 0.15 ? 1 : Math.cos(Math.min(1, (k - 0.15) / 0.55) * Math.PI);
        draw(m.kind, 2 + k * 3, 0, Math.min(1, k * 8, (1 - k) * 4), flip, 1);
      } else if (m.kind === MARK_Z) {
        draw(m.kind, k * 11, m.drift * k * 2, Math.min(1, k * 6, (1 - k) * 2) * 0.9, 1, 1);
      } else {
        const pop = k < 0.2 ? 1 + 0.6 * (1 - k / 0.2) : 1;
        draw(m.kind, 1, 0, Math.min(1, (1 - k) * 3), pop, pop);
      }
    }
  }
}

export const idleFx = new IdleFx();

/** The puppet's squash, for the renderers: 1 when whole. */
export const squashOf = (p: Pick<Puppet, 'squash'>): number => p.squash ?? 1;
