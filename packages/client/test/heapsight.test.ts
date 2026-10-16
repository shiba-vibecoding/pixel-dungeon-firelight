import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addHero, createWorld, exploredCells, levelAt, visibleCells } from '@pd/core';
import { heapDrawn } from '../src/heapsight';

describe('items and plants on the floor', () => {
  it('are drawn where the hero sees them now, as ItemSprite.update() has it, and not in a room only remembered', () => {
    const visible = [false, true, false];
    expect(heapDrawn(visible, 1)).toBe(true);
    expect(heapDrawn(visible, 0)).toBe(false);
    expect(heapDrawn(visible, 5)).toBe(false);
  });

  it('are hidden in the rooms the hero has left, even with the whole level explored, and shown under the hero', () => {
    const world = createWorld(4);
    const hero = addHero(world, { id: 'p', name: 'P', heroClass: 'warrior' });
    const level = levelAt(world, 1);
    exploredCells(world, 1).fill(true);
    const seen = visibleCells(world, 1);
    // The cell the hero stands on is in sight: a heap there is drawn.
    expect(heapDrawn(seen, hero.pos)).toBe(true);
    // Every explored cell out of sight holds nothing that is drawn.
    const remembered = level.map.map((_, i) => i).filter((i) => !seen[i]);
    expect(remembered.length).toBeGreaterThan(100);
    for (const pos of remembered.slice(0, 200)) expect(heapDrawn(seen, pos)).toBe(false);
    // A heap of the level that lies out of sight is among them.
    const far = (world.floors[1]?.heaps ?? []).filter((h) => !seen[h.pos]);
    expect(far.length).toBeGreaterThan(0);
    for (const heap of far) expect(heapDrawn(seen, heap.pos)).toBe(false);
  });

  it('are asked of the field of view by both renderers, never of what is merely explored', () => {
    const flat = readFileSync(new URL('../src/render.ts', import.meta.url), 'utf8');
    const solid = readFileSync(new URL('../src/r3d/world3d.ts', import.meta.url), 'utf8');
    for (const text of [flat, solid]) {
      expect(text).toContain('heapDrawn(visible, heap.pos)');
      expect(text).toContain('heapDrawn(visible, plant.pos)');
      expect(text).not.toMatch(/explored\[(heap|plant)\.pos\]/);
    }
  });
});
