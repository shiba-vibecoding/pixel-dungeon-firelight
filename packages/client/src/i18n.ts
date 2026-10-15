import { capitalize, language } from './i18n-util';
import type { Strings } from './i18n-en';

/*
 * Interface text in Russian and English; the language follows Telegram or the browser. The texts of each language are a chunk of their
 * own (i18n-en.ts, i18n-ru.ts): only the language shown is fetched, and the page waits for it here, before anything that says a word starts.
 */

export const lang = language();
const loaded = lang === 'ru' ? await import('./i18n-ru') : await import('./i18n-en');
export const t: Strings = 'ru' in loaded ? loaded.ru : loaded.en;
/** For dates and numbers in the language of the text around them. */
export const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
if (typeof document !== 'undefined') {
  document.documentElement.lang = lang;
  document.title = t.gameName;
}
export { capitalize };
