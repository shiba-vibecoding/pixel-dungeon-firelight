import {
  applyEvent, type ClientMessage, createWorld, type PlayerInfo, type ServerMessage, type World, type WorldEvent,
} from '@pd/core';

/*
 * One co-op room: the authoritative world plus who is connected. Pure logic
 * with no Cloudflare APIs, so it can be tested directly; the Durable Object
 * only moves bytes and persists `state()`.
 */

export interface Delivery {
  /** Player ids to send to. */
  to: string[];
  message: ServerMessage;
}

export interface RoomState {
  world: World;
  seq: number;
}

export class RoomLogic {
  private readonly online = new Set<string>();

  constructor(private readonly saved: RoomState) {}

  static create(seed: number): RoomLogic {
    return new RoomLogic({ world: createWorld(seed), seq: 0 });
  }

  state(): RoomState {
    return this.saved;
  }

  onlinePlayers(): string[] {
    return [...this.online];
  }

  /** Restores who is connected after the object woke up from hibernation. */
  restoreOnline(ids: Iterable<string>): void {
    for (const id of ids) this.online.add(id);
  }

  connect(player: PlayerInfo): Delivery[] {
    const deliveries: Delivery[] = [];
    const others = this.onlinePlayers().filter((id) => id !== player.id);
    this.online.add(player.id);

    if (!this.saved.world.heroes.some((hero) => hero.id === player.id)) {
      // Everyone already here learns about the newcomer as a regular event;
      // the newcomer receives a snapshot that already contains it.
      deliveries.push(...this.commit({ type: 'join', player }, others));
    }
    deliveries.push({ to: [player.id], message: this.snapshot(player.id) });
    deliveries.push({ to: this.onlinePlayers(), message: { type: 'presence', online: this.onlinePlayers() } });
    return deliveries;
  }

  disconnect(playerId: string): Delivery[] {
    this.online.delete(playerId);
    return [{ to: this.onlinePlayers(), message: { type: 'presence', online: this.onlinePlayers() } }];
  }

  receive(playerId: string, message: ClientMessage): Delivery[] {
    switch (message.type) {
      case 'sync':
        return [{ to: [playerId], message: this.snapshot(playerId) }];
      case 'act': {
        const event: WorldEvent = { type: 'act', heroId: playerId, action: message.action };
        const result = applyEvent(this.saved.world, event);
        if (!result.ok) {
          return [{ to: [playerId], message: { type: 'rejected', reason: result.reason } }];
        }
        this.saved.seq++;
        return [{ to: this.onlinePlayers(), message: { type: 'event', seq: this.saved.seq, event } }];
      }
      default:
        return [{ to: [playerId], message: { type: 'rejected', reason: 'unknown message' } }];
    }
  }

  private commit(event: WorldEvent, recipients: string[]): Delivery[] {
    applyEvent(this.saved.world, event);
    this.saved.seq++;
    return recipients.length > 0 ? [{ to: recipients, message: { type: 'event', seq: this.saved.seq, event } }] : [];
  }

  private snapshot(playerId: string): ServerMessage {
    return { type: 'snapshot', you: playerId, seq: this.saved.seq, world: this.saved.world, online: this.onlinePlayers() };
  }
}
