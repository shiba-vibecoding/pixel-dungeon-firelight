import { boardObject } from './boards';
import { CORS, json, jsonBody } from './http';
import type { Env } from './index';
import type { DailyEntry } from './leaderboard';
import compete from '../../client/public/assets/compete/compete.json';
import { hallOpensAt, seasonAt, seasonNumbered, seasonNumber, seasonStart } from './season-clock';

/*
 * The hall of fame (design part 7): the season's top ten by Heat, written once when the season is over and its grace days have passed,
 * kept for ever, a page a season. The page is a board object of its own (`hall:s1`) whose list is the top ten as the season's board had it
 * then, and a `frozen` mark; nothing is written to it after. The hourly cron writes it (index.ts scheduled), and so does the first
 * player who closes the season, if the cron has not (season-flow.ts), so no one waits for either.
 *
 *   POST /hall { season?: 's1' }   the page of a season (the latest over by default), and which seasons have one
 */

export const HALL_TOP = compete.season.hallOfFame.top;

const stub = (env: Env, name: string): DurableObjectStub => env.DAILY.get(env.DAILY.idFromName(boardObject(name)));

/** Writes a season's hall of fame if it is not written yet (idempotent); whether it is written now. */
export async function freezeHall(env: Env, seasonId: string): Promise<boolean> {
  const hallName = `hall:${seasonId}`;
  try {
    const hall = (await (await stub(env, hallName).fetch(`https://board/?name=${hallName}&top=0`)).json()) as { frozen?: boolean };
    if (hall.frozen) return true;
    const boardName = `season:${seasonId}`;
    const season = (await (await stub(env, boardName).fetch(`https://board/?name=${boardName}&top=${HALL_TOP}`)).json()) as { top: DailyEntry[] };
    const done = await stub(env, hallName).fetch(`https://board/freeze?name=${hallName}`, { method: 'POST', body: JSON.stringify({ entries: season.top }) });
    return done.ok;
  } catch {
    return false;
  }
}

/** The hourly check: the season that just ended gets its hall of fame once its grace days are over (and for 20 days after, if it was missed). */
export async function freezeDueHall(env: Env, now: number): Promise<void> {
  const start = seasonStart(env.COMPETE_SEASON_START);
  const current = seasonAt(now, start);
  if (current.number <= 1) return;
  const previous = seasonNumbered(current.number - 1, start);
  const opens = hallOpensAt(previous);
  if (now < opens || now > opens + 20 * 86_400_000) return;
  await freezeHall(env, previous.id);
}

/** POST /hall: the hall of fame of a season. */
export async function hallRoute(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const body = (await jsonBody(request)) ?? {};
  const start = seasonStart(env.COMPETE_SEASON_START);
  const current = seasonAt(Date.now(), start);
  // The seasons that are over (the one before this is the latest page).
  const available = Array.from({ length: current.number - 1 }, (_, i) => `s${i + 1}`);
  const asked = seasonNumber(body.season);
  const id = asked !== null && asked < current.number ? `s${asked}` : available[available.length - 1];
  if (!id) return json({ current: current.id, available, season: null, frozen: false, top: [] });
  const name = `hall:${id}`;
  try {
    const page = (await (await stub(env, name).fetch(`https://board/?name=${name}&top=${HALL_TOP}`)).json()) as { top: DailyEntry[]; frozen?: boolean };
    return json({ current: current.id, available, season: id, frozen: page.frozen === true, top: page.top });
  } catch {
    return json({ error: 'hall' }, 502);
  }
}
