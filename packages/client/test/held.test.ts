import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '@pd/core';
import { type HeldData, heldKey, heldOf, heldOffset } from '../src/held';

const assets = (path: string): string => fileURLToPath(new URL(`../public/assets/${path}`, import.meta.url));
const data = JSON.parse(readFileSync(assets('weapons/held/held.json'), 'utf8')) as HeldData;
const FACINGS = ['side', 'front', 'back'] as const;

/** Width and height of a PNG, from its header. */
function size(path: string): [number, number] {
  const head = readFileSync(assets(path)).subarray(16, 24);
  return [head.readUInt32BE(0), head.readUInt32BE(4)];
}

describe('the weapon in the hand (part 9)', () => {
  it('has a picture for every weapon of PD 1.9.2a, melee and thrown', () => {
    const kinds = Object.keys(ITEMS).filter((k) => k.startsWith('weapon.') || k.startsWith('missile.'));
    for (const kind of kinds) expect(heldKey(data, kind), kind).toBeDefined();
  });

  it('has a sheet of 8 angles and 3 trails of 17 x 17 for each, the grip left clear', () => {
    for (const w of Object.values(data.weapons)) {
      expect(existsSync(assets(w.sheet)), w.sheet).toBe(true);
      expect(size(w.sheet)).toEqual([17 * 8, 17 * 2]);
    }
  });

  it('knows the hand in all 21 frames of every class, view and armour tier', () => {
    for (const cls of ['warrior', 'mage', 'rogue', 'ranger'])
      for (const facing of FACINGS) {
        const tiers = data.hands[cls]![facing];
        expect(tiers).toHaveLength(7);
        for (const row of tiers) expect(row).toHaveLength(21);
      }
  });

  it('puts the weapon away in the tomb, operate and read frames, and keeps it in hand otherwise', () => {
    for (const facing of FACINGS) {
      for (const f of [8, 9, 10, 11, 12, 16, 17, 19, 20]) expect(heldOf(data, 'warrior', facing, 0, f, 'weapon.sword', false)).toBeNull();
      for (const f of [0, 1, 2, 3, 4, 5, 6, 7, 18]) expect(heldOf(data, 'warrior', facing, 0, f, 'weapon.sword', false)).not.toBeNull();
    }
  });

  it('swings a sword through the attack and lets a thrown stone go at frame 14', () => {
    const angle = (f: number): number => heldOf(data, 'warrior', 'side', 1, f, 'weapon.sword', true)!.sx / 17;
    expect([13, 14, 15].map(angle)).toEqual([0, 3, 2]);
    expect(heldOf(data, 'warrior', 'side', 1, 14, 'weapon.sword', true)!.trailSx).toBe(0);
    expect(heldOf(data, 'huntress', 'front', 1, 13, 'missile.dart', true)).not.toBeNull();
    expect(heldOf(data, 'huntress', 'front', 1, 14, 'missile.dart', true)).toBeNull();
  });

  it('places the grip on the hand, mirrored with the side view', () => {
    const held = heldOf(data, 'warrior', 'side', 1, 0, 'weapon.sword', false)!;
    expect([held.left, held.top]).toEqual([2, 3]);                          // the hand at (10, 11), the grip at (8, 8)
    expect(heldOffset(held, 12, 15, false)).toEqual({ right: 4.5, up: -5 });
    expect(heldOffset(held, 12, 15, true)).toEqual({ right: -4.5, up: -5 });
  });

  it('draws nothing for bare hands or an unknown item', () => {
    expect(heldOf(data, 'mage', 'side', 0, 0, undefined, false)).toBeNull();
    expect(heldOf(data, 'mage', 'side', 0, 0, 'wand.firebolt', false)).toBeNull();
  });
});
