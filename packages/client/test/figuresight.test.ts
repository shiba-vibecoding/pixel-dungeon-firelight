import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { figureShown } from '../src/figuresight';

const cells = (...on: number[]): boolean[] => {
  const v = new Array<boolean>(2304).fill(false);
  for (const c of on) v[c] = true;
  return v;
};

describe('which figures are drawn', () => {
  const door = 1033;
  const room = 940;

  it('a monster is drawn while its own cell is in sight, and only then', () => {
    expect(figureShown({ isHero: false, to: room }, cells(room), false)).toBe(true);
    expect(figureShown({ isHero: false, to: room }, cells(door), false)).toBe(false);
  });

  it('a monster that once stepped out of the doorway is not drawn in the room behind the closed door', () => {
    // The door's cell is always in sight beside the hero; the puppet remembers it as the cell of its last step (`from`), and it
    // used to be drawn, in full colour, as long as that cell stayed in view.
    const puppet = { isHero: false, to: room, from: door, aim: room };
    expect(figureShown(puppet, cells(door, door + 48), false)).toBe(false);
  });

  it('the hero and the party are always drawn, and mind vision shows every creature, as the original\'s potion does', () => {
    expect(figureShown({ isHero: true, to: 5 }, cells(), false)).toBe(true);
    expect(figureShown({ isHero: false, to: room }, cells(), true)).toBe(true);
  });

  it('is what both renderers ask, and neither looks at the cells of a last step', () => {
    for (const file of ['../src/render.ts', '../src/r3d/world3d.ts']) {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(text).toContain('figureShown(puppet, visible,');
      expect(text).not.toMatch(/visible\[puppet\.(from|aim)\]/);
    }
  });
});
