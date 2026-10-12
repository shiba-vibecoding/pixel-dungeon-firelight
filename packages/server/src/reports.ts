import { DurableObject } from 'cloudflare:workers';

/*
 * What went wrong, for whoever looks after the game: script errors and failed
 * connections the clients report, and exceptions of the server's own rooms.
 * One object keeps the latest few hundred. Reports carry no names or ids,
 * only what the error was, where (solo or a room, the depth) and on what
 * (the build, Telegram's platform, the browser).
 *
 *   POST /report           a client's report (text/plain JSON, as sendBeacon sends it)
 *   GET  /reports          the latest reports; Authorization: Bearer <REPORT_KEY>
 */

export interface Report {
  /** When it reached the server, ms. */
  at: number;
  /** 'error', 'rejection', 'socket', 'desync', 'server'... */
  kind: string;
  message: string;
  stack?: string;
  /** Free-form facts about the moment: mode, depth, build, platform. */
  context?: Record<string, string | number | boolean>;
  /** The same report again: counted, not stored twice. */
  count?: number;
  last?: number;
}

const KEEP = 300;

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
  return { at: now, kind, message, ...(raw.stack ? { stack: text(raw.stack, 1500) } : {}), context };
}

export class ReportStore extends DurableObject {
  override async fetch(request: Request): Promise<Response> {
    const reports = (await this.ctx.storage.get<Report[]>('reports')) ?? [];
    if (request.method === 'POST') {
      const report = (await request.json()) as Report;
      // The same error from the same place is one line with a count.
      const same = reports.find((r) => r.kind === report.kind && r.message === report.message && r.stack === report.stack);
      if (same) {
        same.count = (same.count ?? 1) + 1;
        same.last = report.at;
        same.context = report.context;
      } else {
        reports.push(report);
        if (reports.length > KEEP) reports.splice(0, reports.length - KEEP);
      }
      await this.ctx.storage.put('reports', reports);
      return new Response(null, { status: 204 });
    }
    if (request.method === 'DELETE') {
      await this.ctx.storage.delete('reports');
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify(reports), { headers: { 'Content-Type': 'application/json' } });
  }
}
