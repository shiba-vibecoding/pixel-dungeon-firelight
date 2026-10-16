import { DurableObject } from 'cloudflare:workers';
import { boardObject } from './boards';
import { CAPS, championOf, type CircleKind, type CircleMeta, cleanName, KINDS } from './circle-rules';
import { json } from './http';
import type { Env } from './index';

/*
 * One circle (circle-rules.ts): its name and kind, who is in it, and who won each week. Its weekly board is a DailyBoard object of its own
 * (`circle:<code>:<week>`, boards.ts); this object only knows the members and, when asked about a finished week, looks at that board once and
 * writes the champion down for good.
 *
 *   POST /join  { owner, create?: { name, kind } }   the player joins (a circle that is not there is made only when `create` is given, which the
 *                                                    server does for a player who makes one and for a group's first player)
 *   POST /leave { owner }
 *   GET  /?me=<owner>&settle=<week>                  the circle as told (name, kind, size, cap, whether `me` is in it), and the champion of
 *                                                    `settle` if that week is over
 *
 * Kept a year after the last word.
 */

const KEPT_MS = 365 * 86_400_000;
const CHAMPIONS_KEPT = 12;

interface Stored {
  name: string;
  kind: CircleKind;
  /** Who made it (never served). */
  maker: string;
}

/** The name of a circle's object and of its week's board (in the world's season). */
export const circleName = (code: string): string => `circle:${code}`;
export const circleBoard = (code: string, week: string): string => `circle:${code}:${week}`;

export const circleStub = (env: Env, code: string): DurableObjectStub<Circle> => env.CIRCLE.get(env.CIRCLE.idFromName(boardObject(circleName(code))));

export class Circle extends DurableObject<Env> {
  private async meta(): Promise<CircleMeta | null> {
    const stored = await this.ctx.storage.get<Stored>('circle');
    if (!stored) return null;
    const members = (await this.ctx.storage.get<string[]>('members')) ?? [];
    return { name: stored.name, kind: stored.kind, size: members.length, cap: CAPS_OF(stored.kind) };
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const storage = this.ctx.storage;
    if (request.method === 'POST' && url.pathname === '/join') {
      const body = (await request.json()) as { owner?: unknown; create?: { name?: unknown; kind?: unknown }; code?: unknown };
      if (typeof body.owner !== 'string' || body.owner.length === 0 || body.owner.length > 64) return json({ error: 'bad owner' }, 400);
      let meta = await this.meta();
      if (!meta) {
        const name = cleanName(body.create?.name);
        const kind = (KINDS as readonly unknown[]).includes(body.create?.kind) ? (body.create!.kind as CircleKind) : null;
        if (!body.create || !name || !kind) return json({ error: 'no such circle' }, 404);
        await storage.put({ circle: { name, kind, maker: body.owner } satisfies Stored, members: [] as string[] });
        meta = await this.meta();
      }
      const members = (await storage.get<string[]>('members')) ?? [];
      if (members.includes(body.owner)) return json({ ok: true, kept: true, circle: meta });
      if (members.length >= CAPS_OF(meta!.kind)) return json({ error: 'full' }, 409);
      members.push(body.owner);
      await storage.put('members', members);
      await this.keep();
      return json({ ok: true, kept: false, circle: { ...meta!, size: members.length } });
    }
    if (request.method === 'POST' && url.pathname === '/leave') {
      const { owner } = (await request.json()) as { owner?: unknown };
      const members = (await storage.get<string[]>('members')) ?? [];
      const rest = members.filter((member) => member !== owner);
      if (rest.length !== members.length) await storage.put('members', rest);
      return json({ ok: true });
    }
    const meta = await this.meta();
    if (!meta) return json({ error: 'no such circle' }, 404);
    const me = url.searchParams.get('me');
    const members = (await storage.get<string[]>('members')) ?? [];
    const answer: Record<string, unknown> = { ...meta, member: me !== null && members.includes(me) };
    // A finished week: who won it, looked up once and kept (the board of a past week takes no more).
    const week = url.searchParams.get('settle');
    if (week && /^\d{4}-W\d{2}$/.test(week) && me !== null && members.includes(me)) {
      const champions = (await storage.get<Record<string, { owner: string; name: string; score: number } | null>>('champions')) ?? {};
      if (!(week in champions)) {
        const code = url.searchParams.get('code') ?? '';
        const name = circleBoard(code, week);
        try {
          const board = (await (await this.env.DAILY.get(this.env.DAILY.idFromName(boardObject(name))).fetch(`https://board/?name=${encodeURIComponent(name)}&owners=1`)).json()) as {
            total?: number; first?: { owner: string; name: string; score: number } | null;
          };
          champions[week] = championOf(board.first, board.total ?? 0);
          const keys = Object.keys(champions).sort().slice(-CHAMPIONS_KEPT);
          await storage.put('champions', Object.fromEntries(keys.map((key) => [key, champions[key]!])));
        } catch {
          // Asked again next time.
          return json({ ...answer, settled: false });
        }
      }
      const champion = champions[week];
      answer.champion = champion ? { week, you: champion.owner === me, name: champion.name, score: champion.score } : null;
      answer.settled = true;
    }
    return json(answer);
  }

  private async keep(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + KEPT_MS);
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

const CAPS_OF = (kind: CircleKind): number => CAPS[kind];
