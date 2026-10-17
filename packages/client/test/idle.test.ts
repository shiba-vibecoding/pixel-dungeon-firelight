import { beforeAll, describe, expect, it, vi } from 'vitest';

// The sound module listens to the page when it is loaded: give it a page that hears nothing.
let idleFx: typeof import('../src/idlefx').idleFx;
let MARK_HOURGLASS = 0;
let MARK_START = 0;
let MARK_Z = 0;
beforeAll(async () => {
  vi.stubGlobal('addEventListener', () => undefined);
  vi.stubGlobal('document', { addEventListener: () => undefined, visibilityState: 'visible', hidden: false });
  const m = await import('../src/idlefx');
  idleFx = m.idleFx;
  MARK_HOURGLASS = m.MARK_HOURGLASS;
  MARK_START = m.MARK_START;
  MARK_Z = m.MARK_Z;
});

/** The marks over a figure at a time, as the renderers get them. */
function seen(id: string, now: number): Array<{ kind: number; rise: number; side: number; alpha: number; sx: number; sy: number }> {
  const out: Array<{ kind: number; rise: number; side: number; alpha: number; sx: number; sy: number }> = [];
  idleFx.marksOf(id, now, (kind, rise, side, alpha, sx, sy) => void out.push({ kind, rise, side, alpha, sx, sy }));
  return out;
}

/** A hero with a spot to be and a view, enough for the marks (nothing is drawn here). */
const view = {
  puppets: new Map([['me', { alive: true, flip: false, id: 'me', to: 0 } as never]]),
  position: () => ({ x: 100, y: 100 }),
  flashes: [] as Array<{ cell: number; start: number; color?: string; duration?: number }>,
};

describe('what the hero does while waiting and resting', () => {
  it('flips the hourglass once over a wait of about 400 ms: whole, narrowing to nothing, then the other way up, fading', () => {
    idleFx.clear();
    idleFx.wait(1000, view as never, 'me');
    const marks = (t: number) => seen('me', 1000 + t).filter((m) => m.kind === MARK_HOURGLASS);
    expect(marks(10)[0]!.sx).toBe(1);
    const widths = [100, 160, 220, 280, 340].map((t) => marks(t)[0]!.sx);
    // Narrows, passes through nothing and comes out turned over.
    expect(Math.min(...widths)).toBeLessThan(0.3);
    expect(widths[widths.length - 1]!).toBeLessThan(0);
    expect(seen('me', 1000 + 399).length).toBe(1);
    expect(seen('me', 1000 + 401)).toEqual([]);
  });

  it('is gone from the pool when it is over, and holds a dozen at once without growing', () => {
    idleFx.clear();
    for (let i = 0; i < 40; i++) idleFx.wait(i, view as never, 'me');
    expect(idleFx.marks).toHaveLength(14);
    idleFx.clear();
    expect(idleFx.busy(0)).toBe(false);
  });

  it('settles to rest, breathes, lets a «z» drift up every 1.2 s, and starts at an interruption with a «!»', () => {
    idleFx.clear();
    const hero = view.puppets.get('me') as unknown as { squash?: number };
    // Resting: the pose goes lower, breathing a little.
    let now = 5000;
    idleFx.frame(now, view as never, 'me', true, false, 5, false);
    for (let t = 0; t <= 2600; t += 100) idleFx.frame(now + t, view as never, 'me', true, false, 5, false);
    expect(hero.squash!).toBeLessThan(0.93);
    expect(hero.squash!).toBeGreaterThan(0.85);
    const zs = new Set<number>();
    for (let t = 0; t <= 2600; t += 50) {
      for (const m of seen('me', now + t)) if (m.kind === MARK_Z) zs.add(Math.round(m.rise));
    }
    expect(idleFx.busy(now + 2600)).toBe(true);
    // Health back: nothing breaks. Then a monster in sight: it starts, the «!» pops big and settles, the pose is whole again after a moment.
    now += 2700;
    idleFx.frame(now, view as never, 'me', false, true, 5, false);
    const pop = seen('me', now + 10).filter((m) => m.kind === MARK_START);
    expect(pop).toHaveLength(1);
    expect(pop[0]!.sx).toBeGreaterThan(1.3);
    expect(seen('me', now + 400).filter((m) => m.kind === MARK_START)[0]!.sx).toBe(1);
    idleFx.frame(now + 300, view as never, 'me', false, false, 5, false);
    expect(hero.squash === undefined || hero.squash === 1).toBe(true);
  });

  it('does not make a fuss when the rest is only over (full health, or the player moved on)', () => {
    idleFx.clear();
    idleFx.frame(0, view as never, 'me', true, false, 5, false);
    idleFx.frame(500, view as never, 'me', false, false, 5, false);
    expect(seen('me', 520).filter((m) => m.kind === MARK_START)).toEqual([]);
  });

  it('lights the eight cells round in turn for a search, the walls getting dust instead', () => {
    idleFx.clear();
    view.flashes.length = 0;
    const map = new Uint8Array(48 * 48);
    // The hero stands at pixel (100, 100): cell (6, 6) rounded, with a wall to its north.
    idleFx.search(2000, view as never, 'me', map, (cell) => cell === 5 * 48 + 6);
    expect(view.flashes).toHaveLength(7);
    const starts = view.flashes.map((f) => f.start - 2000);
    // In turn, over about 280 ms, none before the ring leaves.
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...starts)).toBeLessThan(300);
    expect(new Set(starts).size).toBe(7);
    expect(view.flashes.every((f) => f.color !== undefined)).toBe(true);
  });
});
