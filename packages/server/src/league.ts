import { DurableObject } from 'cloudflare:workers';
import { boardObject } from './boards';
import { json } from './http';
import type { Env } from './index';
import { compareEntries, type DailyEntry, Leaderboard, servedEntry } from './leaderboard';
import { ROOM_SIZE, roomOf } from './league-rules';
import { cleanWorn } from './worn';

/*
 * The weekly leagues' objects (design part 7). One class, two kinds, told apart by what they are asked:
 *
 *   the desk of a step and a week   s<SEASON>:league:<step>:<week>:desk   POST /join { owner }: the room the player is put in, by the order
 *                                   they came (the first 30, the next 30 ...), and the same room if they ask again
 *   a room                          s<SEASON>:league:<step>:<week>:<n>      POST /put { entry }: the player's best run of the week (kept
 *                                   if it beats theirs), GET /?me=<id>: the room, ranked by the week's score, and where I stand;
 *                                   GET /?owners=1: every member's place by account (the bot's league results; never served outside)
 *
 * A room holds at most 30 and is kept 90 days. Nothing here is ever asked by a timer: a week is settled by the player on their next visit.
 */

/** How long a week's desk and rooms are kept after the last word (ms). */
const KEPT_MS = 90 * 86_400_000;

/** The name of a week's desk for a step, and of one of its rooms (in the world's season). */
export const deskName = (tier: string, week: string): string => `league:${tier}:${week}:desk`;
export const roomName = (tier: string, week: string, room: number): string => `league:${tier}:${week}:${room}`;

export const leagueStub = (env: Env, name: string): DurableObjectStub<League> => env.LEAGUE.get(env.LEAGUE.idFromName(boardObject(name)));

export class League extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const storage = this.ctx.storage;
    if (request.method === 'POST' && url.pathname === '/join') {
      const { owner } = (await request.json()) as { owner?: unknown };
      if (typeof owner !== 'string' || owner.length === 0 || owner.length > 64) return json({ error: 'bad owner' }, 400);
      const had = await storage.get<number>(`o:${owner}`);
      if (had !== undefined) return json({ room: had, kept: true });
      const count = (await storage.get<number>('count')) ?? 0;
      const room = roomOf(count);
      await storage.put({ count: count + 1, [`o:${owner}`]: room });
      await this.keep();
      return json({ room, kept: false });
    }
    if (request.method === 'POST' && url.pathname === '/put') {
      const { entry } = (await request.json()) as { entry?: DailyEntry };
      if (!entry || typeof entry.id !== 'string' || typeof entry.owner !== 'string') return json({ error: 'bad entry' }, 400);
      const board = new Leaderboard((await storage.get<DailyEntry[]>('board')) ?? [], compareEntries, ROOM_SIZE);
      const placed = board.place(entry);
      if (placed.changed) await storage.put('board', board.entries());
      await this.keep();
      return json({ rank: placed.rank, size: board.entries().length });
    }
    if (request.method === 'POST' && url.pathname === '/worn') {
      // The player's equipment changed, or their name: the room shows it (the same patch the boards take, daily-board.ts).
      const patch = (await request.json()) as { owner?: unknown; byClass?: unknown; name?: unknown };
      if (typeof patch.owner !== 'string' || typeof patch.byClass !== 'object' || patch.byClass === null) return json({ error: 'bad patch' }, 400);
      const byClass = Object.fromEntries(Object.entries(patch.byClass).map(([heroClass, worn]) => [heroClass, cleanWorn(worn)]));
      const entries = (await storage.get<DailyEntry[]>('board')) ?? [];
      const board = new Leaderboard(entries, compareEntries, ROOM_SIZE);
      let changed = board.patchWorn(patch.owner, byClass);
      if (typeof patch.name === 'string' && patch.name.length > 0 && board.patchName(patch.owner, patch.name.slice(0, 32))) changed = true;
      if (changed) await storage.put('board', entries);
      return json({ changed });
    }
    const list = (await storage.get<DailyEntry[]>('board')) ?? [];
    if (url.searchParams.get('owners') === '1') {
      const owners: Record<string, number> = {};
      list.forEach((entry, i) => {
        if (entry.owner) owners[entry.owner] = i + 1;
      });
      return json({ owners, size: list.length });
    }
    const me = url.searchParams.get('me');
    const rank = me ? list.findIndex((entry) => entry.id === me) + 1 : 0;
    return json({ size: list.length, top: list.map(servedEntry), rank: rank > 0 ? rank : null });
  }

  /** Sets the deletion some time after the last word. */
  private async keep(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + KEPT_MS);
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
