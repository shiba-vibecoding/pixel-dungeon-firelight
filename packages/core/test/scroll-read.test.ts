import { describe, expect, it } from 'vitest';
import {
  act, type Action, addHero, canEnter, charAt, createItem, createMob, createWorld, type Effect, fingerprint, floorAt, type Hero, heroById,
  isIdentified, type ItemKind, levelAt, NEIGHBOURS8, scrollTargets, type World,
} from '../src/index';
import { pacify } from './helpers';

/*
 * InventoryScroll.doRead: a scroll of upgrade, enchantment or identify the party does not know is read at once (and learned), and the
 * item it is read on is chosen after; giving it up wastes the scroll (and the reading's time).
 */

type Targeted = 'scroll.upgrade' | 'scroll.enchantment' | 'scroll.identify';
const KINDS: readonly Targeted[] = ['scroll.upgrade', 'scroll.enchantment', 'scroll.identify'];

/** A warrior with some of the scroll first in the pack (the party does not know it) and a few things to read it on. */
function reader(scroll: ItemKind, count = 2): { world: World; hero: Hero } {
  const world = pacify(createWorld(8));
  const hero = addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  hero.items.unshift(createItem(scroll, count));
  hero.items.push(createItem('potion.frost'), createItem('armor.scale'));
  world.known = world.known.filter((kind) => kind !== scroll && kind !== 'potion.frost');
  return { world, hero };
}

const ok = (world: World, action: Action): Effect[] => {
  const result = act(world, 'p', action);
  if (!result.ok) throw new Error(`${JSON.stringify(action)} refused: ${result.reason}`);
  return result.effects;
};

/** What the scroll is read on, and the effect that shows it was. */
const ON: Record<Targeted, { pick: (hero: Hero) => number | 'armor' | 'weapon'; effect: Effect['type'] }> = {
  'scroll.upgrade': { pick: () => 'armor', effect: 'upgraded' },
  'scroll.enchantment': { pick: () => 'weapon', effect: 'imbued' },
  'scroll.identify': { pick: (hero) => hero.items.findIndex((item) => item.kind === 'potion.frost'), effect: 'revealed' },
};

describe.each(KINDS)('an unknown %s read', (kind) => {
  it('is learned at once and spends no time; the item is chosen after, and then the reading takes its time', () => {
    const { world, hero } = reader(kind);
    const time = hero.time;
    const effects = ok(world, { type: 'use', item: 0 });
    expect(effects).toContainEqual({ type: 'used', hero: 'p', kind, identified: true });
    expect(world.known).toContain(kind);
    expect(hero.time).toBe(time);
    expect(hero.items[0]).toMatchObject({ kind, qty: 1 });
    expect(hero.pendingScroll).toMatchObject({ kind, item: { kind, qty: 1 } });
    expect(effects.some((e) => e.type === ON[kind].effect)).toBe(false);
    // The player can ask what it may be read on, as for a known scroll.
    expect(scrollTargets(world, hero, kind).length).toBeGreaterThan(0);

    const done = ok(world, { type: 'scrollTarget', on: ON[kind].pick(hero) });
    expect(done.some((e) => e.type === ON[kind].effect)).toBe(true);
    expect(hero.pendingScroll).toBeUndefined();
    expect(hero.time).toBe(time + 1);
    if (kind === 'scroll.upgrade') expect(hero.armor!.level).toBe(1);
    if (kind === 'scroll.enchantment') expect(hero.weapon!.enchant).toBeDefined();
    if (kind === 'scroll.identify') expect(world.known).toContain('potion.frost');
    // The spare scroll is known and waits in the pack.
    expect(hero.items[0]).toMatchObject({ kind, qty: 1 });
  });

  it('is wasted when given up: the scroll is gone, the reading takes its time, nothing is changed', () => {
    const { world, hero } = reader(kind);
    const time = hero.time;
    ok(world, { type: 'use', item: 0 });
    const before = JSON.stringify([hero.armor, hero.weapon, hero.items.slice(1)]);
    const effects = ok(world, { type: 'scrollCancel' });
    expect(effects).toContainEqual({ type: 'scrollWasted', hero: 'p', kind });
    expect(hero.pendingScroll).toBeUndefined();
    expect(hero.time).toBe(time + 1);
    expect(hero.items[0]).toMatchObject({ kind, qty: 1 });
    expect(JSON.stringify([hero.armor, hero.weapon, hero.items.slice(1)])).toBe(before);
    expect(world.known).toContain(kind);
    // Nothing is pending any more.
    expect(act(world, 'p', { type: 'scrollCancel' })).toEqual({ ok: false, reason: 'you are not reading a scroll' });
    expect(ok(world, { type: 'wait' })).toBeDefined();
  });

  it('can be answered after a «no» (the client asks again, the core never moved) and then a choice', () => {
    const { world, hero } = reader(kind);
    ok(world, { type: 'use', item: 0 });
    const mid = fingerprint(world);
    // «No»: the client only opens the selector again, and the hero is still choosing.
    expect(hero.pendingScroll).toBeDefined();
    expect(fingerprint(world)).toBe(mid);
    ok(world, { type: 'scrollTarget', on: ON[kind].pick(hero) });
    expect(hero.pendingScroll).toBeUndefined();
  });

  it('refuses every other action while the item is awaited, changing nothing, even beside a monster', () => {
    const { world, hero } = reader(kind);
    const level = levelAt(world, 1);
    const floor = floorAt(world, 1);
    const pos = NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, 1, c))!;
    const rat = createMob('#rat', 'rat', pos, 'hunting', floor.now);
    Object.assign(rat, { enemy: hero.id, target: hero.pos });
    floor.mobs.push(rat);
    const rats = JSON.stringify(rat);

    ok(world, { type: 'use', item: 0 });
    // Reading took no time: the rat has not had a turn.
    expect(JSON.stringify(rat)).toBe(rats);
    const mid = fingerprint(world);
    const others: Action[] = [
      { type: 'wait' }, { type: 'search' }, { type: 'attack', target: rat.id }, { type: 'move', to: hero.pos + 1 }, { type: 'descend' },
      { type: 'pickup' }, { type: 'use', item: 0 }, { type: 'use', item: 1 }, { type: 'drop', item: 0 }, { type: 'equip', item: 2 },
      { type: 'throw', item: 1, target: hero.pos + 1 }, { type: 'plan', steps: [{ type: 'rest' }] }, { type: 'unequip' },
    ];
    for (const action of others) {
      expect(act(world, 'p', action), JSON.stringify(action)).toEqual({ ok: false, reason: 'choose what to read the scroll on' });
      expect(fingerprint(world)).toBe(mid);
    }
    expect(JSON.stringify(rat)).toBe(rats);
    // A choice the scroll cannot act on is refused too, and it is still pending.
    expect(act(world, 'p', { type: 'scrollTarget', on: hero.items.findIndex((item) => item.kind === kind) }).ok).toBe(false);
    expect(act(world, 'p', { type: 'scrollTarget', on: 99 })).toEqual({ ok: false, reason: 'no such item' });
    expect(act(world, 'p', { type: 'scrollTarget', on: 'ring5' as never })).toEqual({ ok: false, reason: 'bad target' });
    expect(fingerprint(world)).toBe(mid);
    ok(world, { type: 'scrollTarget', on: ON[kind].pick(hero) });
    // Time has passed now: the rat has had its turn.
    expect(JSON.stringify(rat)).not.toBe(rats);
  });

  it('is refused as a second step when no scroll was read', () => {
    const { world, hero } = reader(kind);
    const before = fingerprint(world);
    expect(act(world, 'p', { type: 'scrollTarget', on: 'armor' })).toEqual({ ok: false, reason: 'you are not reading a scroll' });
    expect(act(world, 'p', { type: 'scrollCancel' })).toEqual({ ok: false, reason: 'you are not reading a scroll' });
    expect(fingerprint(world)).toBe(before);
    expect(hero.pendingScroll).toBeUndefined();
  });

  it('plays the same when replayed, and on a copy that went through storage in the middle of the choice', () => {
    const endings: Array<(hero: Hero) => Action> = [(hero) => ({ type: 'scrollTarget', on: ON[kind].pick(hero) }), () => ({ type: 'scrollCancel' })];
    for (const ending of endings) {
      const start = reader(kind).world;
      const log: Action[] = [];
      const straight = structuredClone(start);
      for (const next of [(): Action => ({ type: 'use', item: 0 }), () => ending(heroById(straight, 'p')!), (): Action => ({ type: 'wait' })]) {
        const action = next();
        ok(straight, action);
        log.push(action);
      }

      // The same moves on a copy of the start.
      const replayed = structuredClone(start);
      for (const action of log) ok(replayed, action);
      expect(fingerprint(replayed)).toBe(fingerprint(straight));

      // The run saved and loaded again in the middle of the choice.
      const saved = structuredClone(start);
      ok(saved, log[0]!);
      const loaded = JSON.parse(JSON.stringify(saved)) as World;
      expect(heroById(loaded, 'p')!.pendingScroll).toBeDefined();
      expect(fingerprint(loaded)).toBe(fingerprint(saved));
      for (const action of log.slice(1)) ok(loaded, action);
      expect(fingerprint(loaded)).toBe(fingerprint(straight));
    }
  });
});

describe('reading unknown scrolls of choice', () => {
  it('lets the last scroll of a stack go from the pack, and the choice come from the pack as it is then', () => {
    const { world, hero } = reader('scroll.identify', 1);
    ok(world, { type: 'use', item: 0 });
    expect(hero.items.some((item) => item.kind === 'scroll.identify')).toBe(false);
    // The pack moved up one: slots are those of the pack without the scroll.
    const potion = hero.items.findIndex((item) => item.kind === 'potion.frost');
    expect(scrollTargets(world, hero, 'scroll.identify')).toContain(potion);
    ok(world, { type: 'scrollTarget', on: potion });
    expect(isIdentified(world, hero.items[potion]!)).toBe(true);
  });

  it('can only be given up when there is nothing to read it on', () => {
    const { world, hero } = reader('scroll.identify', 1);
    hero.items = hero.items.filter((item) => item.kind === 'scroll.identify');
    for (const item of [hero.weapon, hero.armor, ...hero.rings]) if (item) Object.assign(item, { levelUnknown: undefined, curseUnknown: undefined });
    ok(world, { type: 'use', item: 0 });
    expect(scrollTargets(world, hero, 'scroll.identify')).toEqual([]);
    expect(act(world, 'p', { type: 'scrollTarget', on: 'armor' }).ok).toBe(false);
    ok(world, { type: 'scrollCancel' });
    expect(hero.pendingScroll).toBeUndefined();
  });

  it('leaves other scrolls to be read at once, and a known targeted one to be asked about first', () => {
    const { world, hero } = reader('scroll.mapping');
    ok(world, { type: 'use', item: 0 });
    expect(hero.pendingScroll).toBeUndefined();
    const known = reader('scroll.upgrade');
    known.world.known.push('scroll.upgrade');
    ok(known.world, { type: 'use', item: 0, on: 'armor' });
    expect(known.hero.pendingScroll).toBeUndefined();
    expect(known.hero.armor!.level).toBe(1);
  });

  it('is learned by the party: the next scroll of the kind is a known one', () => {
    const { world, hero } = reader('scroll.upgrade', 3);
    ok(world, { type: 'use', item: 0 });
    ok(world, { type: 'scrollCancel' });
    ok(world, { type: 'use', item: 0, on: 'armor' });
    expect(hero.pendingScroll).toBeUndefined();
    expect(hero.armor!.level).toBe(1);
  });
});
