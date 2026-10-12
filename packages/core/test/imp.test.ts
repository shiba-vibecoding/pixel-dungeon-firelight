import { describe, expect, it } from 'vitest';
import {
  act, addHero, canEnter, charAt, createItem, createMob, createWorld, floorAt, heroById, levelAt, NEIGHBOURS8, type World,
} from '../src/index';

/** A run in which the ambitious imp has turned up, with a solo hero standing next to him. */
function withImp(): { world: World; depth: number } {
  for (let seed = 1; seed < 200; seed++) {
    const world = createWorld(seed * 17);
    levelAt(world, 19);
    if (!world.impQuest) continue;
    const depth = world.impQuest.depth;
    const imp = floorAt(world, depth).mobs.find((mob) => mob.kind === 'imp')!;
    const level = levelAt(world, depth);
    const beside = NEIGHBOURS8.map((n) => imp.pos + n).find((c) => canEnter(level, c) && !charAt(world, depth, c))!;
    addHero(world, { id: 'p', name: 'P', heroClass: 'rogue' });
    const hero = heroById(world, 'p')!;
    Object.assign(hero, { depth, pos: beside, time: floorAt(world, depth).now, hp: 5000, ht: 5000, attackSkill: 5000 });
    for (const mob of floorAt(world, depth).mobs) if (mob.kind !== 'imp') mob.state = 'passive';
    return { world, depth };
  }
  throw new Error('no imp in 200 runs');
}

describe('the ambitious imp', () => {
  it('turns up once on depths 17-19 and asks for monks or golems to be slain', () => {
    const { world, depth } = withImp();
    expect(depth).toBeGreaterThanOrEqual(17);
    expect(depth).toBeLessThanOrEqual(19);
    const imp = floorAt(world, depth).mobs.find((mob) => mob.kind === 'imp')!;
    const result = act(world, 'p', { type: 'attack', target: imp.id });
    expect(result.ok && result.effects).toContainEqual({ type: 'imp', hero: 'p', line: 'intro' });
    expect(world.impQuest!.given).toBe(true);
    // Not yet: no tokens.
    expect(act(world, 'p', { type: 'impReward' })).toEqual({ ok: false, reason: 'nothing to give' });
  });

  it('each of his targets slain leaves a token; enough of them buy his ring', () => {
    const { world, depth } = withImp();
    const quest = world.impQuest!;
    const hero = heroById(world, 'p')!;
    const imp = floorAt(world, depth).mobs.find((mob) => mob.kind === 'imp')!;
    act(world, 'p', { type: 'attack', target: imp.id });
    // A target right next to the hero, struck down at once.
    const level = levelAt(world, depth);
    const pos = NEIGHBOURS8.map((n) => hero.pos + n).find((c) => canEnter(level, c) && !charAt(world, depth, c))!;
    const prey = createMob('#prey', quest.prey, pos, 'hunting', floorAt(world, depth).now);
    Object.assign(prey, { hp: 1, enemy: 'p', target: hero.pos });
    floorAt(world, depth).mobs.push(prey);
    act(world, 'p', { type: 'attack', target: prey.id });
    expect(floorAt(world, depth).heaps.some((heap) => heap.pos === pos && heap.items.some((i) => i.kind === 'quest.token'))).toBe(true);
    hero.items.push(createItem('quest.token', quest.prey === 'monk' ? 8 : 6));
    const talk = act(world, 'p', { type: 'attack', target: imp.id });
    expect(talk.ok && talk.effects).toContainEqual({ type: 'imp', hero: 'p', line: 'reward' });
    const reward = act(world, 'p', { type: 'impReward' });
    expect(reward.ok).toBe(true);
    expect(hero.items.some((item) => item.kind === quest.reward.kind && item.level >= 2)).toBe(true);
    expect(hero.items.some((item) => item.kind === 'quest.token')).toBe(false);
    expect(floorAt(world, depth).mobs.some((mob) => mob.kind === 'imp')).toBe(false);
    expect(world.known).toContain(quest.reward.kind);
  });
});
