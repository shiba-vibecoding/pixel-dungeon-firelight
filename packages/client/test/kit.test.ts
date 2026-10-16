import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOLT_OF, BOSS_NAMES, PARTICLE_FRAME, REGION_NAMES, atmosphere, bossAt, boltOf, hex, lights, materialOf, parseKit, regionKit } from '../src/r3d/kit';

const raw = JSON.parse(readFileSync(new URL('../public/assets/hd2d/hd2d-kit.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const kit = parseKit(raw);

describe('the world kit of Claude Design', () => {
  it('reads the kit as it is shipped: five regions, their boss arenas, the materials, the bolts', () => {
    expect(Object.keys(kit.regions)).toEqual([...REGION_NAMES]);
    expect(kit.camera).toEqual({ pitch: 50, fov: 30 });
    expect(kit.three).toEqual({ ambientScale: 2, hemiScale: 2.4, torchDecayAdd: 0.5 });
    expect(kit.materials.wall_face!.height).toBe(1.5);
    expect(kit.materials.door!.height).toBe(1.25);
    expect(kit.materials.chasm!.height).toBe(-3);
    for (const name of REGION_NAMES) {
      const region = kit.regions[name];
      expect(region.depths).toHaveLength(4);
      expect(region.boss.depth).toBe(region.depths[3]! + 1);
      expect(BOSS_NAMES).toContain(region.boss.name);
      for (const p of [...region.particles, ...region.boss.particles]) if (p.type !== 'haze') expect(PARTICLE_FRAME[p.type]).toBeGreaterThanOrEqual(0);
    }
    expect(Object.keys(kit.bolts)).toHaveLength(13);
  });

  it('puts every depth in its region, and the boss depths in their boss arenas', () => {
    const seen: Record<string, string> = {};
    for (let depth = 1; depth <= 26; depth++) {
      const region = Math.min(4, Math.floor((depth - 1) / 5));
      const a = atmosphere(kit, region, depth);
      expect(a.region.name).toBe(REGION_NAMES[region]);
      if (depth % 5 === 0 && depth <= 25) {
        expect(a.boss).toBe(BOSS_NAMES[depth / 5 - 1]);
        expect(a.accent).not.toBeNull();
        expect(a.ambient).toEqual(a.region.boss.ambient);
        expect(a.fog).toEqual(a.region.boss.fog);
        // The arena keeps the region's first particle and adds the boss's.
        expect(a.particles.length).toBe(1 + a.region.boss.particles.length);
        seen[a.boss!] = a.region.name;
      } else {
        expect(a.boss).toBeNull();
        expect(a.accent).toBeNull();
        expect(a.ambient).toEqual(a.region.ambient);
        expect(a.fog).toEqual(a.region.fog);
      }
    }
    expect(seen).toEqual({ goo: 'sewers', tengu: 'prison', dm300: 'caves', king: 'city', yog: 'halls' });
  });

  it('knows the boss of a depth, and of none else', () => {
    expect([5, 10, 15, 20, 25].map(bossAt)).toEqual(['goo', 'tengu', 'dm300', 'king', 'yog']);
    expect([1, 4, 6, 11, 21, 24, 26, 0].map(bossAt)).toEqual([null, null, null, null, null, null, null, null]);
  });

  it('does not give another region a boss arena (the arena of waves takes a region at a boss depth)', () => {
    // Depth 10 lit as the sewers: Tengu's air belongs to the prison only.
    expect(atmosphere(kit, 0, 10).boss).toBeNull();
    expect(atmosphere(kit, 1, 10).boss).toBe('tengu');
  });

  it('applies the kit multipliers for three.js r169, once', () => {
    const sewers = lights(kit, atmosphere(kit, 0, 2));
    expect(sewers.ambient.intensity).toBeCloseTo(0.55 * 2, 10);
    expect(sewers.ambient.color).toBe(hex('#5b7c78'));
    expect(sewers.hemi.intensity).toBeCloseTo(0.35 * 2.4, 10);
    expect(sewers.torch).toMatchObject({ color: hex('#ff9448'), intensity: 13, distance: 9, decay: 1.2 + 0.5 });
    expect(sewers.torch.flicker).toEqual({ hz: 6, amp: 0.18 });
    expect(sewers.hero).toEqual({ color: hex('#ffe0b0'), intensity: 4, distance: 6, decay: 1.6 });
    // A boss arena lights with its own ambient, and the region's torch.
    const goo = lights(kit, atmosphere(kit, 0, 5));
    expect(goo.ambient.intensity).toBeCloseTo(0.45 * 2, 10);
    expect(goo.torch.decay).toBeCloseTo(1.7, 10);
    const halls = lights(kit, atmosphere(kit, 4, 22));
    expect(halls.torch).toMatchObject({ color: hex('#ff4a20'), intensity: 12, decay: 1.3 + 0.5 });
  });

  it('lays a region\'s changes over the common material', () => {
    expect(materialOf(kit, 0, 'floor').roughness).toBe(0.62);
    expect(materialOf(kit, 1, 'floor').roughness).toBe(0.88);
    expect(materialOf(kit, 3, 'floor').roughness).toBe(0.55);
    expect(materialOf(kit, 0, 'wall_face').roughness).toBe(0.7);
    expect(materialOf(kit, 2, 'wall_face').roughness).toBe(0.8);
    expect(materialOf(kit, 2, 'wall_face').height).toBe(1.5);
    expect(materialOf(kit, 4, 'water').roughness).toBe(0.5);
    expect(materialOf(kit, 3, 'water').roughness).toBe(0.06);
    expect(() => materialOf(kit, 0, 'nothing')).toThrow(/no material/);
  });

  it('keeps the halls\' water as lava with a glow and no mirror', () => {
    const halls = regionKit(kit, 4).water;
    expect(halls.reflect).toBeNull();
    expect(halls.emissive).toBe('#ff5a1a');
    expect(halls.emissiveIntensity).toBe(0.8);
    expect(regionKit(kit, 0).water.reflect).toBe('#6fa898');
    expect(regionKit(kit, 99)).toBe(regionKit(kit, 4));
  });

  it('names the kit bolt of each bolt of the game', () => {
    expect(boltOf(kit, 'fire').light).toBe('#ff7a2a');
    expect(boltOf(kit, 'lightning').intensity).toBe(8);
    expect(boltOf(kit, 'rocks').light).toBeNull();
    expect(boltOf(kit, 'something new')).toBe(kit.bolts.magicMissile);
    for (const name of Object.values(BOLT_OF)) expect(kit.bolts[name]).toBeDefined();
  });

  it('refuses a kit that is wrong, and says where', () => {
    const broken = JSON.parse(JSON.stringify(raw)) as { regions: { caves: { torch: { intensity: unknown } } } };
    broken.regions.caves.torch.intensity = 'bright';
    expect(() => parseKit(broken)).toThrow(/regions\.caves\.torch\.intensity/);
    expect(() => parseKit({})).toThrow(/camera/);
    expect(() => parseKit(null)).toThrow(/kit is not an object/);
    const noColour = JSON.parse(JSON.stringify(raw)) as { regions: { halls: { ambient: { color: unknown } } } };
    noColour.regions.halls.ambient.color = 'red';
    expect(() => parseKit(noColour)).toThrow(/regions\.halls\.ambient\.color is not a #rrggbb/);
  });
});
