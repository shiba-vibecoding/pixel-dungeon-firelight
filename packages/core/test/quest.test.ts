import { describe, expect, it } from 'vitest';
import {
  act, addHero, adjacent, canEnter, charAt, createMob, createWorld, F, floorAt, hasFlag, heroById, isSafe, levelAt, NEIGHBOURS8, RoomType,
  type World,
} from '../src/index';
import type { GhostErrand } from '../src/quest';
import { pacify } from './helpers';

/** A run whose sad ghost has appeared with the given errand, and a warrior standing next to it. */
function withGhost(errand: GhostErrand = 'rose'): { world: World; ghostId: string } {
  for (let seed = 1; seed < 200; seed++) {
    const world = createWorld(seed);
    for (let depth = 1; depth <= 4; depth++) levelAt(world, depth);
    const quest = world.quest;
    if (!quest) continue;
    quest.type = errand;
    const floor = floorAt(world, quest.depth);
    const ghost = floor.mobs.find((m) => m.kind === 'ghost')!;
    floor.mobs = [ghost];
    addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
    const hero = heroById(world, 'p')!;
    const level = levelAt(world, quest.depth);
    hero.depth = quest.depth;
    hero.pos = NEIGHBOURS8.map((n) => ghost.pos + n).find(
      (c) => canEnter(level, c) && hasFlag(level.map[c]!, F.PASSABLE) && !charAt(world, quest.depth, c),
    )!;
    return { world, ghostId: ghost.id };
  }
  throw new Error('no ghost in 200 runs');
}

describe('the sad ghost', () => {
  it('appears once per run, on depth 2 to 4, with a reward ready', () => {
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const world = createWorld(seed);
      for (let depth = 1; depth <= 4; depth++) levelAt(world, depth);
      const ghosts = [1, 2, 3, 4].flatMap((d) => floorAt(world, d).mobs.filter((m) => m.kind === 'ghost').map(() => d));
      // The original guarantees it by depth 4 unless no free cell can be found.
      expect(ghosts.length).toBeLessThanOrEqual(1);
      if (ghosts.length === 1) {
        seen++;
        expect(world.quest!.depth).toBe(ghosts[0]);
        expect(world.quest!.weapon.kind.startsWith('weapon.')).toBe(true);
        expect(world.quest!.armor.kind.startsWith('armor.')).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(30);
  });

  it('drifts about the level', () => {
    const { world, ghostId } = withGhost();
    const hero = heroById(world, 'p')!;
    const ghost = floorAt(world, hero.depth).mobs.find((m) => m.id === ghostId)!;
    const cells = new Set([ghost.pos]);
    for (let i = 0; i < 60; i++) {
      act(world, 'p', { type: 'search' });
      cells.add(ghost.pos);
    }
    expect(cells.size).toBeGreaterThan(3);
  });

  it('cannot be hurt, is no threat, and talking to it gives the quest', () => {
    const { world, ghostId } = withGhost();
    const hero = heroById(world, 'p')!;
    const ghost = floorAt(world, hero.depth).mobs.find((m) => m.id === ghostId)!;
    expect(isSafe(world, hero)).toBe(true);
    const result = act(world, 'p', { type: 'attack', target: ghostId });
    expect(result.ok && result.effects).toEqual([{ type: 'ghost', hero: 'p', line: 'intro', errand: 'rose' }]);
    expect(ghost.hp).toBe(1);
    expect(world.quest!.given).toBe(true);
    expect(act(world, 'p', { type: 'attack', target: ghostId }).ok && world.quest!.given).toBe(true);
    expect(act(world, 'p', { type: 'reward', choice: 'weapon' })).toEqual({ ok: false, reason: 'nothing to give' });
  });

  it('one of the level monsters drops the rose; the ghost trades it for the chosen reward', () => {
    const { world, ghostId } = withGhost();
    const hero = heroById(world, 'p')!;
    act(world, 'p', { type: 'attack', target: ghostId });
    const quest = world.quest!;
    const floor = floorAt(world, quest.depth);
    const level = levelAt(world, quest.depth);
    // Rats keep coming next to the hero until one of them drops the rose.
    Object.assign(hero, { attackSkill: 100, ht: 500, hp: 500 });
    for (let i = 0; i < 40 && !quest.dropped; i++) {
      const cell = NEIGHBOURS8.map((n) => hero.pos + n).find(
        (c) => canEnter(level, c) && hasFlag(level.map[c]!, F.PASSABLE) && !charAt(world, quest.depth, c),
      )!;
      const rat = createMob(`#r${i}`, 'rat', cell, 'hunting', floor.now);
      floor.mobs.push(rat);
      for (let k = 0; k < 20 && floor.mobs.includes(rat); k++) act(world, 'p', { type: 'attack', target: rat.id });
    }
    expect(quest.dropped).toBe(true);
    const rose = floor.heaps.find((h) => h.items.some((item) => item.kind === 'quest.rose'))!;
    hero.pos = rose.pos;
    expect(act(world, 'p', { type: 'pickup' }).ok).toBe(true);
    // The ghost has drifted off meanwhile: catch up with it.
    const ghost = floor.mobs.find((m) => m.id === ghostId)!;
    hero.pos = NEIGHBOURS8.map((n) => ghost.pos + n).find(
      (c) => canEnter(level, c) && hasFlag(level.map[c]!, F.PASSABLE) && !charAt(world, quest.depth, c),
    )!;
    expect(act(world, 'p', { type: 'attack', target: ghostId }).ok).toBe(true);
    const reward = act(world, 'p', { type: 'reward', choice: 'armor' });
    expect(reward.ok && reward.effects.at(-1)).toEqual({ type: 'ghost', hero: 'p', line: 'farewell', errand: 'rose' });
    expect(hero.items.some((i) => i.kind === quest.armor.kind && i.level === quest.armor.level)).toBe(true);
    expect(hero.items.some((i) => i.kind === 'quest.rose')).toBe(false);
    expect(floor.mobs.some((m) => m.kind === 'ghost')).toBe(false);
    expect(quest.done).toBe(true);
  });

  it('wants revenge on the fetid rat, which comes out at the first kill and leaves its skull', () => {
    const { world, ghostId } = withGhost('rat');
    const hero = heroById(world, 'p')!;
    act(world, 'p', { type: 'attack', target: ghostId });
    const quest = world.quest!;
    const floor = floorAt(world, quest.depth);
    const level = levelAt(world, quest.depth);
    Object.assign(hero, { attackSkill: 1000, ht: 500, hp: 500 });
    const cell = NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, quest.depth, c))!;
    const rat = createMob('#r', 'rat', cell, 'hunting', floor.now);
    floor.mobs.push(rat);
    for (let k = 0; k < 20 && floor.mobs.includes(rat); k++) act(world, 'p', { type: 'attack', target: rat.id });
    const fetid = floor.mobs.find((m) => m.kind === 'fetidRat')!;
    expect(fetid).toBeDefined();
    // Bring it over and slay it: struck, it puffs out paralytic gas, which does not hold it.
    const beside = NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, quest.depth, c))!;
    fetid.pos = beside;
    for (let k = 0; k < 40 && floor.mobs.includes(fetid); k++) {
      if (adjacent(fetid.pos, hero.pos)) act(world, 'p', { type: 'attack', target: fetid.id });
      else act(world, 'p', { type: 'wait' });
    }
    expect(floor.mobs.includes(fetid)).toBe(false);
    const skull = floor.heaps.find((h) => h.items.some((item) => item.kind === 'quest.skull'))!;
    hero.items.push(skull.items.find((item) => item.kind === 'quest.skull')!);
    const ghost = floor.mobs.find((m) => m.id === ghostId)!;
    hero.pos = NEIGHBOURS8.map((n) => ghost.pos + n).find((c) => canEnter(level, c) && !charAt(world, quest.depth, c))!;
    const talk = act(world, 'p', { type: 'attack', target: ghostId });
    expect(talk.ok && talk.effects).toEqual([{ type: 'ghost', hero: 'p', line: 'reward', errand: 'rat' }]);
    expect(act(world, 'p', { type: 'reward', choice: 'weapon' }).ok).toBe(true);
    expect(hero.items.some((i) => i.kind === 'quest.skull')).toBe(false);
  });

  it('is bound by a curse which, once the hero agrees to face it, takes shape and fights; broken, the ghost rewards', () => {
    const { world, ghostId } = withGhost('curse');
    const hero = heroById(world, 'p')!;
    const quest = world.quest!;
    const floor = floorAt(world, quest.depth);
    const intro = act(world, 'p', { type: 'attack', target: ghostId });
    expect(intro.ok && intro.effects).toEqual([{ type: 'ghost', hero: 'p', line: 'intro', errand: 'curse' }]);
    expect(quest.given).toBe(false);
    expect(act(world, 'p', { type: 'faceCurse' }).ok).toBe(true);
    const curse = floor.mobs.find((m) => m.kind === 'curse')!;
    expect(curse).toMatchObject({ ht: 10 + quest.depth * 3, enemy: 'p' });
    expect(floor.mobs.some((m) => m.kind === 'ghost')).toBe(false);
    Object.assign(hero, { attackSkill: 1000, ht: 500, hp: 500 });
    for (let k = 0; k < 200 && floor.mobs.includes(curse); k++) {
      if (adjacent(curse.pos, hero.pos)) act(world, 'p', { type: 'attack', target: curse.id });
      else act(world, 'p', { type: 'wait' });
    }
    expect(quest.freed).toBe(true);
    const ghost = floor.mobs.find((m) => m.kind === 'ghost')!;
    hero.pos = NEIGHBOURS8.map((n) => ghost.pos + n).find((c) => canEnter(levelAt(world, quest.depth), c) && !charAt(world, quest.depth, c))!;
    const talk = act(world, 'p', { type: 'attack', target: ghost.id });
    expect(talk.ok && talk.effects).toEqual([{ type: 'ghost', hero: 'p', line: 'reward', errand: 'curse' }]);
    expect(act(world, 'p', { type: 'reward', choice: 'armor' }).ok).toBe(true);
    expect(quest.done).toBe(true);
    expect(act(world, 'p', { type: 'faceCurse' })).toEqual({ ok: false, reason: 'there is no curse to face' });
  });
});

describe('the Rat King', () => {
  it("holds court in a hidden treasury beside Goo's lair, and has no time for heroes", () => {
    let kings = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const world = pacify(createWorld(seed));
      const level = levelAt(world, 5);
      const room = level.rooms.find((r) => r.type === RoomType.RAT_KING);
      const king = floorAt(world, 5).mobs.find((m) => m.kind === 'ratKing');
      expect(!!room).toBe(!!king);
      if (!king) continue;
      kings++;
      const chests = floorAt(world, 5).heaps.filter((h) => h.kind === 'chest' || h.kind === 'mimic');
      expect(chests.filter((h) => h.kind === 'mimic')).toHaveLength(1);
      addHero(world, { id: 'p', name: 'P', heroClass: 'rogue' });
      const hero = heroById(world, 'p')!;
      hero.depth = 5;
      hero.pos = NEIGHBOURS8.map((n) => king.pos + n).find((c) => canEnter(level, c) && !charAt(world, 5, c))!;
      const first = act(world, 'p', { type: 'attack', target: king.id });
      expect(first.ok && first.effects).toEqual([{ type: 'ratKing', hero: 'p', line: 'notSleeping' }]);
      const second = act(world, 'p', { type: 'attack', target: king.id });
      expect(second.ok && second.effects).toEqual([{ type: 'ratKing', hero: 'p', line: 'busy' }]);
      expect(king.hp).toBe(1);
    }
    expect(kings).toBeGreaterThan(3);
  });
});
