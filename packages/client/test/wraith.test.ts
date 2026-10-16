import { describe, expect, it } from 'vitest';
import { type Fading, puppetAlpha } from '../src/puppetfade';

const puppet = (over: Partial<Fading>): Fading => ({ alive: true, isHero: false, removeAt: Infinity, ...over });

describe('the fades of figures (AlphaTweener)', () => {
  it('lets a wraith rise from nothing to whole in half a second', () => {
    const w = puppet({ fade: { start: 1000, ms: 500, from: 0, to: 1 } });
    expect(puppetAlpha(w, 1000)).toBe(0);
    expect(puppetAlpha(w, 1250)).toBeCloseTo(0.5, 5);
    expect(puppetAlpha(w, 1500)).toBe(1);
    expect(puppetAlpha(w, 9000)).toBe(1);
  });

  it('fades the old figure of a cell out as the new one fades in', () => {
    const was = puppet({ fade: { start: 0, ms: 500, from: 1, to: 0 } });
    const now = puppet({ fade: { start: 0, ms: 500, from: 0, to: 1 } });
    expect(puppetAlpha(was, 100) + puppetAlpha(now, 100)).toBeCloseTo(1, 5);
    expect(puppetAlpha(was, 600)).toBe(0);
  });

  it('fades the dead soft-bodied away over their three seconds, and a hero or a body that lies not at all', () => {
    const ghost = puppet({ alive: false, removeAt: 4000, fadeMs: 3000 });
    expect(puppetAlpha(ghost, 1000)).toBe(1);
    expect(puppetAlpha(ghost, 2500)).toBeCloseTo(0.5, 5);
    expect(puppetAlpha(ghost, 4000)).toBe(0);
    expect(puppetAlpha(ghost, 2500, false)).toBe(1);
    expect(puppetAlpha(puppet({ alive: false, isHero: true, removeAt: 0 }), 100)).toBe(1);
    expect(puppetAlpha(puppet({ alive: false, laid: true, removeAt: 0 }), 100)).toBe(1);
  });
});
