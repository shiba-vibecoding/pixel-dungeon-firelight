import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Every stylesheet is global, so two features that both style a bare `.fl-x` fight over it: the one loaded later wins everywhere. That is how
 * the growth ceremony's `.fl-banner` (absolute, no taps, fading) took over the shop's season card and its pass button (report MVNAQG).
 * A class styled bare in more than one sheet is allowed only where one feature is split across sheets on purpose (listed here).
 */

const DIR = fileURLToPath(new URL('../src/', import.meta.url));

/** Classes one feature styles in two sheets on purpose: the shop and its extension, the designer's quest and boss sheets and the code's. */
const SHARED = new Set([
  'fl-card', 'fl-card-art', 'fl-card-name', 'fl-face', 'fl-friend', 'fl-sticker',
  'fl-quest', 'fl-quest-title', 'fl-bossbar',
]);

/** The classes a sheet styles bare (`.fl-x {`, `.fl-x:hover {`), not inside another (`.fl-y .fl-x`). */
function bareClasses(css: string): Set<string> {
  const out = new Set<string>();
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/(?:^|[}\n])\s*([^{}@]+)\{/g)) {
    for (const raw of m[1]!.split(',')) {
      const sel = raw.trim();
      const hit = /^\.((?:fl|pd)-[\w-]+)(?::[\w-]+(?:\([^)]*\))?)?$/.exec(sel);
      if (hit) out.add(hit[1]!);
    }
  }
  return out;
}

describe('stylesheets: no two features style the same bare class', () => {
  it('keeps each bare .fl-/.pd- class to one sheet, but for the listed splits', () => {
    const owners = new Map<string, string[]>();
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.css') && f !== 'ui.css')) {
      for (const cls of bareClasses(readFileSync(DIR + file, 'utf8'))) owners.set(cls, [...(owners.get(cls) ?? []), file]);
    }
    const clashes = [...owners].filter(([cls, files]) => files.length > 1 && !SHARED.has(cls)).map(([cls, files]) => `${cls}: ${files.join(', ')}`);
    expect(clashes).toEqual([]);
  });

  it('keeps the shop\'s season card its own: the growth ceremony is .fl-ceremony', () => {
    const grow = readFileSync(DIR + 'fl-grow.css', 'utf8');
    expect(bareClasses(grow).has('fl-banner')).toBe(false);
    expect(bareClasses(grow).has('fl-ceremony')).toBe(true);
  });
});
