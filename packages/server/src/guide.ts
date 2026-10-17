import {
  GUIDE_IDS, type GuideArticle, type GuideHit, guideArticles, guideLanguage, type GuideLanguage, guideOpenLabel, guideQueryHasLetters,
  guideRulesLine, guideStartParam, searchGuide,
} from '../../client/src/guide-lookup';
import { WindowLimiter } from './limits';

/*
 * The guide («Памятка») in any chat. Inline mode: `@bot голод` lists the matching articles and the one picked is sent as a message with
 * an «Open in game» button (a Mini App link that opens the guide at that article, `startapp=guide_<id>`). The commands /guide and
 * /памятка (private chats, and groups the bot is in) answer with one article; with no topic, or an unclear one, the topics as buttons.
 * The texts are the game's own (client/src/guide-lookup.ts). Only what was asked is answered, each asker within a limit; a group
 * is never answered more than a few times in a while. Kept apart from the Worker so it can be tested with a fake Bot API.
 */

/** Telegram's limits on what we send: a message (4096 characters), an inline result's title and description. */
const MAX_MESSAGE = 4096;
const MAX_DESCRIPTION = 110;
/** How long Telegram may keep an inline answer for others asking the same, in seconds. */
export const INLINE_CACHE_SECONDS = 300;
/** The most results to an inline query (Telegram allows 50). */
const INLINE_RESULTS = 10;
/** The longest query looked at (Telegram's own limit is 256). */
const MAX_QUERY = 100;

/** The text with the characters that mean markup in Telegram's HTML escaped: all that parse_mode HTML needs. */
export const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The Mini App link that opens the game at an article, or nothing when the bot's link is not set. */
export function guideLink(appLink: string, id: string): string | undefined {
  return appLink ? `${appLink}?startapp=${guideStartParam(id)}` : undefined;
}

interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}
export interface Markup {
  inline_keyboard: InlineButton[][];
}

/** An article as a message in HTML: the title bold, the text, the line of what the rules are. Everything from the guide is escaped. */
export function articleMessage(article: GuideArticle, lang: GuideLanguage): string {
  const text = `<b>${escapeHtml(article.title)}</b>\n\n${escapeHtml(article.text)}\n\n<i>${escapeHtml(guideRulesLine(lang))}</i>`;
  return text.slice(0, MAX_MESSAGE);
}

/** The button under an article: opens the game at it; none when the bot's link is not set. */
export function articleMarkup(id: string, lang: GuideLanguage, appLink: string): Markup | undefined {
  const url = guideLink(appLink, id);
  return url ? { inline_keyboard: [[{ text: guideOpenLabel(lang), url }]] } : undefined;
}

/** The first sentence, cut to fit an inline result's description. */
function firstSentence(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s+/u)[0] ?? text;
  return sentence.length > MAX_DESCRIPTION ? `${sentence.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : sentence;
}

/** Inline mode's InlineQueryResultArticle: the title and a line in the list, the whole article as the message that is sent. */
export function inlineResult(article: GuideArticle, lang: GuideLanguage, appLink: string): Record<string, unknown> {
  const markup = articleMarkup(article.id, lang, appLink);
  return {
    type: 'article',
    id: article.id,
    title: article.title,
    description: firstSentence(article.text),
    input_message_content: { message_text: articleMessage(article, lang), parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    ...(markup ? { reply_markup: markup } : {}),
  };
}

export interface InlineQuery {
  id: string;
  from: { id: number; language_code?: string; is_bot?: boolean };
  query: string;
}

/**
 * The parameters of answerInlineQuery for a query. The language is the query's own (by its letters) so the answer is the same for
 * everyone who asks it and may be kept by Telegram for 300 seconds; a query with no letters (empty) is in the asker's language, so
 * that answer is theirs alone (is_personal).
 */
export function inlineAnswer(query: InlineQuery, appLink: string): Record<string, unknown> {
  const text = query.query.slice(0, MAX_QUERY);
  const lang = guideLanguage(text, query.from.language_code);
  const personal = !guideQueryHasLetters(text);
  return {
    inline_query_id: query.id,
    results: searchGuide(text, lang, INLINE_RESULTS).map((hit) => inlineResult(hit, lang, appLink)),
    cache_time: INLINE_CACHE_SECONDS,
    is_personal: personal,
  };
}

/** The commands that ask for the guide: /guide for everybody (a command is ASCII), /памятка as typed text. */
const COMMANDS = new Set(['/guide', '/pamyatka', '/pamiatka', '/памятка']);

export interface GuideCommand {
  topic: string;
}

/**
 * The guide command in a message, or null. `/guide@thisbot ankh` is ours, `/guide@otherbot` is another bot's (a group may hold several).
 * `botName` is this bot's username when known.
 */
export function parseGuideCommand(text: string, botName?: string): GuideCommand | null {
  const words = text.trim();
  if (!words.startsWith('/')) return null;
  const head = /^\S+/u.exec(words)![0];
  const [command, target] = head.split('@') as [string, string | undefined];
  if (!COMMANDS.has(command.toLowerCase())) return null;
  if (target !== undefined && botName && target.toLowerCase() !== botName.toLowerCase()) return null;
  return { topic: words.slice(head.length).trim().slice(0, MAX_QUERY) };
}

/** The bot's username from its Mini App link (https://t.me/<bot>/<app>), if it has one. */
export function botNameOf(appLink: string): string | undefined {
  return /^https?:\/\/t\.me\/([A-Za-z0-9_]+)/.exec(appLink)?.[1];
}

const TOPICS_LINE: Readonly<Record<GuideLanguage, string>> = {
  ru: 'Памятка. Выберите тему или напишите «/памятка голод».',
  en: 'The guide. Pick a topic, or write “/guide hunger”.',
};
const NOT_FOUND_LINE: Readonly<Record<GuideLanguage, string>> = {
  ru: 'Такой статьи нет. Вот темы Памятки:',
  en: 'No such article. The guide’s topics:',
};
const SEVERAL_LINE: Readonly<Record<GuideLanguage, string>> = {
  ru: 'Нашлось несколько статей, выберите:',
  en: 'Several articles fit, pick one:',
};
const SLOW_DOWN: Readonly<Record<GuideLanguage, string>> = { ru: 'Не так быстро.', en: 'Not so fast.' };
export const guideSlowDown = (lang: GuideLanguage): string => SLOW_DOWN[lang];

/** Buttons that ask for an article (a callback; answered by `articleForCallback`), two to a row. */
export function topicButtons(articles: readonly GuideArticle[]): Markup {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < articles.length; i += 2) {
    rows.push(articles.slice(i, i + 2).map((a) => ({ text: a.title.slice(0, 40), callback_data: `g:${a.id}` })));
  }
  return { inline_keyboard: rows };
}

/** What the bot says to a guide command: a message and its markup, in HTML when `html`. */
export interface GuideReply {
  text: string;
  html: boolean;
  markup?: Markup;
}

/** One article, with its button. */
function articleReply(article: GuideArticle, lang: GuideLanguage, appLink: string): GuideReply {
  const markup = articleMarkup(article.id, lang, appLink);
  return { text: articleMessage(article, lang), html: true, ...(markup ? { markup } : {}) };
}

/**
 * The answer to /guide <topic>. No topic: the topics as buttons. A topic that clearly names one article: that article. A topic that
 * fits several: those as buttons. One that fits none: the topics as buttons. The language is the topic's own by its letters, else the
 * asker's.
 */
export function guideReply(topic: string, languageCode: string | undefined, appLink: string): GuideReply {
  const lang = guideLanguage(topic, languageCode);
  const all = guideArticles(lang);
  if (!topic.trim()) return { text: TOPICS_LINE[lang], html: false, markup: topicButtons(all) };
  const hits = searchGuide(topic, lang, 6);
  if (hits.length === 0) return { text: NOT_FOUND_LINE[lang], html: false, markup: topicButtons(all) };
  const [best, next] = hits as [GuideHit, GuideHit | undefined];
  // One that stands out is the answer; otherwise the asker picks.
  if (!next || best.score - next.score >= 2) return articleReply(best, lang, appLink);
  // Those that fit nearly as well as the best, not every article that mentions the word.
  return { text: SEVERAL_LINE[lang], html: false, markup: topicButtons(hits.filter((hit) => hit.score >= best.score - 3)) };
}

/** The article a topic button names (`g:<id>`), in the asker's language; null for data that is not ours. */
export function articleForCallback(data: string | undefined, languageCode: string | undefined, appLink: string): GuideReply | null {
  const id = /^g:([a-z]{2,16})$/.exec(data ?? '')?.[1];
  if (!id || !GUIDE_IDS.includes(id)) return null;
  const lang = guideLanguage('', languageCode);
  const article = guideArticles(lang).find((a) => a.id === id);
  return article ? articleReply(article, lang, appLink) : null;
}

/** The three allowances: an asker's, a group's, and inline queries'. In memory only (limits.ts WindowLimiter). */
export interface GuideLimits {
  user: WindowLimiter;
  group: WindowLimiter;
  inline: WindowLimiter;
}

export function newGuideLimits(): GuideLimits {
  return {
    // A person reads a handful of articles at a time.
    user: new WindowLimiter(20, 10 * 60_000),
    // A group is answered a few times in a while whoever asks, so a command cannot become noise in it.
    group: new WindowLimiter(8, 10 * 60_000),
    // Inline queries come with every pause in typing; Telegram keeps repeats, this keeps a runaway client out.
    inline: new WindowLimiter(60, 60_000),
  };
}

/** True if this asker may be answered now, in a private chat or a group (and counts it). Without limits, always. */
export function mayAnswer(limits: GuideLimits | undefined, user: number, chat: { id: number; type: string }, now: number): boolean {
  if (!limits) return true;
  const person = limits.user.allow(`u${user}`, now);
  if (chat.type === 'private') return person;
  // Both are counted: a group's allowance is spent by every answer in it.
  const group = limits.group.allow(`c${chat.id}`, now);
  return person && group;
}
