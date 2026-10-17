import { addHero, createItem, createWorld, type Effect, floorAt, type Hero, heroById, levelAt, type World } from '@pd/core';
import { describe, expect, it } from 'vitest';
import {
  arrives, cycleMark, emptyMem, GROW_PREFIX, Grow, GrowStore, itemKey, lookKey, remember, remembersHit, seeLook, sees, writeNote,
} from '../src/growmem';
import { evictable, putWithRoom, setEvictContext } from '../src/savestore';
import { MemStorage } from './savekit';

/*
 * What the client remembers of a run (growmem.ts): the effects of the core go in, and what the player's screens ask comes out. The
 * store is small, written beside the run and never in its way: the quota lets other runs' records go first.
 */

function setup(seed = 3): { world: World; hero: Hero } {
  const world = createWorld(seed);
  floorAt(world, 1).mobs = [];
  levelAt(world, 1);
  addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
  return { world, hero: heroById(world, 'p')! };
}

const at = { depth: 2, turn: 40 };

describe('growmem: what the effects leave in the memory', () => {
  it('marks a stackable kind as new once, and gear every time', () => {
    const { world } = setup();
    const mem = emptyMem();
    const potion = createItem('potion.healing');
    remember(mem, world, { type: 'pickedUp', hero: 'p', item: potion }, 'p', at);
    expect(mem.fresh).toEqual([itemKey(world, potion)]);
    mem.fresh = [];
    remember(mem, world, { type: 'pickedUp', hero: 'p', item: createItem('potion.healing') }, 'p', at);
    expect(mem.fresh).toEqual([]);            // a second of a kind already held is no news
    remember(mem, world, { type: 'pickedUp', hero: 'p', item: createItem('weapon.sword') }, 'p', at);
    remember(mem, world, { type: 'pickedUp', hero: 'p', item: createItem('weapon.sword') }, 'p', at);
    expect(mem.fresh).toEqual(['weapon.sword']);   // (the same key: the pack shows both as new until looked at)
    remember(mem, world, { type: 'pickedUp', hero: 'q', item: createItem('weapon.mace') }, 'p', at);
    expect(mem.fresh).not.toContain('weapon.mace'); // another hero's find is not mine
  });

  it('keeps a look as «category:label», never together with its kind', () => {
    const { world } = setup();
    const mem = emptyMem();
    remember(mem, world, { type: 'pickedUp', hero: 'p', item: createItem('potion.frost') }, 'p', at);
    expect(mem.looks).toEqual([lookKey(world, 'potion.frost')]);
    expect(mem.looks[0]).toMatch(/^potion:\d+$/);
    expect(JSON.stringify(mem)).not.toContain('potion.frost');
    expect(seeLook(mem, world, 'potion.frost')).toBe(false);       // already met
    expect(seeLook(mem, world, 'weapon.sword')).toBe(false);        // a weapon has no look to meet
  });

  it('counts uses by look, and monsters slain and the hardest blow taken', () => {
    const { world } = setup();
    const mem = emptyMem();
    remember(mem, world, { type: 'used', hero: 'p', kind: 'potion.healing', identified: true }, 'p', at);
    remember(mem, world, { type: 'used', hero: 'p', kind: 'potion.healing', identified: false }, 'p', at);
    expect(mem.uses[lookKey(world, 'potion.healing')!]).toBe(2);
    remember(mem, world, { type: 'died', depth: 2, who: '#1', pos: 5, kind: 'rat', by: 'p' }, 'p', at);
    remember(mem, world, { type: 'died', depth: 2, who: '#2', pos: 6, kind: 'rat', by: 'someone' }, 'p', at);
    expect(mem.beasts.rat).toEqual({ first: 2, kills: 1, hit: 0 });
    expect(remembersHit(mem, 'rat', 4, 2)).toBe(true);
    expect(remembersHit(mem, 'rat', 3, 2)).toBe(false);
    expect(remembersHit(mem, 'ghost', 9, 2)).toBe(false);           // not a foe
    expect(mem.beasts.rat!.hit).toBe(4);
  });

  it('writes the chronicle from the effects, and a descent once per new depth', () => {
    const { world, hero } = setup();
    const mem = emptyMem();
    const up: Effect = { type: 'levelUp', hero: 'p', lvl: 2 };
    expect(remember(mem, world, up, 'p', at)).toMatchObject({ kind: 'level', value: 2 });
    expect(mem.chronicle).toHaveLength(1);
    hero.depth = 3;
    expect(arrives(mem, hero, 100)).toBe(true);
    expect(arrives(mem, hero, 120)).toBe(false);
    expect(mem.depths).toEqual([{ depth: 3, lvl: hero.lvl, ht: hero.ht, str: hero.str }]);
    expect(mem.chronicle.filter((e) => e.kind === 'depth')).toHaveLength(1);
  });

  it('meets monsters and things only where the hero can see', () => {
    const { world, hero } = setup();
    const floor = floorAt(world, 1);
    const level = levelAt(world, 1);
    floor.mobs = [{ ...({} as never), id: '#1', kind: 'rat', pos: level.entrance + 1, hp: 8, ht: 8, state: 'wandering' } as never];
    floor.heaps = [{ pos: level.entrance + 2, kind: 'heap', items: [createItem('potion.frost')] }, { pos: level.entrance + 3, kind: 'chest', items: [createItem('potion.toxicGas')] }];
    const mem = emptyMem();
    const seen = new Array<boolean>(level.map.length).fill(false);
    expect(sees(mem, world, hero, seen)).toBe(false);
    seen[level.entrance + 1] = seen[level.entrance + 2] = seen[level.entrance + 3] = true;
    expect(sees(mem, world, hero, seen)).toBe(true);
    expect(mem.beasts.rat?.first).toBe(1);
    expect(mem.looks).toEqual([lookKey(world, 'potion.frost')]);   // what lies in a closed chest is not seen
  });

  it('keeps notes short and takes a cleared one away; ticks cycle through their marks', () => {
    const mem = emptyMem();
    expect(writeNote(mem, 'potion:3', '  healing?   maybe  ')).toBe('healing? maybe');
    expect(writeNote(mem, 'potion:3', 'x'.repeat(200))).toHaveLength(80);
    writeNote(mem, 'potion:3', '   ');
    expect(mem.notes['potion:3']).toBeUndefined();
    expect([1, 2, 3, 4].map(() => cycleMark(mem, 'potion:3', 'potion.healing'))).toEqual(['tick', 'x', 'q', null]);
  });
});

describe('growmem: the store', () => {
  it('writes and reads a record per run, and drops the older runs beyond two', () => {
    const storage = new MemStorage();
    const store = new GrowStore(storage);
    const mem = emptyMem();
    mem.notes['potion:1'] = 'a';
    expect(store.save('1:a', mem)).toBe(true);
    expect(store.load('1:a').notes).toEqual({ 'potion:1': 'a' });
    expect(store.load('9:z').notes).toEqual({});
    storage.setItem(`${GROW_PREFIX}2:b`, JSON.stringify({ ...emptyMem(), at: 5 }));
    storage.setItem(`${GROW_PREFIX}3:c`, JSON.stringify({ ...emptyMem(), at: 6 }));
    store.prune('3:c');
    expect([...storage.data.keys()].sort()).toEqual([`${GROW_PREFIX}1:a`, `${GROW_PREFIX}3:c`].sort().filter((k) => storage.data.has(k)));
    expect(storage.data.size).toBe(2);
  });

  it('survives a storage that is full or broken: it gives up in silence, and a corrupt record reads as empty', () => {
    const full = new MemStorage(10);
    expect(new GrowStore(full).save('1:a', emptyMem())).toBe(false);
    const broken = new MemStorage();
    broken.setItem(`${GROW_PREFIX}1:a`, '{not json');
    expect(new GrowStore(broken).load('1:a')).toEqual(emptyMem());
    expect(new GrowStore(null).save('1:a', emptyMem())).toBe(false);
  });

  it('is the first thing the quota lets go of for another run, and the last for this one; the game save wins the room', () => {
    const storage = new MemStorage(6000);
    const other = `${GROW_PREFIX}1:old`;
    const mine = `${GROW_PREFIX}2:now`;
    storage.setItem(other, 'o'.repeat(1500));
    storage.setItem(mine, 'm'.repeat(1500));
    setEvictContext(() => ({ run: '2:now', depth: 3 }));
    expect(evictable(storage)).toEqual([other, mine]);
    // A saved run that needs room: the other run's note goes, then (only if it must) this one's.
    expect(putWithRoom(storage, 'pd-solo', 's'.repeat(4000))).toBe(true);
    expect(storage.data.has(other)).toBe(false);
    expect(storage.data.get('pd-solo')).toHaveLength(4000);
    expect(putWithRoom(storage, 'pd-solo~2', 's'.repeat(1800))).toBe(true);
    expect(storage.data.has(mine)).toBe(false);
    setEvictContext(() => null);
  });

  it('a Grow bound to a fresh run forgets a stale record, and flushes what changed', () => {
    const storage = new MemStorage();
    const store = new GrowStore(storage);
    const stale = emptyMem();
    stale.notes.x = 'stale';
    store.save('1:a', stale);
    const grow = new Grow();
    grow.setStore(store);
    grow.bind('1:a', true);
    expect(grow.data.notes).toEqual({});
    grow.setNote('potion:2', 'maybe');
    grow.flush();
    const again = new Grow();
    again.setStore(store);
    again.bind('1:a', false);
    expect(again.data.notes).toEqual({ 'potion:2': 'maybe' });
  });
});
