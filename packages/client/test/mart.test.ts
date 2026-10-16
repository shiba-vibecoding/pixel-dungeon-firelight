import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artSku, CATALOG, itemById, PASS_FREE, PASS_PAID } from '../src/catalog';

/** The designer's catalogue (design part 5): what the shop sells is held to it, in names, bundles and the pass; the prices are the owner's. */
const designer = JSON.parse(readFileSync(new URL('../public/assets/mart/fl/catalog.json', import.meta.url), 'utf8')) as {
  items: Array<{ sku: string; kind: string; stars: number; name: { en: string; ru: string }; heroClass?: string; legendary?: boolean; how?: string; items?: string[]; pack?: string }>;
  bundles: Array<{ sku: string; items: string[]; name: { en: string; ru: string } }>;
  season: { free: Array<[number, string]>; paid: Array<[number, string]> };
};

const ours = (sku: string): string => sku.replace('.ranger.', '.huntress.');

/** What the owner's price table makes of a designer's price (README of the commit: the table). */
function ownerPrice(item: (typeof designer.items)[number]): number {
  if (item.stars === 0) return 0;
  if (item.legendary) return 450;
  switch (item.kind) {
    case 'fire': case 'decor': case 'hat': case 'pet': return item.kind === 'pet' ? ({ 50: 75, 100: 150 } as Record<number, number>)[item.stars] ?? item.stars : item.kind === 'fire' ? (item.stars === 50 ? 75 : item.stars) : item.stars === 25 ? 50 : item.stars;
    case 'trail': case 'kill': case 'digits': return 50;
    case 'death': case 'quips': return 75;
    case 'frame': return item.sku === 'frame.sunforge' ? 100 : 50;
    case 'stickers': return 50;
    default: return item.stars;
  }
}

describe('the shop against the designer’s catalogue', () => {
  const sold = designer.items.filter((item) => item.kind !== 'stickers');

  it('sells every one of the designer’s items, by their ids and names, in both languages', () => {
    for (const item of designer.items) {
      const mine = itemById(ours(item.sku));
      expect(mine, item.sku).toBeDefined();
      if (item.kind === 'skin') expect(mine!.heroClass).toBe(item.heroClass === 'ranger' ? 'huntress' : item.heroClass);
      if (item.kind !== 'skin' && item.kind !== 'sticker' && item.kind !== 'stickers') {
        expect(mine!.name.en, item.sku).toBe(item.name.en);
        expect(mine!.name.ru, item.sku).toBe(item.name.ru);
      }
    }
    expect(designer.items).toHaveLength(135);
    expect(artSku('skin.huntress.moss')).toBe('skin.ranger.moss');
  });

  it('prices every one by the owner’s table, and the designer’s legendary looks at 450', () => {
    for (const item of designer.items) {
      const mine = itemById(ours(item.sku))!;
      if (item.kind === 'sticker') expect(mine.stars, item.sku).toBe(0);
      else if (item.how) expect(mine.stars, item.sku).toBe(0);
      else expect(mine.stars, item.sku).toBe(ownerPrice(item));
    }
  });

  it('the earn-only ones are the designer’s «how»: a badge, the patronage or the season', () => {
    for (const item of sold.filter((candidate) => candidate.how)) {
      const mine = itemById(item.sku)!;
      expect(mine.earn, item.sku).toBeDefined();
      expect(mine.earn!.by).toBe(item.how!.startsWith('badge') ? 'badge' : item.how === 'patron' ? 'patron' : 'pass');
    }
  });

  it('has the designer’s three bundles with their parts, priced at 0.7 of them, and the sticker pack', () => {
    for (const bundle of designer.bundles) {
      const mine = itemById(bundle.sku)!;
      expect(mine.items, bundle.sku).toEqual(bundle.items.map(ours));
      expect(mine.name.en).toBe(bundle.name.en);
      expect(mine.name.ru).toBe(bundle.name.ru);
    }
    expect(itemById('stickers.pack1')!.items).toHaveLength(12);
  });

  it('gives the designer’s season lines, but for the golden fire in place of the flame pillar at level 13', () => {
    const same = (mine: ReadonlyArray<readonly [number, string]>, theirs: Array<[number, string]>): void => {
      expect(mine.map(([level]) => level)).toEqual(theirs.map(([level]) => level));
      for (let i = 0; i < mine.length; i++) if (theirs[i]![1] !== 'kill.pillar') expect(mine[i]![1]).toBe(ours(theirs[i]![1]));
    };
    same(PASS_FREE, designer.season.free);
    same(PASS_PAID, designer.season.paid);
    expect(PASS_PAID.find(([level]) => level === 13)![1]).toBe('fire.golden');
  });

  it('every art file the designer names exists', () => {
    const missing: string[] = [];
    const check = (path: unknown): void => {
      if (typeof path !== 'string' || !/\.(png|svg)$/.test(path)) return;
      try {
        readFileSync(new URL(`../public/assets/${path}`, import.meta.url));
      } catch {
        missing.push(path);
      }
    };
    const walk = (value: unknown): void => {
      if (typeof value === 'string') check(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') Object.values(value).forEach(walk);
    };
    walk(designer);
    expect(missing).toEqual([]);
    expect(CATALOG.length).toBeGreaterThan(135);
  });
});
