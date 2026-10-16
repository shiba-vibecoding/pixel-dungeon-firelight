import { dayOf } from '@pd/core';
import compete from '../../client/public/assets/compete/compete.json';
import { SEASON } from './boards';
import { outcomeOf } from './league-rules';

/* What the bot's reminders say and when (notifier.ts sends them). Pure logic. */

export interface Subscriber {
  chat: number;
  ru: boolean;
  /** The streak as the player's object last told, and the last day it was kept (a daily begun). */
  streak: number;
  last: string | null;
  /** The last day the bot wrote to the player (any message: the bot never writes twice in a day), and the last week whose result did. */
  sent?: string;
  week?: string;
  /** The season that streak belongs to (boards.ts); a streak of an earlier season was wiped with the world and is not reminded of. */
  season?: number;
  /** The league room the player is in this week (told by their object when they join one): the Monday message says how the week ended there. */
  league?: { tier: string; week: string; room: number };
}

export type Job = { chat: number; text: string; button: string; start: string };

/** When the streak reminder goes (UTC hour): evening in Europe, before the day's end at midnight UTC. */
export const REMIND_HOUR = 17;
/** When last week's results go out on Monday (UTC hour). */
export const WEEKLY_HOUR = 8;
export const subKey = (chat: number): string => `s:${chat}`;

/** Whether the bot may still write to this subscriber today: it writes at most once a day in all, whatever the message is. */
export const mayWrite = (sub: Pick<Subscriber, 'sent'>, now: number): boolean => sub.sent !== dayOf(now);

/** A player is told they were passed on the day's board only while they stand this high on it. */
export const OVERTAKEN_TOP = 50;

/** The time left of the UTC day, as the message words it: «5 ч 12 мин», «5 h 12 min», «9 мин». */
export function dayLeft(now: number, ru: boolean): string {
  const minutes = Math.max(1, Math.ceil((Date.parse(`${dayOf(now)}T00:00:00Z`) + 86_400_000 - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  const [h, m] = ru ? ['ч', 'мин'] : ['h', 'min'];
  return hours > 0 ? `${hours} ${h} ${minutes % 60} ${m}` : `${minutes} ${m}`;
}

const fill = (text: string, values: Record<string, string | number>): string => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

/**
 * «Someone passed you on today's board», for a subscriber who has just been passed: only if they asked for reminders (a subscriber is
 * one who did), still stand in the day's top 50, and the bot has not written to them today. `place` is where they stand now.
 */
export function overtakenJob(sub: Subscriber, who: string, place: number, now: number): Job | null {
  if (!mayWrite(sub, now) || place > OVERTAKEN_TOP || place < 1) return null;
  const words = compete.strings[sub.ru ? 'ru' : 'en'].n_overtaken;
  return {
    chat: sub.chat,
    text: `🔥 ${words.title}\n${fill(words.text, { who: who.slice(0, 32), n: place, t: dayLeft(now, sub.ru) })}`,
    button: words.button,
    start: 'boards',
  };
}

/**
 * The league's result on Monday morning (replacing the plain weekly place for those who were in a room): the place in the room, and
 * whether it takes them up, keeps them or sends them down. `place` and `size` are the room's last standing.
 */
export function leagueJob(sub: Subscriber, week: string, tier: string, place: number, size: number): Job {
  const lang = sub.ru ? 'ru' : 'en';
  const words = compete.strings[lang].n_league;
  const name = (key: string): string => compete.leagues.tiers.find((entry) => entry.key === key)?.name[lang] ?? key;
  const outcome = outcomeOf(tier, place, size);
  const res = fill(words[outcome.result], { t2: name(outcome.to) });
  return {
    chat: sub.chat,
    text: `🔥 ${words.title}\n${fill(words.text, { w: week.split('-W')[1] ?? week, n: place, m: size, t: name(tier), res })}`,
    button: words.button,
    start: 'league',
  };
}

/** The streak reminder for a subscriber now, if one is due. */
export function streakReminder(sub: Subscriber, now: number): Job | null {
  const today = dayOf(now);
  const yesterday = dayOf(now - 86_400_000);
  if ((sub.season ?? 1) < SEASON || sub.streak < 2 || sub.last !== yesterday || sub.sent === today) return null;
  return {
    chat: sub.chat,
    text: sub.ru
      ? `🔥 Ваша серия — ${sub.streak} ${daysRu(sub.streak)} подряд — сгорит в полночь по UTC. Подземелье дня ждёт!`
      : `🔥 Your ${sub.streak}-day streak breaks at midnight UTC. Today's dungeon is waiting!`,
    button: sub.ru ? 'Спуститься' : 'Descend',
    start: 'daily',
  };
}

function daysRu(n: number): string {
  const tens = n % 100;
  const ones = n % 10;
  if (tens >= 11 && tens <= 14) return 'дней';
  return ones === 1 ? 'день' : ones >= 2 && ones <= 4 ? 'дня' : 'дней';
}

/** Last week's result for a subscriber who was on its board. */
export function weeklyResult(sub: Subscriber, week: string, place: number, total: number): Job {
  const medal = place <= 10;
  return {
    chat: sub.chat,
    text: sub.ru
      ? `Неделя ${week.split('-W')[1]} закрылась. Ваше место в недельном рейтинге: #${place} из ${total}.${medal ? '\n🏅 Вы в десятке лучших — медаль недели ваша!' : ''}\nНовая неделя уже идёт.`
      : `Week ${week.split('-W')[1]} is over. Your place on the weekly board: #${place} of ${total}.${medal ? '\n🏅 Top 10 — the week\'s medal is yours!' : ''}\nA new week has begun.`,
    button: sub.ru ? 'Играть' : 'Play',
    start: 'play',
  };
}

