/* What both languages' texts share: plural forms, capitals, and the choice of the language. */

/** Russian plural forms: 1 день, 2 дня, 5 дней. */
export function plural(n: number, one: string, few: string, many: string): string {
  const tens = n % 100;
  const ones = n % 10;
  if (tens >= 11 && tens <= 14) return many;
  return ones === 1 ? one : ones >= 2 && ones <= 4 ? few : many;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function language(): 'ru' | 'en' {
  const telegram = (globalThis as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } })
    .Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
  let chosen: string | null = null;
  try {
    // Chosen in the settings; otherwise as in Telegram, or the browser.
    chosen = localStorage.getItem('pd-lang');
  } catch {
    // Storage blocked: go by Telegram.
  }
  const code = new URLSearchParams(location.search).get('lang') ?? chosen ?? telegram ?? navigator.language ?? 'en';
  return /^(ru|uk|be|kk)/i.test(code) ? 'ru' : 'en';
}
