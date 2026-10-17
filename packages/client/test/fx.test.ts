import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { type Effect, HEIGHT, type ItemKind, POTION_COLORS, type TrapKind, WIDTH } from '@pd/core';
import { FxPlayer, MODE_FLOOR, MODE_HEAD, type Env } from '../src/fxplayer';
import {
  ATLAS, CRIT_SHARE, type FxLib, attackKey, eventKey, frameAt, gasRow, headingFrame, lightLevel, packSheets, parseFx, playMs, problems, sheetPaths,
  waveScale, withExtras,
} from '../src/fxsheet';

const ASSETS = new URL('../public/assets/', import.meta.url);
const raw: unknown = JSON.parse(readFileSync(new URL('fx/fx.json', ASSETS), 'utf8'));
type Bolt = NonNullable<Extract<Effect, { type: 'zapped' }>['bolt']>;
const designer = parseFx(raw);
const lib = withExtras(designer);

/** A PNG's size from its header. */
function pngSize(path: string): { w: number; h: number } | null {
  try {
    const head = readFileSync(new URL(path, ASSETS)).subarray(16, 24);
    return { w: head.readUInt32BE(0), h: head.readUInt32BE(4) };
  } catch {
    return null;
  }
}

describe('fx.json', () => {
  it('has the designer\'s 148 effects (part 6: 78; part 13: 70) and 62 events, and parses whole', () => {
    expect(Object.keys(designer.fx)).toHaveLength(148);
    expect(Object.keys(designer.events)).toHaveLength(62);
    expect(Object.keys(designer.bossCards.bosses).sort()).toEqual(['dm300', 'goo', 'king', 'tengu', 'yog']);
  });

  it('has no event pointing at a missing effect, sheet, boss card, link or frame row', () => {
    expect(problems(designer, pngSize)).toEqual([]);
    expect(problems(lib, pngSize)).toEqual([]);
  });

  it('maps every event to an effect that exists, with a sheet that exists', () => {
    for (const [key, id] of Object.entries(lib.events)) {
      if (id.startsWith('boss.')) {
        const card = lib.bossCards.bosses[id.slice(5)];
        expect(card, key).toBeDefined();
        expect(pngSize(card!.portrait), `${key}: ${card!.portrait}`).not.toBeNull();
        continue;
      }
      const d = lib.fx[id];
      expect(d, `${key} -> ${id}`).toBeDefined();
      expect(pngSize(d!.sheet), `${id}: ${d!.sheet}`).not.toBeNull();
    }
  });

  it('has a sheet on disk for every effect, and each sheet holds its frames', () => {
    for (const path of sheetPaths(lib)) expect(pngSize(path), path).not.toBeNull();
    for (const d of Object.values(lib.fx)) {
      const size = pngSize(d.sheet)!;
      expect(d.frames * d.w, d.id).toBeLessThanOrEqual(size.w);
      expect((d.row + 1) * d.h, d.id).toBeLessThanOrEqual(size.h);
    }
  });

  it('rejects data of the wrong shape with a message that names the field', () => {
    expect(() => parseFx(null)).toThrow(/root/);
    expect(() => parseFx({ ...(raw as object), fx: { x: { sheet: 'a.png' } } })).toThrow(/fx\.x\.behaviour/);
    const broken = JSON.parse(JSON.stringify(raw)) as { fx: Record<string, { behaviour: string }> };
    broken.fx['bolt.fire']!.behaviour = 'teleport';
    expect(() => parseFx(broken)).toThrow(/bolt\.fire\.behaviour/);
  });

  it('reports a link to nothing', () => {
    const bad: FxLib = { ...designer, events: { ...designer.events, 'zapped.magic': 'bolt.nothing' } };
    expect(problems(bad)).toEqual(['event zapped.magic: no effect bolt.nothing']);
  });
});

/** Every kind the core can send, so that a new one fails here until it has a look (or is named as having none). */
const BOLTS = { magic: 1, lightning: 1, fire: 1, poison: 1, slow: 1, teleport: 1, blink: 1, beam: 1, rocks: 1, shadow: 1, amok: 1, reach: 1, flock: 1, regrowth: 1 } satisfies Record<Bolt, 1>;
const TRAPS = { toxic: 1, fire: 1, paralytic: 1, poison: 1, alarm: 1, lightning: 1, gripping: 1, summoning: 1 } satisfies Record<TrapKind, 1>;

describe('events to effects', () => {
  const zap = (bolt?: Bolt): Effect => ({ type: 'zapped', depth: 1, from: 0, to: 1, ...(bolt ? { bolt } : {}) });

  it('gives every bolt of the 1.9.2a wands an effect, and a bolt with no name the magic missile\'s', () => {
    for (const bolt of Object.keys(BOLTS) as Bolt[]) {
      const id = lib.events[eventKey(zap(bolt))!];
      expect(id, bolt).toBe(`bolt.${bolt}`);
      expect(lib.fx[id!]!.hit ?? lib.fx[id!]!.start ?? 'ok', bolt).toBeTruthy();
    }
    expect(lib.events[eventKey(zap())!]).toBe('bolt.magic');
  });

  it('gives every trap its plate, and every cloud of a burst its tiles', () => {
    for (const kind of Object.keys(TRAPS) as TrapKind[]) {
      expect(lib.events[eventKey({ type: 'trap', depth: 1, pos: 0, kind, hero: 'h' })!], kind).toBe(`trap.${kind}`);
    }
    for (const kind of ['fire', 'frost', 'purity'] as const) {
      expect(lib.events[eventKey({ type: 'burst', depth: 1, pos: 0, kind, radius: 1 })!], kind).toBe(`gas.${kind}`);
    }
    expect(lib.events[eventKey({ type: 'special', hero: 'h', ability: 'smokeBomb', from: 0, to: 0 })!]).toBe('gas.smoke');
  });

  it('gives every colour of potion a splash, in the order of the sheet', () => {
    POTION_COLORS.forEach((colour, row) => {
      const id = lib.events[eventKey({ type: 'shattered', hero: 'h', depth: 1, pos: 0, kind: 'potion.healing', identified: false }, colour)!];
      expect(id, colour).toBe(`potion.splash.${colour}`);
      expect(lib.fx[id!]!.row, colour).toBe(row);
    });
    expect(eventKey({ type: 'shattered', hero: 'h', depth: 1, pos: 0, kind: 'potion.healing', identified: false })).toBeNull();
  });

  it('gives the four waves their rings, the thrown weapons their flights, the stones theirs', () => {
    for (const kind of ['challenge', 'terror', 'lullaby', 'psionic'] as const) {
      expect(lib.events[eventKey({ type: 'scroll', hero: 'h', kind, count: 1 })!]).toBe(`wave.${kind}`);
    }
    // (Recharging and removing a curse have no wave: they only log a line.)
    expect(lib.events[eventKey({ type: 'scroll', hero: 'h', kind: 'recharging', count: 1 })!]).toBeUndefined();
    for (const item of ['missile.boomerang', 'missile.shuriken', 'missile.tomahawk', 'missile.javelin'] as ItemKind[]) {
      expect(lib.events[eventKey({ type: 'thrown', depth: 1, from: 0, to: 1, item })!], item).toBe(`thrown.${item.slice(8)}`);
    }
    for (const item of ['missile.dart', 'missile.curare', 'missile.incendiary'] as ItemKind[]) {
      const id = lib.events[eventKey({ type: 'thrown', depth: 1, from: 0, to: 1, item })!];
      expect(id, item).toMatch(/^stone\./);
      expect(lib.fx[lib.fx[id!]!.hit!], item).toBeDefined();
    }
    expect(lib.events[eventKey({ type: 'missile', depth: 1, from: 0, to: 1, sprite: 3 })!]).toBe('thrown.arrow');
  });

  it('gives the heroes\' moments, the five bosses and the blows their effects', () => {
    expect(lib.events[eventKey({ type: 'levelUp', hero: 'h', lvl: 2 })!]).toBe('hero.levelup');
    expect(lib.events[eventKey({ type: 'resurrected', hero: 'h' })!]).toBe('hero.ankh');
    expect(lib.events[eventKey({ type: 'amulet', hero: 'h', first: true })!]).toBe('hero.amulet');
    expect(lib.events[eventKey({ type: 'healed', hero: 'h', amount: 5 })!]).toBe('hero.heal');
    for (const kind of ['goo', 'tengu', 'dm300', 'king', 'yog'] as const) {
      expect(lib.events[eventKey({ type: 'yell', depth: 5, mob: 'm', kind, line: 'notice' })!], kind).toBe(`boss.${kind}`);
    }
    // (Only the moment a boss notices the party has a card.)
    expect(eventKey({ type: 'yell', depth: 5, mob: 'm', kind: 'goo', line: 'death' })).toBeNull();
    for (const key of ['attack.hit', 'attack.crit', 'attack.miss']) expect(lib.fx[lib.events[key]!], key).toBeDefined();
  });

  it('every event the data names is one the game can make', () => {
    // (A key in fx.json that no event can build would be dead data.)
    const made = new Set<string>();
    for (const bolt of Object.keys(BOLTS) as Bolt[]) made.add(eventKey(zap(bolt))!);
    for (const kind of Object.keys(TRAPS) as TrapKind[]) made.add(`trap.${kind}`);
    for (const colour of POTION_COLORS) made.add(`shattered.${colour}`);
    for (const key of Object.keys(designer.events)) {
      if (/^(gas\.|burst\.|special\.|scroll\.|thrown\.|yell\.notice\.|attack\.)/.test(key) || ['missile', 'levelUp', 'resurrected', 'amulet', 'healed'].includes(key)) continue;
      expect(made.has(key), key).toBe(true);
    }
  });
});

describe('the rules', () => {
  it('shows a crit when a hit takes 30 % of the target\'s greatest health, and nothing in the core changes', () => {
    expect(CRIT_SHARE).toBe(0.3);
    expect(attackKey(true, 6, 20)).toBe('attack.crit');
    expect(attackKey(true, 5, 20)).toBe('attack.hit');
    expect(attackKey(false, 99, 20)).toBe('attack.miss');
    // An unknown health is never a crit.
    expect(attackKey(true, 99, 0)).toBe('attack.hit');
  });

  it('picks the frame of an 8-way sheet by the heading: E NE N NW W SW S SE', () => {
    expect(headingFrame(1, 0)).toBe(0);
    expect(headingFrame(1, -1)).toBe(1);
    expect(headingFrame(0, -1)).toBe(2);
    expect(headingFrame(-1, -1)).toBe(3);
    expect(headingFrame(-1, 0)).toBe(4);
    expect(headingFrame(-1, 1)).toBe(5);
    expect(headingFrame(0, 1)).toBe(6);
    expect(headingFrame(1, 1)).toBe(7);
  });

  it('plays frames by the clock: looping ones wrap, the others hold their last', () => {
    const loop = { frames: 4, fps: 16, loop: true };
    expect(frameAt(loop, 0)).toBe(0);
    expect(frameAt(loop, 70)).toBe(1);
    expect(frameAt(loop, 250)).toBe(0);
    const once = { frames: 4, fps: 16, loop: false };
    expect(frameAt(once, 10_000)).toBe(3);
    expect(playMs(once)).toBe(250);
  });

  it('picks a cloud\'s row by the gas in the cell: 1-5, 6-15, 16 and more', () => {
    const toxic = lib.fx['gas.toxic']!;
    expect([1, 5, 6, 15, 16, 99].map((v) => gasRow(toxic, v))).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('draws a wave at the whole scale that reaches its radius, or the largest', () => {
    expect(waveScale({ w: 48, radius: 1.5, scaleSteps: [1, 2, 3] })).toBe(1);
    expect(waveScale({ w: 48, radius: 3, scaleSteps: [1, 2, 3] })).toBe(2);
    expect(waveScale(lib.fx['wave.challenge']!)).toBe(3);
  });

  it('lights: a flash rises for 15 % and dies away, a steady one burns evenly and eases out', () => {
    expect(lightLevel('flash', 0, 100)).toBe(0);
    expect(lightLevel('flash', 15, 100)).toBeCloseTo(1, 5);
    expect(lightLevel('flash', 57.5, 100)).toBeCloseTo(0.5, 2);
    expect(lightLevel('flash', 100, 100)).toBe(0);
    expect(lightLevel('steady', 400, 1000)).toBe(1);
    expect(lightLevel('steady', 950, 1000)).toBeLessThan(0.5);
    for (const curve of ['pulse', 'flicker'] as const) for (let ms = 0; ms < 1000; ms += 25) expect(lightLevel(curve, ms, 1000)).toBeGreaterThanOrEqual(0);
  });
});

describe('the atlas', () => {
  it('holds every sheet the 3D view draws beside the old 256 x 256 corner of the 1024 x 768 atlas, with none on another', () => {
    const sheets = sheetPaths(lib).filter((p) => !p.startsWith('fx/boss/')).map((path) => ({ path, ...pngSize(path)! }));
    const regions = ATLAS.free;
    const placed = packSheets(sheets, regions);
    expect(placed, 'the sheets fit').not.toBeNull();
    const list = [...placed!.values()];
    expect(list).toHaveLength(sheets.length);
    for (const r of list) {
      const inside = regions.some((g) => r.x >= g.x && r.y >= g.y && r.x + r.w <= g.x + g.w && r.y + r.h <= g.y + g.h);
      expect(inside).toBe(true);
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${i} and ${j}`).toBe(true);
      }
    }
  });

  it('says so when they do not fit', () => {
    expect(packSheets([{ path: 'a', w: 40, h: 40 }], [{ x: 0, y: 0, w: 32, h: 32 }])).toBeNull();
  });
});

// ---- the player ---------------------------------------------------------------------------------------------------------------

class Screen {
  shakes: Array<{ px: number; ms: number; at: number }> = [];
  flashes: Array<{ rgb: string; alpha: number; ms: number; at: number }> = [];
  stains: string[] = [];
  reduced = false;
  light = false;
  asSink() {
    return {
      shake: (px: number, ms: number, now: number) => void this.shakes.push({ px, ms, at: now }),
      flash: (rgb: string, alpha: number, ms: number, now: number) => void this.flashes.push({ rgb, alpha, ms, at: now }),
      stain: (_x: number, _y: number, _now: number, color: string) => void this.stains.push(color),
      reducedMotion: () => this.reduced,
      light: () => this.light,
    };
  }
}

const cell = (x: number, y: number): number => y * WIDTH + x;

function player(): { p: FxPlayer; screen: Screen } {
  const p = new FxPlayer();
  const screen = new Screen();
  p.sink = screen.asSink();
  p.use(lib);
  return { p, screen };
}

const env = (overrides: Partial<Env> = {}): Env => ({
  depth: 1, myId: 'me', labels: { 'potion.healing': 8 }, where: (id, out) => { out.x = id === 'far' ? 40.5 : 10.5; out.z = 10.5; return true; },
  htOf: () => 20, sees: () => true, ...overrides,
});

const everywhere = null;

describe('the player', () => {
  it('flies a bolt at the data\'s speed with its head turned along the path, then plays its hit', () => {
    const { p } = player();
    const ms = p.fly('bolt.fire', cell(10, 10), cell(14, 10), 1000);
    // 4 cells at 11 cells a second.
    expect(ms).toBeCloseTo((4 / 11) * 1000, 0);
    p.collect(1000 + ms / 2, everywhere);
    const head = p.items[0]!;
    expect(head.def.id).toBe('bolt.fire');
    expect(head.mode).toBe(MODE_HEAD);
    expect(head.turn).toBe(true);
    expect(head.x).toBeCloseTo(12.5, 1);
    // Landed: the hit, at the target, as a one-off.
    p.collect(1000 + ms + 30, everywhere);
    expect(p.items[0]!.def.id).toBe('bolt.fire.hit');
    expect(p.items[0]!.x).toBeCloseTo(14.5, 5);
    // Over.
    p.collect(5000, everywhere);
    expect(p.count).toBe(0);
  });

  it('draws a beam as its start, its tiles and its end, and lightning as tiles that change every step', () => {
    const { p } = player();
    p.fly('bolt.beam', cell(10, 10), cell(15, 10), 0);
    p.collect(100, everywhere);
    const ids = Array.from({ length: p.count }, (_, i) => p.items[i]!.def.id);
    expect(ids[0]).toBe('bolt.beam.start');
    expect(ids[ids.length - 1]).toBe('bolt.beam.end');
    expect(ids.filter((id) => id === 'bolt.beam')).toHaveLength(4);
    const arc = player().p;
    arc.fly('bolt.lightning', cell(10, 10), cell(16, 10), 0);
    const framesAt = (t: number): number[] => {
      arc.collect(t, everywhere);
      return Array.from({ length: arc.count }, (_, i) => arc.items[i]!.col);
    };
    // 24 frames a second: a new frame in each tile every ~42 ms.
    expect(framesAt(10)).not.toEqual(framesAt(60));
    arc.collect(190, everywhere);
    expect(arc.items[0]!.def.id).toBe('bolt.lightning.strike');
  });

  it('turns a thrown weapon by its heading with no rotation, and brings a boomerang home', () => {
    const { p } = player();
    expect(p.launch({ type: 'missile', depth: 1, from: cell(10, 10), to: cell(14, 6), sprite: 3 }, 1, 0)).toBe(true);
    p.collect(100, everywhere);
    expect(p.items[0]!.def.id).toBe('thrown.arrow');
    // Up and to the right: north-east, the second frame.
    expect(p.items[0]!.col).toBe(1);
    expect(p.items[0]!.turn).toBe(false);
    const b = player().p;
    expect(b.launch({ type: 'thrown', depth: 1, from: cell(10, 10), to: cell(14, 10), item: 'missile.boomerang' }, 1, 0)).toBe(true);
    b.collect(10, everywhere);
    const start = b.items[0]!.x;
    // 4 cells at 12 a second, and the same way back.
    const there = (4 / 12) * 1000;
    b.collect(there, everywhere);
    expect(b.items[0]!.x).toBeCloseTo(14.5, 0);
    b.collect(2 * there - 5, everywhere);
    expect(Math.abs(b.items[0]!.x - start)).toBeLessThan(0.5);
  });

  it('does not launch what the data has no flight for (a potion, a bomb), and leaves other floors alone', () => {
    const { p } = player();
    expect(p.launch({ type: 'thrown', depth: 1, from: 0, to: 5, item: 'bomb' }, 1, 0)).toBe(false);
    expect(p.launch({ type: 'thrown', depth: 1, from: 0, to: 5, item: 'potion.healing' }, 1, 0)).toBe(false);
    p.collect(50, everywhere);
    expect(p.count).toBe(0);
    expect(new FxPlayer().launch({ type: 'zapped', depth: 1, from: 0, to: 5, bolt: 'fire' }, 1, 0)).toBe(false);
  });

  it('lays a wave\'s rings on the floor at the whole scale, one after another, and throws its specks', () => {
    const { p, screen } = player();
    expect(p.onEffect({ type: 'scroll', hero: 'me', kind: 'challenge', count: 1 }, env(), 0)).toBe(true);
    p.update(5);
    expect(screen.shakes).toEqual([{ px: 3, ms: 300, at: 5 }]);
    expect(screen.flashes[0]!.alpha).toBeCloseTo(0.3, 5);
    p.collect(130, everywhere);
    const rings = Array.from({ length: p.count }, (_, i) => p.items[i]!).filter((it) => it.def.id === 'wave.challenge');
    // The second ring starts 120 ms after the first.
    expect(rings).toHaveLength(2);
    expect(rings.every((r) => r.mode === MODE_FLOOR && r.scale === 3)).toBe(true);
    const specks = Array.from({ length: p.count }, (_, i) => p.items[i]!).filter((it) => it.def.id === 'wave.challenge.specks');
    expect(specks.length).toBeGreaterThan(0);
    expect(specks.length).toBeLessThanOrEqual(18);
  });

  it('shakes and flashes only the reader for a scroll, but all for the psionic flash', () => {
    const { p, screen } = player();
    p.onEffect({ type: 'scroll', hero: 'far', kind: 'challenge', count: 1 }, env(), 0);
    p.onEffect({ type: 'scroll', hero: 'far', kind: 'psionic', count: 1 }, env(), 0);
    p.update(1);
    expect(screen.shakes).toHaveLength(0);
    expect(screen.flashes.map((f) => f.rgb)).toEqual(['255, 255, 255']);
  });

  it('sends no shake and half the flash when motion is reduced, fewer rings and no specks', () => {
    const { p, screen } = player();
    screen.reduced = true;
    p.onEffect({ type: 'scroll', hero: 'me', kind: 'challenge', count: 1 }, env(), 0);
    p.update(1);
    expect(screen.shakes).toHaveLength(0);
    expect(screen.flashes[0]!.alpha).toBeCloseTo(0.15, 5);
    p.collect(130, everywhere);
    expect(Array.from({ length: p.count }, (_, i) => p.items[i]!.def.id)).toEqual(['wave.challenge']);
  });

  it('plays the light quality\'s waves with half the rings and specks', () => {
    // The specks' timing comes from a random seed per effect: fixed here, so both qualities are compared on the same dice.
    const dice = vi.spyOn(Math, 'random').mockReturnValue(0.42);
    const full = player();
    full.p.onEffect({ type: 'scroll', hero: 'me', kind: 'lullaby', count: 1 }, env(), 0);
    full.p.collect(1000, everywhere);
    const light = player();
    light.screen.light = true;
    light.p.onEffect({ type: 'scroll', hero: 'me', kind: 'lullaby', count: 1 }, env(), 0);
    light.p.collect(1000, everywhere);
    dice.mockRestore();
    expect(light.p.count).toBeLessThan(full.p.count);
  });

  it('lets a monster set off a trap without shaking or flashing the screen, and a hero shake it', () => {
    const { p, screen } = player();
    p.onEffect({ type: 'trap', depth: 1, pos: cell(10, 10), kind: 'lightning', hero: '', mob: 'rat' }, env(), 0);
    p.update(1);
    expect(screen.shakes).toHaveLength(0);
    expect(screen.flashes).toHaveLength(0);
    p.collect(30, everywhere);
    expect(p.items[0]!.def.id).toBe('trap.lightning');
    p.onEffect({ type: 'trap', depth: 1, pos: cell(10, 10), kind: 'lightning', hero: 'me' }, env(), 100);
    p.update(101);
    expect(screen.shakes).toEqual([{ px: 4, ms: 300, at: 101 }]);
    expect(screen.flashes[0]!.rgb).toBe('230, 240, 255');
    // A trap a monster set off out of sight shows nothing.
    const quiet = player().p;
    quiet.onEffect({ type: 'trap', depth: 1, pos: cell(10, 10), kind: 'fire', hero: '', mob: 'rat' }, env({ sees: () => false }), 0);
    quiet.collect(30, everywhere);
    expect(quiet.count).toBe(0);
  });

  it('shows a hit, a crit (30 % of the target\'s health) and a miss at the target, and the miss replaces the old puff', () => {
    const { p } = player();
    const attack = (hit: boolean, damage: number): Effect => ({ type: 'attack', depth: 1, attacker: 'me', target: 'rat', hit, damage });
    expect(p.onEffect(attack(true, 2), env(), 0)).toBe(false);
    expect(p.onEffect(attack(true, 6), env(), 0)).toBe(false);
    expect(p.onEffect(attack(false, 0), env(), 0)).toBe(true);
    p.collect(20, everywhere);
    expect(Array.from({ length: p.count }, (_, i) => p.items[i]!.def.id).sort()).toEqual(['hit', 'hit.crit', 'hit.miss']);
  });

  it('splashes a potion in its own colour and leaves a stain of it', () => {
    const { p, screen } = player();
    const e: Effect = { type: 'shattered', hero: 'me', depth: 1, pos: cell(10, 10), kind: 'potion.healing' as ItemKind, identified: false };
    p.onEffect(e, env(), 0);
    p.collect(50, everywhere);
    expect(p.items[0]!.def.id).toBe('potion.splash.amber');
    expect(p.items[0]!.mode).toBe(MODE_FLOOR);
    expect(screen.stains).toEqual([lib.fx['potion.splash.amber']!.light!.color]);
    // It holds its last frame, then goes.
    p.collect(900, everywhere);
    expect(p.items[0]!.col).toBe(5);
    p.collect(3000, everywhere);
    expect(p.count).toBe(0);
  });

  it('fills a burst with tiles of its cloud for a while, and the floor\'s gas with tiles by volume, skipping what is out of sight', () => {
    const { p } = player();
    p.onEffect({ type: 'burst', depth: 1, pos: cell(10, 10), kind: 'fire', radius: 1 }, env(), 0);
    p.collect(100, everywhere);
    expect(p.count).toBe(9);
    p.collect(5000, everywhere);
    expect(p.count).toBe(0);
    p.gas = { toxic: [[cell(5, 5), 3], [cell(6, 5), 30], [cell(7, 5), 8]], web: [[cell(8, 5), 1]] };
    const seen = new Array<boolean>(WIDTH * HEIGHT).fill(false);
    seen[cell(5, 5)] = seen[cell(6, 5)] = seen[cell(8, 5)] = true;
    p.collect(0, seen);
    const tiles = Array.from({ length: p.count }, (_, i) => p.items[i]!);
    expect(tiles.map((t) => `${t.def.id}:${t.row}`)).toEqual(['gas.toxic:0', 'gas.toxic:2', 'gas.web:0']);
    expect(tiles.every((t) => t.mode === MODE_FLOOR)).toBe(true);
  });

  it('drops rocks from three cells up and plays their hit when they land', () => {
    const { p } = player();
    expect(p.onEffect({ type: 'avalanche', depth: 1, cells: Array.from({ length: 12 }, (_, i) => cell(10 + i, 10)) }, env(), 0)).toBe(true);
    p.collect(30, everywhere);
    const high = Math.max(...Array.from({ length: p.count }, (_, i) => p.items[i]!.lift));
    expect(high).toBeGreaterThan(2.5);
    p.collect(700, everywhere);
    expect(Array.from({ length: p.count }, (_, i) => p.items[i]!.def.id)).toContain('bolt.rocks.hit');
  });

  it('follows a hero\'s moment to where they walk and gives a hero\'s level only to the hero', () => {
    const { p, screen } = player();
    let x = 10.5;
    p.locate = (_id, _now, out) => { out.x = x; out.z = 10.5; return true; };
    p.onEffect({ type: 'levelUp', hero: 'far', lvl: 3 }, env(), 0);
    x = 20.5;
    p.collect(30, everywhere);
    expect(p.items[0]!.x).toBe(20.5);
    p.update(1);
    expect(screen.flashes).toHaveLength(0);
    p.onEffect({ type: 'levelUp', hero: 'me', lvl: 3 }, env(), 100);
    p.update(101);
    expect(screen.flashes).toHaveLength(1);
    // The Amulet only the first time.
    expect(p.onEffect({ type: 'amulet', hero: 'me', first: false }, env(), 0)).toBe(false);
    expect(p.onEffect({ type: 'amulet', hero: 'me', first: true }, env(), 0)).toBe(true);
  });

  it('lights with the brightest effect, the nearer of two equal ones, and not what the party cannot see', () => {
    const { p } = player();
    const out = { x: 0, z: 0, light: lib.fx['bolt.fire']!.light!, level: 0 };
    p.fly('bolt.magic', cell(10, 10), cell(20, 10), 0);
    p.onEffect({ type: 'trap', depth: 1, pos: cell(14, 10), kind: 'lightning', hero: 'me' }, env(), 0);
    // The lightning trap (8) beats the magic missile (3), but not from a place that is not seen.
    expect(p.brightest(30, 10, 10, everywhere, out)).toBe(true);
    expect(out.light.color).toBe('#c0f4ff');
    const seen = new Array<boolean>(WIDTH * HEIGHT).fill(false);
    for (let x = 10; x <= 13; x++) seen[cell(x, 10)] = true;
    expect(p.brightest(30, 10, 10, seen, out)).toBe(true);
    expect(out.light.color).toBe('#b8a8ff');
    // The light is gone with the effect.
    expect(p.brightest(9000, 10, 10, everywhere, out)).toBe(false);
  });

  it('lists the strongest lights for the canvas, strongest first', () => {
    const { p } = player();
    p.onEffect({ type: 'trap', depth: 1, pos: cell(10, 10), kind: 'lightning', hero: 'me' }, env(), 0);
    p.onEffect({ type: 'trap', depth: 1, pos: cell(12, 10), kind: 'alarm', hero: 'me' }, env(), 0);
    p.onEffect({ type: 'trap', depth: 1, pos: cell(14, 10), kind: 'poison', hero: 'me' }, env(), 0);
    const out = Array.from({ length: 2 }, () => ({ x: 0, z: 0, light: lib.fx['bolt.fire']!.light!, level: 0 }));
    expect(p.lightsInto(20, 2, everywhere, out)).toBe(2);
    expect(out[0]!.light.intensity * out[0]!.level).toBeGreaterThanOrEqual(out[1]!.light.intensity * out[1]!.level);
    expect(out[0]!.light.color).toBe('#c0f4ff');
  });

  it('makes nothing in a frame: its pools hold their ground through a storm of effects and survive running out of room', () => {
    const { p } = player();
    const items = p.items.slice();
    for (let i = 0; i < 400; i++) p.fly('bolt.fire', cell(10, 10), cell(20, 12), i);
    for (let i = 0; i < 200; i++) p.onEffect({ type: 'scroll', hero: 'me', kind: 'terror', count: 1 }, env(), i);
    p.gas = { toxic: Array.from({ length: 900 }, (_, i) => [cell(i % 60, Math.trunc(i / 60)), 20] as const) };
    for (let t = 0; t < 3000; t += 16) {
      p.collect(t, everywhere);
      expect(p.count).toBeLessThanOrEqual(p.items.length);
    }
    expect(p.items.length).toBe(items.length);
    expect(p.items.every((it, i) => it === items[i])).toBe(true);
    p.clear();
    p.collect(0, everywhere);
  });

  it('has no look for events the data does not know, and does nothing before the data has come', () => {
    const none = new FxPlayer();
    expect(none.onEffect({ type: 'levelUp', hero: 'me', lvl: 2 }, env(), 0)).toBe(false);
    expect(none.collect(0, everywhere)).toBe(0);
    const { p } = player();
    expect(p.onEffect({ type: 'died', depth: 1, who: 'rat', pos: 0 }, env(), 0)).toBe(false);
    expect(p.owns({ type: 'zapped', depth: 1, from: 0, to: 1, bolt: 'fire' })).toBe(true);
    expect(p.owns({ type: 'thrown', depth: 1, from: 0, to: 1, item: 'bomb' })).toBe(false);
  });

  it('puts the boss\'s red light and kick at the boss', () => {
    const { p, screen } = player();
    p.bossArrives(10.5, 10.5, 0);
    p.update(1);
    expect(screen.shakes).toEqual([{ px: 2, ms: 400, at: 1 }]);
    const out = { x: 0, z: 0, light: lib.fx['bolt.fire']!.light!, level: 0 };
    expect(p.brightest(200, 10, 10, everywhere, out)).toBe(true);
    expect(out.light.color).toBe('#ff3a2a');
    expect(out.light.intensity).toBe(4);
  });
});
