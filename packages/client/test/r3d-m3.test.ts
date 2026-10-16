import { describe, expect, it } from 'vitest';
import { bloomWeights } from '../src/r3d/post';
import { TIERS } from '../src/r3d/governor';
import { parseKit } from '../src/r3d/kit';
import { readFileSync } from 'node:fs';

const kit = parseKit(JSON.parse(readFileSync(new URL('../public/assets/hd2d/hd2d-kit.json', import.meta.url), 'utf8')));

describe('the bloom (post.ts)', () => {
  it('is on in the two highest tiers only', () => {
    expect(TIERS.map((t) => [t.name, t.bloom])).toEqual([['high', true], ['mid', true], ['low', false], ['min', false]]);
  });

  it('weights the wide glow more as the kit radius grows, and never more than the near one', () => {
    const narrow = bloomWeights(0);
    const kitted = bloomWeights(kit.bloom.radius);
    const wide = bloomWeights(1);
    expect(kitted.wide).toBeGreaterThan(narrow.wide);
    expect(wide.wide).toBeGreaterThan(kitted.wide);
    // With the kit's radius each step up adds a little less than the one before (a glow, not a fog).
    expect(kitted.mid).toBeGreaterThan(0);
    expect(kitted.mid).toBeLessThanOrEqual(1);
    expect(kitted.wide).toBeLessThanOrEqual(kitted.mid);
  });

  it('reads the kit\'s own numbers', () => {
    expect(kit.bloom).toEqual({ threshold: 0.82, strength: 0.55, radius: 0.35 });
  });
});
