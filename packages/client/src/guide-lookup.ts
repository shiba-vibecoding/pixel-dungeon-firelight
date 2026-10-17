import { GUIDE_EN } from './i18n-guide';
import { GUIDE_RU } from './i18n-guide.ru';

/*
 * The guide («Памятка», i18n-guide.ts and .ru.ts) as something to look things up in, without a screen: the bot's inline mode
 * and its /guide command (server/src/guide.ts) answer from here, so a chat sees the very texts the game shows, and the
 * game opens at an article by the start parameter `guide_<id>`. Pure and free of the DOM: the server imports it by path.
 * Not imported by the game itself, which loads one language's guide at a time.
 */

export type GuideLanguage = 'ru' | 'en';

export interface GuideArticle {
  id: string;
  title: string;
  /** The whole article in plain text: paragraphs separated by a blank line, lines of a list by a line break. */
  text: string;
}

const GUIDES = { en: GUIDE_EN, ru: GUIDE_RU } as const;

/** Words that find an article besides its own title and text (both languages; a Russian word is looked up by its stem, see `stem`). */
const ALIASES: Readonly<Record<string, string>> = {
  growth: 'рост прокачка уровень сила талант подкласс класс level strength talent subclass grow experience',
  hunger: 'голод еда паек сытость мясо food ration hungry starving satiety meat',
  ankh: 'анкх анк анкер якорь воскрешение воскресить ankh anchor resurrection resurrect revive',
  curses: 'проклятие проклятый проклятая curse cursed',
  uncurse: 'проклятие снять снятие curse uncurse remove',
  haggler: 'лавка магазин торговец торговля цена продажа shop shopkeeper haggler price sell',
  mimics: 'мимик сундук ларец chest mimic',
  well: 'колодец знание здоровье well awareness health',
  seeds: 'семя семена трава роса seed seeds grass dew plant',
  score: 'очки счёт счет рекорд score points',
  challenges: 'испытание испытания челлендж challenge challenges',
  vial: 'фляга роса капля dew vial drop',
  alchemy: 'котёл котел котла котле котлу варка варить зелье зелья alchemy potion brew pot cauldron',
  search: 'поиск искать секрет потайной потайные дверь ловушка search secret hidden door magnifier',
  traps: 'ловушка ловушки цвет цвета trap traps colour color colours colors',
};

/** The articles people ask about most, for a query with nothing in it. */
const TOP = ['hunger', 'ankh', 'curses', 'uncurse', 'alchemy', 'search', 'traps', 'challenges', 'mimics', 'haggler'] as const;

/** «Based on …» line under an article. */
const RULES_LINE: Readonly<Record<GuideLanguage, string>> = {
  ru: 'Правила Pixel Dungeon 1.9.2a, проверено по коду игры',
  en: 'Rules of Pixel Dungeon 1.9.2a, checked against the game’s code',
};

/** The words on the button that opens the game at the article. */
const OPEN_IN_GAME: Readonly<Record<GuideLanguage, string>> = { ru: 'Открыть в игре', en: 'Open in game' };

const capitalise = (text: string): string => (text ? text[0]!.toUpperCase() + text.slice(1) : text);

/** The guide in a language: its entries and the trap colours last, as the game's own list has them. */
export function guideArticles(lang: GuideLanguage): GuideArticle[] {
  const G = GUIDES[lang];
  const traps = [G.trapColourText, G.trapColours.map(([name, what]) => `• ${capitalise(name)}: ${what}`).join('\n'), G.trapColourNote].join('\n\n');
  return [...G.entries.map(({ id, title, text }) => ({ id, title, text })), { id: 'traps', title: G.trapColourTitle, text: traps }];
}

/** The footer of an article, and the button's words. */
export const guideRulesLine = (lang: GuideLanguage): string => RULES_LINE[lang];
export const guideOpenLabel = (lang: GuideLanguage): string => OPEN_IN_GAME[lang];

/** The language a query is in: by its letters, or the asker's own language when it has none (a Cyrillic letter wins). */
export function guideLanguage(query: string, languageCode?: string): GuideLanguage {
  if (/[Ѐ-ӿ]/.test(query)) return 'ru';
  if (/[a-z]/i.test(query)) return 'en';
  return /^(ru|uk|be|kk)/i.test(languageCode ?? '') ? 'ru' : 'en';
}

/** True if the query has letters to tell the language by (what decides whether an answer is the same for everybody). */
export const guideQueryHasLetters = (query: string): boolean => /[a-zЀ-ӿ]/i.test(query);

/** The start parameter that opens the game at an article (`startapp=guide_<id>`; letters, digits and `_` only, at most 64). */
export const guideStartParam = (id: string): string => `guide_${id}`;

/** The article a start parameter names, or null. The parameter comes from a link anybody can write: only a known id counts. */
export function guideIdFromStart(start: string | null | undefined): string | null {
  const id = /^guide_([a-z]{2,16})$/.exec(start ?? '')?.[1];
  return id && id in ALIASES ? id : null;
}

export const GUIDE_IDS: readonly string[] = guideArticles('en').map((article) => article.id);

const normalise = (text: string): string => text.toLowerCase().replace(/ё/g, 'е');
const wordsOf = (text: string): string[] => normalise(text).match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * What a word is looked up by: a Russian word loses its ending (голод → голо, so голода and голодный are found), an English plural its s.
 * Words are matched from their beginning, so «ключ» finds ключи but not включённое.
 */
function stem(word: string): string {
  if (/[а-я]/.test(word)) return word.length >= 7 ? word.slice(0, -2) : word.length >= 5 ? word.slice(0, -1) : word;
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

/** The most words and the longest word looked up in a query. */
const MAX_TOKENS = 5;
const MAX_TOKEN = 32;

/** The words a query is looked up by (stems); none for a query shorter than two letters. */
export function queryTokens(query: string): string[] {
  const words = wordsOf(query.slice(0, 100)).filter((word) => word.length >= 2).slice(0, MAX_TOKENS);
  return words.map((word) => stem(word.slice(0, MAX_TOKEN)));
}

export interface GuideHit extends GuideArticle {
  score: number;
}

/**
 * The articles that answer a query, best first. Every word of the query must be found somewhere in the article: in its title (the most
 * points, a few more for the title's first word), in the extra words that name it (alias) or in its text. The titles and texts are
 * of the given language; the aliases serve both. An empty query finds the top articles.
 */
export function searchGuide(query: string, lang: GuideLanguage, limit = 10): GuideHit[] {
  const tokens = queryTokens(query);
  const articles = guideArticles(lang);
  if (tokens.length === 0) {
    return TOP.slice(0, limit).map((id, i) => ({ ...articles.find((a) => a.id === id)!, score: TOP.length - i }));
  }
  const hits: GuideHit[] = [];
  for (const article of articles) {
    const title = wordsOf(article.title);
    const aliases = wordsOf(ALIASES[article.id] ?? '');
    const body = wordsOf(article.text);
    let score = 0;
    for (const token of tokens) {
      const inTitle = title.findIndex((word) => word.startsWith(token));
      const points = inTitle >= 0 ? (inTitle === 0 ? 12 : 10) : aliases.some((word) => word.startsWith(token)) ? 8 : body.some((word) => word.startsWith(token)) ? 3 : 0;
      if (points === 0) {
        score = 0;
        break;
      }
      score += points;
    }
    if (score > 0) hits.push({ ...article, score });
  }
  // Best first; the guide's own order among equals (sort is stable).
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
