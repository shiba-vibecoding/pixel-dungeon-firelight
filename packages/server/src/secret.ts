/*
 * Comparing secrets (the reports' key, the webhook's secret) without telling
 * an attacker how much of a guess was right: both sides are hashed first, so
 * the comparison takes the same time whatever the lengths, and the digests
 * are compared byte by byte to the end.
 */

async function digest(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** True if `given` is the secret `expected`; false for a missing or empty secret. */
export async function sameSecret(given: string | null | undefined, expected: string | null | undefined): Promise<boolean> {
  if (!expected || given == null) return false;
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * A request's body as text, read no further than `limit` bytes: null if it is
 * longer. Content-Length is checked first, but a client can leave it out, so
 * the stream itself is counted too.
 */
export async function readBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.byteLength;
  }
  return new TextDecoder().decode(all);
}
