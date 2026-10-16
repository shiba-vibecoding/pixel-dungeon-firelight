/*
 * The words of the competitions (design part 7, assets/compete/compete.json → strings), apart from where they are kept: plural forms,
 * `{n}` filled in, numbers. Pure, so that it is tested. The forms come as the designer wrote them: a string, or an array in the order
 * [one, other] for English and [one, few, many] for Russian.
 */

export type Lang = 'ru' | 'en';

/** Which form a number takes: English one/other, Russian one (1, 21 ...) / few (2-4, 22-24 ...) / many (the rest, and 11-14). */
export function pluralIndex(lang: Lang, n: number): number {
  const whole = Math.abs(Math.trunc(n));
  if (lang !== 'ru') return whole === 1 ? 0 : 1;
  const ones = whole % 10;
  const tens = whole % 100;
  return ones === 1 && tens !== 11 ? 0 : ones >= 2 && ones <= 4 && (tens < 12 || tens > 14) ? 1 : 2;
}

/** The form for `n` (a plain string has only one), the last form if the language gave fewer than it needs. */
export function pluralForm(forms: string | readonly string[], n: number, lang: Lang): string {
  if (typeof forms === 'string') return forms;
  return forms[Math.min(pluralIndex(lang, n), forms.length - 1)] ?? '';
}

/** `{name}` in a text replaced by the values; a value not given leaves nothing. */
export function fill(text: string, values: Readonly<Record<string, string | number>> = {}): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

/** A number as a player of the language reads it (thousands apart by a no-break space in Russian). */
export const formatNumber = (n: number, lang: Lang): string => Math.round(n).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US');

/** «1 284 игрока»: the form for `n`, with `{n}` as the formatted number and any other values the text has. */
export function say(forms: string | readonly string[], n: number, lang: Lang, extra: Readonly<Record<string, string | number>> = {}): string {
  return fill(pluralForm(forms, n, lang), { n: formatNumber(n, lang), ...extra });
}

/** How long, in the words of the units given: «2 d 7 h», «5 h 12 min», «9 min»; under a minute: the `soon` word. */
export function spanText(ms: number, units: { d: string; h: string; m: string; soon: string }): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes < 1) return units.soon;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return days > 0 ? `${days} ${units.d} ${hours} ${units.h}` : hours > 0 ? `${hours} ${units.h} ${minutes % 60} ${units.m}` : `${minutes} ${units.m}`;
}
