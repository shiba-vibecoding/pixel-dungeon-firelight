import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KEYS, recolorPixels } from '../src/season-art';

const data = JSON.parse(readFileSync(new URL('../public/assets/compete/compete.json', import.meta.url), 'utf8')) as {
  season: { template: { keys: string[] }; seasons: Array<{ id: string; palette: string[] }> };
};

const pixel = (hex: string, alpha = 255): number[] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), alpha];

describe('the season\'s cup and frame from the template (season-art.ts)', () => {
  it('swaps the four greys for the four shades of the season, by index, and nothing else', () => {
    const palette = data.season.seasons[1]!.palette;
    const pixels = new Uint8ClampedArray([...KEYS.flatMap((key) => pixel(key)), ...pixel('#ffcc66'), ...pixel('#101010'), ...pixel('#e0e0e0', 0)]);
    expect(recolorPixels(pixels, palette)).toBe(4);
    expect([...pixels]).toEqual([
      ...palette.flatMap((shade) => pixel(shade)), ...pixel('#ffcc66'), ...pixel('#101010'), ...pixel('#e0e0e0', 0),
    ]);
  });

  it('uses the keys the designer wrote down', () => {
    expect(KEYS).toEqual(data.season.template.keys);
  });

  it('has four shades in every palette the designer drew', () => {
    for (const season of data.season.seasons) expect(season.palette, season.id).toHaveLength(4);
  });
});
