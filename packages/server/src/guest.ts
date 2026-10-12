/*
 * Guests: players outside Telegram, who have no account to prove who they are.
 * Each keeps a random secret of its own (in the browser) and sends it when it
 * connects; the id the room uses, and shows the party, is derived from it by
 * a one-way hash. So a guest's id, seen by everyone in the room, is no use for
 * taking over their hero: reconnecting as them takes the secret, which only
 * their browser has.
 */

/** A secret long enough not to be guessed, in URL-safe characters (a uuid passes). */
const SECRET = /^[A-Za-z0-9_-]{16,128}$/;

export function validGuestSecret(secret: string): boolean {
  return SECRET.test(secret);
}

/** The public id of the guest who holds this secret, or null if it is not a usable secret. */
export async function guestId(secret: string): Promise<string | null> {
  if (!validGuestSecret(secret)) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pd-guest:${secret}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `guest-${hex.slice(0, 16)}`;
}
