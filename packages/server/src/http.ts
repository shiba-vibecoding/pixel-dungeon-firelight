import { readBody } from './secret';

/* What the HTTP routes share: CORS for the Mini App's page, JSON in and out. */

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

/** The longest JSON body the shop and the leaderboard take: init data and a few fields. */
export const MAX_JSON_BYTES = 16 * 1024;

/** A request's JSON object body, or null if it is too big, not JSON or not an object. */
export async function jsonBody(request: Request, limit = MAX_JSON_BYTES): Promise<Record<string, unknown> | null> {
  const text = await readBody(request, limit);
  if (text === null) return null;
  try {
    const body = JSON.parse(text) as unknown;
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
