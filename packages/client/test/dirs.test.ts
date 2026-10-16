import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  conventionFaces, type Face, FACING_HOLD_MS, type Facing, facingFor, figureOf, PET_VIEWS, settle, SPRITE_VIEWS, turn, turnable, turnAt, turnBetween,
  type Turnable, withView,
} from '../src/dirs';
import type { Puppet } from '../src/view';

const WIDTH = 48;
const cell = (x: number, y: number): number => x + y * WIDTH;
const at = cell(10, 10);

/** The view after one step from (10, 10) by (dx, dy), from a fresh figure. */
function stepped(dx: number, dy: number): Turnable {
  const t = turnable();
  turnBetween(t, at, cell(10 + dx, 10 + dy), WIDTH, 1000);
  return t;
}

describe('the direction rule of part 8', () => {
  it('shows the side for any step with a sideways part, mirrored when it goes left', () => {
    for (const [dx, dy] of [[1, 0], [1, 1], [1, -1]] as const) {
      const t = stepped(dx, dy);
      expect([t.facing, t.flip]).toEqual(['side', false]);
    }
    for (const [dx, dy] of [[-1, 0], [-1, 1], [-1, -1]] as const) {
      const t = stepped(dx, dy);
      expect([t.facing, t.flip]).toEqual(['side', true]);
    }
  });

  it('shows the front for a step straight down the screen and the back for one straight up', () => {
    expect(stepped(0, 1).facing).toBe('front');
    expect(stepped(0, -1).facing).toBe('back');
    // (A fresh figure already faces the front, so the step up is the one that has to turn it.)
    expect(turnable().facing).toBe('front');
  });

  it('covers all eight directions with the three views', () => {
    const seen: Record<string, Facing> = {};
    for (const [name, dx, dy] of [['E', 1, 0], ['SE', 1, 1], ['S', 0, 1], ['SW', -1, 1], ['W', -1, 0], ['NW', -1, -1], ['N', 0, -1], ['NE', 1, -1]] as const) {
      seen[name] = stepped(dx, dy).facing;
    }
    expect(seen).toEqual({ E: 'side', SE: 'side', S: 'front', SW: 'side', W: 'side', NW: 'side', N: 'back', NE: 'side' });
  });

  it('keeps the last direction when it stands still, and a figure that has not moved faces the front', () => {
    const t = stepped(0, -1);
    turnBetween(t, at, at, WIDTH, 5000);
    settle(t, 9000);
    expect(t.facing).toBe('back');
    expect(facingFor(0, 0, 'side')).toBe('side');
    const left = stepped(-1, 0);
    turnBetween(left, at, at, WIDTH, 5000);
    settle(left, 9000);
    expect([left.facing, left.flip]).toEqual(['side', true]);
    expect(turnable().facing).toBe('front');
  });

  it('turns an attack, a zap or a throw to face its target by the same rule', () => {
    const face = (dx: number, dy: number): Turnable => {
      const t = turnable('side');
      turnAt(t, at, cell(10 + dx, 10 + dy), WIDTH, 1000);
      return t;
    };
    expect(face(0, 1).facing).toBe('front');
    expect(face(0, -1).facing).toBe('back');
    expect(face(1, 1).facing).toBe('side');
    expect([face(-1, 0).facing, face(-1, 0).flip]).toEqual(['side', true]);
    // A reach of two, and a target far down one column off: still the first step is straight down.
    expect(face(0, 2).facing).toBe('front');
    expect(face(1, 8).facing).toBe('front');
    expect(face(-1, -7).facing).toBe('back');
    // A target mostly to the side is the side.
    expect(face(5, 2).facing).toBe('side');
    expect(face(3, 5).facing).toBe('side');
    // On the spot there is nothing to turn to.
    expect(face(0, 0).facing).toBe('side');
  });

  it('holds a view for at least 120 ms, so a zigzag of single steps does not flicker', () => {
    expect(FACING_HOLD_MS).toBe(120);
    const t = turnable('side');
    // Down (front) at once from the start, then straight up and sideways inside the hold: it stays on the front.
    turn(t, 0, 1, 1000);
    expect([t.facing, t.facingAt]).toEqual(['front', 1000]);
    turn(t, 0, -1, 1050);
    expect(t.facing).toBe('front');
    settle(t, 1119);
    expect(t.facing).toBe('front');
    // The last thing asked for wins once the hold is over (the back, asked at 1050, was out of date by the side asked at 1100).
    turn(t, 1, 0, 1100);
    settle(t, 1119);
    expect(t.facing).toBe('front');
    settle(t, 1120);
    expect(t.facing).toBe('side');
    expect(t.facingAt).toBe(1120);
    // A view that has held long enough turns at once.
    turn(t, 0, -1, 2000);
    expect(t.facing).toBe('back');
  });

  it('turns the mirror at once even while the view is held (only the side view uses it)', () => {
    const t = turnable();
    turn(t, 1, 0, 1000);
    turn(t, -1, 0, 1010);
    expect([t.facing, t.flip]).toEqual(['side', true]);
  });
});

const image = (name: string): HTMLImageElement => ({ name }) as unknown as HTMLImageElement;
const face = (name: string, glow = false): Face => ({ image: name, img: image(name), ...(glow ? { glow: `${name}-glow`, glowImg: image(`${name}-glow`) } : {}) });

function puppet(over: Partial<Puppet> = {}): Puppet {
  return {
    ...turnable(), alive: true, sprite: { sheet: { image: image('side'), w: 12, h: 15, cols: 21 }, anims: {} as never, faces: { front: face('front'), back: face('back') } },
    ...over,
  } as unknown as Puppet;
}

const name = (img: HTMLImageElement | undefined): string | undefined => (img as unknown as { name: string } | undefined)?.name;

describe('what is drawn for a view', () => {
  it('draws the side view mirrored, and the front and back never mirrored', () => {
    const side = figureOf(puppet({ facing: 'side', facingWant: 'side', flip: true }), 1e6);
    expect([name(side.image), side.flip]).toEqual(['side', true]);
    const front = figureOf(puppet({ facing: 'front', flip: true }), 1e6);
    expect([front.facing, name(front.image), front.flip]).toEqual(['front', 'front', false]);
    const back = figureOf(puppet({ facing: 'back', facingWant: 'back', flip: true }), 1e6);
    expect([back.facing, name(back.image), back.flip]).toEqual(['back', 'back', false]);
  });

  it('falls back to the side while a sheet has not come, or if there is none', () => {
    const sheet = { image: image('side'), w: 12, h: 15, cols: 21 };
    const waiting = figureOf(puppet({ sprite: { sheet, anims: {} as never, faces: { front: { image: 'dirs/never.png' } } } as never }), 1e6);
    expect([waiting.facing, waiting.flip]).toEqual(['side', false]);
    const plain = figureOf(puppet({ sprite: { sheet, anims: {} as never } as never, flip: true }), 1e6);
    expect([plain.facing, plain.flip]).toEqual(['side', true]);
  });

  it('keeps the dead on the side view: the tomb is the same from every side', () => {
    const f = figureOf(puppet({ alive: false, facing: 'back', facingWant: 'back', flip: true }), 1e6);
    expect([f.facing, name(f.image), f.flip]).toEqual(['side', 'side', true]);
  });

  it('takes the look, its glow and the hat from the same view, or none of them', () => {
    const look = { sheet: image('look-side'), glow: image('look-glow'), pulse: { hz: 1, min: 0, max: 1 }, faces: { front: face('look-front', true) } };
    const hatArt = (ready: boolean) => ({
      image: image('hat-side'), glow: image('hat-glow'), w: 16, h: 22, heroX: 2, heroY: 7,
      faces: { front: ready ? face('hat-front', true) : { image: 'dirs/hat-never.png', glow: 'dirs/hat-never-glow.png' } },
    });
    const f = figureOf(puppet({ worn: { look, hat: hatArt(true), any: true } as never }), 1e6);
    expect(f.facing).toBe('front');
    expect([name(f.image), name(f.glow), name(f.hat), name(f.hatGlow)]).toEqual(['look-front', 'look-front-glow', 'hat-front', 'hat-front-glow']);
    // The hat's front has not come: the whole figure stays on the side view, the body and the hat both from the side.
    const w = figureOf(puppet({ worn: { look, hat: hatArt(false), any: true } as never }), 1e6);
    expect(w.facing).toBe('side');
    expect([name(w.image), name(w.glow), name(w.hat), name(w.hatGlow)]).toEqual(['side', 'look-glow', 'hat-side', 'hat-glow']);
  });

  it('follows the settled view when the hold is over', () => {
    const p = puppet({ facing: 'front', facingWant: 'back', facingAt: 1000 });
    expect(figureOf(p, 1100).facing).toBe('front');
    expect(figureOf(p, 1120).facing).toBe('back');
  });
});

describe('the paths of the other views', () => {
  it("names a view by the designer's convention, glow included", () => {
    expect(withView('mart/fl/hats/mage-straw.png', 'back')).toBe('mart/fl/hats/mage-straw-back.png');
    const faces = conventionFaces('mart/fl/legendary/warrior-forgeborn.png', 'mart/fl/legendary/warrior-forgeborn-glow.png');
    expect(faces.front).toEqual({ image: 'mart/fl/legendary/warrior-forgeborn-front.png', glow: 'mart/fl/legendary/warrior-forgeborn-glow-front.png' });
    expect(faces.back).toEqual({ image: 'mart/fl/legendary/warrior-forgeborn-back.png', glow: 'mart/fl/legendary/warrior-forgeborn-glow-back.png' });
  });

  const assets = (path: string): string => fileURLToPath(new URL(`../public/assets/${path}`, import.meta.url));

  it('finds every view the catalogue and the hero classes need on disk', () => {
    const catalog = JSON.parse(readFileSync(assets('mart/fl/catalog.json'), 'utf8')) as { items: Array<Record<string, unknown>> };
    const missing: string[] = [];
    const need = (faces: ReturnType<typeof conventionFaces>): void => {
      for (const f of [faces.front, faces.back]) {
        if (!f) continue;
        for (const path of [f.image, f.glow]) if (path && !existsSync(assets(path))) missing.push(path);
      }
    };
    for (const key of Object.keys(SPRITE_VIEWS)) need(SPRITE_VIEWS[key]!);
    let looks = 0;
    let hats = 0;
    let pets = 0;
    for (const item of catalog.items) {
      if (item.kind === 'skin' && typeof item.sheet === 'string') {
        looks++;
        need(conventionFaces(item.sheet, typeof item.glow === 'string' ? item.glow : undefined));
      } else if (item.kind === 'hat' && item.sheets) {
        const glows = item.glow as Record<string, string> | undefined;
        for (const [cls, sheet] of Object.entries(item.sheets as Record<string, string>)) {
          hats++;
          need(conventionFaces(sheet, glows?.[cls]));
        }
      } else if (item.kind === 'pet') {
        pets++;
        const sheet = item.sheet as { file: string };
        const views = PET_VIEWS[sheet.file.replace(/^.*\/|\.png$/g, '')] ?? {};
        for (const view of ['front', 'back'] as const) if (views[view] && !existsSync(assets(withView(sheet.file, view)))) missing.push(withView(sheet.file, view));
      }
    }
    expect(missing).toEqual([]);
    expect(hats).toBe(48);
    expect(pets).toBe(6);
    expect(looks).toBeGreaterThanOrEqual(24);
  });
});
