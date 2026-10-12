import type { PlayerInfo } from './actors';
import type { Look } from './shop';
import { act, type Action, type ActionResult, joinHero, restartWorld, type World } from './world';

/*
 * Co-op wire protocol. The server owns the authoritative world and broadcasts
 * every accepted change as an ordered event; because the core is deterministic,
 * clients apply the same event to their replica and stay in sync. Each event
 * carries a sequence number so a client that misses one can ask for a snapshot.
 */

export type { PlayerInfo };

/** A change to the world, replayed identically by the server and every client. */
export type WorldEvent =
  | { type: 'join'; player: PlayerInfo }
  | { type: 'act'; heroId: string; action: Action }
  /** A new run for the same party; the server picks the seed. */
  | { type: 'restart'; seed: number };

/** The party's emotes, in the order the co-op sheet draws them. */
export const EMOTES = ['help', 'here', 'wait', 'attention', 'thanks', 'hooray', 'heal', 'run'] as const;
export type EmoteKind = (typeof EMOTES)[number];

/**
 * A word to the party without words: a ping on a cell (the depth it is on, so a
 * companion elsewhere does not see it on their own map) or an emote over my head.
 * Signals are outside the world: the room relays them and forgets them.
 */
export type Signal = { kind: 'ping'; depth: number; cell: number } | { kind: 'emote'; emote: EmoteKind };

export type ClientMessage =
  | { type: 'act'; action: Action }
  | { type: 'restart' }
  | { type: 'sync' }
  /** What my hero wears (Pixel-Mart); outside the world, so the core never sees it. */
  | { type: 'look'; look: Look }
  /** A signal for the party; outside the world, like a look. */
  | { type: 'signal'; signal: Signal };

export type ServerMessage =
  | { type: 'snapshot'; you: string; seq: number; world: World; online: string[] }
  | { type: 'event'; seq: number; event: WorldEvent }
  | { type: 'presence'; online: string[] }
  /** What every player in the room wears, as the server allows it (see allowedLook). */
  | { type: 'looks'; looks: Record<string, Look> }
  /** A player's signal, relayed to the whole room (the sender too). */
  | { type: 'signal'; from: string; signal: Signal }
  | { type: 'rejected'; reason: string };

/** Applies an event; the server and every replica run exactly this. */
export function applyEvent(world: World, event: WorldEvent): ActionResult {
  switch (event.type) {
    case 'join':
      joinHero(world, event.player);
      return { ok: true, effects: [] };
    case 'act':
      return act(world, event.heroId, event.action);
    case 'restart':
      restartWorld(world, event.seed);
      return { ok: true, effects: [] };
  }
}
