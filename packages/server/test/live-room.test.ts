import { describe, expect, it } from 'vitest';
import { applyEvent, heroById, LIVE_TURN_MS, type ServerMessage, type World } from '@pd/core';
import { pacify } from '../../core/test/helpers';
import { type Delivery, LIVE_IDLE_MS, RoomLogic } from '../src/room-logic';
import { sanitizeAction } from '../src/messages';

const alice = { id: 'alice', name: 'Alice', heroClass: 'warrior' as const };
const bob = { id: 'bob', name: 'Bob', heroClass: 'mage' as const };

/** What one player's game makes of what the room sends them. */
class Replica {
  world: World | null = null;
  seq = 0;
  ticks: number[] = [];

  receive(message: ServerMessage): void {
    if (message.type === 'snapshot') {
      this.world = structuredClone(message.world);
      this.seq = message.seq;
    } else if (message.type === 'event') {
      expect(message.seq).toBe(this.seq + 1);
      if (message.event.type === 'tick') this.ticks.push(message.event.ms);
      applyEvent(this.world!, message.event);
      this.seq = message.seq;
    }
  }
}

function route(deliveries: Delivery[], replicas: Record<string, Replica>): void {
  for (const { to, message } of deliveries) {
    for (const id of to) replicas[id]?.receive(JSON.parse(JSON.stringify(message)) as ServerMessage);
  }
}

describe('a live room', () => {
  it('beats time itself while anyone plays, and every replica keeps step', () => {
    const room = RoomLogic.create(31);
    pacify(room.state().world);
    expect(room.live).toBe(true);
    expect(room.ticking(0)).toBe(false);
    const replicas = { alice: new Replica(), bob: new Replica() };
    route(room.connect(alice, 0), replicas);
    route(room.connect(bob, 0), replicas);
    expect(room.ticking(0)).toBe(true);
    const world = room.state().world;
    const hero = heroById(world, 'alice')!;
    const start = hero.pos;
    world.explored[1] = world.levels[1]!.map.map(() => true);
    for (const id of ['alice', 'bob']) replicas[id as 'alice'].world!.explored[1] = world.explored[1].slice();
    const goal = world.levels[1]!.exit;
    route(room.receive('alice', { type: 'act', action: { type: 'plan', steps: [{ type: 'go', to: goal }] } }, 0), replicas);
    // Bob does nothing at all: the clock goes on regardless.
    for (let beat = 0; beat < 80 && hero.pos !== goal; beat++) route(room.liveTick(beat * LIVE_TURN_MS), replicas);
    expect(hero.pos).not.toBe(start);
    expect(hero.pos).toBe(goal);
    expect(replicas.alice.world).toEqual(world);
    expect(replicas.bob.world).toEqual(world);
    expect(replicas.bob.ticks.every((ms) => ms >= LIVE_TURN_MS)).toBe(true);
  });

  it('stops its clock when nobody has done anything for a long while, and an order starts it again', () => {
    const room = RoomLogic.create(33);
    room.connect(alice, 0);
    expect(room.ticking(LIVE_IDLE_MS - 1)).toBe(true);
    expect(room.ticking(LIVE_IDLE_MS + 1)).toBe(false);
    room.receive('alice', { type: 'act', action: { type: 'wait' } }, LIVE_IDLE_MS + 2);
    expect(room.ticking(LIVE_IDLE_MS + 3)).toBe(true);
  });

  it('stops its clock when the last player leaves', () => {
    const room = RoomLogic.create(32);
    room.connect(alice, 0);
    expect(room.ticking(0)).toBe(true);
    room.disconnect('alice', 1);
    expect(room.ticking(1)).toBe(false);
    expect(room.liveTick(2)).toEqual([]);
  });

  it('takes plans of the right shape only', () => {
    expect(sanitizeAction({ type: 'plan', steps: [{ type: 'go', to: 40, junk: 1 }, { type: 'hunt', target: 'm3' }, { type: 'rest' }, { type: 'stride', dx: 1, dy: -1 }, { type: 'pickup' }] }))
      .toEqual({ type: 'plan', steps: [{ type: 'go', to: 40 }, { type: 'hunt', target: 'm3' }, { type: 'rest' }, { type: 'stride', dx: 1, dy: -1 }, { type: 'pickup' }] });
    expect(sanitizeAction({ type: 'plan', steps: [{ type: 'plan', steps: [] }] })).toBeNull();
    expect(sanitizeAction({ type: 'plan', steps: [{ type: 'stride', dx: 0, dy: 0 }] })).toBeNull();
    expect(sanitizeAction({ type: 'plan', steps: Array.from({ length: 65 }, () => ({ type: 'rest' })) })).toBeNull();
  });
});
