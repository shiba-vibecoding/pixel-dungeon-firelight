import { describe, expect, it } from 'vitest';
import {
  act, addHero, canEnter, charAt, createMob, createWorld, F, floorAt, hasFlag, heroById, isSafe, levelAt, NEIGHBOURS8,
  type World,
} from '../src/index';

/** A run whose sad ghost has appeared, with a warrior standing next to it. */
function withGhost(): { world: World; ghostId: string } {
  for (let seed = 1; seed < 200; seed++) {
    const world = createWorld(seed);
    for (let depth = 1; depth <= 4; depth++) levelAt(world, depth);
    const quest = world.quest;
    if (!quest) continue;
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
    expect(result.ok && result.effects).toEqual([{ type: 'ghost', hero: 'p', line: 'intro' }]);
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
    expect(reward.ok && reward.effects.at(-1)).toEqual({ type: 'ghost', hero: 'p', line: 'farewell' });
    expect(hero.items.some((i) => i.kind === quest.armor.kind && i.level === quest.armor.level)).toBe(true);
    expect(hero.items.some((i) => i.kind === 'quest.rose')).toBe(false);
    expect(floor.mobs.some((m) => m.kind === 'ghost')).toBe(false);
    expect(quest.done).toBe(true);
  });
});
