/*
 * How much a room's player may send. A WebSocket message is the client's word,
 * and a busy or broken (or hostile) client must not make the room work for
 * everyone else: a message too big is refused outright, and each kind of
 * message has its own allowance, refilled over time (a token bucket). The
 * allowances are generous for real play: a hero walking acts several times
 * a second, while a look or a full resync is needed only now and then.
 */

/** The largest message a client ever needs to send (an action or a look is a few dozen bytes). */
export const MAX_MESSAGE_BYTES = 8 * 1024;

/** WebSocket close code "message too big". */
export const CLOSE_TOO_BIG = 1009;

/** The size of a message as it arrived, in bytes (a string counts its UTF-8 bytes). */
export function messageBytes(data: string | ArrayBuffer): number {
  if (typeof data !== 'string') return data.byteLength;
  // Cheap bound first: a string never takes more than three bytes a UTF-16 unit.
  if (data.length * 3 <= MAX_MESSAGE_BYTES) return data.length;
  return new TextEncoder().encode(data).byteLength;
}

/** A refilling allowance: `burst` at most, `perSecond` coming back. */
export interface Rate {
  burst: number;
  perSecond: number;
}

export class TokenBucket {
  private tokens: number;
  private at: number;

  constructor(private readonly rate: Rate, now: number) {
    this.tokens = rate.burst;
    this.at = now;
  }

  /** True if there is a token to spend now (and spends it). */
  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.at) / 1000;
    this.tokens = Math.min(this.rate.burst, this.tokens + elapsed * this.rate.perSecond);
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export type LimitedKind = 'act' | 'look' | 'sync' | 'restart';

/** Each kind's allowance per player. */
export const RATES: Readonly<Record<LimitedKind, Rate>> = {
  // Walking sends an action a step; a burst covers a quick run of taps.
  act: { burst: 20, perSecond: 8 },
  // A look changes when the player dresses up: one every two seconds or so.
  look: { burst: 2, perSecond: 0.5 },
  // A client asks for a snapshot when it missed an event; once in two seconds is plenty.
  sync: { burst: 2, perSecond: 0.5 },
  restart: { burst: 2, perSecond: 0.2 },
};

/**
 * The allowances of everyone in a room, kept in memory only: a room woken
 * from hibernation simply starts everyone with a full allowance again.
 */
export class MessageLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(private readonly rates: Readonly<Record<LimitedKind, Rate>> = RATES) {}

  /** True if the player may send a message of this kind now (and counts it). */
  allow(playerId: string, kind: LimitedKind, now: number): boolean {
    const key = `${kind}\n${playerId}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(this.rates[kind], now);
      this.buckets.set(key, bucket);
    }
    return bucket.take(now);
  }

  /** Forgets a player who left. */
  forget(playerId: string): void {
    for (const kind of Object.keys(this.rates)) this.buckets.delete(`${kind}\n${playerId}`);
  }
}

/**
 * At most `max` of something by one sender within a sliding window, kept in
 * memory only: for things a sender should only do now and then (an error
 * report, a message to support), where a restart counting afresh does no harm.
 */
export class WindowLimiter {
  private readonly sent = new Map<string, number[]>();

  constructor(private readonly max: number, private readonly windowMs: number, private readonly maxKeys = 10_000) {}

  /** True if this sender may go ahead now (and counts it). */
  allow(key: string, now: number): boolean {
    const recent = (this.sent.get(key) ?? []).filter((at) => now - at < this.windowMs);
    const allowed = recent.length < this.max;
    if (allowed) recent.push(now);
    this.sent.set(key, recent);
    // Senders come and go: forget the quiet ones so the map does not grow without end.
    if (this.sent.size > this.maxKeys) {
      for (const [other, times] of this.sent) if (times.every((at) => now - at >= this.windowMs)) this.sent.delete(other);
    }
    return allowed;
  }
}
