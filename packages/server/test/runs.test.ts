import { describe, expect, it } from 'vitest';
import { act, type Action, createItem, fingerprint, heroById, type ItemKind, type World } from '@pd/core';
import { step } from '../../core/test/runner';
import { boardsFor } from '../src/boards';
import { fromEntries, toEntries } from '../src/run-store';
import { emptyProfile, keepStreak, ME, PlayerLogic, type RunSlot, streakNow } from '../src/runs';

const TODAY = '2026-10-13';

function player(): PlayerLogic {
  return new PlayerLogic(emptyProfile('Alice'));
}

function start(logic: PlayerLogic, slot: RunSlot = 'dungeon', today = TODAY, id = 'r1') {
  return logic.start({ slot, heroClass: 'warrior', challenges: 0, name: 'Alice', seed: 7, id, now: 0, today });
}

/** A device's copy: plays `count` moves of the bot, returns them (only those taken). */
function play(world: World, count: number): Action[] {
  const taken: Action[] = [];
  for (let i = 0; i < count && !world.over; i++) {
    const action = step(world, ME);
    if (act(world, ME, action).ok) taken.push(action);
  }
  return taken;
}

/** Waits until the hero falls (hunger, or what comes for them), syncing as a device does. */
function waitToDeath(logic: PlayerLogic, slot: RunSlot, id: string, device: World) {
  for (let batch = 0; batch < 40; batch++) {
    const from = logic.runs[slot]!.seq;
    const actions: Action[] = [];
    for (let i = 0; i < 400 && !device.over; i++) {
      if (act(device, ME, { type: 'wait' }).ok) actions.push({ type: 'wait' });
    }
    const result = logic.sync(slot, id, from, actions, fingerprint(device), 1000);
    expect(result.reply.world).toBeUndefined();
    if (result.finish) return result;
  }
  throw new Error('the hero never fell');
}

describe('checked runs', () => {
  it('play on the server as on the device: the same moves, the same world', () => {
    const logic = player();
    const run = start(logic);
    const device = structuredClone(run.world);
    const moves = play(device, 60);
    const { reply } = logic.sync('dungeon', 'r1', 0, moves, fingerprint(device), 1);
    expect(reply.world).toBeUndefined();
    expect(reply.seq).toBe(moves.length);
    expect(fingerprint(logic.runs.dungeon!.world)).toBe(fingerprint(device));
  });

  it('send the server’s copy back to a device that edited its own', () => {
    const logic = player();
    const run = start(logic);
    const device = structuredClone(run.world);
    heroById(device, ME)!.ht = heroById(device, ME)!.hp = 999;
    const moves = play(device, 5);
    const { reply } = logic.sync('dungeon', 'r1', 0, moves, fingerprint(device), 1);
    expect(reply.reason).toBe('parted');
    expect(heroById(reply.world!, ME)!.ht).toBeLessThan(999);
    expect(fingerprint(reply.world!)).toBe(fingerprint(logic.runs.dungeon!.world));
  });

  it('take moves once: a batch sent again (its answer lost) only adds what is new', () => {
    const logic = player();
    const run = start(logic);
    const device = structuredClone(run.world);
    const first = play(device, 20);
    logic.sync('dungeon', 'r1', 0, first, fingerprint(device), 1);
    const second = play(device, 20);
    const { reply } = logic.sync('dungeon', 'r1', 0, [...first, ...second], fingerprint(device), 2);
    expect(reply.world).toBeUndefined();
    expect(reply.seq).toBe(first.length + second.length);
  });

  it('never let a device go back: moves from before what the server took send its copy', () => {
    const logic = player();
    const run = start(logic);
    const device = structuredClone(run.world);
    const before = structuredClone(device);
    const moves = play(device, 30);
    logic.sync('dungeon', 'r1', 0, moves, fingerprint(device), 1);
    // The device reloads an older save and plays it otherwise.
    const other = play(before, 3);
    const { reply } = logic.sync('dungeon', 'r1', 0, other.slice(0, 1), fingerprint(before), 2);
    expect(reply.world).toBeDefined();
    expect(reply.seq).toBe(moves.length);
  });

  it('score a run once it ends, keep the history, leave bones for the next ordinary run', () => {
    const logic = player();
    const run = start(logic);
    const device = structuredClone(run.world);
    const { finish } = waitToDeath(logic, 'dungeon', 'r1', device);
    expect(finish!.summary.mode).toBe('dungeon');
    expect(finish!.summary.ranked).toBe(true);
    expect(logic.profile.best).toBe(finish!.summary.score);
    expect(logic.profile.history).toHaveLength(1);
    expect(logic.profile.bones).not.toBeNull();
    expect(boardsFor(finish!.summary)).toEqual(['week', 'all']);
    // The bones go to the next ordinary run, and are gone from the profile.
    const next = start(logic, 'dungeon', TODAY, 'r2');
    expect(next.world.bones).toBeDefined();
    expect(logic.profile.bones).toBeNull();
  });

  it('count one daily dungeon a day: asked again it goes on; once over, another is practice', () => {
    const logic = player();
    const first = start(logic, 'daily');
    expect(first.ranked).toBe(true);
    expect(logic.profile.streak.count).toBe(1);
    expect(start(logic, 'daily', TODAY, 'r2').id).toBe(first.id);
    const { finish } = waitToDeath(logic, 'daily', first.id, structuredClone(first.world));
    expect(boardsFor(finish!.summary)).toEqual(['daily', 'week', 'all']);
    const practice = start(logic, 'daily', TODAY, 'r3');
    expect(practice.ranked).toBe(false);
    expect(practice.world.run.seed).toBe(first.world.run.seed);
    // Tomorrow's counts again, and keeps the streak going.
    expect(start(logic, 'daily', '2026-10-14', 'r4').ranked).toBe(true);
    expect(logic.profile.streak.count).toBe(2);
  });

  it('keep a streak over a missed day only with a freeze', () => {
    let streak = { last: null as string | null, count: 0, best: 0, freezes: 0 };
    for (let d = 1; d <= 7; d++) streak = keepStreak(streak, `2026-10-0${d}`);
    expect(streak).toMatchObject({ count: 7, freezes: 1 });
    // A day missed: the freeze covers it.
    streak = keepStreak(streak, '2026-10-09');
    expect(streak).toMatchObject({ count: 8, freezes: 0 });
    expect(streakNow(streak, '2026-10-11').count).toBe(0);
    streak = keepStreak(streak, '2026-10-11');
    expect(streak).toMatchObject({ count: 1, best: 8 });
  });

  it('keep a player in storage and bring them back whole', () => {
    const logic = player();
    const run = start(logic);
    const device = structuredClone(run.world);
    logic.sync('dungeon', 'r1', 0, play(device, 40), fingerprint(device), 1);
    const entries = new Map(Object.entries(toEntries(logic.profile, logic.runs)));
    const back = fromEntries(entries);
    expect(fingerprint(back.runs.dungeon!.world)).toBe(fingerprint(device));
    expect(back.profile).toEqual(logic.profile);
  });

  // An unknown scroll of upgrade, enchantment or identify is read in two steps (Hero.pendingScroll): the read, then the item or the scroll given up.
  describe.each<[ItemKind, Action]>([
    ['scroll.upgrade', { type: 'scrollTarget', on: 'armor' }],
    ['scroll.enchantment', { type: 'scrollTarget', on: 'weapon' }],
    ['scroll.identify', { type: 'scrollTarget', on: 'armor' }],
    ['scroll.upgrade', { type: 'scrollCancel' }],
  ])('an unknown %s, read on a checked run, then %j', (kind, second) => {
    /** The run with the scroll in the pack of both copies. */
    function withScroll() {
      const logic = player();
      const run = start(logic);
      for (const world of [run.world]) {
        const hero = heroById(world, ME)!;
        hero.items.unshift(createItem(kind, 2));
        world.known = world.known.filter((known) => known !== kind);
        // (The armour is not known, for identify to have something to tell.)
        Object.assign(hero.armor!, { levelUnknown: true, curseUnknown: true });
      }
      return { logic, device: structuredClone(run.world) };
    }

    it('is played by the server alike, with the batch ending where the choice is waited for', () => {
      const { logic, device } = withScroll();
      const first: Action = { type: 'use', item: 0 };
      expect(act(device, ME, first).ok).toBe(true);
      expect(heroById(device, ME)!.pendingScroll).toBeDefined();
      let { reply } = logic.sync('dungeon', 'r1', 0, [first], fingerprint(device), 1);
      expect(reply.world).toBeUndefined();
      expect(reply.seq).toBe(1);
      expect(heroById(logic.runs.dungeon!.world, ME)!.pendingScroll).toMatchObject({ kind });

      // The player is kept in storage in the middle of the choice, and comes back to it.
      const back = fromEntries(new Map(Object.entries(toEntries(logic.profile, logic.runs))));
      expect(heroById(back.runs.dungeon!.world, ME)!.pendingScroll).toMatchObject({ kind });
      expect(fingerprint(back.runs.dungeon!.world)).toBe(fingerprint(device));
      const restored = new PlayerLogic(back.profile, back.runs);

      expect(act(device, ME, second).ok).toBe(true);
      expect(act(device, ME, { type: 'wait' }).ok).toBe(true);
      ({ reply } = restored.sync('dungeon', 'r1', 1, [second, { type: 'wait' }], fingerprint(device), 2));
      expect(reply.world).toBeUndefined();
      expect(reply.seq).toBe(3);
      expect(heroById(restored.runs.dungeon!.world, ME)!.pendingScroll).toBeUndefined();
      expect(fingerprint(restored.runs.dungeon!.world)).toBe(fingerprint(device));
    });

    it('is played in a single batch, too, and the server refuses an action that part the choice from its answer', () => {
      const { logic, device } = withScroll();
      const moves: Action[] = [{ type: 'use', item: 0 }, second, { type: 'wait' }];
      for (const move of moves) expect(act(device, ME, move).ok).toBe(true);
      const { reply } = logic.sync('dungeon', 'r1', 0, moves, fingerprint(device), 1);
      expect(reply.world).toBeUndefined();
      expect(reply.seq).toBe(3);

      // A device that moved on without answering (it cannot, but a tampered one would) is sent the server's copy.
      const cheat = withScroll();
      const answer = cheat.logic.sync('dungeon', 'r1', 0, [{ type: 'use', item: 0 }, { type: 'wait' }], null, 1).reply;
      expect(answer.reason).toMatch(/^refused: choose what to read the scroll on/);
      expect(answer.seq).toBe(1);
      expect(heroById(answer.world!, ME)!.pendingScroll).toBeDefined();
    });
  });
});
