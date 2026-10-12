import { describe, expect, it } from 'vitest';
import {
  applyEvent, canEnter, charAt, createMob, F, findPath, floorAt, hasFlag, heroById, isAlive, levelAt, NEIGHBOURS8,
  type ServerMessage, type World,
} from '@pd/core';
import { botAction, pacify } from '../../core/test/helpers';
import { type Delivery, RoomLogic, SEAT_TIMEOUT, STATE_FORMAT, TURN_TIMEOUT } from '../src/room-logic';

const alice = { id: 'alice', name: 'Alice', heroClass: 'warrior' as const };
const bob = { id: 'bob', name: 'Bob', heroClass: 'mage' as const };

/** A client replica built only from what the server sends to one player. */
class Replica {
  world: World | null = null;
  seq = 0;
  online: string[] = [];
  rejected: string[] = [];

  receive(message: ServerMessage): void {
    switch (message.type) {
      case 'snapshot':
        this.world = structuredClone(message.world);
        this.seq = message.seq;
        this.online = message.online;
        break;
      case 'event':
        expect(message.seq).toBe(this.seq + 1);
        applyEvent(this.world!, message.event);
        this.seq = message.seq;
        break;
      case 'presence':
        this.online = message.online;
        break;
      case 'rejected':
        this.rejected.push(message.reason);
        break;
    }
  }
}

function route(deliveries: Delivery[], replicas: Record<string, Replica>): void {
  for (const { to, message } of deliveries) {
    for (const id of to) replicas[id]?.receive(JSON.parse(JSON.stringify(message)) as ServerMessage);
  }
}

/** A room whose levels have no monsters. */
function peacefulRoom(seed: number): RoomLogic {
  const room = RoomLogic.create(seed);
  pacify(room.state().world);
  return room;
}

describe('co-op room', () => {
  it('keeps every replica identical to the server world', () => {
    const room = peacefulRoom(4242);
    const replicas = { alice: new Replica(), bob: new Replica() };
    route(room.connect(alice, 0), replicas);
    route(room.connect(bob, 0), replicas);

    expect(replicas.alice.world!.heroes.map((h) => h.id)).toEqual(['alice', 'bob']);
    expect(replicas.bob.online.sort()).toEqual(['alice', 'bob']);

    // Both walk to the stairs, Alice descends.
    const world = room.state().world;
    for (const id of ['alice', 'bob'] as const) {
      const hero = world.heroes.find((h) => h.id === id)!;
      const blocked = new Set(world.heroes.filter((h) => h !== hero).map((h) => h.pos));
      for (const step of findPath(levelAt(world, 1), hero.pos, levelAt(world, 1).exit, blocked) ?? []) {
        route(room.receive(id, { type: 'act', action: { type: 'move', to: step } }, 0), replicas);
      }
      if (id === 'alice') {
        route(room.receive('alice', { type: 'act', action: { type: 'descend' } }, 0), replicas);
      }
    }

    expect(world.heroes.find((h) => h.id === 'alice')!.depth).toBe(2);
    expect(replicas.alice.world).toEqual(world);
    expect(replicas.bob.world).toEqual(world);
    expect(replicas.bob.seq).toBe(room.state().seq);
  });

  it('keeps replicas identical through fights, timeouts and deaths', () => {
    for (const seed of [1, 2, 3]) {
      const room = RoomLogic.create(seed * 101);
      const replicas = { alice: new Replica(), bob: new Replica() };
      route(room.connect(alice, 0), replicas);
      route(room.connect(bob, 0), replicas);
      const world = room.state().world;
      let now = 0;
      for (let i = 0; i < 600 && !world.over; i++) {
        // Players take turns at random-ish moments; sometimes Bob dawdles.
        const id = i % 3 === 2 ? 'bob' : 'alice';
        const hero = heroById(world, id)!;
        if (isAlive(hero) && (id === 'alice' || i % 7 !== 2)) {
          route(room.receive(id, { type: 'act', action: botAction(world, id) }, now), replicas);
        }
        now += 1000;
        if (room.deadline() !== null && now >= room.deadline()!) route(room.tick(now), replicas);
      }
      expect(replicas.alice.world).toEqual(world);
      expect(replicas.bob.world).toEqual(world);
    }
  }, 20000);

  it('takes at most four heroes, though members can always come back', () => {
    const room = RoomLogic.create(12);
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(room.isFull(id)).toBe(false);
      room.connect({ id, name: id, heroClass: 'rogue' }, 0);
    }
    expect(room.isFull('e')).toBe(true);
    expect(room.isFull('a')).toBe(false);
  });

  it('rejects invalid actions to the sender only, without advancing the sequence', () => {
    const room = RoomLogic.create(1);
    const replicas = { alice: new Replica(), bob: new Replica() };
    route(room.connect(alice, 0), replicas);
    route(room.connect(bob, 0), replicas);
    const seq = room.state().seq;
    route(room.receive('alice', { type: 'act', action: { type: 'move', to: 0 } }, 0), replicas);
    expect(replicas.alice.rejected).toHaveLength(1);
    expect(replicas.bob.rejected).toHaveLength(0);
    expect(room.state().seq).toBe(seq);
  });

  it('keeps a hero across reconnects and resynchronises on request', () => {
    const room = peacefulRoom(9);
    const replicas = { alice: new Replica() };
    route(room.connect(alice, 0), replicas);
    const hero = room.state().world.heroes[0]!;
    const step = findPath(levelAt(room.state().world, 1), hero.pos, levelAt(room.state().world, 1).exit)![0]!;
    route(room.receive('alice', { type: 'act', action: { type: 'move', to: step } }, 0), replicas);

    route(room.disconnect('alice', 0), replicas);
    const again = { alice: new Replica() };
    route(room.connect(alice, 0), again);
    expect(room.state().world.heroes).toHaveLength(1);
    expect(again.alice.world!.heroes[0]!.pos).toBe(step);

    route(room.receive('alice', { type: 'sync' }, 0), again);
    expect(again.alice.world).toEqual(room.state().world);
  });

  it('survives hibernation: a room rebuilt from its saved state continues', () => {
    const room = RoomLogic.create(77);
    route(room.connect(alice, 0), { alice: new Replica() });
    const saved = JSON.parse(JSON.stringify(room.state()));
    const restored = RoomLogic.restore(saved, 1);
    restored.restoreOnline(['alice']);
    const replicas = { alice: new Replica() };
    route(restored.receive('alice', { type: 'sync' }, 0), replicas);
    expect(replicas.alice.world).toEqual(room.state().world);
    expect(restored.onlinePlayers()).toEqual(['alice']);

    // Rooms saved in an older format start afresh instead of crashing.
    const old = RoomLogic.restore({ ...saved, format: STATE_FORMAT - 1 }, 5);
    expect(old.state().world.heroes).toHaveLength(0);
  });
});

describe('co-op turns on the server', () => {
  /** Alice and Bob at the entrance, with an awake rat next to Bob. */
  function standoff(): { room: RoomLogic; replicas: Record<'alice' | 'bob', Replica> } {
    const room = peacefulRoom(3);
    const replicas = { alice: new Replica(), bob: new Replica() };
    route(room.connect(alice, 0), replicas);
    route(room.connect(bob, 0), replicas);
    const world = room.state().world;
    const hero = heroById(world, 'bob')!;
    const level = levelAt(world, 1);
    const cell = NEIGHBOURS8.map((n) => hero.pos + n).find(
      (c) => canEnter(level, c) && hasFlag(level.map[c]!, F.PASSABLE) && !charAt(world, 1, c),
    )!;
    const rat = createMob('#100', 'rat', cell, 'hunting', 0);
    rat.enemy = 'bob';
    floorAt(world, 1).mobs.push(rat);
    // Replicas learn about the rat through a fresh snapshot.
    route(room.receive('alice', { type: 'sync' }, 0), replicas);
    route(room.receive('bob', { type: 'sync' }, 0), replicas);
    return { room, replicas };
  }

  it('gives a hero in danger a time limit, then makes them wait', () => {
    const { room, replicas } = standoff();
    const world = room.state().world;
    route(room.receive('alice', { type: 'act', action: { type: 'wait' } }, 1000), replicas);
    route(room.receive('alice', { type: 'act', action: { type: 'wait' } }, 2000), replicas);
    expect(heroById(world, 'alice')!.intent).not.toBeNull();
    expect(room.deadline()).toBe(2000 + TURN_TIMEOUT);

    // Too early: nothing happens.
    route(room.tick(2000 + TURN_TIMEOUT - 1), replicas);
    expect(heroById(world, 'alice')!.intent).not.toBeNull();

    route(room.tick(2000 + TURN_TIMEOUT), replicas);
    expect(heroById(world, 'alice')!.intent).toBeNull();
    expect(heroById(world, 'bob')!.time).toBe(1);
    expect(room.deadline()).toBeNull();
    expect(replicas.alice.world).toEqual(world);
    expect(replicas.bob.world).toEqual(world);
  });

  it('never waits for a disconnected hero', () => {
    const { room, replicas } = standoff();
    const world = room.state().world;
    route(room.disconnect('bob', 0), replicas);
    route(room.receive('alice', { type: 'act', action: { type: 'wait' } }, 0), replicas);
    route(room.receive('alice', { type: 'act', action: { type: 'wait' } }, 0), replicas);
    expect(heroById(world, 'alice')!.intent).toBeNull();
    expect(heroById(world, 'alice')!.time).toBe(2);
    expect(room.deadline()).toBeNull();
    expect(replicas.alice.world).toEqual(world);
  });

  it('starts a new run for the whole party once everyone has fallen', () => {
    let seed = 500;
    const room = new RoomLogic(RoomLogic.create(1).state(), () => seed++);
    const replicas = { alice: new Replica(), bob: new Replica() };
    route(room.connect(alice, 0), replicas);
    route(room.connect(bob, 0), replicas);
    route(room.receive('alice', { type: 'restart' }, 0), replicas);
    expect(replicas.alice.rejected).toEqual(['the party is still alive']);

    const world = room.state().world;
    for (const hero of world.heroes) hero.hp = 0;
    world.over = true;
    route(room.receive('bob', { type: 'restart' }, 0), replicas);
    expect(world.over).toBe(false);
    expect(world.run.seed).toBe(500);
    expect(world.heroes.map((h) => [h.id, h.hp, h.depth])).toEqual([['alice', 20, 1], ['bob', 20, 1]]);
    // The replicas were broken by hand above, so they resync and then match.
    route(room.receive('alice', { type: 'sync' }, 0), replicas);
    expect(replicas.alice.world).toEqual(world);
  });

  it('gives a full party’s seat to a newcomer only once its player has long been away', () => {
    const room = RoomLogic.create(12);
    const join = (id: string, now: number) => {
      const seat = room.seatFor(id, now);
      if (seat !== null) room.connect({ id: seat, name: id, heroClass: 'rogue' }, now);
      return seat;
    };
    for (const id of ['a', 'b', 'c', 'd']) expect(join(id, 0)).toBe(id);
    expect(room.seatFor('e', 0)).toBeNull();

    room.disconnect('b', 1000);
    room.disconnect('c', 2000);
    // Away, but not for long enough.
    expect(room.seatFor('e', 1000 + SEAT_TIMEOUT - 1)).toBeNull();
    // The longest away goes first; the hero stays, now played by the newcomer.
    expect(join('e', 2000 + SEAT_TIMEOUT)).toBe('b');
    expect(room.state().world.heroes.map((h) => h.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(room.seatFor('e', 2000 + SEAT_TIMEOUT)).toBe('b');

    // Members still present keep theirs, and whoever lost a seat no longer has it.
    expect(room.seatFor('a', 2000 + SEAT_TIMEOUT)).toBe('a');
    expect(room.seatFor('b', 2000 + SEAT_TIMEOUT)).toBe('c');
  });

  it('gives a player whose hero was taken over a new hero of their own when there is room', () => {
    const room = RoomLogic.create(12);
    for (const id of ['a', 'b', 'c', 'd']) room.connect({ id, name: id, heroClass: 'mage' }, 0);
    room.disconnect('a', 0);
    const seat = room.seatFor('e', SEAT_TIMEOUT);
    expect(seat).toBe('a');
    room.connect({ id: seat!, name: 'e', heroClass: 'mage' }, SEAT_TIMEOUT);
    // The party had a death in the family: one hero fewer, a seat free.
    const world = room.state().world;
    world.heroes.splice(world.heroes.findIndex((h) => h.id === 'd'), 1);
    expect(room.seatFor('a', SEAT_TIMEOUT)).toBe('a~2');
    expect(room.seatFor('a', SEAT_TIMEOUT)).toBe('a~2');
    expect(room.seatFor('e', SEAT_TIMEOUT)).toBe('a');
  });

  it('keeps seats when the room is saved and restored', () => {
    const room = RoomLogic.create(12);
    for (const id of ['a', 'b', 'c', 'd']) room.connect({ id, name: id, heroClass: 'mage' }, 0);
    room.disconnect('a', 0);
    expect(room.seatFor('e', SEAT_TIMEOUT)).toBe('a');
    room.connect({ id: 'a', name: 'e', heroClass: 'mage' }, SEAT_TIMEOUT);
    const restored = RoomLogic.restore(JSON.parse(JSON.stringify(room.state())), 1);
    restored.restoreOnline(['a', 'b', 'c', 'd']);
    expect(restored.seatFor('e', SEAT_TIMEOUT)).toBe('a');
    expect(restored.seatFor('f', SEAT_TIMEOUT)).toBeNull();
  });
});
