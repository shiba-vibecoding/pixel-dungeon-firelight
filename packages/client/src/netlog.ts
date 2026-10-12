import { reportLog } from './report';

/*
 * The co-op session's own log: what this player's game saw of the room, line by
 * line (connections, actions and how long they took, waits for companions,
 * refusals, resyncs). Kept in memory, the last few hundred lines; sent with an
 * error report when something goes wrong (a long stall, a dropped line, a
 * world out of step) or when the player reports a problem from the menu. It
 * holds no names or account ids: companions are «others», actions are kinds.
 */

const MAX_LINES = 400;
/** Automatic sends at most this often; a player's own report always goes. */
const AUTO_EVERY_MS = 3 * 60_000;

const lines: string[] = [];
let start = performance.now();
let lastAuto = -Infinity;

/** Adds a line, stamped with seconds since the session began. */
export function netlog(text: string): void {
  lines.push(`${((performance.now() - start) / 1000).toFixed(2)} ${text}`);
  if (lines.length > MAX_LINES) lines.shift();
}

/** A new session: a new log. */
export function startNetlog(what: string): void {
  lines.length = 0;
  start = performance.now();
  netlog(what);
}

/**
 * Sends the log to whoever looks after the game. `byPlayer`: the player asked (always goes);
 * otherwise something went wrong by itself, sent at most every few minutes.
 */
export function sendNetlog(reason: string, byPlayer = false): boolean {
  const now = performance.now();
  if (!byPlayer && now - lastAuto < AUTO_EVERY_MS) return false;
  if (!byPlayer) lastAuto = now;
  netlog(`-- sent: ${reason}`);
  return reportLog(`${reason} @${new Date().toISOString().slice(11, 19)}`, lines.join('\n'));
}
