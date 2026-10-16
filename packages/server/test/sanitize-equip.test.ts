import { describe, expect, it } from 'vitest';
import { sanitizeAction } from '../src/messages';

describe('throwing and taking off what is worn', () => {
  it('a throw may name a pack slot or something worn', () => {
    expect(sanitizeAction({ type: 'throw', item: 3, target: 40 })).toEqual({ type: 'throw', item: 3, target: 40 });
    for (const worn of ['weapon', 'armor', 'ring0', 'ring1']) {
      expect(sanitizeAction({ type: 'throw', item: worn, target: 40, junk: 1 })).toEqual({ type: 'throw', item: worn, target: 40 });
    }
  });

  it('refuses a throw of nothing in particular, and a zap of something worn', () => {
    expect(sanitizeAction({ type: 'throw', item: 'helmet', target: 40 })).toBeNull();
    expect(sanitizeAction({ type: 'throw', item: -1, target: 40 })).toBeNull();
    expect(sanitizeAction({ type: 'throw', item: null, target: 40 })).toBeNull();
    expect(sanitizeAction({ type: 'throw', item: 'weapon' })).toBeNull();
    expect(sanitizeAction({ type: 'zap', item: 'weapon', target: 40 })).toBeNull();
  });

  it('an equip may say which ring comes off, 0 or 1; a drop may name something worn', () => {
    expect(sanitizeAction({ type: 'equip', item: 2 })).toEqual({ type: 'equip', item: 2 });
    expect(sanitizeAction({ type: 'equip', item: 2, replace: 1, junk: 1 })).toEqual({ type: 'equip', item: 2, replace: 1 });
    expect(sanitizeAction({ type: 'equip', item: 2, replace: 2 })).toBeNull();
    expect(sanitizeAction({ type: 'equip', item: 'weapon' })).toBeNull();
    expect(sanitizeAction({ type: 'drop', item: 3 })).toEqual({ type: 'drop', item: 3 });
    for (const worn of ['weapon', 'armor', 'ring0', 'ring1']) expect(sanitizeAction({ type: 'drop', item: worn })).toEqual({ type: 'drop', item: worn });
    expect(sanitizeAction({ type: 'drop', item: 'hat' })).toBeNull();
    expect(sanitizeAction({ type: 'sell', item: 'weapon' })).toBeNull();
  });

  it('an unequip names the weapon (by default) or the armour', () => {
    expect(sanitizeAction({ type: 'unequip' })).toEqual({ type: 'unequip' });
    expect(sanitizeAction({ type: 'unequip', slot: 'armor' })).toEqual({ type: 'unequip', slot: 'armor' });
    expect(sanitizeAction({ type: 'unequip', slot: 'weapon' })).toEqual({ type: 'unequip', slot: 'weapon' });
    expect(sanitizeAction({ type: 'unequip', slot: 'ring0' })).toBeNull();
    expect(sanitizeAction({ type: 'unequip', slot: 7 })).toBeNull();
  });
});
