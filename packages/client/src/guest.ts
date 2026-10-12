/*
 * A guest's secret: players outside Telegram join co-op rooms as guests, and
 * the server knows a guest by this secret, which only this browser keeps. The
 * id the party sees is derived from it on the server (a one-way hash), so
 * nobody who saw that id can come back as this guest and take their hero.
 */

const KEY = 'pd-guest-secret';

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** This browser's guest secret, made on first use; ?player= gives another tab its own (development). */
export function guestSecret(): string {
  let secret: string | null = null;
  try {
    secret = localStorage.getItem(KEY);
    if (!secret) {
      secret = randomSecret();
      localStorage.setItem(KEY, secret);
    }
  } catch {
    // No storage (a private window): a secret for this page only, and a new hero on the next visit.
    secret ??= randomSecret();
  }
  const player = new URLSearchParams(location.search).get('player')?.replace(/[^A-Za-z0-9_-]/g, '');
  return player ? `${secret}-${player}`.slice(0, 128) : secret;
}
