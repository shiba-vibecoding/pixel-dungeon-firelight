import { describe, expect, it } from 'vitest';
import { hapticAllowed } from '../src/telegram';

describe('haptics are rate-limited', () => {
  it('lets one buzz through for a flurry of the same kind', () => {
    expect(hapticAllowed('hit', 10_000)).toBe(true);
    expect(hapticAllowed('hit', 10_040)).toBe(false);
    expect(hapticAllowed('tick', 10_060)).toBe(false);
    expect(hapticAllowed('hit', 10_200)).toBe(true);
  });

  it('lets a stronger one through at once, and notifications over impacts', () => {
    expect(hapticAllowed('tick', 20_000)).toBe(true);
    expect(hapticAllowed('slam', 20_010)).toBe(true);
    expect(hapticAllowed('hit', 20_020)).toBe(false);
    expect(hapticAllowed('success', 20_030)).toBe(true);
    expect(hapticAllowed('error', 20_040)).toBe(true);
  });

  it('starts over when the clock goes back', () => {
    expect(hapticAllowed('slam', 50_000)).toBe(true);
    expect(hapticAllowed('hit', 100)).toBe(true);
  });
});
