import { describe, expect, it } from 'vitest';
import { act, addHero, createMob, createWorld, findPath, floorAt, heroById, levelAt } from '@pd/core';
import { botAction } from '../../core/test/helpers';
import { CLASSES, makeSpec, playDevice, plainProblems, replayOnServer, soakRun } from './soak-engine';

/* A few short runs of the soak (soak.test.ts, which plays hundreds): the engine itself must keep working, and see what it is for. */

describe('the soak engine', () => {
  it('plays a short run of each class, and the server plays it again alike', () => {
    for (let id = 0; id < CLASSES.length * 2; id++) {
      const spec = { ...makeSpec(id), cap: 120 };
      const { failures, stats } = soakRun(spec);
      expect(failures.map((f) => `#${f.spec} ${f.kind}: ${f.message}`), `spec ${id}`).toEqual([]);
      expect(stats.actions).toBeGreaterThan(0);
    }
    // Eight short runs: under a full parallel suite a few seconds each.
  }, 60_000);

  // A refused action must leave the world as it was: the server never hears of it, so a change would part the copies (found in the Shattered soak).
  it('plays a chaos run, where most actions are refused, without a refusal changing the world', () => {
    const spec = { ...makeSpec(2 * CLASSES.length), cap: 150 };
    expect(spec.mode).toBe('chaos');
    expect(soakRun(spec).failures).toEqual([]);
  });

  // The soak found an item dropped in the doorway of DM-300's lair walled in with it when the rock closed (CavesBossLevel.press does the same): not a failure.
  it('lets a heap lie in the sealed doorway of the caves boss', () => {
    const spec = { ...makeSpec(664), cap: 200 };
    expect(spec.challenges).toBe(127);
    expect(soakRun(spec).failures).toEqual([]);
  });

  // Spec 507 stood among its own mirror images, waiting for them to move (they never do): a limit of the bot, found by the soak.
  it('has the bot swap places with a mirror image in its way', () => {
    const world = createWorld(5);
    addHero(world, { id: 'me', name: 'Soak', heroClass: 'warrior' });
    const hero = heroById(world, 'me')!;
    const floor = floorAt(world, 1);
    floor.mobs = [];
    const path = findPath(levelAt(world, 1), hero.pos, levelAt(world, 1).exit)!;
    const image = createMob('#900', 'mirror', path[0]!, 'passive', floor.now);
    image.image = { owner: 'me', attack: 10, damage: 1 };
    floor.mobs.push(image);
    expect(botAction(world, 'me', 26)).toEqual({ type: 'attack', target: '#900' });
    expect(act(world, 'me', { type: 'attack', target: '#900' }).ok).toBe(true);
    expect(hero.pos).toBe(path[0]);
  });

  it('tells a replay that parts from the device (a lost action) at the next sync point', () => {
    const spec = { ...makeSpec(1), cap: 200 };
    const played = playDevice(spec);
    const at = played.log.findIndex((entry, i) => i > 30 && entry.k === 'a' && entry.a.type === 'move');
    expect(at).toBeGreaterThan(0);
    const log = played.log.slice();
    log.splice(at, 1);
    const checkpoints = played.checkpoints.map((cp) => (cp.n > at ? { ...cp, n: cp.n - 1, seq: cp.seq - 1 } : cp));
    const failures = replayOnServer(spec, { ...played, log, checkpoints });
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0]!.kind).toMatch(/diverge|refused/);
  });

  it('knows a world storage would not give back as it was', () => {
    expect(plainProblems({ a: new Map(), b: [1, 2] }).join()).toContain('Map');
    expect(plainProblems({ a: NaN }).join()).toContain('NaN');
    expect(plainProblems({ a: [1, undefined] }).join()).toContain('undefined');
    expect(plainProblems({ a: new Set() }).join()).toContain('Set');
    expect(plainProblems({ a: { b: [1, 'two', null, true] } })).toEqual([]);
    const soft = { count: 0, alias: 0 };
    const shared = { x: 1 };
    expect(plainProblems({ a: shared, b: shared, c: undefined }, soft)).toEqual([]);
    expect(soft).toMatchObject({ count: 1, alias: 1 });
  });
});
