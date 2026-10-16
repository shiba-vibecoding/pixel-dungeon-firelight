import { act, addHero, canEnter, charAt, createItem, createMob, createWorld, type Effect, floorAt, heroById, type ItemKind, levelAt, type Mob, T, WIDTH, type World } from '@pd/core';
import { describe, expect, it, vi } from 'vitest';
import type { Assets } from '../src/sprites';
import type { FxArt } from '../src/flart';

// The view draws nothing here; its imports want a browser, so the few things they touch are made up.
vi.stubGlobal('location', { search: '?lang=en', href: 'http://x/' });
vi.stubGlobal('navigator', { language: 'en', languages: ['en'], userAgent: 'x' });
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
vi.mock('../src/audio', () => ({ audio: new Proxy({}, { get: () => () => undefined }) }));
const { View } = await import('../src/view');

/*
 * The kill effect one wears plays for every kill the hero causes (view.ts apply, from the core's `died.by`): a blow, a wand's bolt, a thrown
 * weapon. It plays for no kill that names nobody (fire, poison, bleeding), for no other hero's, and for no ally's.
 */

const anim = { fps: 1, frames: [0], loop: true };
const sprite = { sheet: { image: {}, w: 12, h: 14, cols: 1 }, anims: { idle: anim, run: anim, attack: anim, die: anim, operate: anim, pump: anim } };
const assets = { heroes: new Proxy({}, { get: () => sprite }), mobs: new Proxy({}, { get: () => sprite }) } as unknown as Assets;
const ART: FxArt = { image: {} as HTMLImageElement, w: 16, h: 16, frames: 6, ms: 80, atX: 8, atY: 8 };

/** A hero (a mage, with a wand) and a rat two cells away along an open line, awake and hunting. */
function arena(kind?: ItemKind, heroClass: 'mage' | 'huntress' | 'warrior' = 'warrior'): { world: World; rat: Mob } {
  for (let seed = 1; seed <= 60; seed++) {
    const world = createWorld(seed);
    for (let depth = 1; depth <= 4; depth++) {
      floorAt(world, depth).mobs = [];
      floorAt(world, depth).respawn = 1e9;
    }
    addHero(world, { id: 'p', name: 'P', heroClass });
    const hero = heroById(world, 'p')!;
    Object.assign(hero, { str: 20, attackSkill: 100000 });
    if (kind) hero.items = [createItem(kind, 5)];
    const map = levelAt(world, 1);
    for (const dir of [1, -1, WIDTH, -WIDTH]) {
      const line = [1, 2].map((k) => hero.pos + dir * k);
      if (!line.every((c) => canEnter(map, c) && map.map[c] !== T.DOOR && !charAt(world, 1, c))) continue;
      const rat = createMob('#rat', 'rat', line[1]!, 'hunting', floorAt(world, 1).now);
      Object.assign(rat, { enemy: 'p', target: hero.pos, hp: 1, ht: 1 });
      floorAt(world, 1).mobs.push(rat);
      return { world, rat };
    }
  }
  throw new Error('no open line');
}

/** The view as it stood before the action, then the action's effects shown; how many kill effects are playing a moment later. */
function played(world: World, run: () => Effect[], now = 1000): number {
  const view = new View(assets);
  view.reset(1);
  view.sync(world, now, 'p');
  const effects = run();
  view.apply(effects, world, 'p', now);
  // Long enough for any bolt to have landed, short enough that the effect is still on.
  const quads = view.wearFx.collect({ any: true, kill: ART }, null, now + 200);
  return quads.quads.slice(0, quads.count).filter((quad) => quad.kind === 'kill').length;
}

const doing = (world: World, action: Parameters<typeof act>[2]) => (): Effect[] => {
  const result = act(world, 'p', action);
  if (!result.ok) throw new Error(result.reason);
  return result.effects;
};

describe('the kill effect', () => {
  it('plays for a blow of mine that kills', () => {
    const { world, rat } = arena();
    const hero = heroById(world, 'p')!;
    // Next to the foe.
    rat.pos = hero.pos + (rat.pos - hero.pos) / 2;
    expect(played(world, doing(world, { type: 'attack', target: rat.id }))).toBe(1);
  });

  it('plays for a wand’s bolt that kills', () => {
    const { world, rat } = arena('wand.magicMissile', 'mage');
    expect(played(world, doing(world, { type: 'zap', item: 0, target: rat.pos }))).toBe(1);
  });

  it('plays for a thrown weapon that kills, after it has landed', () => {
    const { world, rat } = arena('missile.dart', 'huntress');
    const effects = doing(world, { type: 'throw', item: 0, target: rat.pos });
    const view = new View(assets);
    view.reset(1);
    view.sync(world, 1000, 'p');
    view.apply(effects(), world, 'p', 1000);
    const at = (now: number): number => {
      const quads = view.wearFx.collect({ any: true, kill: ART }, null, now);
      return quads.quads.slice(0, quads.count).filter((quad) => quad.kind === 'kill').length;
    };
    // Waiting for the dart (it is two cells away, 90 ms at least), then playing, then done.
    expect(at(1020)).toBe(0);
    expect(at(1300)).toBe(1);
    expect(at(1000 + 90 + 6 * 80 + 100)).toBe(0);
  });

  it('plays for no foe that fire, poison or bleeding kills: the core names nobody', () => {
    for (const condition of ['burning', 'poison', 'bleeding'] as const) {
      const { world, rat } = arena();
      Object.assign(rat, { [condition]: 5 });
      const effects = doing(world, { type: 'wait' })();
      expect(effects.some((effect) => effect.type === 'died' && effect.who === rat.id), condition).toBe(true);
      expect(effects.find((effect) => effect.type === 'died' && effect.who === rat.id), condition).not.toHaveProperty('by');
      const { world: again, rat: other } = arena();
      Object.assign(other, { [condition]: 5 });
      expect(played(again, doing(again, { type: 'wait' })), condition).toBe(0);
    }
  });

  it('plays for no kill that is another hero’s, a monster’s or an ally’s', () => {
    const { world, rat } = arena();
    const died = (by?: string): Effect[] => [{ type: 'died', depth: 1, who: rat.id, pos: rat.pos, kind: 'rat', ...(by ? { by } : {}) }];
    expect(played(world, () => died('someone-else'))).toBe(0);
    expect(played(world, () => died())).toBe(0);
    expect(played(world, () => died('p'))).toBe(1);
  });

  it('plays nowhere but on the floor I am on', () => {
    const { world, rat } = arena();
    expect(played(world, () => [{ type: 'died', depth: 2, who: rat.id, pos: rat.pos, kind: 'rat', by: 'p' }])).toBe(0);
  });
});
