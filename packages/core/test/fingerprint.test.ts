import { describe, expect, it } from 'vitest';
import { act, type Action, addHero, createItem, createWorld, fingerprint, ITEMS, type ItemKind, itemDef, levelAt } from '../src/index';

/*
 * Found by the soak (server/test/soak.test.ts): a copy of a run and its replay must hash alike whatever one of them did
 * to the lazily made containers of the world (`hero.plan ??= []`), and a refused action, which is never sent to the
 * server, must leave no trace the fingerprint could see.
 */

describe('the fingerprint', () => {
  it('takes an empty container for none at all, and a missing key for an undefined one', () => {
    const world = createWorld(5);
    const hero = addHero(world, { id: 'me', name: 'Me', heroClass: 'warrior' });
    delete hero.plan;
    const bare = fingerprint(world);
    hero.plan = [];
    expect(fingerprint(world)).toBe(bare);
    (hero as unknown as Record<string, unknown>).wounds = {};
    expect(fingerprint(world)).toBe(bare);
    (hero as unknown as Record<string, unknown>).wound = undefined;
    expect(fingerprint(world)).toBe(bare);
    // A container with something in it is state.
    hero.plan = [{ type: 'go', to: hero.pos + 1 }];
    expect(fingerprint(world)).not.toBe(bare);
  });

  it('still sees a changed hero, a changed list and a changed level', () => {
    const world = createWorld(5);
    const hero = addHero(world, { id: 'me', name: 'Me', heroClass: 'mage' });
    const before = fingerprint(world);
    hero.hp -= 1;
    const hurt = fingerprint(world);
    expect(hurt).not.toBe(before);
    hero.items.pop();
    expect(fingerprint(world)).not.toBe(hurt);
    const level = levelAt(world, 1);
    const cell = level.map[level.entrance + 1]!;
    level.map[level.entrance + 1] = cell === 1 ? 2 : 1;
    expect(fingerprint(world)).not.toBe(hurt);
  });

  it('is unmoved by an action the world refuses, whatever the class', () => {
    let refused = 0;
    for (const heroClass of ['warrior', 'mage', 'rogue', 'huntress'] as const) {
      const world = createWorld(11);
      const hero = addHero(world, { id: 'me', name: 'Me', heroClass });
      // One of nearly everything in the pack (scrolls and potions that want something chosen are refused without it).
      hero.items = (Object.keys(ITEMS) as ItemKind[])
        .filter((kind) => ['scroll', 'potion', 'seed', 'wand', 'ring'].includes(itemDef(kind).category))
        .map((kind) => createItem(kind));
      delete hero.plan;
      const cell = hero.pos + 3;
      const actions: Action[] = [
        { type: 'ascend' }, { type: 'impReward' }, { type: 'reward', choice: 'weapon' }, { type: 'wandReward', choice: 'battle' }, { type: 'faceCurse' },
        { type: 'special' }, { type: 'unequip' }, { type: 'mine' }, { type: 'buy' }, { type: 'jump', to: cell },
      ];
      for (let item = 0; item < hero.items.length + 2; item++) {
        actions.push(
          { type: 'use', item, on: 1, target: 'armor' }, { type: 'use', item, on: 99 }, { type: 'zap', item, target: cell }, { type: 'throw', item, target: cell },
          { type: 'equip', item: item + 40 }, { type: 'drop', item: item + 40 }, { type: 'sell', item }, { type: 'remove', ring: item + 5 },
          { type: 'balance', item: item + 40, imbue: 'speed' }, { type: 'master', item: item + 40, subclass: 'gladiator' },
        );
      }
      for (const action of actions) {
        const before = fingerprint(world);
        if (act(world, 'me', action).ok) continue;
        refused++;
        expect(fingerprint(world), `${heroClass}: ${JSON.stringify(action)} was refused but changed the world`).toBe(before);
      }
    }
    expect(refused).toBeGreaterThan(50);
  });
});
