import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { LENGTH, T, type Level } from '@pd/core';

// The cards speak the language of the page: Russian is the one the owner reads.
vi.stubGlobal('location', { search: '?lang=ru', href: 'http://x/' });
vi.stubGlobal('navigator', { language: 'ru', languages: ['ru'], userAgent: 'x' });
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
const { PLACE_CARDS, PLACE_ICONS } = await import('../src/placeart');
const { placeCard } = await import('../src/placetext');

describe('the places\' cards (part 13: ui/places/places.json)', () => {
  const json = JSON.parse(readFileSync(new URL('../public/assets/ui/places/places.json', import.meta.url), 'utf8')) as {
    icons: { order: string[] }; cards: Record<string, { en: [string, string]; ru: [string, string] }>;
  };

  it('has the icons in the sheet\'s order and the cards as the designer wrote them', () => {
    expect([...PLACE_ICONS]).toEqual(json.icons.order);
    for (const key of PLACE_ICONS) expect(PLACE_CARDS[key], key).toEqual(json.cards[key]);
    const png = readFileSync(new URL('../public/assets/ui/places/icons.png', import.meta.url));
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([PLACE_ICONS.length * 16, 16]);
  });

  it('puts the right icon on each examine card, and tells what the rules say', () => {
    const map = new Array<number>(LENGTH).fill(T.EMPTY);
    map[10] = T.WELL; map[11] = T.WELL; map[12] = T.WELL; map[13] = T.BOOKSHELF; map[14] = T.PEDESTAL; map[15] = T.SIGN; map[16] = T.PEDESTAL;
    const lvl = { map, wells: [{ pos: 10, water: 'health' }, { pos: 11, water: 'awareness' }, { pos: 12, water: 'transmutation' }], altar: { pos: 16, volume: 0 } } as unknown as Level;
    expect([10, 11, 12].map((c) => placeCard(lvl, false, c, false)!.icon)).toEqual(['well-health', 'well-awareness', 'well-transmutation']);
    expect(placeCard(lvl, false, 13, false)!.icon).toBe('library');
    expect(placeCard(lvl, false, 14, true)!.icon).toBe('pedestal');
    expect(placeCard(lvl, false, 15, false)!.icon).toBe('sign');
    expect(placeCard(lvl, true, 16, false)!.icon).toBe('altar');
    expect(placeCard(lvl, false, 16, false)!.icon).toBe('altar');
    expect(placeCard(lvl, false, 20, false)).toBeNull();
    // Every icon the cards use is one of the sheet's.
    for (const c of [10, 11, 12, 13, 14, 15, 16]) expect(PLACE_ICONS).toContain(placeCard(lvl, true, c, true)!.icon);
  });
});
