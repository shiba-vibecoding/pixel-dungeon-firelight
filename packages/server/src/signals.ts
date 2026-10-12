import { type EmoteKind, EMOTES, LENGTH, type Signal } from '@pd/core';

/*
 * Co-op signals (pings and emotes): relayed to the room as they come and never
 * kept, so they cannot touch the world. What arrives is a client's word, so it
 * is checked and rebuilt field by field, and each player may only send a few
 * in a short while: a finger drumming on the map must not flood the party.
 */

/** The deepest depth there is. */
const DEPTHS = 26;

/** A signal as the room will relay it, or null if it is not one. */
export function validSignal(raw: unknown): Signal | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (s.kind === 'ping') {
    const { depth, cell } = s;
    if (!Number.isInteger(depth) || (depth as number) < 1 || (depth as number) > DEPTHS) return null;
    if (!Number.isInteger(cell) || (cell as number) < 0 || (cell as number) >= LENGTH) return null;
    return { kind: 'ping', depth: depth as number, cell: cell as number };
  }
  if (s.kind === 'emote') {
    return (EMOTES as readonly unknown[]).includes(s.emote) ? { kind: 'emote', emote: s.emote as EmoteKind } : null;
  }
  return null;
}

/** How many signals a player may send within WINDOW_MS; more are dropped without a word. */
export const SIGNAL_BURST = 4;
export const SIGNAL_WINDOW_MS = 3000;

/** Who sent what when, kept in memory only: a room woken from hibernation simply starts counting afresh. */
export class SignalLimiter {
  private readonly sent = new Map<string, number[]>();

  /** True if the player may send a signal now (and counts it). */
  allow(playerId: string, now: number): boolean {
    const recent = (this.sent.get(playerId) ?? []).filter((at) => now - at < SIGNAL_WINDOW_MS);
    if (recent.length >= SIGNAL_BURST) {
      this.sent.set(playerId, recent);
      return false;
    }
    recent.push(now);
    this.sent.set(playerId, recent);
    return true;
  }

  /** Forgets a player who left. */
  forget(playerId: string): void {
    this.sent.delete(playerId);
  }
}
