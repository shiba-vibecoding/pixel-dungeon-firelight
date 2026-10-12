/*
 * What went wrong, for whoever looks after the game: script errors and failed
 * connections the clients report, and exceptions of the server's own rooms.
 * One object (ReportStore, index.ts) keeps the latest few hundred. Reports
 * carry no names or ids, only what the error was, where (solo or a room, the
 * depth) and on what (the build, Telegram's platform, the browser).
 *
 *   POST /report           a client's report (text/plain JSON, as sendBeacon sends it)
 *   GET  /reports          the latest reports; Authorization: Bearer <REPORT_KEY>
 *
 * Anyone can post a report, so everything about it is bounded: the body, how
 * many one address sends (REPORTS_PER_WINDOW), each field, and what is kept.
 * Pure logic, so it can be tested without a Durable Object.
 */

export interface Report {
  /** When it reached the server, ms. */
  at: number;
  /** 'error', 'rejection', 'socket', 'desync', 'server'... */
  kind: string;
  message: string;
  stack?: string;
  /** A co-op session's own log (kind 'coop-log'): what the player's game saw, line by line. */
  log?: string;
  /** Free-form facts about the moment: mode, depth, build, platform. */
  context?: Record<string, string | number | boolean>;
  /** The same report again: counted, not stored twice. */
  count?: number;
  last?: number;
}

/** How many different reports are kept at most. */
export const KEEP = 300;
/** The most the kept reports may take, as stored: well within a stored value's limit. */
export const MAX_STORED_BYTES = 1_000_000;
/** The longest report body a client may post. */
export const MAX_REPORT_BYTES = 16 * 1024;
/** A stack is kept to its first lines; the rest is the same few frames of the runtime. */
const STACK_CHARS = 1500;
const STACK_LINES = 20;
/** A co-op log is kept whole up to this many characters (its last ones, if longer). */
export const LOG_CHARS = 12_000;

/** How many reports one address may send within REPORT_WINDOW_MS; a broken client in a loop must not drown the rest. */
export const REPORTS_PER_WINDOW = 30;
export const REPORT_WINDOW_MS = 10 * 60_000;

/** The header the Worker passes a client's address in, for the limit; the server's own reports have none. */
export const ADDRESS_HEADER = 'X-Report-Address';

const text = (value: unknown, limit: number): string => String(value ?? '').slice(0, limit);

/** A client's report, cut down to what is safe and small to keep. */
export function parseReport(body: unknown, now: number): Report | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const kind = text(raw.kind, 24).replace(/[^a-z-]/g, '');
  const message = text(raw.message, 500);
  if (!kind || !message) return null;
  const context: Record<string, string | number | boolean> = {};
  if (raw.context && typeof raw.context === 'object') {
    for (const [key, value] of Object.entries(raw.context as Record<string, unknown>).slice(0, 16)) {
      if (typeof value === 'number' || typeof value === 'boolean') context[key.slice(0, 24)] = value;
      else if (typeof value === 'string') context[key.slice(0, 24)] = value.slice(0, 160);
    }
  }
  const log = kind === 'coop-log' && raw.log ? String(raw.log).slice(-LOG_CHARS) : '';
  return { at: now, kind, message, ...(raw.stack ? { stack: shortStack(raw.stack) } : {}), ...(log ? { log } : {}), context };
}

/** A stack cut to its first lines and a bounded length. */
export function shortStack(stack: unknown): string {
  return String(stack ?? '').split('\n', STACK_LINES).join('\n').slice(0, STACK_CHARS);
}

/** Drops the oldest reports until the rest fit in `maxBytes` as stored (JSON). */
export function trimReports(reports: Report[], maxBytes = MAX_STORED_BYTES): Report[] {
  const sizes = reports.map((report) => JSON.stringify(report).length + 1);
  let total = sizes.reduce((sum, size) => sum + size, 2);
  let drop = 0;
  while (total > maxBytes && drop < reports.length) total -= sizes[drop++]!;
  return drop > 0 ? reports.slice(drop) : reports;
}

/** The kept reports with one more: the same error from the same place is one line with a count. */
export function addReport(reports: Report[], report: Report): Report[] {
  const same = reports.find((r) => r.kind === report.kind && r.message === report.message && r.stack === report.stack);
  if (same) {
    same.count = (same.count ?? 1) + 1;
    same.last = report.at;
    same.context = report.context;
    return reports;
  }
  // Even the server's own reports are bounded here, though they are made by the server.
  const added = { ...report, message: text(report.message, 500), ...(report.stack ? { stack: shortStack(report.stack) } : {}) };
  return trimReports([...reports, added].slice(-KEEP));
}
