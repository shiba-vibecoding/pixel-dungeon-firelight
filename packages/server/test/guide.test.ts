import { describe, expect, it } from 'vitest';
import { GUIDE_IDS, guideArticles, guideIdFromStart, guideLanguage, queryTokens, searchGuide } from '../../client/src/guide-lookup';
import { GUIDE_EN } from '../../client/src/i18n-guide';
import { GUIDE_RU } from '../../client/src/i18n-guide.ru';
import {
  articleForCallback, articleMessage, botNameOf, escapeHtml, guideReply, inlineAnswer, mayAnswer, newGuideLimits, parseGuideCommand,
} from '../src/guide';
import { type BotApi, type BotConfig, handleUpdate, type Wallets } from '../src/payments';

const NOW = Date.UTC(2026, 9, 17);
const LINK = 'https://t.me/pixel_dungeon_gamebot/pixel_dungeon';

type Call = { method: string; params: Record<string, any> };
function fakeApi(): { api: BotApi; calls: Call[] } {
  const calls: Call[] = [];
  return { calls, api: async (method, params) => (calls.push({ method, params }), true) };
}
/** The guide never touches a wallet. */
const wallets = {
  get: async () => { throw new Error('no wallet here'); },
  apply: async () => { throw new Error('no wallet here'); },
} as unknown as Wallets;
const config = (more: Partial<BotConfig> = {}): BotConfig => ({ appLink: LINK, ...more });
const idsOf = (query: string, lang: 'ru' | 'en' = guideLanguage(query)) => searchGuide(query, lang).map((hit) => hit.id);

describe('the guide, looked up', () => {
  it('has the same articles in both languages, with the traps last', () => {
    const ru = guideArticles('ru');
    const en = guideArticles('en');
    expect(ru.map((a) => a.id)).toEqual(en.map((a) => a.id));
    expect(GUIDE_IDS.at(-1)).toBe('traps');
    expect(ru.length).toBe(GUIDE_RU.entries.length + 1);
    expect(en.length).toBe(GUIDE_EN.entries.length + 1);
    // The traps article carries the colours, the others are the game's own text.
    expect(ru.at(-1)!.text).toContain('• Красный: сигнальная ловушка');
    expect(en.find((a) => a.id === 'hunger')!.text).toBe(GUIDE_EN.entries.find((e) => e.id === 'hunger')!.text);
  });

  it('finds articles by a Russian word, with endings', () => {
    expect(idsOf('голод')[0]).toBe('hunger');
    expect(idsOf('голода')[0]).toBe('hunger');
    expect(idsOf('Анкх')[0]).toBe('ankh');
    expect(idsOf('проклятие').slice(0, 2).sort()).toEqual(['curses', 'uncurse']);
    expect(idsOf('котёл')[0]).toBe('alchemy');
    expect(idsOf('котел')[0]).toBe('alchemy');
    expect(idsOf('мимик')[0]).toBe('mimics');
  });

  it('finds articles by an English word, and by the aliases both ways', () => {
    expect(idsOf('hunger')[0]).toBe('hunger');
    expect(idsOf('ankh')[0]).toBe('ankh');
    expect(idsOf('anchor')[0]).toBe('ankh');
    expect(idsOf('cauldron')[0]).toBe('alchemy');
    expect(idsOf('curse').slice(0, 2).sort()).toEqual(['curses', 'uncurse']);
    expect(idsOf('seeds')).toContain('seeds');
    expect(idsOf('trap colour')[0]).toBe('traps');
  });

  it('matches words from their beginning, so «ключ» is not found inside «включено»', () => {
    const ids = idsOf('ключ');
    expect(ids).toContain('ankh');
    expect(ids).not.toContain('challenges');
    expect(idsOf('key')).toContain('ankh');
  });

  it('needs every word of the query', () => {
    expect(idsOf('голод анкх')).toEqual([]);
    expect(idsOf('zzzzzz')).toEqual([]);
    expect(idsOf('hunger ration')[0]).toBe('hunger');
  });

  it('gives the top articles for an empty query, and limits the number', () => {
    const top = searchGuide('', 'ru');
    expect(top.map((a) => a.id).slice(0, 3)).toEqual(['hunger', 'ankh', 'curses']);
    expect(top.length).toBe(10);
    expect(searchGuide('  ', 'en', 3).length).toBe(3);
    expect(searchGuide('я', 'ru').length).toBe(10);
  });

  it('is not troubled by odd queries', () => {
    expect(queryTokens('a b c d e f g h')).toEqual([]);
    expect(queryTokens('x'.repeat(500)).every((t) => t.length <= 32)).toBe(true);
    expect(() => searchGuide('(*+?[\\', 'en')).not.toThrow();
    expect(idsOf('<script>')).toEqual([]);
  });

  it('picks the language from the query, else from the asker', () => {
    expect(guideLanguage('голод')).toBe('ru');
    expect(guideLanguage('ankh', 'ru')).toBe('en');
    expect(guideLanguage('', 'ru-RU')).toBe('ru');
    expect(guideLanguage('', 'uk')).toBe('ru');
    expect(guideLanguage('', 'en')).toBe('en');
    expect(guideLanguage('42', undefined)).toBe('en');
  });

  it('reads the start parameter of a link only when it names a known article', () => {
    expect(guideIdFromStart('guide_hunger')).toBe('hunger');
    expect(guideIdFromStart('guide_traps')).toBe('traps');
    expect(guideIdFromStart('guide_nope')).toBeNull();
    expect(guideIdFromStart('guide_HUNGER')).toBeNull();
    expect(guideIdFromStart('hunger')).toBeNull();
    expect(guideIdFromStart(undefined)).toBeNull();
    // Every article’s payload is one Telegram accepts (letters, digits, _ and -, at most 64) and one the game reads.
    for (const id of GUIDE_IDS) expect(guideIdFromStart(`guide_${id}`)).toBe(id);
  });
});

describe('the guide in inline mode', () => {
  const query = (text: string, language?: string) => ({ id: 'q1', from: { id: 7, ...(language ? { language_code: language } : {}) }, query: text });

  it('answers with articles: title, a line, the whole text as the message, the deep link as the button', () => {
    const answer = inlineAnswer(query('голод', 'en'), LINK) as any;
    expect(answer.inline_query_id).toBe('q1');
    const first = answer.results[0];
    expect(first).toMatchObject({ type: 'article', id: 'hunger', title: 'Голод' });
    expect(first.description.length).toBeLessThanOrEqual(110);
    expect(first.input_message_content.parse_mode).toBe('HTML');
    expect(first.input_message_content.message_text).toContain('<b>Голод</b>');
    expect(first.input_message_content.message_text).toContain(GUIDE_RU.entries.find((e) => e.id === 'hunger')!.text);
    expect(first.input_message_content.message_text).toContain('Pixel Dungeon 1.9.2a');
    expect(first.reply_markup).toEqual({ inline_keyboard: [[{ text: 'Открыть в игре', url: `${LINK}?startapp=guide_hunger` }]] });
    expect(new Set(answer.results.map((r: any) => r.id)).size).toBe(answer.results.length);
  });

  it('answers in English to an English query, whatever the asker’s language', () => {
    const answer = inlineAnswer(query('ankh', 'ru'), LINK) as any;
    expect(answer.results[0]).toMatchObject({ id: 'ankh', title: 'The ankh' });
    expect(answer.results[0].reply_markup.inline_keyboard[0][0].text).toBe('Open in game');
  });

  it('keeps an answer for 300 seconds for everybody, except an empty query, which is in the asker’s language', () => {
    expect(inlineAnswer(query('голод'), LINK)).toMatchObject({ cache_time: 300, is_personal: false });
    const empty = inlineAnswer(query('', 'ru'), LINK) as any;
    expect(empty).toMatchObject({ cache_time: 300, is_personal: true });
    expect(empty.results.length).toBe(10);
    expect(empty.results[0].title).toBe('Голод');
    expect((inlineAnswer(query('', 'en'), LINK) as any).results[0].title).toBe('Hunger');
  });

  it('answers a query that finds nothing with no results, and makes no button without the bot’s link', () => {
    expect((inlineAnswer(query('zzzzz'), LINK) as any).results).toEqual([]);
    const bare = (inlineAnswer(query('hunger'), '') as any).results[0];
    expect(bare.reply_markup).toBeUndefined();
  });

  it('escapes what it sends as HTML, whatever the texts hold', () => {
    expect(escapeHtml('a < b && c > d')).toBe('a &lt; b &amp;&amp; c &gt; d');
    const message = articleMessage({ id: 'x', title: '<b>T</b>', text: 'a & <i>b</i>' }, 'en');
    expect(message).toContain('<b>&lt;b&gt;T&lt;/b&gt;</b>');
    expect(message).toContain('a &amp; &lt;i&gt;b&lt;/i&gt;');
    // Every article of the guide: the only tags are ours, and the message fits Telegram's limit.
    for (const lang of ['ru', 'en'] as const) {
      for (const article of guideArticles(lang)) {
        const body = articleMessage(article, lang);
        expect(body.replace(/<\/?(b|i)>/g, '')).not.toMatch(/[<>]/);
        expect(body.length).toBeLessThanOrEqual(4096);
      }
    }
  });

  it('is handled by the webhook, and not for a bot, nor past the allowance', async () => {
    const { api, calls } = fakeApi();
    const limits = newGuideLimits();
    await handleUpdate({ inline_query: query('голод', 'ru') }, api, wallets, config({ guideLimits: limits }), NOW);
    expect(calls.map((c) => c.method)).toEqual(['answerInlineQuery']);
    await handleUpdate({ inline_query: { id: 'b', from: { id: 8, is_bot: true }, query: 'x' } }, api, wallets, config(), NOW);
    expect(calls.length).toBe(1);
    for (let i = 0; i < 80; i++) await handleUpdate({ inline_query: query('ankh') }, api, wallets, config({ guideLimits: limits }), NOW + 1000);
    // 60 a minute for one person: the 1 above and 59 of these.
    expect(calls.length).toBe(60);
    await handleUpdate({ inline_query: query('ankh') }, api, wallets, config({ guideLimits: limits }), NOW + 2 * 60_000);
    expect(calls.length).toBe(61);
  });
});

describe('the guide’s chat commands', () => {
  it('reads /guide and /памятка with their topic, and the bot’s name in a group', () => {
    expect(parseGuideCommand('/guide hunger')).toEqual({ topic: 'hunger' });
    expect(parseGuideCommand('/guide')).toEqual({ topic: '' });
    expect(parseGuideCommand('/памятка анкх')).toEqual({ topic: 'анкх' });
    expect(parseGuideCommand('/Памятка  Голод  ')).toEqual({ topic: 'Голод' });
    expect(parseGuideCommand('/pamyatka curses')).toEqual({ topic: 'curses' });
    expect(parseGuideCommand('/guide@pixel_dungeon_gamebot ankh', 'pixel_dungeon_gamebot')).toEqual({ topic: 'ankh' });
    expect(parseGuideCommand('/guide@Pixel_Dungeon_GameBot ankh', 'pixel_dungeon_gamebot')).toEqual({ topic: 'ankh' });
    expect(parseGuideCommand('/guide\nankh')).toEqual({ topic: 'ankh' });
  });

  it('ignores everything else, and another bot’s command', () => {
    expect(parseGuideCommand('guide hunger')).toBeNull();
    expect(parseGuideCommand('памятка голод')).toBeNull();
    expect(parseGuideCommand('/guides')).toBeNull();
    expect(parseGuideCommand('/start')).toBeNull();
    expect(parseGuideCommand('hello /guide')).toBeNull();
    expect(parseGuideCommand('/guide@other_bot ankh', 'pixel_dungeon_gamebot')).toBeNull();
    expect(botNameOf(LINK)).toBe('pixel_dungeon_gamebot');
    expect(botNameOf('')).toBeUndefined();
  });

  it('answers a clear topic with the article and the button, in the topic’s language', () => {
    const reply = guideReply('голод', 'en', LINK);
    expect(reply.html).toBe(true);
    expect(reply.text).toContain('<b>Голод</b>');
    expect(reply.markup!.inline_keyboard).toEqual([[{ text: 'Открыть в игре', url: `${LINK}?startapp=guide_hunger` }]]);
    expect(guideReply('ankh', 'ru', LINK).text).toContain('<b>The ankh</b>');
  });

  it('lists the topics as buttons with no topic, or a topic nobody has, and the candidates when several fit', () => {
    const none = guideReply('', 'ru', LINK);
    expect(none.html).toBe(false);
    const buttons = none.markup!.inline_keyboard.flat();
    expect(buttons.map((b) => b.callback_data)).toEqual(GUIDE_IDS.map((id) => `g:${id}`));
    expect(buttons.every((b) => (b.callback_data ?? '').length <= 64)).toBe(true);
    expect(none.markup!.inline_keyboard.every((row) => row.length <= 2)).toBe(true);
    expect(guideReply('zzzz', 'en', LINK).markup!.inline_keyboard.flat().length).toBe(GUIDE_IDS.length);
    // «Curse» names the curses article outright; «trap» fits two equally.
    expect(guideReply('проклятие', 'ru', LINK).text).toContain('<b>Проклятия</b>');
    const several = guideReply('ловушка', 'ru', LINK);
    expect(several.html).toBe(false);
    expect(several.markup!.inline_keyboard.flat().map((b) => b.callback_data).sort()).toEqual(['g:search', 'g:traps']);
  });

  it('answers a topic button with the article, and refuses data that is not ours', () => {
    expect(articleForCallback('g:ankh', 'ru', LINK)!.text).toContain('<b>Анкх</b>');
    expect(articleForCallback('g:ankh', 'en', LINK)!.text).toContain('<b>The ankh</b>');
    expect(articleForCallback('g:nope', 'en', LINK)).toBeNull();
    expect(articleForCallback('x:ankh', 'en', LINK)).toBeNull();
    expect(articleForCallback(undefined, 'en', LINK)).toBeNull();
  });

  const text = (chat: { id: number; type: string }, body: string, user = 5) => ({
    message: { message_id: 11, chat, from: { id: user, first_name: 'Ann', language_code: 'ru' }, text: body },
  });

  it('replies in a private chat with the article', async () => {
    const { api, calls } = fakeApi();
    await handleUpdate(text({ id: 5, type: 'private' }, '/памятка голод'), api, wallets, config(), NOW);
    expect(calls.length).toBe(1);
    expect(calls[0]!.method).toBe('sendMessage');
    expect(calls[0]!.params).toMatchObject({ chat_id: 5, parse_mode: 'HTML' });
    expect(calls[0]!.params.text).toContain('<b>Голод</b>');
    expect(calls[0]!.params.reply_parameters).toBeUndefined();
    expect(calls[0]!.params.reply_markup.inline_keyboard[0][0].url).toBe(`${LINK}?startapp=guide_hunger`);
  });

  it('replies in a group as a reply to the asker, and only to a command', async () => {
    const { api, calls } = fakeApi();
    const group = { id: -100, type: 'supergroup' };
    await handleUpdate(text(group, 'как там голод?'), api, wallets, config(), NOW);
    await handleUpdate(text(group, '/start'), api, wallets, config(), NOW);
    await handleUpdate(text(group, '/guide@other_bot ankh'), api, wallets, config(), NOW);
    expect(calls).toEqual([]);
    await handleUpdate(text(group, '/guide@pixel_dungeon_gamebot ankh'), api, wallets, config(), NOW);
    expect(calls[0]!.params).toMatchObject({ chat_id: -100, reply_parameters: { message_id: 11, allow_sending_without_reply: true } });
    expect(calls[0]!.params.text).toContain('<b>The ankh</b>');
  });

  it('is rate-limited: a group is answered a few times, a person a handful, and a slow-down is not a reply', async () => {
    const { api, calls } = fakeApi();
    const limits = newGuideLimits();
    const group = { id: -100, type: 'group' };
    for (let i = 0; i < 20; i++) await handleUpdate(text(group, '/guide hunger', 10 + i), api, wallets, config({ guideLimits: limits }), NOW + i);
    expect(calls.length).toBe(8);
    // Another group is not affected; the first one is answered again later.
    await handleUpdate(text({ id: -200, type: 'group' }, '/guide hunger', 40), api, wallets, config({ guideLimits: limits }), NOW + 30);
    expect(calls.length).toBe(9);
    await handleUpdate(text(group, '/guide hunger', 99), api, wallets, config({ guideLimits: limits }), NOW + 11 * 60_000);
    expect(calls.length).toBe(10);
    // One person in a private chat: twenty in ten minutes.
    const before = calls.length;
    for (let i = 0; i < 30; i++) await handleUpdate(text({ id: 5, type: 'private' }, '/guide hunger', 5), api, wallets, config({ guideLimits: limits }), NOW + 12 * 60_000 + i);
    expect(calls.length - before).toBe(20);
  });

  it('sends the article when a topic button is pressed, and acknowledges every press', async () => {
    const { api, calls } = fakeApi();
    const press = (data: string, user = 5, language = 'ru') => ({
      callback_query: { id: 'cb', from: { id: user, language_code: language }, message: { message_id: 3, chat: { id: -100, type: 'group' } }, data },
    });
    await handleUpdate(press('g:alchemy'), api, wallets, config(), NOW);
    expect(calls.map((c) => c.method)).toEqual(['answerCallbackQuery', 'sendMessage']);
    expect(calls[1]!.params.text).toContain('<b>Алхимический котёл</b>');
    await handleUpdate(press('evil'), api, wallets, config(), NOW);
    expect(calls.slice(2).map((c) => c.method)).toEqual(['answerCallbackQuery']);
    const limits = newGuideLimits();
    const more = fakeApi();
    for (let i = 0; i < 12; i++) await handleUpdate(press('g:ankh', 50 + i, 'en'), more.api, wallets, config({ guideLimits: limits }), NOW);
    expect(more.calls.filter((c) => c.method === 'sendMessage').length).toBe(8);
    expect(more.calls.filter((c) => c.method === 'answerCallbackQuery').length).toBe(12);
  });

  it('leaves the bot’s other behaviour alone', async () => {
    const { api, calls } = fakeApi();
    await handleUpdate({ message: { message_id: 1, chat: { id: 5, type: 'private' }, from: { id: 5, first_name: 'Ann', language_code: 'en' }, text: '/start' } }, api, wallets, config(), NOW);
    expect(calls[0]!.params.text).toContain('The dungeon awaits');
  });

  it('counts a person and a group together (mayAnswer)', () => {
    const limits = newGuideLimits();
    expect(mayAnswer(undefined, 1, { id: 1, type: 'private' }, NOW)).toBe(true);
    for (let i = 0; i < 8; i++) expect(mayAnswer(limits, 100 + i, { id: -1, type: 'group' }, NOW)).toBe(true);
    expect(mayAnswer(limits, 200, { id: -1, type: 'group' }, NOW)).toBe(false);
    expect(mayAnswer(limits, 200, { id: 200, type: 'private' }, NOW)).toBe(true);
  });
});
