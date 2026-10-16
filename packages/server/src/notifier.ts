import { DurableObject } from 'cloudflare:workers';
import { dayOf, weekOf } from '@pd/core';
import { boardObject, SEASON } from './boards';
import { CORS, json, jsonBody } from './http';
import type { Env } from './index';
import { botApi } from './payments';
import { speaksRussian } from './catalogue';
import { leagueStub, roomName } from './league';
import { type Job, leagueJob, mayWrite, overtakenJob, REMIND_HOUR, streakReminder, subKey, type Subscriber, WEEKLY_HOUR, weeklyResult } from './reminders';
import { verifyInitData, WEEK_SECONDS } from './telegram-auth';

/*
 * The bot's reminders, for players who asked for them (the game asks with
 * WebApp.requestWriteAccess first) and never more than one a day:
 *   - the daily streak at risk: the evening before it would break, if today's daily dungeon is not begun;
 *   - the week's result on Monday morning: the place on last week's board (and a medal for the top 10).
 * A player who blocks the bot is forgotten at the first message that fails.
 *
 *   POST /notify { initData, on }   asks for reminders, or stops them
 *
 * One object (Notifier, "all") keeps the subscribers and sends in small batches by its alarm, so a
 * long list never makes one invocation too long.
 */

/** Messages sent per alarm. */
const BATCH = 25;

export class Notifier extends DurableObject<Env> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = (await request.json()) as Record<string, unknown>;
    const chat = Number(body.chat);
    if (!Number.isSafeInteger(chat)) return json({ error: 'bad chat' }, 400);
    const key = subKey(chat);
    const sub = await this.ctx.storage.get<Subscriber>(key);
    switch (url.pathname) {
      case '/subscribe':
        if (body.on) await this.ctx.storage.put(key, { streak: 0, last: null, ...sub, chat, ru: Boolean(body.ru) } satisfies Subscriber);
        else await this.ctx.storage.delete(key);
        return json({ on: Boolean(body.on) });
      case '/streak':
        // From the player's object when a daily dungeon begins; nothing is kept for those who did not ask.
        if (sub) await this.ctx.storage.put(key, { ...sub, streak: Number(body.streak) || 0, last: typeof body.last === 'string' ? body.last : sub.last, season: SEASON });
        return json({ ok: true });
      case '/league':
        // From the player's object when they join a room: the Monday message says how the week ended in it (nothing is kept for those who did not ask).
        if (sub && typeof body.tier === 'string' && typeof body.week === 'string' && Number.isInteger(body.room)) {
          await this.ctx.storage.put(key, { ...sub, league: { tier: body.tier, week: body.week, room: body.room as number } });
        }
        return json({ ok: true });
      case '/overtaken': {
        // From the player's object when a result passes someone on the day's board: one message a day at most, to those who asked.
        const now = Date.now();
        const job = sub ? overtakenJob(sub, String(body.who ?? ''), Number(body.place), now) : null;
        if (!sub || !job) return json({ queued: false });
        await this.ctx.storage.put(key, { ...sub, sent: dayOf(now) });
        await this.enqueue([job]);
        return json({ queued: true });
      }
      default:
        return json({ error: 'not found' }, 404);
    }
  }

  /** Puts messages in the queue the alarm sends from. */
  private async enqueue(jobs: Job[]): Promise<void> {
    const queue = (await this.ctx.storage.get<Job[]>('queue')) ?? [];
    await this.ctx.storage.put('queue', [...queue, ...jobs]);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + 1000);
  }

  /** The hourly tick (index.ts scheduled): queues what is due now; the alarm sends it. */
  async tick(now: number): Promise<void> {
    const hour = new Date(now).getUTCHours();
    const monday = new Date(now).getUTCDay() === 1;
    const jobs: Job[] = [];
    const subs = await this.ctx.storage.list<Subscriber>({ prefix: 's:' });
    if (hour === REMIND_HOUR) {
      const today = dayOf(now);
      for (const [key, sub] of subs) {
        const job = streakReminder(sub, now);
        if (!job) continue;
        jobs.push(job);
        await this.ctx.storage.put(key, { ...sub, sent: today });
      }
    }
    if (monday && hour === WEEKLY_HOUR) {
      const week = weekOf(now - 7 * 86_400_000);
      const name = `week:${week}`;
      const response = await this.env.DAILY.get(this.env.DAILY.idFromName(boardObject(name))).fetch(`https://board/?name=${encodeURIComponent(name)}&owners=1&top=0`);
      const { owners = {}, total = 0 } = (await response.json()) as { owners?: Record<string, number>; total?: number };
      // Those who were in a league room get the league's result (one look at each room, not at each player); the rest, the week's place.
      const rooms = new Map<string, Record<string, number>>();
      const roomOwners = async (sub: Subscriber): Promise<Record<string, number>> => {
        const { tier, room } = sub.league!;
        const name = roomName(tier, week, room);
        if (!rooms.has(name)) {
          try {
            const answer = (await (await leagueStub(this.env, name).fetch('https://league/?owners=1')).json()) as { owners?: Record<string, number>; size?: number };
            rooms.set(name, { ...(answer.owners ?? {}), size: answer.size ?? 0 });
          } catch {
            rooms.set(name, {});
          }
        }
        return rooms.get(name)!;
      };
      for (const [key, sub] of subs) {
        // Not twice in a day: the bot has written to them already (a pass on the board).
        if (sub.week === week || !mayWrite(sub, now)) continue;
        if (sub.league?.week === week) {
          const seen = await roomOwners(sub);
          const place = seen[`tg${sub.chat}`];
          if (!place || !seen.size) continue;
          jobs.push(leagueJob(sub, week, sub.league.tier, place, seen.size));
        } else {
          const place = owners[`tg${sub.chat}`];
          if (!place) continue;
          jobs.push(weeklyResult(sub, week, place, total));
        }
        await this.ctx.storage.put(key, { ...sub, week, sent: dayOf(now) });
      }
    }
    if (jobs.length === 0) return;
    await this.enqueue(jobs);
  }

  override async alarm(): Promise<void> {
    const queue = (await this.ctx.storage.get<Job[]>('queue')) ?? [];
    const batch = queue.splice(0, BATCH);
    await this.ctx.storage.put('queue', queue);
    if (this.env.BOT_TOKEN) {
      const bot = botApi(this.env.BOT_TOKEN);
      const app = this.env.APP_LINK ?? 'https://t.me/pixel_dungeon_gamebot/pixel_dungeon';
      for (const job of batch) {
        try {
          await bot('sendMessage', {
            chat_id: job.chat, text: job.text,
            reply_markup: { inline_keyboard: [[{ text: job.button, url: job.start === 'play' ? `${app}?mode=fullscreen` : `${app}?startapp=${job.start}&mode=fullscreen` }]] },
          });
        } catch (error) {
          // Blocked, or the chat is gone: no more reminders there.
          if (/blocked|deactivated|chat not found|403/i.test(String(error))) await this.ctx.storage.delete(subKey(job.chat));
        }
      }
    }
    if (queue.length > 0) await this.ctx.storage.setAlarm(Date.now() + 1000);
  }
}

export const notifierStub = (env: Env): DurableObjectStub<Notifier> => env.NOTIFIER.get(env.NOTIFIER.idFromName('all'));

/** POST /notify: reminders on or off, for the Telegram player behind the init data. */
export async function notifyRoute(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!env.BOT_TOKEN) return json({ error: 'reminders need Telegram' }, 503);
  const body = await jsonBody(request);
  if (!body || typeof body.initData !== 'string') return json({ error: 'bad json' }, 400);
  const user = await verifyInitData(body.initData, env.BOT_TOKEN, WEEK_SECONDS);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const response = await notifierStub(env).fetch('https://notifier/subscribe', {
    method: 'POST', body: JSON.stringify({ chat: user.id, on: body.on === true, ru: speaksRussian(user.language_code) }),
  });
  return json(await response.json());
}
