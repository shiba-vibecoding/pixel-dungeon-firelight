import type { Effect, HeroClass, MobKind } from '@pd/core';
import { describe, expect, it } from 'vitest';
import { type Conditions, type Facts, NO_CONDITIONS, type Source, sourceKey, sourcesOf } from '../src/hurtsrc';

/*
 * Where the hero's damage came from, read from the core's effects and the hero's conditions (hurtsrc.ts). The effects are made up here
 * in the order the core pushes them (world.ts, traps.ts, inventory.ts, wands.ts, enchant.ts).
 */

const ME = 'p';
const mobs: Record<string, MobKind> = { '#rat': 'rat', '#gnoll': 'gnoll', '#skeleton': 'skeleton' };

function facts(over: Partial<Facts> = {}): Facts {
  return {
    myId: ME,
    mobKind: (id) => mobs[id],
    heroClass: (id) => (id === 'q' ? ('mage' as HeroClass) : undefined),
    before: NO_CONDITIONS,
    after: NO_CONDITIONS,
    depth: 3,
    ...over,
  };
}
const under = (c: Partial<Conditions>): Conditions => ({ ...NO_CONDITIONS, ...c });

const hurt = (damage: number, who = ME): Effect => ({ type: 'hurt', depth: 3, who, damage });
const attack = (attacker: string, target: string, damage: number, hit = true): Effect => ({ type: 'attack', depth: 3, attacker, target, hit, damage });

const only = (effects: Effect[], f: Facts): Array<Source | undefined> => {
  const found = sourcesOf(effects, f);
  return effects.map((_, i) => found.get(i));
};

describe('blows', () => {
  it('a monster that hits the hero is the source, by its kind', () => {
    expect(only([attack('#rat', ME, 3)], facts())).toEqual([{ mob: 'rat' }]);
  });

  it('a miss and a blow of nothing say nothing', () => {
    expect(only([attack('#rat', ME, 0, false), attack('#rat', ME, 0)], facts())).toEqual([undefined, undefined]);
  });

  it('a monster already dead by the time the batch is read is still named, when the caller can say what it was', () => {
    const f = facts({ mobKind: (id) => (id === '#gone' ? 'gnoll' : undefined) });
    expect(only([attack('#gone', ME, 2)], f)).toEqual([{ mob: 'gnoll' }]);
  });

  it('another hero who hits is named by their class; one nothing is known of, as unknown', () => {
    expect(only([attack('q', ME, 2)], facts())).toEqual([{ hero: 'mage' }]);
    expect(only([attack('nobody', ME, 2)], facts())).toEqual([{ cause: 'unknown' }]);
  });

  it('the hero\'s own blow in hand is no wand and no missile', () => {
    expect(only([attack(ME, '#rat', 4)], facts())).toEqual([undefined]);
  });

  it('a wand\'s bolt before the damage names the wand by its bolt, a thrown weapon the weapon', () => {
    const bolt: Effect = { type: 'zapped', depth: 3, from: 10, to: 12, bolt: 'fire' };
    expect(only([bolt, attack(ME, '#rat', 6)], facts())).toEqual([undefined, { cause: 'wand', item: 'wand.firebolt' }]);
    const dart: Effect = { type: 'thrown', depth: 3, from: 10, to: 12, item: 'missile.dart' };
    expect(only([dart, attack(ME, '#rat', 2)], facts())).toEqual([undefined, { cause: 'missile', item: 'missile.dart' }]);
  });

  it('a lightning wand that leaps names each hit; a blow in hand after a bolt of another action is none', () => {
    const zap = (to: number): Effect => ({ type: 'zapped', depth: 3, from: 10, to, bolt: 'lightning' });
    const out = only([zap(12), attack(ME, '#rat', 8), zap(13), attack(ME, '#gnoll', 4)], facts());
    expect(out[1]).toEqual({ cause: 'wand', item: 'wand.lightning' });
    expect(out[3]).toEqual({ cause: 'wand', item: 'wand.lightning' });
    // The bolt belongs to the blow that follows it; a second blow with nothing between is a blow in hand.
    expect(only([zap(12), attack(ME, '#rat', 8), attack(ME, '#gnoll', 4)], facts())[2]).toBeUndefined();
  });
});

describe('what set the wound off', () => {
  it('a fall', () => {
    expect(only([{ type: 'fell', hero: ME, depth: 3, pos: 5 }, hurt(7)], facts())[1]).toEqual({ cause: 'fall' });
  });

  it('a lightning or a gripping trap under the hero; not a trap under another, nor a gas or poison one', () => {
    const trap = (kind: 'lightning' | 'gripping' | 'poison', hero = ME): Effect => ({ type: 'trap', depth: 3, pos: 5, kind, hero });
    expect(only([trap('lightning'), hurt(9)], facts())[1]).toEqual({ cause: 'trap', trap: 'lightning' });
    expect(only([trap('gripping'), hurt(5)], facts())[1]).toEqual({ cause: 'trap', trap: 'gripping' });
    expect(only([trap('lightning', 'q'), hurt(9)], facts())[1]).toEqual({ cause: 'unknown' });
    // A poison trap sets a condition: its ticks are poison.
    const poisoned = facts({ after: under({ poison: true }) });
    expect(only([trap('poison'), hurt(1)], poisoned)[1]).toEqual({ cause: 'poison' });
  });

  it('bones, a bomb, the glyph of multiplicity and a lightning bolt of the glyph of potential', () => {
    expect(only([{ type: 'bones', depth: 3, pos: 4 }, hurt(4)], facts())[1]).toEqual({ cause: 'bones' });
    expect(only([{ type: 'exploded', depth: 3, pos: 4 }, { type: 'burnt', depth: 3, pos: 5 }, hurt(8)], facts())[2]).toEqual({ cause: 'bomb' });
    expect(only([{ type: 'glyph', depth: 3, hero: ME, glyph: 'multiplicity' }, hurt(2)], facts())[1]).toEqual({ cause: 'multiplicity' });
    const out = only([{ type: 'zapped', depth: 3, from: 10, to: 11, bolt: 'lightning' }, hurt(5, '#rat'), hurt(2)], facts());
    expect(out).toEqual([undefined, undefined, { cause: 'lightning' }]);
  });

  it('a monster\'s own wound and another hero\'s are not the hero\'s story', () => {
    expect(only([hurt(5, '#rat')], facts())).toEqual([undefined]);
  });

  it('a wound a blow ends the look for: poison after a blow is poison, not the blow\'s cause', () => {
    const f = facts({ after: under({ poison: true }) });
    const out = only([{ type: 'fell', hero: ME, depth: 3, pos: 1 }, attack('#rat', ME, 3), hurt(1)], f);
    expect(out[2]).toEqual({ cause: 'poison' });
  });
});

describe('the conditions that tick', () => {
  it('a bleeding the size of the wound', () => {
    const f = facts({ before: under({ bleeding: 4 }), after: under({ bleeding: 3 }) });
    expect(only([hurt(3)], f)).toEqual([{ cause: 'bleeding' }]);
  });

  it('poison, fire, ooze and deferred blows, each alone', () => {
    expect(only([hurt(1)], facts({ before: under({ poison: true }), after: under({ poison: true }) }))).toEqual([{ cause: 'poison' }]);
    expect(only([hurt(2)], facts({ before: under({ burning: true }), after: NO_CONDITIONS }))).toEqual([{ cause: 'burning' }]);
    expect(only([hurt(1)], facts({ before: under({ ooze: true }), after: under({ ooze: true }) }))).toEqual([{ cause: 'ooze' }]);
    expect(only([hurt(1)], facts({ before: under({ deferred: true }), after: under({ deferred: true }) }))).toEqual([{ cause: 'deferred' }]);
  });

  it('a flame set by a trap in this very batch (nothing before, a fire after) is fire', () => {
    expect(only([hurt(3)], facts({ before: NO_CONDITIONS, after: under({ burning: true }) }))).toEqual([{ cause: 'burning' }]);
  });

  it('a flame never deals more than 3 + depth / 4: a big one is not fire', () => {
    const f = facts({ depth: 3, before: under({ burning: true, poison: true }), after: under({ burning: true, poison: true }) });
    expect(only([hurt(9)], f)).toEqual([{ cause: 'poison' }]);
  });

  it('two conditions in a turn are told apart in the core\'s order: poison, then bleeding, then fire', () => {
    const both = under({ poison: true, bleeding: 2, burning: true });
    const f = facts({ before: both, after: both });
    expect(only([hurt(1), hurt(2), hurt(2)], f)).toEqual([{ cause: 'poison' }, { cause: 'bleeding' }, { cause: 'burning' }]);
  });

  it('a wound of one point while poisoned and starving is the poison; with a second one, hunger came first in the turn', () => {
    const f = facts({ before: under({ poison: true, starving: true }), after: under({ poison: true, starving: true }) });
    expect(only([hurt(1)], f)).toEqual([{ cause: 'poison' }]);
    expect(only([hurt(1), hurt(1)], f)).toEqual([{ cause: 'hunger' }, { cause: 'poison' }]);
  });

  it('starving alone, a pang of hunger; standing in gas alone, gas', () => {
    expect(only([hurt(1)], facts({ after: under({ starving: true }), before: under({ starving: true }) }))).toEqual([{ cause: 'hunger' }]);
    expect(only([hurt(2)], facts({ after: under({ gas: true }), before: under({ gas: true }) }))).toEqual([{ cause: 'gas' }]);
  });

  it('gas and poison in one turn: the poison ticks first, the cloud is the extra', () => {
    const c = under({ poison: true, gas: true });
    expect(only([hurt(1), hurt(2)], facts({ before: c, after: c }))).toEqual([{ cause: 'poison' }, { cause: 'gas' }]);
  });

  it('a wound nothing explains is unknown', () => {
    expect(only([hurt(4)], facts())).toEqual([{ cause: 'unknown' }]);
  });

  it('a long step (two turns of poison) keeps the same cause', () => {
    const f = facts({ before: under({ poison: true }), after: under({ poison: true }) });
    expect(only([hurt(1), hurt(1)], f)).toEqual([{ cause: 'poison' }, { cause: 'poison' }]);
  });

  it('wounds, blows and the hero\'s bolt in one batch are each read on their own', () => {
    const f = facts({ before: under({ poison: true }), after: under({ poison: true }) });
    const out = only([attack('#gnoll', ME, 4), hurt(1), { type: 'zapped', depth: 3, from: 1, to: 2, bolt: 'magic' }, attack(ME, '#gnoll', 3)], f);
    expect(out).toEqual([{ mob: 'gnoll' }, { cause: 'poison' }, undefined, { cause: 'wand', item: 'wand.magicMissile' }]);
  });
});

describe('keys', () => {
  it('tell sources apart', () => {
    expect(new Set([{ mob: 'rat' }, { mob: 'gnoll' }, { cause: 'poison' }, { cause: 'trap', trap: 'gripping' }, { cause: 'trap', trap: 'lightning' }].map((s) => sourceKey(s as Source))).size).toBe(5);
  });
});
