import { describe, expect, it } from 'vitest';
import { addReport, KEEP, MAX_STORED_BYTES, parseReport, type Report, shortStack, trimReports } from '../src/reports';
import { readBody } from '../src/secret';

const report = (message: string, stack?: string): Report => ({ at: 1, kind: 'error', message, ...(stack ? { stack } : {}), context: {} });

describe('error reports', () => {
  it('cuts a client report down to bounded fields', () => {
    const parsed = parseReport({
      kind: 'Error!!', message: 'm'.repeat(900), stack: Array.from({ length: 100 }, (_, i) => `at f${i} (x.js:1:1)`).join('\n'),
      context: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`key${i}`, 'v'.repeat(400)])),
    }, 5)!;
    expect(parsed.kind).toBe('rror');
    expect(parsed.message).toHaveLength(500);
    expect(parsed.stack!.split('\n')).toHaveLength(20);
    expect(Object.keys(parsed.context!)).toHaveLength(16);
    expect(Object.values(parsed.context!).every((v) => String(v).length <= 160)).toBe(true);
    expect(parseReport({ kind: 'error' }, 5)).toBeNull();
  });

  it('keeps stacks short', () => {
    expect(shortStack('x'.repeat(5000))).toHaveLength(1500);
    expect(shortStack(undefined)).toBe('');
  });

  it('counts the same report again instead of keeping it twice', () => {
    let kept = addReport([], report('boom', 'at a'));
    kept = addReport(kept, { ...report('boom', 'at a'), at: 9 });
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ count: 2, last: 9 });
  });

  it('keeps the newest few hundred, within a megabyte', () => {
    let kept: Report[] = [];
    for (let i = 0; i < KEEP + 50; i++) kept = addReport(kept, report(`error ${i}`, 's'.repeat(1400)));
    expect(kept.length).toBeLessThanOrEqual(KEEP);
    expect(kept.at(-1)!.message).toBe(`error ${KEEP + 49}`);
    expect(JSON.stringify(kept).length).toBeLessThanOrEqual(MAX_STORED_BYTES);

    // However big the reports, what is kept fits: the oldest go first.
    const big = Array.from({ length: 10 }, (_, i) => report(`big ${i}`, 'b'.repeat(400_000)));
    const trimmed = trimReports(big, 1_000_000);
    expect(trimmed.map((r) => r.message)).toEqual(['big 8', 'big 9']);
  });

  it('reads a body only up to its limit', async () => {
    const post = (body: string, headers: Record<string, string> = {}) => new Request('https://x/', { method: 'POST', body, headers });
    expect(await readBody(post('hello'), 10)).toBe('hello');
    expect(await readBody(post('hello world!'), 10)).toBeNull();
    expect(await readBody(post('hi', { 'Content-Length': '999999' }), 10)).toBeNull();
    // A stream with no declared length is counted as it comes.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i++) controller.enqueue(new TextEncoder().encode('0123456789'));
        controller.close();
      },
    });
    expect(await readBody(new Request('https://x/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit), 30)).toBeNull();
    expect(await readBody(new Request('https://x/'), 10)).toBe('');
  });
});
