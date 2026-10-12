import { act, type Action, type ActionResult, type HeroClass, joinHero, type World } from './world';

/*
 * Co-op wire protocol. The server owns the authoritative world and broadcasts
 * every accepted change as an ordered event; because the core is deterministic,
 * clients apply the same event to their replica and stay in sync. Each event
 * carries a sequence number so a client that misses one can ask for a snapshot.
 */

export interface PlayerInfo {
  id: string;
  name: string;
  heroClass: HeroClass;
}

/** A change to the world, replayed identically by the server and every client. */
export type WorldEvent =
  | { type: 'join'; player: PlayerInfo }
  | { type: 'act'; heroId: string; action: Action };

export type ClientMessage =
  | { type: 'act'; action: Action }
  | { type: 'sync' };

export type ServerMessage =
  | { type: 'snapshot'; you: string; seq: number; world: World; online: string[] }
  | { type: 'event'; seq: number; event: WorldEvent }
  | { type: 'presence'; online: string[] }
  | { type: 'rejected'; reason: string };

/** Applies an event; the server and every replica run exactly this. */
export function applyEvent(world: World, event: WorldEvent): ActionResult {
  switch (event.type) {
    case 'join':
      joinHero(world, event.player);
      return { ok: true };
    case 'act':
      return act(world, event.heroId, event.action);
  }
}
