import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ITEMS } from '@pd/core';
import type { Facing } from '../src/dirs';
import type { HeldData } from '../src/held';
import { heldFor } from '../src/heldart';
import type { Puppet } from '../src/view';

const data = JSON.parse(readFileSync(fileURLToPath(new URL('../public/assets/weapons/held/held.json', import.meta.url)), 'utf8')) as HeldData;
const FACINGS: Facing[] = ['side', 'front', 'back'];
const CLASSES = ['warrior', 'mage', 'rogue', 'huntress'];

const hero = (over: Partial<Puppet> = {}): Puppet => ({ isHero: true, alive: true, kind: 'warrior', row: 1, anim: 'idle', weapon: 'weapon.sword', ...over }) as unknown as Puppet;

describe('what a puppet holds in its hand', () => {
  it('holds the weapon in hand in every view, class and armour row, in the frames that carry a hand', () => {
    const kinds = Object.keys(ITEMS).filter((k) => k.startsWith('weapon.') || k.startsWith('missile.'));
    for (const cls of CLASSES) {
      for (const facing of FACINGS) {
        for (let row = 0; row < 7; row++) {
          for (const kind of kinds) {
            for (const frame of [0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 15, 18]) {
              // A thrown stone leaves the hand at frame 14 of its throw; everything else is in the hand.
              const held = heldFor(data, hero({ kind: cls, row, weapon: kind, anim: 'idle' }), facing, frame, 0);
              expect(held, `${cls} ${facing} ${row} ${kind} ${frame}`).not.toBeNull();
            }
          }
        }
      }
    }
  });

  it('shows nothing for bare fists, monsters, the dead, and the frames of operating, reading and the tomb', () => {
    expect(heldFor(data, hero({ weapon: undefined }), 'side', 0, 0)).toBeNull();
    expect(heldFor(data, hero({ isHero: false }), 'side', 0, 0)).toBeNull();
    expect(heldFor(data, hero({ alive: false }), 'side', 0, 0)).toBeNull();
    for (const frame of [8, 9, 10, 11, 12, 16, 17, 19, 20]) expect(heldFor(data, hero(), 'front', frame, 0)).toBeNull();
    expect(heldFor(data, hero({ weapon: 'weapon.notAThing' as never }), 'side', 0, 0)).toBeNull();
  });

  it('swings in the attack animation, and holds still in every other one', () => {
    const angle = (anim: string, frame: number): number | undefined => {
      const held = heldFor(data, hero({ anim: anim as never }), 'side', frame, 0);
      return held ? held.sx / 17 : undefined;
    };
    expect([13, 14, 15].map((f) => angle('attack', f))).toEqual([0, 3, 2]);
    expect(heldFor(data, hero({ anim: 'attack' }), 'side', 14, 0)!.trailSx).toBe(0);
    expect(heldFor(data, hero({ anim: 'idle' }), 'side', 2, 0)!.trailSx).toBe(-1);
    // A zap does not change the pose: the animation is not `attack`, so the weapon is held still.
    expect(heldFor(data, hero({ anim: 'idle' }), 'side', 0, 0)).not.toBeNull();
  });

  it('lets a thrown stone go at frame 14 and has the next one back in the hand afterwards', () => {
    const stone = hero({ kind: 'huntress', weapon: 'missile.dart', anim: 'attack' });
    expect(heldFor(data, stone, 'side', 13, 0)).not.toBeNull();
    expect(heldFor(data, stone, 'side', 14, 0)).toBeNull();
    // The throw is over, the stack is in the hand again.
    expect(heldFor(data, { ...stone, anim: 'idle' } as Puppet, 'side', 0, 0)).not.toBeNull();
  });

  it('keeps a boomerang out of the hand while it flies, and has it back when it returns', () => {
    const boomerang = hero({ kind: 'huntress', weapon: 'missile.boomerang', heldAwayFrom: 1070, heldAwayUntil: 2400 });
    expect(heldFor(data, boomerang, 'side', 0, 1000)).not.toBeNull();
    expect(heldFor(data, boomerang, 'side', 0, 1070)).toBeNull();
    expect(heldFor(data, boomerang, 'front', 3, 2000)).toBeNull();
    expect(heldFor(data, boomerang, 'side', 0, 2400)).not.toBeNull();
  });

  it('puts the weapon behind the body where the pose says so and in front elsewhere', () => {
    const layers = new Set<string>();
    for (const facing of FACINGS) for (let f = 0; f < 21; f++) {
      const held = heldFor(data, hero({ anim: 'attack' }), facing, f, 0);
      if (held) layers.add(`${facing}:${held.layer}`);
    }
    expect(layers.has('back:front') || layers.has('back:back')).toBe(true);
    expect([...layers].some((l) => l.endsWith(':front'))).toBe(true);
  });
});
