import {
  applyEvent, blockers, type ClientMessage, createWorld, type PlayerInfo, type ServerMessage, type World,
  type WorldEvent,
} from '@pd/core';

/*
 * One co-op room: the authoritative world plus who is connected. Pure logic
 * with no Cloudflare APIs, so it can be tested directly; the Durable Object
 * only moves bytes, persists `state()` and wakes the room up at `deadline()`.
 *
 * Turns: a hero in danger who has not decided yet holds up companions on the
 * same depth (see blockers() in the core). The room gives them TURN_TIMEOUT
 * to act, then makes them wait a turn. Disconnected heroes never hold anyone
 * up: they wait at once.
 */

export interface Delivery {
  /** Player ids to send to. */
  to: string[];
  message: ServerMessage;
}

/** Bumped whenever the saved world format changes; older rooms start afresh. */
export const STATE_FORMAT = 12;

export interface RoomState {
  format: number;
  world: World;
  seq: number;
  /** When each hero who is holding companions up started doing so (ms). */
  holdingSince: Record<string, number>;
}

export const TURN_TIMEOUT = 12_000;

/** Heroes per party; a shared invite link in a big chat must not flood one dungeon. */
export const PARTY_SIZE = 4;

export class RoomLogic {
  private readonly online = new Set<string>();

  constructor(
    private readonly saved: RoomState,
    private readonly newSeed: () => number = () => Math.floor(Math.random() * 2 ** 31),
  ) {}

  static create(seed: number, newSeed?: () => number): RoomLogic {
    return new RoomLogic({ format: STATE_FORMAT, world: createWorld(seed), seq: 0, holdingSince: {} }, newSeed);
  }

  /** A saved room, or a fresh one if it was saved in an older format. */
  static restore(saved: RoomState | undefined, seed: number): RoomLogic {
    return saved?.format === STATE_FORMAT ? new RoomLogic(saved) : RoomLogic.create(seed);
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

  /** True if a newcomer cannot join: the party is complete (members may always come back). */
  isFull(playerId: string): boolean {
    const heroes = this.saved.world.heroes;
    return heroes.length >= PARTY_SIZE && !heroes.some((hero) => hero.id === playerId);
  }

  connect(player: PlayerInfo, now: number): Delivery[] {
    const deliveries: Delivery[] = [];
    const others = this.onlinePlayers().filter((id) => id !== player.id);
    this.online.add(player.id);

    if (!this.saved.world.heroes.some((hero) => hero.id === player.id)) {
      // Everyone already here learns about the newcomer as a regular event;
      // the newcomer receives a snapshot that already contains it.
      deliveries.push(...this.commit({ type: 'join', player }, others));
    }
    deliveries.push({ to: [player.id], message: this.snapshot(player.id) });
    deliveries.push(this.presence());
    deliveries.push(...this.settle(now));
    return deliveries;
  }

  disconnect(playerId: string, now: number): Delivery[] {
    this.online.delete(playerId);
    return [this.presence(), ...this.settle(now)];
  }

  receive(playerId: string, message: ClientMessage, now: number): Delivery[] {
    switch (message.type) {
      case 'sync':
        return [{ to: [playerId], message: this.snapshot(playerId) }];
      case 'act': {
        const event: WorldEvent = { type: 'act', heroId: playerId, action: message.action };
        const result = applyEvent(this.saved.world, event);
        if (!result.ok) {
          return [{ to: [playerId], message: { type: 'rejected', reason: result.reason } }];
        }
        return [this.broadcast(event), ...this.settle(now)];
      }
      case 'restart':
        if (!this.saved.world.over) {
          return [{ to: [playerId], message: { type: 'rejected', reason: 'the party is still alive' } }];
        }
        this.saved.holdingSince = {};
        return this.commit({ type: 'restart', seed: this.newSeed() }, this.onlinePlayers());
      default:
        return [{ to: [playerId], message: { type: 'rejected', reason: 'unknown message' } }];
    }
  }

  /** When the room next needs to act on its own, if ever. */
  deadline(): number | null {
    const times = Object.values(this.saved.holdingSince);
    return times.length > 0 ? Math.min(...times) + TURN_TIMEOUT : null;
  }

  /** Makes heroes who ran out of time wait a turn. */
  tick(now: number): Delivery[] {
    const deliveries: Delivery[] = [];
    for (const [id, since] of Object.entries(this.saved.holdingSince)) {
      if (now >= since + TURN_TIMEOUT) {
        delete this.saved.holdingSince[id];
        deliveries.push(...this.autoWait(id));
      }
    }
    return [...deliveries, ...this.settle(now)];
  }

  /** Lets absent heroes pass and starts the clock on the others holding things up. */
  private settle(now: number): Delivery[] {
    const deliveries: Delivery[] = [];
    for (let i = 0; i < 1000; i++) {
      const holding = blockers(this.saved.world);
      const absent = holding.filter((id) => !this.online.has(id));
      if (absent.length === 0) {
        const next: Record<string, number> = {};
        for (const id of holding) next[id] = this.saved.holdingSince[id] ?? now;
        this.saved.holdingSince = next;
        break;
      }
      for (const id of absent) deliveries.push(...this.autoWait(id));
    }
    return deliveries;
  }

  private autoWait(heroId: string): Delivery[] {
    const event: WorldEvent = { type: 'act', heroId, action: { type: 'wait' } };
    return applyEvent(this.saved.world, event).ok ? [this.broadcast(event)] : [];
  }

  private commit(event: WorldEvent, recipients: string[]): Delivery[] {
    applyEvent(this.saved.world, event);
    this.saved.seq++;
    const message: ServerMessage = { type: 'event', seq: this.saved.seq, event };
    return recipients.length > 0 ? [{ to: recipients, message }] : [];
  }

  /** For an event already applied to the world. */
  private broadcast(event: WorldEvent): Delivery {
    this.saved.seq++;
    return { to: this.onlinePlayers(), message: { type: 'event', seq: this.saved.seq, event } };
  }

  private presence(): Delivery {
    return { to: this.onlinePlayers(), message: { type: 'presence', online: this.onlinePlayers() } };
  }

  private snapshot(playerId: string): ServerMessage {
    return { type: 'snapshot', you: playerId, seq: this.saved.seq, world: this.saved.world, online: this.onlinePlayers() };
  }
}
