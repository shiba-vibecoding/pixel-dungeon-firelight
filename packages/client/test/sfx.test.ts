import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOLT_SOUND, TRAP_SOUND } from '../src/soundmap';
import { hasSfx, renderSfx, renderVoice, seedOf, SFX, SFX_NAMES, voiceLength, voiceSpan, type Sfx } from '../src/sfx-synth';

const RATES = [22050, 44100, 48000];

describe('the synth: a voice rendered to samples', () => {
  it('lasts attack + hold + decay', () => {
    const rate = 44100;
    const out = renderVoice({ wave: 'sine', freq: 440, attack: 0.01, hold: 0.05, decay: 0.1 }, rate, () => 0.5);
    expect(out.length).toBe(Math.ceil(0.16 * rate));
  });

  it('plays the pitch it is asked for', () => {
    const rate = 48000;
    const out = renderVoice({ wave: 'sine', freq: 480, attack: 0.001, hold: 0.5, decay: 0.01 }, rate, () => 0);
    let crossings = 0;
    for (let i = 1; i < out.length; i++) if (out[i - 1]! < 0 && out[i]! >= 0) crossings++;
    // 480 Hz for about half a second.
    expect(crossings).toBeGreaterThan(235);
    expect(crossings).toBeLessThan(246);
  });

  it('slides the pitch up when told to', () => {
    const rate = 48000;
    const out = renderVoice({ wave: 'sine', freq: 200, slide: 12, attack: 0.001, hold: 0.4, decay: 0.01 }, rate, () => 0);
    const crossings = (from: number, to: number): number => {
      let n = 0;
      for (let i = from + 1; i < to; i++) if (out[i - 1]! < 0 && out[i]! >= 0) n++;
      return n;
    };
    const half = Math.floor(out.length / 2);
    expect(crossings(half, out.length)).toBeGreaterThan(crossings(0, half) * 1.3);
  });

  it('bit-crushes to the levels asked for', () => {
    const rate = 44100;
    const out = renderVoice({ wave: 'sine', freq: 300, hold: 0.1, crush: 3, decay: 0.001, attack: 0.001 }, rate, () => 0);
    // Where the envelope is full (the hold): only the few levels of 3 bits are left.
    const held = out.slice(Math.ceil(0.002 * rate), Math.floor(0.1 * rate));
    const levels = new Set(Array.from(held, (x) => Math.round(x * 1e4) / 1e4));
    expect(levels.size).toBeLessThanOrEqual(9);
    expect(levels.size).toBeGreaterThan(2);
  });

  it('never goes unstable in a sweeping, resonant filter', () => {
    for (const type of ['lp', 'hp', 'bp'] as const) {
      const out = renderVoice({ wave: 'noise', filter: { type, hz: 8000, to: 40, q: 12 }, hold: 0.5, decay: 0.2 }, 22050, Math.random);
      expect(out.every((x) => Number.isFinite(x) && Math.abs(x) < 50)).toBe(true);
    }
  });
});

describe('the sounds', () => {
  it('are rendered with finite samples, at every sample rate', () => {
    for (const name of SFX_NAMES) {
      for (const rate of RATES) {
        const out = renderSfx(SFX[name], rate, seedOf(name));
        expect(out.length, name).toBeGreaterThan(0);
        for (let i = 0; i < out.length; i++) {
          if (!Number.isFinite(out[i]!)) throw new Error(`${name} at ${rate}: sample ${i} is ${out[i]}`);
        }
      }
    }
  });

  it('last as long as their voices say, and not more than 3.5 seconds', () => {
    for (const name of SFX_NAMES) {
      const def: Sfx = SFX[name];
      const seconds = Math.max(...def.voices.map(voiceSpan));
      const out = renderSfx(def, 44100, seedOf(name));
      expect(out.length, name).toBe(Math.ceil(seconds * 44100) + 1);
      expect(seconds, name).toBeGreaterThan(0.015);
      expect(seconds, name).toBeLessThanOrEqual(3.5);
    }
  });

  it('are brought to their level, and are never silent or clipped', () => {
    for (const name of SFX_NAMES) {
      const out = renderSfx(SFX[name], 44100, seedOf(name));
      let peak = 0;
      let energy = 0;
      for (const x of out) {
        peak = Math.max(peak, Math.abs(x));
        energy += x * x;
      }
      expect(peak, name).toBeCloseTo(SFX[name].level, 2);
      expect(peak, name).toBeLessThanOrEqual(1);
      expect(Math.sqrt(energy / out.length), name).toBeGreaterThan(0.005);
    }
  });

  it('come out the same every time, on every device', () => {
    for (const name of ['roar', 'crowd', 'crackle', 'hit', 'shatter'] as const) {
      const a = renderSfx(SFX[name], 44100, seedOf(name));
      const b = renderSfx(SFX[name], 44100, seedOf(name));
      expect(Array.from(a)).toEqual(Array.from(b));
    }
  });

  it('end in silence, without a click', () => {
    for (const name of SFX_NAMES) {
      const out = renderSfx(SFX[name], 44100, seedOf(name));
      expect(Math.abs(out[out.length - 1]!), name).toBeLessThan(0.02);
    }
  });

  it('are scattered differently from seed to seed (a crackle is not one pop repeated)', () => {
    const a = renderSfx(SFX.crackle, 44100, 1);
    const b = renderSfx(SFX.crackle, 44100, 2);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('voice lengths add up', () => {
    expect(voiceLength({ attack: 0.1, hold: 0.2, decay: 0.3 })).toBeCloseTo(0.6);
    expect(voiceSpan({ attack: 0.1, hold: 0, decay: 0.1, delay: 1, repeat: [3, 0.5] })).toBeCloseTo(2.2);
  });
});

describe('the sounds the game asks for', () => {
  const KEPT = new Set(['boss', 'badge']);
  const sources = readdirSync(new URL('../src', import.meta.url)).filter((f) => f.endsWith('.ts'));

  it('all exist (the two kept from the original aside)', () => {
    const missing: string[] = [];
    for (const file of sources) {
      const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      for (const match of text.matchAll(/audio\.(?:play|later)\((?:[\w.* ]+,\s*)?'([A-Za-z_]+)'/g)) {
        const name = match[1]!;
        if (!hasSfx(name) && !KEPT.has(name)) missing.push(`${file}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every trap and every wand has one', () => {
    for (const kind of ['toxic', 'fire', 'paralytic', 'poison', 'alarm', 'lightning', 'gripping', 'summoning']) expect(TRAP_SOUND[kind], kind).toBeDefined();
    for (const kind of ['magic', 'lightning', 'fire', 'poison', 'slow', 'teleport', 'blink', 'beam', 'rocks', 'shadow', 'amok', 'reach', 'flock', 'regrowth']) {
      expect(BOLT_SOUND[kind], kind).toBeDefined();
    }
    for (const name of [...Object.values(TRAP_SOUND), ...Object.values(BOLT_SOUND)]) expect(hasSfx(name), name).toBe(true);
  });

  it('include the roar of the challenge scroll, and the other waves', () => {
    for (const name of ['roar', 'wail', 'lullaby', 'psi', 'crit', 'thump', 'equip', 'quip', 'tick', 'click', 'amulet', 'ascend', 'descend']) expect(hasSfx(name), name).toBe(true);
  });

  it('give the roar a longer body than a blast', () => {
    const length = (name: keyof typeof SFX): number => Math.max(...SFX[name].voices.map(voiceSpan));
    expect(length('roar')).toBeGreaterThan(1.2);
    expect(length('roar')).toBeGreaterThan(length('blast'));
  });
});
