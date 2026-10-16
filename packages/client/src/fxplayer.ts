/*
 * The player of the designer's effects (fxsheet.ts has the data). It keeps a fixed pool of running effects and, each frame, turns
 * them into a list of frames to draw: where, which cell of which sheet, how bright. The two renderers only draw that list (the canvas
 * in fxdraw2d.ts, the instanced quads in r3d/fx3d.ts), so both modes show the same thing at the same time.
 *
 * Nothing is made while a frame is drawn: the instances and the draw items are objects made once, and the clouds of gas are walked
 * in place. An effect's light is described here too (its colour, how bright it is now, where), and the scene's one moving light, or the
 * 2D canvas' soft discs, are taken from the brightest of them.
 *
 * Positions are in cells, as floats: (col + 0.5, row + 0.5) is the middle of a cell. Time is the visual clock (fx.time), in ms.
 */

import { HEIGHT, type Effect, type ItemKind, POTION_COLORS, WIDTH } from '@pd/core';
import {
  type FxDef, type FxLib, type FxLight, SHURIKEN_SPRITE, eventKey, frameAt, gasRow, headingFrame, lightLevel, playMs, waveScale,
} from './fxsheet';

export const MODE_STAND = 0;
export const MODE_HEAD = 1;
export const MODE_FEET = 2;
export const MODE_FLOOR = 3;

/** One frame to draw this frame. */
export class DrawItem {
  def!: FxDef;
  /** The cell of the sheet: column, and row (in frames of the def's height). */
  col = 0;
  row = 0;
  /** Where, in cells (the middle of a cell is .5). */
  x = 0;
  z = 0;
  /** Height over the floor, cells: the middle of a standing frame, the foot of one that stands at the feet, the plane of one that lies. */
  lift = 0;
  /** The way it travels (cells), when it is turned along its path. */
  dx = 0;
  dz = 0;
  turn = false;
  /** Whole-number scale of the art. */
  scale = 1;
  alpha = 1;
  mode = MODE_STAND;
  /** At a figure's feet rather than the middle of its cell. */
  feet = false;
}

const KIND = { fly: 0, flash: 1, splat: 2, beam: 3, arc: 4, drop: 5, wave: 6, hang: 7, cloud: 8, glow: 9 } as const;

class Inst {
  alive = false;
  kind: number = KIND.flash;
  def!: FxDef;
  /** From, to (cells); the middle of the effect when it stays. */
  x0 = 0;
  z0 = 0;
  x1 = 0;
  z1 = 0;
  /** Starts at (ms, may be ahead of now: a hit that waits for its bolt) and lasts dur ms. */
  start = 0;
  dur = 0;
  row = 0;
  scale = 1;
  /** A thrown thing's arc, cells. */
  arc = 0;
  /** The half-width of a cloud, cells; the gas it holds. */
  radius = 0;
  volume = 0;
  seed = 0;
  follow: string | null = null;
  returns = false;
  rings = 1;
  specks = 0;
  /** A wave's ring scale. */
  ring = 1;
  /** The light: what it is and how long it burns (ms). */
  light: FxLight | null = null;
  lightMs = 0;
  sub0: FxDef | null = null;
  sub1: FxDef | null = null;
}

/** What the player asks of the screen. */
export interface Sink {
  shake(px: number, ms: number, now: number): void;
  /** A flash of the whole screen: colour as 'r, g, b'. */
  flash(rgb: string, alpha: number, ms: number, now: number): void;
  /** A stain left on the floor where it fell (world pixels). */
  stain(x: number, y: number, now: number, color: string): void;
  reducedMotion(): boolean;
  light(): boolean;
}

const quiet: Sink = { shake: () => undefined, flash: () => undefined, stain: () => undefined, reducedMotion: () => false, light: () => false };

export interface PlayOpts {
  /** ms from now. */
  delay?: number;
  /** Follows this character (cell floats from `locate`). */
  follow?: string;
  /** Added to the def's row (a cloud's thickness, a sheet shared by effects). */
  rowAdd?: number;
  /** Whole-number scale. */
  scale?: number;
  /** How long it lasts when it has no length of its own (a cloud), ms. */
  ms?: number;
  /** The width of the square a cloud fills, as the half-side in cells. */
  radius?: number;
  /** The gas a cloud holds (picks its row). */
  volume?: number;
  /** Shake and flash the screen (the def's own), or not. */
  shake?: boolean;
  tint?: boolean;
}

/** What the player needs to know of the game while it takes an effect in. */
export interface Env {
  depth: number;
  myId: string;
  labels: Readonly<Partial<Record<ItemKind, number>>>;
  /** The middle of a character's cell, cells; false if it is not on the map. */
  where(id: string, out: { x: number; z: number }): boolean;
  /** The greatest health of a character, or 0. */
  htOf(id: string): number;
  /** Whether the party sees a cell. */
  sees(cell: number): boolean;
}

const CAP_INST = 160;
const CAP_ITEMS = 520;
/** The most gas tiles drawn: more would only be fill. */
const GAS_TILES = 240;
const CAP_KICKS = 24;

const cellX = (cell: number): number => cell % WIDTH;
const cellZ = (cell: number): number => Math.trunc(cell / WIDTH);

function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (k: number): number => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

export class FxPlayer {
  lib: FxLib | null = null;
  sink: Sink = quiet;
  /** Where a character is now (cells): set by the game, for effects that follow someone. */
  locate: ((id: string, now: number, out: { x: number; z: number }) => boolean) | null = null;
  /** Clouds on the floor (the floor's own gas record), drawn as tiles. */
  gas: Partial<Record<string, ReadonlyArray<readonly [number, number]>>> | undefined;
  readonly items: DrawItem[] = [];
  count = 0;

  private readonly pool: Inst[] = [];
  private readonly spot = { x: 0, z: 0 };
  private cursor = 0;
  private readonly kicks: Array<{ at: number; px: number; ms: number; rgb: string; alpha: number }> = [];
  private lastNow = 0;

  constructor() {
    for (let i = 0; i < CAP_INST; i++) this.pool.push(new Inst());
    for (let i = 0; i < CAP_ITEMS; i++) this.items.push(new DrawItem());
  }

  /** Data in hand: from now the effects it names are played. */
  use(lib: FxLib | null): void {
    this.lib = lib;
    this.clear();
  }

  clear(): void {
    for (const i of this.pool) i.alive = false;
    this.kicks.length = 0;
    this.count = 0;
  }

  get ready(): boolean {
    return this.lib !== null;
  }

  /** Whether anything is playing (the picture must be drawn at full pace), or gas lies on the floor. */
  moving(now: number): boolean {
    for (const i of this.pool) if (i.alive && now < i.start + i.dur) return true;
    return this.kicks.length > 0;
  }

  /** Whether an effect has an id in the data. */
  has(id: string): boolean {
    return this.lib !== null && this.lib.fx[id] !== undefined;
  }

  /** The effect an event key names, or null. */
  idOf(key: string | null): string | null {
    if (!key || !this.lib) return null;
    const id = this.lib.events[key];
    return id !== undefined && this.lib.fx[id] ? id : null;
  }

  private take(): Inst | null {
    for (let n = 0; n < CAP_INST; n++) {
      const i = this.pool[(this.cursor + n) % CAP_INST]!;
      if (!i.alive) {
        this.cursor = (this.cursor + n + 1) % CAP_INST;
        return i;
      }
    }
    return null;
  }

  private begin(kind: number, d: FxDef, x: number, z: number, now: number, o: PlayOpts, dur: number): Inst | null {
    const i = this.take();
    if (!i) return null;
    i.alive = true;
    i.kind = kind;
    i.def = d;
    i.x0 = i.x1 = x;
    i.z0 = i.z1 = z;
    i.start = now + (o.delay ?? 0);
    i.dur = dur;
    i.row = d.row + (o.rowAdd ?? 0);
    i.scale = o.scale ?? 1;
    i.arc = 0;
    i.radius = o.radius ?? 0;
    i.volume = o.volume ?? 0;
    i.seed = Math.floor(Math.random() * 1e6);
    i.follow = o.follow ?? null;
    i.returns = false;
    i.rings = 1;
    i.specks = 0;
    i.ring = 1;
    i.sub0 = i.sub1 = null;
    // The light burns as long as it says, or as long as the effect lasts.
    i.light = d.light ?? null;
    i.lightMs = d.light ? (d.light.ms > 0 ? d.light.ms : dur) : 0;
    if (i.lightMs > dur && kind !== KIND.fly) i.dur = dur = i.lightMs;
    this.kick(d, now + (o.delay ?? 0), o);
    return i;
  }

  /** The screen shake and flash an effect brings with it, at the moment it begins. */
  private kick(d: FxDef, at: number, o: PlayOpts): void {
    const calm = this.sink.reducedMotion();
    if (d.shake && o.shake !== false && !calm) this.kicks.push({ at, px: d.shake.px, ms: d.shake.ms, rgb: '', alpha: 0 });
    if (d.tint && o.tint !== false) this.kicks.push({ at, px: 0, ms: d.tint.ms, rgb: d.tint.rgb, alpha: d.tint.alpha * (calm ? 0.5 : 1) });
    if (this.kicks.length > CAP_KICKS) this.kicks.splice(0, this.kicks.length - CAP_KICKS);
  }

  /** Every game frame: the screen shake and flash whose time has come. */
  update(now: number): void {
    this.pump(now);
  }

  /** Gives the kicks whose time has come to the screen. */
  private pump(now: number): void {
    if (this.kicks.length === 0) return;
    let n = 0;
    for (const k of this.kicks) {
      if (k.at > now) this.kicks[n++] = k;
      else if (k.rgb === '') this.sink.shake(k.px, k.ms, now);
      else this.sink.flash(k.rgb, k.alpha, k.ms, now);
    }
    this.kicks.length = n;
  }

  // ---- starting effects ----------------------------------------------------------------------------------------------------------

  /** A one-off at a place (cells): a hit, a splash, a trap's flash, a hero's moment, a cloud. Returns false if there is no such effect. */
  playAt(id: string, x: number, z: number, now: number, o: PlayOpts = {}): boolean {
    const d = this.lib?.fx[id];
    if (!d) return false;
    switch (d.behaviour) {
      case 'hang': {
        const inst = this.begin(KIND.hang, d, x, z, now, o, o.ms ?? d.hold ?? 2400);
        return inst !== null;
      }
      case 'splat': {
        const inst = this.begin(KIND.splat, d, x, z, now, o, playMs(d) + (d.stay?.ms ?? 0));
        return inst !== null;
      }
      case 'tile': {
        const inst = this.begin(KIND.cloud, d, x, z, now, o, o.ms ?? 2000);
        return inst !== null;
      }
      case 'wave': return this.wave(d, x, z, now, o);
      default: {
        const dur = d.loop ? (o.ms ?? d.hold ?? playMs(d)) : playMs(d);
        const inst = this.begin(KIND.flash, d, x, z, now, o, dur);
        return inst !== null;
      }
    }
  }

  /** A ring and its specks on the floor around someone. */
  private wave(d: FxDef, x: number, z: number, now: number, o: PlayOpts): boolean {
    const light = this.sink.light();
    const calm = this.sink.reducedMotion();
    const rings = calm ? 1 : light ? Math.max(1, Math.ceil((d.rings ?? 1) / 2)) : (d.rings ?? 1);
    const stagger = d.stagger ?? 0;
    const dur = playMs(d) + (rings - 1) * stagger;
    const inst = this.begin(KIND.wave, d, x, z, now, o, dur);
    if (!inst) return false;
    inst.rings = rings;
    inst.ring = waveScale(d);
    const specks = d.specks && this.lib?.fx[d.specks.id];
    if (specks) {
      inst.sub0 = specks;
      inst.specks = calm ? 0 : light ? Math.ceil(d.specks!.count / 2) : d.specks!.count;
      const life = specks.life?.[1] ?? 800;
      if (dur < life + 300) inst.dur = life + 300;
    }
    return true;
  }

  /** A projectile or a ray from a cell to a cell. `id` is the flight's effect; its hit is played on arrival. Returns the flight's length in ms, or -1. */
  fly(id: string, from: number, to: number, now: number, o: PlayOpts = {}): number {
    const d = this.lib?.fx[id];
    if (!d) return -1;
    const fx0 = cellX(from) + 0.5;
    const fz0 = cellZ(from) + 0.5;
    const fx1 = cellX(to) + 0.5;
    const fz1 = cellZ(to) + 0.5;
    const length = Math.hypot(fx1 - fx0, fz1 - fz0);
    const hit = d.hit ? this.lib!.fx[d.hit] : undefined;
    const delay = o.delay ?? 0;
    let ms = 0;
    switch (d.behaviour) {
      case 'beam': case 'arc': {
        ms = d.ms ?? 300;
        const inst = this.begin(d.behaviour === 'beam' ? KIND.beam : KIND.arc, d, fx0, fz0, now, o, ms);
        if (!inst) return -1;
        inst.x1 = fx1;
        inst.z1 = fz1;
        inst.sub0 = (d.start && this.lib!.fx[d.start]) || null;
        inst.sub1 = (d.end && this.lib!.fx[d.end]) || null;
        // The strike of a bolt of lightning, the end of a beam: where it lands, when it has crossed.
        if (hit) this.playAt(hit.id, fx1, fz1, now, { delay: delay + ms, shake: o.shake, tint: o.tint });
        break;
      }
      case 'fly': {
        const speed = typeof d.speed === 'number' && d.speed > 0 ? d.speed : 12;
        ms = Math.max(110, (length / speed) * 1000);
        if (d.returns) ms *= 2;
        const inst = this.begin(KIND.fly, d, fx0, fz0, now, o, ms);
        if (!inst) return -1;
        inst.x1 = fx1;
        inst.z1 = fz1;
        inst.returns = d.returns === true;
        // A thing thrown flies in an arc, higher the farther it goes; a bolt flies level.
        inst.arc = d.anchor === 'head' || d.light ? 0 : Math.min(0.9, 0.15 + length * 0.15);
        if (hit && !d.returns) this.playAt(hit.id, fx1, fz1, now, { delay: delay + ms, shake: o.shake, tint: o.tint });
        break;
      }
      default:
        return -1;
    }
    return ms;
  }

  /** Rocks falling onto each of these cells. */
  rocks(cells: readonly number[], now: number): boolean {
    const d = this.lib?.fx['bolt.rocks'];
    if (!d) return false;
    const hit = d.hit ? this.lib!.fx[d.hit] : undefined;
    const fall = d.fall ?? 3;
    const ms = 380;
    for (let n = 0; n < cells.length && n < 40; n++) {
      const cell = cells[n]!;
      const delay = hash(cell, n) * 220;
      const inst = this.begin(KIND.drop, d, cellX(cell) + 0.5, cellZ(cell) + 0.5, now, { delay }, ms);
      if (!inst) break;
      inst.arc = fall;
      if (hit) this.playAt(hit.id, cellX(cell) + 0.5, cellZ(cell) + 0.5, now, { delay: delay + ms, shake: false });
    }
    return true;
  }

  /** A light with no frames: the red glow of a boss that has noticed the party. */
  glow(light: FxLight, x: number, z: number, now: number): void {
    const i = this.take();
    if (!i) return;
    i.alive = true;
    i.kind = KIND.glow;
    i.def = glowDef;
    i.x0 = i.x1 = x;
    i.z0 = i.z1 = z;
    i.start = now;
    i.dur = i.lightMs = light.ms > 0 ? light.ms : 1000;
    i.light = light;
    i.follow = null;
  }

  // ---- events ---------------------------------------------------------------------------------------------------------------------

  /** Whether the data has a look for this event (so the older one is not drawn as well). */
  owns(e: Effect, labels?: Env['labels']): boolean {
    return this.idOf(eventKey(e, e.type === 'shattered' ? colourOf(e.kind, labels) : undefined, 1)) !== null;
  }

  /**
   * A projectile event (a bolt, something thrown, a monster's missile): starts its flight and returns true if the data has one, so the
   * older drawn-dot or item-in-an-arc is not made. The hit comes with it, when the flight ends.
   */
  launch(e: Effect, depth: number, now: number, sees?: (cell: number) => boolean): boolean {
    if (!this.lib) return false;
    if (e.type === 'zapped') {
      if (e.depth !== depth) return this.idOf(eventKey(e)) !== null;
      const id = this.idOf(eventKey(e));
      if (!id) return false;
      const d = this.lib.fx[id]!;
      if (d.behaviour === 'drop') return true;
      const visible = !sees || sees(e.to) || sees(e.from);
      // A flying bolt carries no screen kick until it lands: the hit has it.
      const ms = this.fly(id, e.from, e.to, now, { shake: visible, tint: visible });
      return ms >= 0;
    }
    if (e.type === 'thrown') {
      if (e.depth !== depth) return this.idOf(eventKey(e)) !== null;
      const id = this.idOf(eventKey(e));
      return id !== null && this.fly(id, e.from, e.to, now) >= 0;
    }
    if (e.type === 'missile') {
      if (e.depth !== depth) return true;
      // A monster's missile is an arrow, unless it is a shuriken.
      const id = e.sprite === SHURIKEN_SPRITE ? 'thrown.shuriken' : this.idOf('missile');
      return id !== null && this.has(id) && this.fly(id, e.from, e.to, now) >= 0;
    }
    return false;
  }

  /**
   * The look of an event, in the data's terms. Returns true when it takes the place of the older effects of that event (the caller then
   * leaves them out); false when there is nothing for it, or the designer's look only goes on top of them (a hit, a level gained).
   */
  onEffect(e: Effect, env: Env, now: number): boolean {
    const lib = this.lib;
    if (!lib) return false;
    const where = this.spot;
    switch (e.type) {
      case 'attack': {
        if (e.depth !== env.depth || !env.where(e.target, where)) return false;
        const id = this.idOf(eventKey(e, undefined, env.htOf(e.target)));
        if (!id) return false;
        const mine = e.attacker === env.myId || e.target === env.myId;
        this.playAt(id, where.x, where.z, now, { shake: mine, tint: mine });
        // The older white puff of a miss is what this replaces; a blow's blood stays under its sparks.
        return !e.hit;
      }
      case 'scroll': {
        const id = this.idOf(eventKey(e));
        if (!id || !env.where(e.hero, where)) return false;
        const d = lib.fx[id]!;
        const mine = e.hero === env.myId;
        this.playAt(id, where.x, where.z, now, { shake: mine, tint: mine || d.tintOnlyForReader === false });
        return true;
      }
      case 'levelUp': case 'resurrected': case 'healed': {
        if (e.type === 'healed' && !(e.amount > 0)) return false;
        const id = this.idOf(eventKey(e));
        if (!id || !env.where(e.hero, where)) return false;
        const mine = e.hero === env.myId;
        this.playAt(id, where.x, where.z, now, { follow: e.hero, shake: mine, tint: mine });
        return true;
      }
      case 'amulet': {
        if (!e.first) return false;
        const id = this.idOf(eventKey(e));
        if (!id || !env.where(e.hero, where)) return false;
        const mine = e.hero === env.myId;
        this.playAt(id, where.x, where.z, now, { follow: e.hero, shake: mine, tint: mine });
        return true;
      }
      case 'trap': {
        if (e.depth !== env.depth) return false;
        const id = this.idOf(eventKey(e));
        if (!id) return false;
        // A trap a monster set off (or an item landing on one) flashes, but does not shake or flash the screen.
        const byHero = e.hero !== '' && !e.mob;
        if (!byHero && !env.sees(e.pos)) return true;
        this.playAt(id, cellX(e.pos) + 0.5, cellZ(e.pos) + 0.5, now, { shake: byHero, tint: byHero });
        return true;
      }
      case 'burst': {
        if (e.depth !== env.depth) return false;
        const id = this.idOf(eventKey(e));
        if (!id) return false;
        this.playAt(id, cellX(e.pos) + 0.5, cellZ(e.pos) + 0.5, now, { radius: e.radius, volume: 20, ms: 2000 });
        return true;
      }
      case 'special': {
        const id = this.idOf(eventKey(e));
        if (!id) return false;
        this.playAt(id, cellX(e.from) + 0.5, cellZ(e.from) + 0.5, now, { radius: 1, volume: 20, ms: 2000 });
        return true;
      }
      case 'shattered': {
        if (e.depth !== env.depth) return false;
        const colour = colourOf(e.kind, env.labels);
        const id = this.idOf(eventKey(e, colour));
        if (!id) return false;
        const x = cellX(e.pos) + 0.5;
        const z = cellZ(e.pos) + 0.5;
        this.playAt(id, x, z, now);
        // The puddle stays as a stain among the others.
        const d = lib.fx[id]!;
        if (d.light) this.sink.stain(x * 16, z * 16 + 2, now, d.light.color);
        return false;
      }
      case 'avalanche': {
        if (e.depth !== env.depth) return false;
        return this.rocks(e.cells, now);
      }
      default:
        return false;
    }
  }

  /** The boss card's light and shake: red light at the boss, the camera kicked. */
  bossArrives(x: number, z: number, now: number): void {
    const cards = this.lib?.bossCards;
    if (!cards) return;
    this.glow(cards.light, x, z, now);
    if (!this.sink.reducedMotion()) this.kicks.push({ at: now, px: cards.shake.px, ms: cards.shake.ms, rgb: '', alpha: 0 });
  }

  // ---- each frame -----------------------------------------------------------------------------------------------------------------

  private emit(d: FxDef, col: number, row: number, x: number, z: number, lift: number, mode: number): DrawItem | null {
    if (this.count >= CAP_ITEMS) return null;
    const it = this.items[this.count++]!;
    it.def = d;
    it.col = col;
    it.row = row;
    it.x = x;
    it.z = z;
    it.lift = lift;
    it.mode = mode;
    it.turn = false;
    it.dx = it.dz = 0;
    it.scale = 1;
    it.alpha = 1;
    it.feet = false;
    return it;
  }

  /** Where a running effect is now, for its light and its drawing; false while it waits or is over. */
  private placeInto(i: Inst, now: number, out: { x: number; z: number; k: number }): boolean {
    const t = now - i.start;
    if (t < 0 || t >= i.dur) return false;
    out.k = t / i.dur;
    if (i.kind === KIND.fly) {
      const k = i.returns ? 1 - Math.abs(2 * out.k - 1) : out.k;
      out.x = i.x0 + (i.x1 - i.x0) * k;
      out.z = i.z0 + (i.z1 - i.z0) * k;
    } else if (i.kind === KIND.beam || i.kind === KIND.arc) {
      out.x = (i.x0 + i.x1) / 2;
      out.z = (i.z0 + i.z1) / 2;
    } else {
      out.x = i.x0;
      out.z = i.z0;
    }
    return true;
  }

  private readonly at = { x: 0, z: 0, k: 0 };
  /** The lit cells of the frame being collected, and the test made once over them. */
  private vis: ArrayLike<boolean> | null = null;
  private readonly seeFn = (x: number, z: number): boolean => this.vis === null || this.vis[Math.floor(z) * WIDTH + Math.floor(x)] === true;

  /**
   * Moves the effects on to `now` and lists the frames to draw: `count` of them in `items`. `visible` is the map's lit cells (null: all);
   * the gas on the floor is added.
   */
  collect(now: number, visible: ArrayLike<boolean> | null): number {
    this.lastNow = now;
    this.count = 0;
    this.pump(now);
    const lib = this.lib;
    if (!lib) return 0;
    const calm = this.sink.reducedMotion();
    this.vis = visible;
    const see = this.seeFn;
    for (const i of this.pool) {
      if (!i.alive) continue;
      const t = now - i.start;
      if (t >= i.dur) {
        i.alive = false;
        continue;
      }
      if (t < 0) continue;
      if (i.follow !== null && this.locate?.(i.follow, now, this.spot)) {
        i.x0 = i.x1 = this.spot.x;
        i.z0 = i.z1 = this.spot.z;
      }
      switch (i.kind) {
        case KIND.fly: this.flight(i, t, see); break;
        case KIND.flash: case KIND.hang: this.stand(i, t, see); break;
        case KIND.splat: this.splat(i, t, see); break;
        case KIND.beam: case KIND.arc: this.ray(i, t, see); break;
        case KIND.drop: this.drop(i, t, see); break;
        case KIND.wave: this.rings(i, t, see); break;
        case KIND.cloud: this.cloud(i, t, visible); break;
        default: break;
      }
    }
    this.gasTiles(now, visible, calm);
    return this.count;
  }

  private flight(i: Inst, t: number, see: (x: number, z: number) => boolean): void {
    const d = i.def;
    const raw = t / i.dur;
    const k = i.returns ? 1 - Math.abs(2 * raw - 1) : raw;
    const x = i.x0 + (i.x1 - i.x0) * k;
    const z = i.z0 + (i.z1 - i.z0) * k;
    if (!see(x, z)) return;
    const back = i.returns && raw > 0.5 ? -1 : 1;
    const dx = (i.x1 - i.x0) * back;
    const dz = (i.z1 - i.z0) * back;
    const frame = d.directions ? headingFrame(dx, dz) : frameAt(d, t);
    const orient = d.orient === true && !d.directions;
    const head = d.anchor === 'head' && orient;
    const it = this.emit(d, frame, i.row, x, z, (head ? 0.55 : 0.5) + (i.arc > 0 ? 0.05 + i.arc * Math.sin(k * Math.PI) : 0), head ? MODE_HEAD : MODE_STAND);
    if (!it) return;
    it.scale = i.scale;
    if (orient) {
      it.turn = true;
      it.dx = dx;
      it.dz = dz;
    }
  }

  private stand(i: Inst, t: number, see: (x: number, z: number) => boolean): void {
    const d = i.def;
    if (!see(i.x0, i.z0)) return;
    if (!d.loop && t >= playMs(d) && i.kind === KIND.flash) return;
    const frame = frameAt(d, t);
    let mode = MODE_STAND;
    let lift = 0.5;
    let feet = false;
    let z = i.z0;
    switch (d.anchor) {
      case 'feet': mode = MODE_FEET; lift = 0; feet = true; break;
      case 'floor': mode = MODE_FLOOR; lift = d.lift ?? 0.02; if (d.sheet.includes('/traps/')) z -= 0.25; break;
      case 'feet-floor': mode = MODE_FLOOR; lift = d.lift ?? 0.02; feet = true; break;
      default: break;
    }
    if (i.kind === KIND.hang) {
      // Over the figure's head, drifting up a little.
      lift = 0.95 + (d.rise ?? 0) * (t / i.dur);
    }
    const it = this.emit(d, frame, i.row, i.x0, z, lift, mode);
    if (!it) return;
    it.scale = i.scale;
    it.feet = feet;
    // A flash fades out over its last frame.
    if (!d.loop && i.kind === KIND.flash) {
      const left = playMs(d) - t;
      it.alpha = left < 1000 / d.fps ? Math.max(0.15, left / (1000 / d.fps)) : 1;
    } else if (i.kind === KIND.hang) {
      const k = t / i.dur;
      it.alpha = Math.min(1, k * 8, (1 - k) * 5);
    }
  }

  private splat(i: Inst, t: number, see: (x: number, z: number) => boolean): void {
    const d = i.def;
    if (!see(i.x0, i.z0)) return;
    const play = playMs(d);
    const stay = d.stay?.ms ?? 0;
    const frame = t < play ? frameAt(d, t) : (d.stay?.frame ?? d.frames - 1);
    const it = this.emit(d, frame, i.row, i.x0, i.z0, d.lift ?? 0.02, MODE_FLOOR);
    if (!it) return;
    it.scale = i.scale;
    it.alpha = t < play || stay <= 0 ? 1 : Math.min(1, (1 - (t - play) / stay) / 0.4);
  }

  private ray(i: Inst, t: number, see: (x: number, z: number) => boolean): void {
    const d = i.def;
    const dx = i.x1 - i.x0;
    const dz = i.z1 - i.z0;
    const length = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(length));
    const k = t / i.dur;
    const alpha = k < 0.75 ? 1 : (1 - k) / 0.25;
    const step = Math.floor((t * d.fps) / 1000);
    for (let s = 0; s <= n; s++) {
      const u = n === 0 ? 0 : s / n;
      const x = i.x0 + dx * u;
      const z = i.z0 + dz * u;
      if (!see(x, z)) continue;
      // The ends have their own frames; between them the ray, or the crackling of lightning (a new frame in every cell every step).
      const sheet = s === 0 ? (i.sub0 ?? d) : s === n ? (i.sub1 ?? d) : d;
      const frame = i.kind === KIND.arc ? Math.floor(hash(i.seed + s * 31, step) * sheet.frames) : (step + s) % sheet.frames;
      const it = this.emit(sheet, frame, sheet.row, x, z, 0.55, MODE_HEAD);
      if (!it) return;
      it.turn = true;
      it.dx = dx;
      it.dz = dz;
      it.alpha = alpha;
    }
  }

  private drop(i: Inst, t: number, see: (x: number, z: number) => boolean): void {
    const d = i.def;
    if (!see(i.x0, i.z0)) return;
    const k = t / i.dur;
    const it = this.emit(d, frameAt(d, t), i.row, i.x0, i.z0, 0.4 + i.arc * (1 - k * k), MODE_STAND);
    if (it) it.scale = i.scale;
  }

  private rings(i: Inst, t: number, see: (x: number, z: number) => boolean): void {
    const d = i.def;
    if (!see(i.x0, i.z0)) return;
    const play = playMs(d);
    const stagger = d.stagger ?? 0;
    for (let r = 0; r < i.rings; r++) {
      const local = t - r * stagger;
      if (local < 0 || local >= play) continue;
      const it = this.emit(d, frameAt(d, local), i.row, i.x0, i.z0, d.lift ?? 0.03, MODE_FLOOR);
      if (!it) return;
      it.scale = i.ring;
      it.feet = true;
    }
    const s = i.sub0;
    if (!s || i.specks === 0) return;
    const lifeMin = s.life?.[0] ?? 500;
    const lifeMax = s.life?.[1] ?? 1000;
    const reach = (d.radius ?? 5) * 0.85;
    for (let j = 0; j < i.specks; j++) {
      const born = hash(i.seed, j * 3) * 260;
      const life = lifeMin + hash(i.seed, j * 3 + 1) * (lifeMax - lifeMin);
      const age = t - born;
      if (age < 0 || age >= life) continue;
      const u = age / life;
      const angle = (j / i.specks) * Math.PI * 2 + (hash(i.seed, j * 3 + 2) - 0.5) * 0.6;
      const out = reach * (1 - (1 - u) * (1 - u)) * (0.55 + 0.45 * hash(i.seed + 7, j));
      const x = i.x0 + Math.cos(angle) * out;
      const z = i.z0 + Math.sin(angle) * out * 0.8;
      if (!see(x, z)) continue;
      const it = this.emit(s, Math.min(s.frames - 1, Math.floor((age * s.fps) / 1000)), s.row, x, z, 0.25 + ((s.rise ?? 0) * u) / 16, MODE_STAND);
      if (!it) return;
      it.alpha = u < 0.7 ? 1 : (1 - u) / 0.3;
    }
  }

  private cloud(i: Inst, t: number, visible: ArrayLike<boolean> | null): void {
    const d = i.def;
    const frame0 = Math.floor((t * d.fps) / 1000);
    const k = t / i.dur;
    const alpha = k < 0.7 ? 1 : (1 - k) / 0.3;
    const cx = Math.floor(i.x0);
    const cz = Math.floor(i.z0);
    const r = Math.max(0, Math.round(i.radius));
    const row = gasRow(d, i.volume || 10) + (i.row - d.row);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= WIDTH || z >= HEIGHT || (visible !== null && !visible[z * WIDTH + x])) continue;
        const it = this.emit(d, (frame0 + x + z) % d.frames, row, x + 0.5, z + 0.5, d.lift ?? 0.25, MODE_FLOOR);
        if (!it) return;
        it.alpha = alpha;
      }
    }
  }

  /** The clouds on the floor: one tile of the cloud's sheet in each cell that holds gas and is in sight. */
  private gasTiles(now: number, visible: ArrayLike<boolean> | null, calm: boolean): void {
    const gas = this.gas;
    const lib = this.lib;
    if (!gas || !lib) return;
    let drawn = 0;
    for (const kind in gas) {
      const d = lib.fx[`gas.${kind}`];
      const cells = gas[kind];
      if (!d || !cells) continue;
      const step = calm ? 0 : Math.floor((now * d.fps) / 1000);
      for (let n = 0; n < cells.length && drawn < GAS_TILES; n++) {
        const entry = cells[n]!;
        const cell = entry[0];
        if (visible !== null && !visible[cell]) continue;
        const x = cell % WIDTH;
        const z = Math.trunc(cell / WIDTH);
        const it = this.emit(d, (step + x + z) % d.frames, gasRow(d, entry[1]), x + 0.5, z + 0.5, d.lift ?? 0.25, MODE_FLOOR);
        if (!it) return;
        drawn++;
      }
    }
  }

  // ---- light ----------------------------------------------------------------------------------------------------------------------

  private readonly lit = { x: 0, z: 0, k: 0 };

  /** How bright an effect's light is now (0 for none), and where it is (cells), into `out`. */
  private lightNow(i: Inst, now: number): number {
    if (!i.alive || !i.light) return 0;
    const t = now - i.start;
    if (t < 0 || t >= i.lightMs) return 0;
    if (!this.placeInto(i, now, this.lit)) return 0;
    return lightLevel(i.light.curve, t, i.lightMs);
  }

  /**
   * The brightest light now, by what it gives and how far the hero is (nearer wins when they are close in strength), into `out`. False
   * when none burns. The scene has one moving light; the others show only as the glow of their frames.
   */
  brightest(now: number, hx: number, hz: number, visible: ArrayLike<boolean> | null, out: { x: number; z: number; light: FxLight; level: number }): boolean {
    let best = 0;
    let found = false;
    for (const i of this.pool) {
      const level = this.lightNow(i, now);
      if (level <= 0.01) continue;
      const cell = Math.floor(this.lit.z) * WIDTH + Math.floor(this.lit.x);
      if (visible !== null && !visible[cell]) continue;
      const near = Math.hypot(this.lit.x - hx, this.lit.z - hz);
      const score = (i.light!.intensity * level) / (1 + 0.12 * near);
      if (score <= best) continue;
      best = score;
      found = true;
      out.x = this.lit.x;
      out.z = this.lit.z;
      out.light = i.light!;
      out.level = level;
    }
    return found;
  }

  /** Every light that burns now (at most `max` of them, the brightest first): for the 2D canvas, which can show several. */
  lightsInto(now: number, max: number, visible: ArrayLike<boolean> | null, out: Array<{ x: number; z: number; light: FxLight; level: number }>): number {
    let n = 0;
    for (const i of this.pool) {
      const level = this.lightNow(i, now);
      if (level <= 0.01) continue;
      const cell = Math.floor(this.lit.z) * WIDTH + Math.floor(this.lit.x);
      if (visible !== null && !visible[cell]) continue;
      const weight = i.light!.intensity * level;
      // Keep the strongest `max`: insert in order.
      let at = n;
      while (at > 0 && out[at - 1]!.level * out[at - 1]!.light.intensity < weight) at--;
      if (at >= max) continue;
      if (n < max) n++;
      for (let m = n - 1; m > at; m--) {
        const from = out[m - 1]!;
        const to = out[m]!;
        to.x = from.x; to.z = from.z; to.light = from.light; to.level = from.level;
      }
      const slot = out[at]!;
      slot.x = this.lit.x; slot.z = this.lit.z; slot.light = i.light!; slot.level = level;
    }
    return n;
  }
}

/** The potion colour of a shattered item, or undefined (the run's label of its kind). */
export function colourOf(kind: ItemKind, labels?: Env['labels']): string | undefined {
  const label = labels?.[kind];
  return label === undefined ? undefined : POTION_COLORS[label];
}

const glowDef: FxDef = {
  id: 'glow', sheet: '', w: 1, h: 1, row: 0, frames: 1, fps: 1, loop: false, behaviour: 'flash', blend: 'add', anchor: 'center',
};

export const fxp = new FxPlayer();
