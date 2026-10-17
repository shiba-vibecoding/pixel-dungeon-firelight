import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENCHANT_RGB, GLYPH_RGB, GROWTH_ICONS, MASKED, MOMENTS, MOTION } from '../src/growdata';

/* growdata.ts is cut from the designer's growth.json: the two are held together here, so that a new json is a failing test, not a wrong icon. */
const json = JSON.parse(readFileSync(new URL('../public/assets/ui/growth/growth.json', import.meta.url), 'utf8')) as {
  icons: Record<string, Record<string, number[]>>;
  enchant: Record<string, string>;
  glyph: string;
  masks: string[];
  motion: { max: number; hold: number; stagger: number; pop: number; reveal: number; moments: Record<string, { ms?: number }> };
};

describe('growdata.ts follows growth.json', () => {
  it('has the places of every icon, the colours and the moments', () => {
    expect(JSON.parse(JSON.stringify(GROWTH_ICONS))).toEqual(json.icons);
    expect(ENCHANT_RGB).toEqual(json.enchant);
    expect(GLYPH_RGB).toBe(json.glyph);
    expect(MASKED).toEqual(json.masks);
    expect(MOTION).toEqual({ max: json.motion.max, hold: json.motion.hold, stagger: json.motion.stagger, pop: json.motion.pop, reveal: json.motion.reveal });
    for (const [name, moment] of Object.entries(json.motion.moments)) if (moment.ms) expect((MOMENTS as Record<string, number>)[name]).toBe(moment.ms);
  });

  it('keeps every moment within the 400 ms the designer set', () => {
    for (const ms of Object.values(MOMENTS)) expect(ms).toBeLessThanOrEqual(MOTION.max);
  });
});
