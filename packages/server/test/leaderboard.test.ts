import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, countSubmission, isPublicId, Leaderboard, MAX_SUBMISSIONS, parseResult, publicId, score } from '../src/leaderboard';

const run = (depth: number, level: number, gold: number, won = false) => ({ heroClass: 'warrior', depth, level, gold, won });

describe('daily leaderboard', () => {
  it('scores like the original rankings', () => {
    expect(score(run(3, 4, 250))).toBe(250 + 4 * 3 * 100);
    expect(score(run(5, 6, 400, true))).toBe((400 + 6 * 5 * 100) * 2);
  });

  it('keeps each player best run, ordered by score', () => {
    const board = new Leaderboard();
    expect(board.submit('a', 'Alice', run(2, 2, 100), 1)).toBe(1);
    expect(board.submit('b', 'Bob', run(4, 3, 50), 2)).toBe(1);
    expect(board.rank('a')).toBe(2);
    // A worse run does not replace a better one.
    expect(board.submit('b', 'Bob', run(1, 1, 0), 3)).toBe(1);
    expect(board.top(10).map((e) => [e.id, e.score])).toEqual([['b', 1250], ['a', 500]]);
    expect(board.submit('a', 'Alice', run(5, 5, 300, true), 4)).toBe(1);
    expect(board.entries()).toHaveLength(2);
  });

  it('ranks equal scores by fewer turns, and only then by who finished earlier', () => {
    const board = new Leaderboard();
    const entry = (id: string, turns: number | undefined, at: number) => ({ ...run(2, 2, 100), id, name: id, score: 500, at, ...(turns === undefined ? {} : { turns }) });
    board.put(entry('slow', 900, 1));
    board.put(entry('fast', 400, 3));
    board.put(entry('same-late', 400, 5));
    board.put(entry('unknown', undefined, 0));
    expect(board.top(10).map((e) => e.id)).toEqual(['fast', 'same-late', 'slow', 'unknown']);
    // A higher score still beats any number of turns.
    board.put({ ...entry('rich', 5000, 9), score: 501 });
    expect(board.rank('rich')).toBe(1);
  });

  it('lets a player better their own run on the same score by fewer turns', () => {
    const board = new Leaderboard();
    const entry = (turns: number, at: number) => ({ ...run(2, 2, 100), id: 'a', name: 'A', score: 500, at, turns });
    board.put(entry(900, 1));
    board.put(entry(1200, 2));
    expect(board.entries()[0]!.turns).toBe(900);
    board.put(entry(700, 3));
    expect(board.entries()).toHaveLength(1);
    expect(board.entries()[0]!.turns).toBe(700);
  });

  it('stays bounded', () => {
    const board = new Leaderboard();
    for (let i = 0; i < BOARD_SIZE + 20; i++) board.submit(`p${i}`, 'P', run(1, 1, i), i);
    expect(board.entries()).toHaveLength(BOARD_SIZE);
    expect(board.rank('p0')).toBeNull();
  });

  it('rejects malformed or impossible results', () => {
    expect(parseResult(run(3, 2, 10))).toEqual(run(3, 2, 10));
    expect(parseResult({ ...run(3, 2, 10), heroClass: 'wizard' })).toBeNull();
    expect(parseResult({ ...run(3, 2, 10), depth: 99 })).toBeNull();
    expect(parseResult({ ...run(3, 2, 10), gold: -5 })).toBeNull();
    expect(parseResult('nonsense')).toBeNull();
    // A win only counts on the last depth, the Amulet's.
    expect(parseResult(run(3, 2, 10, true))!.won).toBe(false);
    expect(parseResult(run(26, 20, 5000, true))!.won).toBe(true);
    expect(parseResult(run(27, 20, 5000, true))).toBeNull();
  });

  it('takes only so many results a day from one player', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < MAX_SUBMISSIONS; i++) expect(countSubmission(counts, 'a')).toBe(true);
    expect(countSubmission(counts, 'a')).toBe(false);
    expect(counts.a).toBe(MAX_SUBMISSIONS);
    expect(countSubmission(counts, 'b')).toBe(true);
  });

  it('shows players by an opaque id, the same all day and different the next', async () => {
    const today = await publicId('secret', '2026-10-12', 'tg4242');
    expect(isPublicId(today)).toBe(true);
    expect(today).not.toContain('4242');
    expect(await publicId('secret', '2026-10-12', 'tg4242')).toBe(today);
    expect(await publicId('secret', '2026-10-13', 'tg4242')).not.toBe(today);
    expect(await publicId('other', '2026-10-12', 'tg4242')).not.toBe(today);
    expect(isPublicId('tg4242')).toBe(false);
  });
});
