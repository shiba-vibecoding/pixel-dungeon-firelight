import { DurableObject } from 'cloudflare:workers';
import { applyPut, entryKey, listRanks, putSlices, RANKS, readSlice } from './board-state';
import { boardTtl } from './boards';
import { json } from './http';
import type { Env } from './index';
import { type DailyEntry, Leaderboard, servedEntry } from './leaderboard';
import { cleanWorn } from './worn';
import { parseSlice, sliceKey } from './slices';

/*
 * One board: the daily dungeon of a day, a week's best, the best ever (boards.ts). The Durable Object only reads and writes what
 * board-state.ts asks for: the score list, a short list for each slice, the rank index and a player's own entry. One call to it serves
 * any slice, and a finished run is written to every list it belongs to in the same call.
 */

export class DailyBoard extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const name = url.searchParams.get('name') ?? url.searchParams.get('date') ?? '';
    if (request.method === 'POST' && url.pathname === '/put') return json(await this.put((await request.json()) as DailyEntry, name));
    if (request.method === 'POST' && url.pathname === '/worn') return this.worn(await request.json());
    // A hall of fame is written once: the first to bring the top keeps it, the rest are told it is kept.
    if (request.method === 'POST' && url.pathname === '/freeze') return this.freeze(await request.json());
    if (request.method === 'POST') return json({ error: 'results come from checked runs only' }, 410);
    const storage = this.ctx.storage;
    // Every player's place, by account (the reminders' weekly results); never served outside.
    if (url.searchParams.get('owners') === '1') {
      const board = new Leaderboard((await storage.get<DailyEntry[]>('board')) ?? []);
      const owners: Record<string, number> = {};
      board.entries().forEach((entry, i) => {
        if (entry.owner) owners[entry.owner] = i + 1;
      });
      return json({ owners, total: board.entries().length });
    }
    const slice = parseSlice(url.searchParams.get('metric'), url.searchParams.get('cls'));
    if (!slice) return json({ error: 'bad slice' }, 400);
    const me = url.searchParams.get('me');
    const list = (await storage.get<DailyEntry[]>(sliceKey(slice))) ?? [];
    const ranks = await storage.get<number[]>(RANKS);
    const own = me && !list.some((entry) => entry.id === me) ? await storage.get<DailyEntry>(entryKey(me)) : undefined;
    const count = Math.min(100, Math.max(0, Number(url.searchParams.get('top') ?? 20) || 0));
    const answer = readSlice(slice, { list, ranks, own }, { me, owner: url.searchParams.get('owner'), top: count });
    // What a finished day says of a player for the titles: where they stood on its speed and depth lists.
    if (me && url.searchParams.get('lists') === '1') {
      const lists = await storage.get<DailyEntry[]>(['l:speed', 'l:depth']);
      Object.assign(answer, listRanks({ speed: lists.get('l:speed') ?? [], depth: lists.get('l:depth') ?? [] }, me));
    }
    // A hall of fame says whether it has been written.
    if (name.startsWith('hall:')) Object.assign(answer, { frozen: (await storage.get('frozen')) !== undefined });
    return json(answer);
  }

  private async freeze(body: unknown): Promise<Response> {
    const storage = this.ctx.storage;
    if ((await storage.get('frozen')) !== undefined) return json({ frozen: true, kept: true });
    const entries = Array.isArray((body as { entries?: unknown }).entries) ? ((body as { entries: DailyEntry[] }).entries).slice(0, 10).map(servedEntry) : [];
    await storage.put({ board: entries, frozen: Date.now() });
    return json({ frozen: true, kept: false });
  }

  /** A finished run onto the score list, every slice it counts for, and the rank index. */
  private async put(entry: DailyEntry, name: string): Promise<unknown> {
    const storage = this.ctx.storage;
    const lists = await storage.get<DailyEntry[]>(putSlices(entry, name).map(sliceKey));
    const { answer, writes } = applyPut({ lists, ranks: await storage.get<number[]>(RANKS), previous: await storage.get<DailyEntry>(entryKey(entry.id)) }, entry, name);
    await storage.put(writes);
    await this.expireAfter(name);
    return answer;
  }

  /** The player's equipment changed, or they hid their name (player.ts): their entries on every list show it. */
  private async worn(body: unknown): Promise<Response> {
    const patch = body as { owner?: unknown; id?: unknown; byClass?: unknown; name?: unknown };
    if (typeof patch.owner !== 'string' || typeof patch.byClass !== 'object' || patch.byClass === null) return json({ error: 'bad patch' }, 400);
    const byClass = Object.fromEntries(Object.entries(patch.byClass).map(([heroClass, worn]) => [heroClass, cleanWorn(worn)]));
    const name = typeof patch.name === 'string' && patch.name.length > 0 ? patch.name.slice(0, 32) : null;
    const storage = this.ctx.storage;
    const lists = await storage.list<DailyEntry[]>({ prefix: 'l:' });
    const base = await storage.get<DailyEntry[]>('board');
    if (base) lists.set('board', base);
    const writes: Record<string, unknown> = {};
    const mend = (entries: DailyEntry[]): boolean => {
      const board = new Leaderboard(entries);
      let changed = board.patchWorn(patch.owner as string, byClass);
      if (name !== null && board.patchName(patch.owner as string, name)) changed = true;
      return changed;
    };
    for (const [key, entries] of lists) if (mend(entries)) writes[key] = entries;
    if (typeof patch.id === 'string') {
      const own = await storage.get<DailyEntry>(entryKey(patch.id));
      if (own && mend([own])) writes[entryKey(patch.id)] = own;
    }
    const changed = Object.keys(writes).length > 0;
    if (changed) await storage.put(writes);
    return json({ changed });
  }

  /** Sets the board's deletion some time after its day or week (boards.ts boardTtl); the best ever are kept. */
  private async expireAfter(name: string): Promise<void> {
    const ttl = boardTtl(name);
    if (ttl === null || (await this.ctx.storage.getAlarm()) !== null) return;
    await this.ctx.storage.setAlarm(Date.now() + ttl);
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
