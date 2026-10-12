import {
  applyEvent, autoAction, blockers, type ClientMessage, createWorld, type PlayerInfo, type ServerMessage, type World,
  type WorldEvent,
} from '@pd/core';

/*
 * One co-op room: the authoritative world plus who is connected. Pure logic
 * with no Cloudflare APIs, so it can be tested directly; the Durable Object
 * only moves bytes, persists `state()` and wakes the room up at `deadline()`.
 *
 * Turns: a hero in danger who has not decided yet holds up companions on the
 * same depth (see blockers() in the core). Only a player who is playing holds
 * the party: one who has done nothing for IDLE_TIMEOUT (reading the chat,
 * looking away) waits at once, turn after turn, until they act again, as a
 * disconnected one does. A player at the controls gets TURN_TIMEOUT at most.
 */

export interface Delivery {
  /** Player ids to send to. */
  to: string[];
  message: ServerMessage;
}

/** Bumped whenever the saved world format changes; older rooms start afresh. */
export const STATE_FORMAT = 31;

export interface RoomState {
  format: number;
  world: World;
  seq: number;
  /** When each hero who is holding companions up started doing so (ms). */
  holdingSince: Record<string, number>;
  /**
   * Players who play a hero not of their own id, by player id: a seat taken
   * over from someone long gone, or a new hero for a player whose own was
   * taken over (see seatFor). Absent in rooms saved before seats could change.
   */
  seats?: Record<string, string>;
  /** Since when each hero's player has been away (ms), by hero id. */
  offlineSince?: Record<string, number>;
  /** When each hero's player last did something (ms), by hero id. */
  activeAt?: Record<string, number>;
}

/** The longest a party waits for a companion's move. */
export const TURN_TIMEOUT = 8000;
/**
 * A player who has not acted for this long is not at the controls: the party does not wait
 * for them (in play, a turn in a fight comes within a second or two; a party held up by a
 * friend who had looked away, every turn, was the co-op's worst trouble).
 */
export const IDLE_TIMEOUT = 4000;

/** Heroes per party; a shared invite link in a big chat must not flood one dungeon. */
export const PARTY_SIZE = 4;

/** How long a full party's hero must have been without its player before a newcomer may take it over. */
export const SEAT_TIMEOUT = 30 * 60_000;

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

  /**
   * The hero a player plays in this room, by id: their own, or a new one, or,
   * when the party is full, the hero of whoever has been away longest, if
   * that is over SEAT_TIMEOUT (a party must not keep seats for players who
   * never come back). Null if there is no seat for them. The player then
   * connects under that hero's id; the room remembers whose it is now, and
   * someone whose hero was taken over gets a new one when they come back.
   */
  seatFor(playerId: string, now: number): string | null {
    const seats = (this.saved.seats ??= {});
    const heroes = this.saved.world.heroes;
    const exists = (id: string): boolean => heroes.some((hero) => hero.id === id);
    const taken = new Set(Object.values(seats));
    const mine = seats[playerId];
    // Theirs, or a new one set aside for them that has yet to join.
    if (mine !== undefined && (exists(mine) || heroes.length < PARTY_SIZE)) return mine;
    if (mine === undefined && exists(playerId) && !taken.has(playerId)) return playerId;

    // No hero of their own (any more): a new one if there is room.
    if (heroes.length < PARTY_SIZE) {
      let id = playerId;
      for (let n = 2; exists(id) || taken.has(id); n++) id = `${playerId}~${n}`;
      if (id === playerId) delete seats[playerId];
      else seats[playerId] = id;
      return id;
    }
    const gone = this.longestAway(now);
    if (!gone) return null;
    // Whoever played that hero before (if not its first player) no longer does.
    for (const [player, hero] of Object.entries(seats)) if (hero === gone) delete seats[player];
    if (gone === playerId) delete seats[playerId];
    else seats[playerId] = gone;
    return gone;
  }

  /** The hero whose player has been away longest, if over SEAT_TIMEOUT. */
  private longestAway(now: number): string | null {
    const away = (this.saved.offlineSince ??= {});
    let best: string | null = null;
    for (const hero of this.saved.world.heroes) {
      if (this.online.has(hero.id)) continue;
      // A hero away since before the room kept count: counted from now.
      away[hero.id] ??= now;
      if (now - away[hero.id]! >= SEAT_TIMEOUT && (best === null || away[hero.id]! < away[best]!)) best = hero.id;
    }
    return best;
  }

  connect(player: PlayerInfo, now: number): Delivery[] {
    const deliveries: Delivery[] = [];
    const others = this.onlinePlayers().filter((id) => id !== player.id);
    this.online.add(player.id);
    if (this.saved.offlineSince) delete this.saved.offlineSince[player.id];
    (this.saved.activeAt ??= {})[player.id] = now;

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
    (this.saved.offlineSince ??= {})[playerId] = now;
    return [this.presence(), ...this.settle(now)];
  }

  receive(playerId: string, message: ClientMessage, now: number): Delivery[] {
    switch (message.type) {
      case 'sync':
        return [{ to: [playerId], message: this.snapshot(playerId) }];
      case 'act': {
        (this.saved.activeAt ??= {})[playerId] = now;
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
    const times = Object.entries(this.saved.holdingSince).map(([id, since]) => Math.min(since + TURN_TIMEOUT, this.idleAt(id, since)));
    return times.length > 0 ? Math.min(...times) : null;
  }

  /** When a hero's player counts as idle: IDLE_TIMEOUT after they last acted. */
  private idleAt(heroId: string, fallback: number): number {
    return (this.saved.activeAt?.[heroId] ?? fallback) + IDLE_TIMEOUT;
  }

  /** Makes heroes who ran out of time wait a turn. */
  tick(now: number): Delivery[] {
    const deliveries: Delivery[] = [];
    for (const [id, since] of Object.entries(this.saved.holdingSince)) {
      if (now >= since + TURN_TIMEOUT || now >= this.idleAt(id, since)) {
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
      // Away, or not at the controls: they wait, and the party goes on.
      const absent = holding.filter((id) => !this.online.has(id) || now >= this.idleAt(id, this.saved.holdingSince[id] ?? now));
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

  /** A turn played for a hero whose player is not at the controls: they strike back if attacked, else wait (core autoAction). */
  private autoWait(heroId: string): Delivery[] {
    const action = autoAction(this.saved.world, heroId);
    let event: WorldEvent = { type: 'act', heroId, action };
    if (!applyEvent(this.saved.world, event).ok) {
      event = { type: 'act', heroId, action: { type: 'wait' } };
      if (!applyEvent(this.saved.world, event).ok) return [];
    }
    return [this.broadcast(event)];
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
