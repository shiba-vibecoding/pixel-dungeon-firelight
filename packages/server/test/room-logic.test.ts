import { describe, expect, it } from 'vitest';
import { applyEvent, findPath, levelAt, type ServerMessage, type World } from '@pd/core';
import { type Delivery, RoomLogic } from '../src/room-logic';

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

describe('co-op room', () => {
  it('keeps every replica identical to the server world', () => {
    const room = RoomLogic.create(4242);
    const replicas = { alice: new Replica(), bob: new Replica() };
    route(room.connect(alice), replicas);
    route(room.connect(bob), replicas);

    expect(replicas.alice.world!.heroes.map((h) => h.id)).toEqual(['alice', 'bob']);
    expect(replicas.bob.online.sort()).toEqual(['alice', 'bob']);

    // Both walk to the stairs, Alice descends.
    const world = room.state().world;
    for (const id of ['alice', 'bob'] as const) {
      const hero = world.heroes.find((h) => h.id === id)!;
      const blocked = new Set(world.heroes.filter((h) => h !== hero).map((h) => h.pos));
      for (const step of findPath(levelAt(world, 1), hero.pos, levelAt(world, 1).exit, blocked) ?? []) {
        route(room.receive(id, { type: 'act', action: { type: 'move', to: step } }), replicas);
      }
      if (id === 'alice') {
        route(room.receive('alice', { type: 'act', action: { type: 'descend' } }), replicas);
      }
    }

    expect(world.heroes.find((h) => h.id === 'alice')!.depth).toBe(2);
    expect(replicas.alice.world).toEqual(world);
    expect(replicas.bob.world).toEqual(world);
    expect(replicas.bob.seq).toBe(room.state().seq);
  });

  it('rejects invalid actions to the sender only, without advancing the sequence', () => {
    const room = RoomLogic.create(1);
    const replicas = { alice: new Replica(), bob: new Replica() };
    route(room.connect(alice), replicas);
    route(room.connect(bob), replicas);
    const seq = room.state().seq;
    route(room.receive('alice', { type: 'act', action: { type: 'move', to: 0 } }), replicas);
    expect(replicas.alice.rejected).toHaveLength(1);
    expect(replicas.bob.rejected).toHaveLength(0);
    expect(room.state().seq).toBe(seq);
  });

  it('keeps a hero across reconnects and resynchronises on request', () => {
    const room = RoomLogic.create(9);
    const replicas = { alice: new Replica() };
    route(room.connect(alice), replicas);
    const hero = room.state().world.heroes[0]!;
    const step = findPath(levelAt(room.state().world, 1), hero.pos, levelAt(room.state().world, 1).exit)![0]!;
    route(room.receive('alice', { type: 'act', action: { type: 'move', to: step } }), replicas);

    route(room.disconnect('alice'), replicas);
    const again = { alice: new Replica() };
    route(room.connect(alice), again);
    expect(room.state().world.heroes).toHaveLength(1);
    expect(again.alice.world!.heroes[0]!.pos).toBe(step);

    route(room.receive('alice', { type: 'sync' }), again);
    expect(again.alice.world).toEqual(room.state().world);
  });

  it('survives hibernation: a room rebuilt from its saved state continues', () => {
    const room = RoomLogic.create(77);
    route(room.connect(alice), { alice: new Replica() });
    const saved = JSON.parse(JSON.stringify(room.state()));
    const restored = new RoomLogic(saved);
    restored.restoreOnline(['alice']);
    const replicas = { alice: new Replica() };
    route(restored.receive('alice', { type: 'sync' }), replicas);
    expect(replicas.alice.world).toEqual(room.state().world);
    expect(restored.onlinePlayers()).toEqual(['alice']);
  });
});
