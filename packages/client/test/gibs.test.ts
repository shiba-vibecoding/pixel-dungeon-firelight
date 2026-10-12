import { describe, expect, it } from 'vitest';
import { FLOOR, type Gib, stepGib, type Surface, SWALLOW, WALL } from '../src/gibs';

const chunk = (o: Partial<Gib> = {}): Gib => ({
  x: 24, y: 24, z: 6, vx: 0, vy: 0, vz: 100, w: 3, h: 2, color: '#c42020', shade: '#5a0808', smear: null,
  born: 0, life: Infinity, glow: false, bounces: 0, resting: false, spin: 80, ...o,
});

/** Runs a chunk at 60 frames a second until it rests or is gone (or two seconds pass). */
function settle(g: Gib, surface: (x: number, y: number) => Surface, dt = 1 / 60): { results: string[]; frames: number } {
  const results: string[] = [];
  let frames = 0;
  while (frames < 120) {
    frames++;
    const r = stepGib(g, dt, surface);
    if (r !== 'flying') results.push(r);
    if (r === 'rested' || r === 'swallowed') break;
  }
  return { results, frames };
}

const open = (): Surface => FLOOR;

describe('stepGib', () => {
  it('arcs up, comes down, bounces at most twice and rests on the floor', () => {
    const g = chunk({ vx: 40, vz: 120 });
    let peak = 0;
    const results: string[] = [];
    for (let i = 0; i < 120 && !g.resting; i++) {
      const r = stepGib(g, 1 / 60, open);
      peak = Math.max(peak, g.z);
      if (r !== 'flying') results.push(r);
    }
    expect(peak).toBeGreaterThan(10);
    expect(g.resting).toBe(true);
    expect(g.z).toBe(0);
    expect(results.filter((r) => r === 'bounced').length).toBeLessThanOrEqual(2);
    expect(results[results.length - 1]).toBe('rested');
    // It went the way it was thrown, but not far.
    expect(g.x).toBeGreaterThan(24);
    expect(g.x).toBeLessThan(24 + 48);
  });

  it('lands about the same place whatever the frame rate', () => {
    const a = chunk({ vx: 50, vy: -20, vz: 110 });
    const b = chunk({ vx: 50, vy: -20, vz: 110 });
    settle(a, open, 1 / 120);
    settle(b, open, 1 / 30);
    expect(Math.abs(a.x - b.x)).toBeLessThan(4);
    expect(Math.abs(a.y - b.y)).toBeLessThan(4);
  });

  it('is thrown back off a wall, never into it', () => {
    // A wall from x = 32 on: everything at or right of it is solid.
    const wall = (x: number): Surface => (x >= 32 ? WALL : FLOOR);
    for (let i = 0; i < 50; i++) {
      const g = chunk({ x: 28, vx: 80 + i * 4, vy: (i % 5) * 10 - 20, vz: 90 + i });
      for (let f = 0; f < 120 && !g.resting; f++) {
        stepGib(g, 1 / 60, wall);
        expect(g.x).toBeLessThan(32);
      }
      expect(g.resting).toBe(true);
    }
  });

  it('slides along a wall it meets at a slant, rather than stopping dead', () => {
    const wall = (_x: number, y: number): Surface => (y < 16 ? WALL : FLOOR);
    const g = chunk({ x: 24, y: 18, vx: 40, vy: -60, vz: 100 });
    stepGib(g, 1 / 20, wall);
    expect(g.y).toBeGreaterThanOrEqual(16);
    expect(g.vy).toBeGreaterThan(0);
    expect(g.vx).toBe(40);
  });

  it('is swallowed by water or a chasm where it lands', () => {
    const g = chunk({ vx: 30, vz: 60 });
    const { results } = settle(g, () => SWALLOW);
    expect(results[results.length - 1]).toBe('swallowed');
  });

  it('stays put once at rest', () => {
    const g = chunk({ z: 0, vz: -10 });
    expect(stepGib(g, 1 / 60, open)).toBe('rested');
    const { x, y } = g;
    expect(stepGib(g, 1 / 60, open)).toBe('rested');
    expect([g.x, g.y]).toEqual([x, y]);
  });
});
