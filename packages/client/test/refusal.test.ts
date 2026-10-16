import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REPEAT_MS, Refusals } from '../src/refusal';

describe('a refused step is said once', () => {
  it('not again for the same cell and reason within two seconds, however many times a held key retries', () => {
    const r = new Refusals();
    let said = 0;
    // A key held for three seconds: a retry every frame at 60 Hz.
    for (let t = 0; t < 3000; t += 16) if (r.allow(412, 'locked', t)) said++;
    // Once at the start, once more when two seconds have passed.
    expect(said).toBe(2);
  });

  it('says it again for another door, or another reason', () => {
    const r = new Refusals();
    expect(r.allow(1, 'locked', 0)).toBe(true);
    expect(r.allow(1, 'locked', 10)).toBe(false);
    expect(r.allow(2, 'locked', 20)).toBe(true);
    expect(r.allow(1, 'barricade', 30)).toBe(true);
    expect(r.allow(1, 'locked', REPEAT_MS + 1)).toBe(true);
  });

  it('is asked of by every refusal in the walking code, and each ends the held key', () => {
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    for (const text of ['t.locked', 't.exitLocked', 't.barricade']) expect(main).not.toContain(`view.say(${text}`);
    for (const reason of ["'locked'", "'exitLocked'", "'barricade'"]) expect(main).toContain(`refuse(cell, ${reason},`);
    // The one function every refusal goes through stops the key.
    const body = main.slice(main.indexOf('function refuse('), main.indexOf('function refuse(') + 400);
    expect(body).toContain("held.code = ''");
  });
});
