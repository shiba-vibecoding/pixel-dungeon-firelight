import { createHero, createItem, createWorld } from '@pd/core';
import { describe, expect, it, vi } from 'vitest';

// The texts want a browser's language: an English one is made up.
vi.stubGlobal('location', { search: '?lang=en', href: 'http://x/' });
vi.stubGlobal('navigator', { language: 'en', languages: ['en'], userAgent: 'x' });
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
const { t } = await import('../src/i18n');
const { itemInfo, strengthOf } = await import('../src/itemtext');

describe('an unidentified weapon or armour gives nothing of its level away', () => {
  it('says «probably too heavy» and shows the strength from the kind alone, whatever its real level', () => {
    const world = createWorld(7);
    const hero = createHero({ id: 'h1', heroClass: 'warrior', name: 'X' } as never, 1, 0, 0);
    hero.str = 12;
    for (const kind of ['weapon.sword', 'armor.mail'] as const) {
      const plain = { ...createItem(kind), level: 0, levelUnknown: true };
      // Upgraded far enough that its real requirement would be within the hero's strength.
      const upgraded = { ...createItem(kind), level: 4, levelUnknown: true };
      expect(itemInfo(world, hero, upgraded)).toEqual(itemInfo(world, hero, plain));
      expect(strengthOf(upgraded)).toEqual(strengthOf(plain));
      expect(itemInfo(world, hero, upgraded)).toContain(t.probablyTooHeavy);
    }
  });
});
