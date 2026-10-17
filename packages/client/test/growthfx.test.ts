import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ATLAS, packSheets } from '../src/fxsheet';
import {
  ENCHANT_RGB, FX_ROW, glyphLight, GLYPH_RGB, HALO, HALO_RGB, lifted, newPose, ORBIT_MS, ORBIT_DR, ORBIT_R0, onScreen, periodOf, runeLook, saltOf, SHINE_PERIOD,
  SIGIL_MS, sigilFrame, SPARKS, sparkCount, sparkPose,
} from '../src/r3d/growthfx';

/* Part 11 variant A in 3D: the pure rules of the sparks, and that they are the designer's numbers. */

const json = JSON.parse(readFileSync(fileURLToPath(new URL('../public/assets/ui/growth/growth.json', import.meta.url)), 'utf8')) as {
  shine: { A: { sparks: number[]; halo: number[] } };
  motion: { moments: { shine: { period: number[] }; mastery: { ms: number } } };
  enchant: Record<string, string>;
  fx: Record<string, { y: number; w: number; h: number; frames: number }>;
  glyph: string;
  palette: Record<string, string>;
};

describe('growth in 3D: the designer\'s numbers', () => {
  it('keeps sparks, halo and period equal to growth.json', () => {
    expect([...SPARKS]).toEqual(json.shine.A.sparks);
    expect([...HALO]).toEqual(json.shine.A.halo);
    expect([...SHINE_PERIOD]).toEqual(json.motion.moments.shine.period);
    expect(SIGIL_MS).toBe(json.motion.moments.mastery.ms);
  });

  it('keeps the rows of the effects sheet and the colours equal to growth.json', () => {
    for (const [name, y] of Object.entries(FX_ROW)) expect(json.fx[name]!.y, name).toBe(y);
    expect(Object.keys(ENCHANT_RGB).sort()).toEqual(Object.keys(json.enchant).sort());
    for (const [k, v] of Object.entries(json.enchant)) expect(ENCHANT_RGB[k]!.join(', '), k).toBe(v);
    expect(GLYPH_RGB.join(', ')).toBe(json.glyph);
    const f = json.palette.f!;
    expect([...HALO_RGB]).toEqual([1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16)));
  });

  it('has a reserved corner in the atlas that the other sheets are not packed into', () => {
    const g = ATLAS.growth;
    expect([g.w, g.h]).toEqual([64, 128]);
    for (const r of ATLAS.free) {
      const apart = g.x + g.w <= r.x || r.x + r.w <= g.x || g.y + g.h <= r.y || r.y + r.h <= g.y;
      expect(apart, JSON.stringify(r)).toBe(true);
    }
    expect(g.x + g.w).toBeLessThanOrEqual(ATLAS.w);
    expect(g.y + g.h).toBeLessThanOrEqual(ATLAS.h);
    // and the free area still packs a few big sheets, as before
    expect(packSheets([{ path: 'a', w: 384, h: 256 }, { path: 'b', w: 192, h: 128 }], ATLAS.free)).not.toBeNull();
  });
});

describe('growth in 3D: sparks by step', () => {
  it('shows 1, 2, 3, 4 sparks by step, none for nothing, and half (rounded up) in the light mode', () => {
    expect([0, 1, 2, 3, 4].map((t) => sparkCount(t, false))).toEqual([0, 1, 2, 3, 4]);
    expect([0, 1, 2, 3, 4].map((t) => sparkCount(t, true))).toEqual([0, 1, 1, 2, 2]);
  });

  it('twinkles once a period for steps 1 to 3 and keeps turning for step 4', () => {
    expect([1, 2, 3, 4].map(periodOf)).toEqual([1600, 1200, 900, ORBIT_MS]);
    const p = newPose();
    for (const tier of [1, 2, 3]) {
      const per = periodOf(tier);
      let lit = 0;
      let dark = 0;
      const seen = new Set<number>();
      for (let ms = 0; ms < per; ms += 10) {
        sparkPose(tier, 0, 1, ms, 0, false, p);
        if (p.alpha > 0) {
          lit++;
          seen.add(p.frame);
        } else dark++;
      }
      // lit for the first half of the period, through the four frames, then dark
      expect(lit / (lit + dark), `tier ${tier}`).toBeCloseTo(0.5, 1);
      expect([...seen].sort()).toEqual([0, 1, 2, 3]);
      sparkPose(tier, 0, 1, per, 0, false, p);
      const again = { ...p };
      sparkPose(tier, 0, 1, 0, 0, false, p);
      expect(again).toEqual(p);
    }
    for (let ms = 0; ms < 3000; ms += 37) {
      sparkPose(4, 2, 4, ms, 0, false, p);
      expect(p.alpha).toBe(1);
      expect(p.frame).toBeGreaterThanOrEqual(1);
      expect(p.frame).toBeLessThanOrEqual(3);
    }
  });

  it('keeps the orbit between 0.22 and 0.34 cells', () => {
    const p = newPose();
    for (let k = 0; k < 4; k++) {
      const r = ORBIT_R0 + ORBIT_DR * k;
      expect(r).toBeGreaterThanOrEqual(0.22 - 1e-9);
      expect(r).toBeLessThanOrEqual(0.34 + 1e-9);
      for (let ms = 0; ms < 1400; ms += 50) {
        sparkPose(4, k, 4, ms, 0, false, p);
        expect(Math.hypot(p.dx, (p.dy - 0.2) / 0.9)).toBeCloseTo(r, 6);
      }
    }
  });

  it('shows still sparks under reduced motion: lit, one frame, the same at every time', () => {
    const a = newPose();
    const b = newPose();
    for (const tier of [1, 2, 3, 4]) {
      sparkPose(tier, 1, 2, 0, 0, true, a);
      sparkPose(tier, 1, 2, 123456, 777, true, b);
      expect(b).toEqual(a);
      expect(a.alpha).toBe(1);
    }
    expect(runeLook(500, true, { frame: 0, light: 0 })).toEqual({ frame: 3, light: 1 });
    expect(glyphLight(0, true)).toBe(glyphLight(900, true));
    expect(sigilFrame(0, true)).toBe(sigilFrame(399, true));
  });

  it('keeps the sparks of two heroes (salts) out of step', () => {
    const a = newPose();
    const b = newPose();
    sparkPose(2, 0, 2, 300, saltOf('a'), false, a);
    sparkPose(2, 0, 2, 300, saltOf('zz-other'), false, b);
    expect(saltOf('a')).not.toBe(saltOf('zz-other'));
    expect(a.dx === b.dx && a.dy === b.dy).toBe(false);
  });
});

describe('growth in 3D: the small rules', () => {
  it('flares the sigil for 400 ms in four frames', () => {
    expect([0, 99, 100, 250, 399].map((t) => sigilFrame(t, false))).toEqual([0, 0, 1, 2, 3]);
    expect(sigilFrame(400, false)).toBe(-1);
    expect(sigilFrame(-1, false)).toBe(-1);
  });

  it('raises a dull enchantment colour so an added rune shows, and leaves bright ones alone', () => {
    const out: [number, number, number] = [0, 0, 0];
    expect(Math.max(...lifted(ENCHANT_RGB.death!, 120, out))).toBeCloseTo(120);
    expect(lifted(ENCHANT_RGB.fire!, 120, out)).toEqual([255, 68, 0]);
    const o2: [number, number, number] = [0, 0, 0];
    lifted([68, 0, 170], 120, o2);
    expect(o2).toEqual([68, 0, 170]);
  });

  it('draws only figures that are on the screen (a margin of cells)', () => {
    // 2 device pixels per art pixel on a 750 x 1624 canvas, the camera's corner at the origin
    const on = (x: number, y: number): boolean => onScreen(x, y, 0, 0, 2, 750, 1624, Math.sin((70 * Math.PI) / 180), 2);
    expect(on(100, 100)).toBe(true);
    expect(on(-20, 100)).toBe(true);
    expect(on(-100, 100)).toBe(false);
    expect(on(100, 2000)).toBe(false);
    expect(on(2000, 100)).toBe(false);
  });
});
