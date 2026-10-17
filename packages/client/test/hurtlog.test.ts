import { addHero, createWorld, type Effect, floorAt, heroById, levelAt, T } from '@pd/core';
import { describe, expect, it, vi } from 'vitest';
import type { Assets } from '../src/sprites';
import { FEED_SHOWN, HurtLog } from '../src/hurtlog';
import { NO_CONDITIONS, type Source, sourcesOf } from '../src/hurtsrc';

// The view and the icons draw nothing here; their imports want a browser, so the few things they touch are made up.
vi.stubGlobal('location', { search: '?lang=en', href: 'http://x/' });
vi.stubGlobal('navigator', { language: 'en', languages: ['en'], userAgent: 'x' });
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
vi.mock('../src/audio', () => ({ audio: new Proxy({}, { get: () => () => undefined }) }));
const { View } = await import('../src/view');
const { iconFor } = await import('../src/srcicon');
const { conditionsOf } = await import('../src/hurtlog');

/*
 * The feed's ring of wounds, the hero's conditions as hurtsrc.ts reads them, the pictures a source gets, and the damage numbers that carry
 * them (view.ts apply).
 */

describe('the log of wounds', () => {
  const entry = (turn: number) => ({ turn, depth: 1, amount: 1, source: { cause: 'poison' } as Source });

  it('shows the newest first, a dozen of them', () => {
    const log = new HurtLog();
    for (let turn = 1; turn <= 30; turn++) log.push(entry(turn));
    const shown = log.recent();
    expect(shown).toHaveLength(FEED_SHOWN);
    expect(shown[0]!.turn).toBe(30);
    expect(shown.at(-1)!.turn).toBe(30 - FEED_SHOWN + 1);
  });

  it('keeps a couple of dozen, no more', () => {
    const log = new HurtLog();
    for (let turn = 1; turn <= 100; turn++) log.push(entry(turn));
    expect(log.size).toBeLessThanOrEqual(30);
    expect(log.recent(1000)[0]!.turn).toBe(100);
  });

  it('is emptied for a new run', () => {
    const log = new HurtLog();
    log.push(entry(1));
    log.reset();
    expect(log.recent()).toEqual([]);
  });
});

describe('the hero\'s conditions', () => {
  it('are read off the hero', () => {
    const world = createWorld(7);
    addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
    const hero = heroById(world, 'p')!;
    expect(conditionsOf(hero, false, false)).toEqual(NO_CONDITIONS);
    Object.assign(hero, { poison: 3, burning: 2, bleeding: 4, ooze: 0, deferred: 5 });
    expect(conditionsOf(hero, true, true)).toEqual({ burning: true, poison: true, bleeding: 4, ooze: true, deferred: true, starving: true, gas: true });
  });
});

describe('the pictures of the sources', () => {
  const labels = {};
  it('a monster is its own portrait, a bone burst a skeleton\'s, a trap its own tile', () => {
    expect(iconFor({ mob: 'rat' }, labels)).toEqual({ kind: 'mob', mob: 'rat' });
    expect(iconFor({ cause: 'bones' }, labels)).toEqual({ kind: 'mob', mob: 'skeleton' });
    expect(iconFor({ cause: 'trap', trap: 'gripping' }, labels)).toEqual({ kind: 'tile', terrain: T.GRIPPING_TRAP });
  });

  it('the slow ones are buff icons, the fall the depth sign, the unknown a skull', () => {
    expect(iconFor({ cause: 'poison' }, labels)).toEqual({ kind: 'buff', index: 3 });
    expect(iconFor({ cause: 'burning' }, labels)).toEqual({ kind: 'buff', index: 2 });
    expect(iconFor({ cause: 'bleeding' }, labels)).toEqual({ kind: 'buff', index: 26 });
    expect(iconFor({ cause: 'fall' }, labels).kind).toBe('icons');
    expect(iconFor({ cause: 'unknown' }, labels).kind).toBe('icons');
    expect(iconFor({ cause: 'gas' }, labels)).toEqual({ kind: 'gas' });
  });

  it('lightning shows a trap\'s tile, never a wand (a wand\'s look would give away which one it is)', () => {
    expect(iconFor({ cause: 'lightning' }, labels)).toEqual({ kind: 'tile', terrain: T.LIGHTNING_TRAP });
  });

  it('a missile is its own item', () => {
    const icon = iconFor({ cause: 'missile', item: 'missile.dart' }, labels);
    expect(icon).toEqual({ kind: 'item', index: 31 });
  });
});

describe('damage numbers', () => {
  const anim = { fps: 1, frames: [0], loop: true };
  const sprite = { sheet: { image: {}, w: 12, h: 14, cols: 1 }, anims: { idle: anim, run: anim, attack: anim, die: anim, operate: anim, pump: anim } };
  const assets = { heroes: new Proxy({}, { get: () => sprite }), mobs: new Proxy({}, { get: () => sprite }) } as unknown as Assets;

  it('a wound of the hero carries the picture of its source; a blow in hand at a monster carries none', () => {
    const world = createWorld(3);
    addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
    const hero = heroById(world, 'p')!;
    floorAt(world, 1).mobs = [];
    levelAt(world, 1);
    const view = new View(assets);
    view.reset(1);
    view.sync(world, 1000, 'p');
    const effects: Effect[] = [{ type: 'hurt', depth: 1, who: 'p', damage: 2 }, { type: 'hurt', depth: 1, who: 'p', damage: 1 }];
    const sources = sourcesOf(effects, {
      myId: 'p', mobKind: () => undefined, heroClass: () => undefined, before: { ...NO_CONDITIONS, poison: true, bleeding: 2 }, after: { ...NO_CONDITIONS, poison: true, bleeding: 2 }, depth: 1,
    });
    view.apply(effects, world, 'p', 1000, sources);
    void hero;
    const [first, second] = view.floaters;
    expect(first!.text).toBe('2');
    expect(first!.icon).toBeDefined();
    expect(second!.icon).toBeDefined();
    // Without sources the numbers are as ever.
    const plain = new View(assets);
    plain.reset(1);
    plain.sync(world, 1000, 'p');
    plain.apply(effects, world, 'p', 1000);
    expect(plain.floaters.every((f) => f.icon === undefined)).toBe(true);
  });
});
