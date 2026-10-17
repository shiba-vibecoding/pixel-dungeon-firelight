import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GHOST_HOLD_MS, HpGhost } from '../src/bossbar';
import { DEFAULT_STAGING, squashAt, squashMs, stageAt, stagingOf } from '../src/bossdata';
import { marksFor, mulberry, wound } from '../src/bossdmg';
import { BOSS_KINDS, BOSS_LINES, BOSS_MOMENTS, bossLine, bossPool } from '../src/bosslines';
import { bossIntensity, calmPush, damageStage, jiggle, lookOf, newLook, POP_MS, pushEnvelope } from '../src/bosslook';
import { parseFx } from '../src/fxsheet';
import { intensityMix } from '../src/music';
import { bossVfx, BossVfx, SHAPE, VFX_CAP } from '../src/r3d/bossvfx3d';

const ASSETS = new URL('../public/assets/', import.meta.url);
const raw: unknown = JSON.parse(readFileSync(new URL('fx/fx.json', ASSETS), 'utf8'));

describe('the bosses\' lines', () => {
  it('has lines for every boss, moment, language and register, a few of each', () => {
    for (const kind of BOSS_KINDS) {
      for (const moment of BOSS_MOMENTS) {
        for (const lang of ['en', 'ru'] as const) {
          const set = BOSS_LINES[kind][moment][lang];
          expect(set.clean.length, `${kind}.${moment}.${lang} clean`).toBeGreaterThanOrEqual(3);
          expect(set.foul.length, `${kind}.${moment}.${lang} foul`).toBeGreaterThanOrEqual(2);
          for (const line of [...set.clean, ...set.foul]) expect(line.length, line).toBeLessThanOrEqual(80);
        }
      }
    }
  });

  it('keeps the swearing to the foul register', () => {
    const foulWords = /\b(fuck\w*|shit\w*|bitch|bastard|piss\w*|asshole|dick)\b|бляд|блять|хуй|хуя|нахуй|пизд|ебан|мудил|говн|заеб|сука|зассу|мраз|ублюд|дерьм/i;
    for (const kind of BOSS_KINDS) {
      for (const moment of BOSS_MOMENTS) {
        for (const lang of ['en', 'ru'] as const) {
          for (const line of bossPool(kind, moment, lang, false)) expect(line, `${kind}.${moment}.${lang}`).not.toMatch(foulWords);
          // (And the foul pool has some, in each moment.)
          expect(BOSS_LINES[kind][moment][lang].foul.some((line) => foulWords.test(line)), `${kind}.${moment}.${lang} foul`).toBe(true);
        }
      }
    }
  });

  it('the foul register has the clean lines too, and the picker does not repeat what was just said', () => {
    expect(bossPool('goo', 'notice', 'en', true).length).toBe(BOSS_LINES.goo.notice.en.foul.length + BOSS_LINES.goo.notice.en.clean.length);
    const pool = bossPool('tengu', 'half', 'ru', false);
    const recent = pool.slice(0, pool.length - 1);
    expect(bossLine('tengu', 'half', 'ru', false, 0.3, recent)).toBe(pool[pool.length - 1]);
    // Everything recent: it still says something.
    expect(pool).toContain(bossLine('tengu', 'half', 'ru', false, 0.99, pool));
    for (const roll of [0, 0.5, 0.999999]) expect(bossLine('yog', 'death', 'en', true, roll)).toBeTruthy();
  });
});

describe('the bar\'s ghost of lost health', () => {
  it('starts where the boss is, waits after a blow, then catches up slowly', () => {
    const g = new HpGhost();
    g.update(0.5, 0, 16);
    expect(g.ghost).toBe(0.5);
    g.update(0.3, 100, 16);
    expect(g.hp).toBeCloseTo(0.3);
    // Held: the pale strip stays where the fill was.
    g.update(0.3, 100 + GHOST_HOLD_MS - 10, 16);
    expect(g.ghost).toBeCloseTo(0.5);
    // Then it follows, never under the fill, and not all at once.
    let t = 100 + GHOST_HOLD_MS;
    g.update(0.3, t, 16);
    expect(g.ghost).toBeGreaterThan(0.3);
    for (let i = 0; i < 400 && g.ghost > g.hp; i++) {
      t += 16;
      g.update(0.3, t, 16);
      expect(g.ghost).toBeGreaterThanOrEqual(g.hp);
    }
    expect(g.ghost).toBe(g.hp);
    // Seconds, not a frame: a fifth of the bar takes a good second or two.
    expect(t - (100 + GHOST_HOLD_MS)).toBeGreaterThan(1000);
  });

  it('a second blow while the strip is still there keeps the older strip; a mending takes it away', () => {
    const g = new HpGhost();
    g.update(1, 0, 16);
    g.update(0.8, 10, 16);
    g.update(0.6, 60, 16);
    expect(g.ghost).toBeCloseTo(1);
    g.update(0.9, 200, 16);
    expect(g.hp).toBeCloseTo(0.9);
    expect(g.ghost).toBeCloseTo(0.9);
    expect(g.healedAt).toBe(200);
  });

  it('reduced motion lets the strip go as soon as its wait is over', () => {
    const g = new HpGhost();
    g.update(1, 0, 16, true);
    g.update(0.4, 10, 16, true);
    expect(g.ghost).toBe(1);
    g.update(0.4, 10 + GHOST_HOLD_MS, 16, true);
    expect(g.ghost).toBeCloseTo(0.4);
  });
});

describe('the staging the designer gives', () => {
  const lib = parseFx(raw);

  it('has the defaults the file has', () => {
    expect(stagingOf(lib)).toEqual(DEFAULT_STAGING);
    expect(stagingOf(null)).toBe(DEFAULT_STAGING);
  });

  it('names effects that are in the data, with sheets', () => {
    const st = stagingOf(lib);
    for (const id of [st.gooHit, st.gooDeath, st.tenguJump, st.tenguMark, st.dmDeath, st.dmDebris, st.kingThrone, st.kingSummon, st.kingFall.then, st.yogGlint, st.yogDeath, st.yogAmulet, st.steam, ...st.dmStages.map((s) => s.fx), ...Object.values(st.yogFists)]) {
      expect(lib.fx[id], id).toBeDefined();
    }
  });

  it('picks the machine\'s stage by its health, worst last, and steps the slime\'s squash', () => {
    const st = DEFAULT_STAGING;
    expect(stageAt(st.dmStages, 0.9)).toBe(-1);
    expect(stageAt(st.dmStages, 0.66)).toBe(0);
    expect(stageAt(st.dmStages, 0.5)).toBe(0);
    expect(stageAt(st.dmStages, 0.4)).toBe(1);
    expect(stageAt(st.dmStages, 0.1)).toBe(2);
    expect(squashAt(st.gooSquash, 0)).toEqual([1.25, 0.75]);
    expect(squashAt(st.gooSquash, 59)).toEqual([1.25, 0.75]);
    expect(squashAt(st.gooSquash, 60)).toEqual([0.9, 1.12]);
    expect(squashAt(st.gooSquash, 125)).toEqual([1, 1]);
    expect(squashAt(st.gooSquash, squashMs(st.gooSquash))).toBeNull();
    expect(squashAt(st.gooSquash, -1)).toBeNull();
    // Missing or broken parts of the file come from the defaults.
    expect(stagingOf({ ...lib, bosses: { goo: { squash: { onHit: 'no' } }, king: { fall: { ms: 'x' } } } }).gooSquash).toEqual(st.gooSquash);
    expect(stagingOf({ ...lib, bosses: { yog: { glintEvery: [1000, 2000] } } }).yogGlintEvery).toEqual([1000, 2000]);
  });
});

describe('how a boss\'s body is drawn', () => {
  const out = newLook();

  it('a blow squashes the slime in the designer\'s steps, feet fixed, and a third as much for reduced motion', () => {
    const state = { kind: 'goo', frac: 1, hitAt: 1000 };
    let look = lookOf(state, 1000, false, out);
    expect([look.sx, look.sy]).toEqual([1.25, 0.75]);
    look = lookOf(state, 1070, false, out);
    expect([look.sx, look.sy]).toEqual([0.9, 1.12]);
    look = lookOf(state, 1200, false, out);
    expect([look.sx, look.sy]).toEqual([1, 1]);
    look = lookOf(state, 1000, true, out);
    expect(look.sx).toBeCloseTo(1 + 0.25 * 0.35);
    expect(look.sy).toBeCloseTo(1 - 0.25 * 0.35);
  });

  it('the slime swells white before it bursts', () => {
    const state = { kind: 'goo', frac: 0.1, deathAt: 500 };
    const early = { ...lookOf(state, 500 + POP_MS * 0.9, false, out) };
    expect(early.sx).toBeGreaterThan(1.3);
    expect(early.r).toBeGreaterThan(1.5);
    const after = lookOf(state, 500 + POP_MS + 20, false, out);
    expect(after.sx).toBe(1);
  });

  it('the machine darkens by stages, glows at the last, and turns green as it mends', () => {
    expect([1, 0.74, 0.5, 0.2].map(damageStage)).toEqual([0, 1, 2, 3]);
    const whole = { ...lookOf({ kind: 'dm300', frac: 1 }, 0, false, out) };
    const worn = { ...lookOf({ kind: 'dm300', frac: 0.3 }, 0, true, out) };
    expect(whole.g).toBe(1);
    expect(worn.g).toBeLessThan(whole.g);
    expect(worn.b).toBeLessThan(worn.g);
    expect(worn.stage).toBe(2);
    const last = lookOf({ kind: 'dm300', frac: 0.1 }, 0, true, out);
    expect(last.stage).toBe(3);
    expect(last.glow).toBeGreaterThan(0);
    const mending = lookOf({ kind: 'dm300', frac: 0.5, repairAt: 100 }, 400, true, out);
    expect(mending.g).toBeGreaterThan(mending.r);
  });

  it('the king falls on his back in four steps, and a summoned dwarf is not there until it rises, then grows from its feet', () => {
    const king = { kind: 'king', frac: 0, deathAt: 0 };
    const angles = [1, 160, 310, 460, 599, 700].map((t) => lookOf(king, t, false, out).roll);
    expect(angles[0]).toBeCloseTo(Math.PI / 8);
    expect(angles[1]).toBeCloseTo(Math.PI / 4);
    expect(angles[2]).toBeCloseTo((3 * Math.PI) / 8);
    expect(angles[3]).toBeCloseTo(Math.PI / 2);
    expect(angles[5]).toBeCloseTo(Math.PI / 2);
    // Reduced motion: no steps, one fall.
    expect(lookOf(king, 1, true, out).roll).toBeCloseTo(Math.PI / 2);
    const dwarf = { kind: 'undead', frac: 1, riseAt: 1000, riseMs: 400 };
    expect(lookOf(dwarf, 900, false, out).hide).toBe(true);
    const half = { ...lookOf(dwarf, 1200, false, out) };
    expect(half.hide).toBe(false);
    expect(half.sy).toBeGreaterThan(0.5);
    expect(half.sy).toBeLessThan(1);
    expect(lookOf(dwarf, 1500, false, out).sy).toBe(1);
  });

  it('a fist slams up past its height and settles; Tengu flickers in thin and bright; the eye flares and dims', () => {
    const fist = { kind: 'rottingFist', frac: 1, riseAt: 0, riseMs: 600 };
    const heights = [0.2, 0.5, 0.7, 0.9].map((k) => lookOf(fist, k * 600, false, out).sy);
    expect(Math.max(...heights)).toBeGreaterThan(1);
    expect(lookOf(fist, 600, false, out).sy).toBe(1);
    const tengu = { kind: 'tengu', frac: 1, riseAt: 0, riseMs: 300 };
    const flicker = lookOf(tengu, 20, false, out);
    expect(flicker.sx).toBeLessThan(0.8);
    expect(flicker.r).toBeGreaterThan(1.5);
    const glare = { kind: 'yog', frac: 1, glareAt: 0 };
    expect(lookOf(glare, 450, false, out).r).toBeGreaterThan(2);
    expect(lookOf(glare, 950, false, out).r).toBe(1);
  });

  it('the spring of a hit dies away', () => {
    expect(jiggle(0)).toBeCloseTo(1);
    expect(Math.abs(jiggle(400))).toBeLessThan(0.2);
    expect(jiggle(600)).toBe(0);
    expect(jiggle(100, true)).toBeCloseTo(jiggle(100) * 0.35);
  });
});

describe('the camera and the music of a fight', () => {
  it('a push eases in, holds and lets go; reduced motion gets a short, small one', () => {
    const push = { at: 1000, inMs: 2000, holdMs: 1000, outMs: 1500, amount: 0.2, slide: 0.5 };
    expect(pushEnvelope(push, 900)).toBe(0);
    expect(pushEnvelope(push, 2000)).toBeCloseTo(0.5, 1);
    expect(pushEnvelope(push, 3500)).toBe(1);
    expect(pushEnvelope(push, 4750)).toBeCloseTo(0.5, 1);
    expect(pushEnvelope(push, 6000)).toBe(0);
    const calm = calmPush(push);
    expect(calm.amount).toBeLessThan(push.amount / 2);
    expect(calm.inMs + calm.holdMs + calm.outMs).toBeLessThan(1500);
    expect(calm.slide).toBe(0);
  });

  it('the music is harder by phase and the mix opens up with it', () => {
    expect([1, 0.6, 0.45, 0.3, 0.1].map(bossIntensity)).toEqual([0, 0.35, 0.6, 0.85, 1]);
    const calm = intensityMix(0);
    const hard = intensityMix(1);
    for (const inst of ['lead', 'harm', 'bass', 'drum', 'pad', 'pluck', 'tone'] as const) expect(hard[inst], inst).toBeGreaterThan(calm[inst]);
    expect(hard.flute).toBeLessThan(calm.flute);
    expect(intensityMix(5)).toEqual(hard);
    expect(calm).toEqual({ lead: 1, harm: 1, bass: 1, drum: 1, pad: 1, flute: 1, pluck: 1, tone: 1 });
  });
});

describe('the machine\'s wounds', () => {
  it('lay the same marks for the same stage, and more of them at each stage', () => {
    expect(marksFor(2, 22, 20)).toEqual(marksFor(2, 22, 20));
    const n = [1, 2, 3].map((s) => marksFor(s, 22, 20).length);
    expect(n[0]).toBeLessThan(n[1]!);
    expect(n[1]).toBeLessThan(n[2]!);
    // A worse stage is the better one with more.
    expect(marksFor(3, 22, 20).slice(0, n[1])).toEqual(marksFor(2, 22, 20));
    expect(mulberry(7)()).toBe(mulberry(7)());
  });

  it('touch only the figure, the same on each frame, and the cracks of the last stage glow', () => {
    // Two frames of 22 x 20, opaque in a middle block.
    const w = 44;
    const h = 20;
    const pixels = (): Uint8ClampedArray => {
      const d = new Uint8ClampedArray(w * h * 4);
      for (let y = 4; y < 18; y++) for (let x = 3; x < 19; x++) for (const dx of [0, 22]) {
        const i = (y * w + x + dx) * 4;
        d[i] = 150; d[i + 1] = 140; d[i + 2] = 130; d[i + 3] = 255;
      }
      return d;
    };
    const base = pixels();
    const worn = pixels();
    const glow = new Uint8ClampedArray(w * h * 4);
    wound(worn, glow, w, h, 22, 20, 3);
    let changed = 0;
    let lit = 0;
    for (let i = 0; i < worn.length; i += 4) {
      if (base[i + 3] === 0) {
        expect(worn[i + 3]).toBe(0);
        expect(glow[i + 3]).toBe(0);
      } else if (worn[i] !== base[i] || worn[i + 1] !== base[i + 1]) changed++;
      if (glow[i + 3] > 0) lit++;
    }
    expect(changed).toBeGreaterThan(20);
    expect(lit).toBeGreaterThan(5);
    // The second frame is the first one's, shifted.
    for (let y = 0; y < h; y++) for (let x = 0; x < 22; x++) expect(worn[(y * w + x + 22) * 4]).toBe(worn[(y * w + x) * 4]);
    // Without the glow map the cracks are only dark.
    const dark = pixels();
    wound(dark, null, w, h, 22, 20, 3);
    expect(dark.length).toBe(worn.length);
  });
});

describe('the bosses\' particles', () => {
  it('wait their delay, move under gravity, bounce, fade and go', () => {
    const v = new BossVfx();
    v.emit({ x: 5, y: 1, z: 5, vx: 1, life: 1000, size: 0.1, color: '#ffffff', gravity: 10, bounce: true, delay: 200 });
    expect(v.count).toBe(1);
    v.update(100, 0);
    expect(v.count).toBe(1);
    const drawn: number[][] = [];
    const painter = {
      soft: { billboard: (...a: number[]) => drawn.push(a), flat: (...a: number[]) => drawn.push(a) },
      glow: { billboard: (...a: number[]) => drawn.push(a), flat: (...a: number[]) => drawn.push(a) },
      dot: [0, 0, 1, 1], mist: [0, 0, 1, 1], solid: [0, 0, 1, 1], ring: [0, 0, 1, 1],
    };
    v.draw(painter, 100, () => true);
    expect(drawn).toHaveLength(0);
    v.update(200, 300);
    v.update(100, 400);
    v.draw(painter, 400, () => true);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]![0]).toBeGreaterThan(5);
    // It falls and bounces off the floor, never under it.
    for (let i = 0; i < 20; i++) v.update(50, 500 + i * 50);
    drawn.length = 0;
    v.draw(painter, 1500, () => true);
    if (drawn[0]) expect(drawn[0]![1]).toBeGreaterThanOrEqual(0.01);
    for (let i = 0; i < 40; i++) v.update(50, 2000 + i * 50);
    expect(v.count).toBe(0);
    expect(v.busy).toBe(false);
  });

  it('leave out what the party does not see, draw rings flat and streaks as long as they run, and take no more than the pool holds', () => {
    const v = new BossVfx();
    const calls: string[] = [];
    const painter = {
      soft: { billboard: () => calls.push('soft-b'), flat: () => calls.push('soft-f') },
      glow: { billboard: () => calls.push('glow-b'), flat: () => calls.push('glow-f') },
      dot: [0, 0, 1, 1], mist: [0, 0, 1, 1], solid: [0, 0, 1, 1], ring: [0, 0, 1, 1],
    };
    v.emit({ x: 1, y: 0, z: 1, life: 500, size: 1, color: '#ff0000', shape: SHAPE.ring, glow: true });
    v.emit({ x: 9, y: 0.5, z: 9, life: 500, size: 1, color: '#00ff00', shape: SHAPE.mist });
    v.update(10, 0);
    v.draw(painter, 10, (x) => x < 5);
    expect(calls).toEqual(['glow-f']);
    v.streak(0, 0, 4, 0, 0.5, 0, 200, '#ffffff');
    v.beam(0, 0, 3, 0, 0.5, 0, 300, '#ff4060');
    calls.length = 0;
    v.draw(painter, 100, () => true);
    expect(calls.filter((c) => c === 'glow-f').length).toBeGreaterThanOrEqual(2);
    const full = new BossVfx();
    let taken = 0;
    for (let i = 0; i < VFX_CAP + 30; i++) if (full.emit({ x: 0, y: 0, z: 0, life: 1000, size: 0.1, color: '#ffffff' })) taken++;
    expect(taken).toBe(VFX_CAP);
    full.clear();
    expect(full.count).toBe(0);
    expect(bossVfx.busy).toBe(false);
  });
});
