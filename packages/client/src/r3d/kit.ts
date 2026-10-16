/*
 * The world kit of Claude Design (design part 3, public/assets/hd2d/hd2d-kit.json), read into types, with no Three.js and no DOM so it
 * can be tested: the materials of each kind of terrain, and for each region (and each boss's arena) its ambient and hemisphere
 * light, torch, fog and mist, particles, water, glowing tiles and extra lights; the colours and lights of the wands' bolts.
 *
 * Light values are tuned for Three.js r169 with the multipliers of the kit's own `three` block (the ambient and hemisphere
 * intensities times a scale, the torch's decay plus a little): `lights()` applies them, and nothing else may.
 */
import { isBossDepth } from '@pd/core';

export const REGION_NAMES = ['sewers', 'prison', 'caves', 'city', 'halls'] as const;
export type RegionName = (typeof REGION_NAMES)[number];

export const BOSS_NAMES = ['goo', 'tengu', 'dm300', 'king', 'yog'] as const;
export type BossName = (typeof BOSS_NAMES)[number];

export interface Tint {
  color: string;
  intensity: number;
}

export interface MaterialKit {
  tiles: number[];
  roughness: number;
  metalness: number;
  /** Height in cells. */
  height: number;
}

export interface Flicker {
  hz: number;
  amp: number;
}

export interface TorchKit {
  color: string;
  intensity: number;
  distance: number;
  decay: number;
  flicker: Flicker;
  shadows: boolean;
}

export interface MistKit {
  color: string;
  density: number;
  height: number;
}

export interface FogKit {
  color: string;
  near: number;
  far: number;
  mist: MistKit | null;
}

export type ParticleType = 'drip' | 'mist' | 'dust' | 'ember' | 'ash' | 'spore' | 'steam' | 'spark' | 'bubble' | 'magic' | 'fly' | 'smoke' | 'haze';

/** The frame of each particle in particles.png (8 x 8 px frames); haze is a screen pass and has none. */
export const PARTICLE_FRAME: Readonly<Record<Exclude<ParticleType, 'haze'>, number>> = {
  drip: 0, mist: 1, dust: 2, ember: 3, ash: 4, spore: 5, steam: 6, spark: 7, bubble: 8, magic: 9, fly: 10, smoke: 11,
};

/** Particles that are drawn as light (added on), and so glow. */
export const GLOWING: ReadonlySet<ParticleType> = new Set(['ember', 'spore', 'spark', 'magic']);

export interface ParticleKit {
  type: ParticleType;
  color: string;
  /** Particles a second per room. */
  rate: number;
}

export interface WaterKit {
  surface: string;
  reflect: string | null;
  reflectStrength: number;
  scroll: [number, number];
  ripple: string;
  /** Lava (the halls): its own glow. */
  emissive?: string;
  emissiveIntensity?: number;
}

export interface TileLight {
  tile: number;
  color: string;
  intensity: number;
  distance: number;
}

export interface BossKit {
  depth: number;
  name: BossName;
  ambient: Tint;
  fog: FogKit;
  accent: { color: string; intensity: number };
  particles: ParticleKit[];
}

export interface RegionKit {
  name: RegionName;
  depths: number[];
  override: Record<string, Partial<MaterialKit>>;
  ambient: Tint;
  hemi: { sky: string; ground: string; intensity: number };
  torch: TorchKit;
  fog: FogKit;
  particles: ParticleKit[];
  water: WaterKit;
  /** Tiles that glow, by terrain id, with the colour; `traps` says whether found traps glow. */
  emissive: Record<string, string | boolean>;
  lights: TileLight[];
  window?: { tile: number; color: string; intensity: number };
  boss: BossKit;
}

export interface BoltKit {
  color: string;
  light: string | null;
  intensity: number;
  distance: number;
}

/**
 * How the kit says flat sprites stand in the world (the `sprites` block, firelight-sprites.md): the blob of shade under a
 * figure, how a flyer hovers, the one-pixel rim of the strongest light, and the light a sprite carries so it is never black.
 */
export interface SpriteKit {
  /** Share of the light a sprite is lit by itself (emissive = its colour times this). */
  selfLight: number;
  shadow: { width: number; squash: number; opacity: number; offset: number };
  fly: { hover: number; shadowScale: number; shadowFade: number; bobHz: number; bobAmp: number };
  rim: { on: boolean; strength: number; max: number; px: number };
}

/** What the sprites are drawn with when a kit has no `sprites` block (the numbers of firelight-sprites.md). */
export const DEFAULT_SPRITES: SpriteKit = {
  selfLight: 0.14,
  shadow: { width: 0.9, squash: 0.42, opacity: 0.55, offset: 0.08 },
  fly: { hover: 0.35, shadowScale: 0.7, shadowFade: 0.55, bobHz: 1.2, bobAmp: 0.06 },
  rim: { on: true, strength: 0.3, max: 0.6, px: 1 },
};

export interface Kit {
  camera: { pitch: number; fov: number };
  sprites: SpriteKit;
  three: { ambientScale: number; hemiScale: number; torchDecayAdd: number };
  bloom: { threshold: number; strength: number; radius: number };
  hero_light: { color: string; intensity: number; distance: number; decay: number };
  materials: Record<string, MaterialKit>;
  regions: Record<RegionName, RegionKit>;
  bolts: Record<string, BoltKit>;
}

const fail = (what: string): never => {
  throw new Error(`hd2d kit: ${what}`);
};

const obj = (value: unknown, what: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : fail(`${what} is not an object`);

const num = (value: unknown, what: string): number => (typeof value === 'number' && Number.isFinite(value) ? value : fail(`${what} is not a number`));

const str = (value: unknown, what: string): string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fail(`${what} is not a #rrggbb colour`);

const text = (value: unknown, what: string): string => (typeof value === 'string' ? value : fail(`${what} is not a string`));

const list = (value: unknown, what: string): unknown[] => (Array.isArray(value) ? value : fail(`${what} is not a list`));

/** '#rrggbb' as the number Three.js takes. */
export function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

function parseTint(value: unknown, what: string): Tint {
  const o = obj(value, what);
  return { color: str(o.color, `${what}.color`), intensity: num(o.intensity, `${what}.intensity`) };
}

function parseFog(value: unknown, what: string): FogKit {
  const o = obj(value, what);
  const mist = o.mist === null || o.mist === undefined ? null : obj(o.mist, `${what}.mist`);
  return {
    color: str(o.color, `${what}.color`),
    near: num(o.near, `${what}.near`),
    far: num(o.far, `${what}.far`),
    mist: mist ? { color: str(mist.color, `${what}.mist.color`), density: num(mist.density, `${what}.mist.density`), height: num(mist.height, `${what}.mist.height`) } : null,
  };
}

function parseParticles(value: unknown, what: string): ParticleKit[] {
  return list(value, what).map((item, i) => {
    const o = obj(item, `${what}[${i}]`);
    const type = text(o.type, `${what}[${i}].type`);
    if (type !== 'haze' && !(type in PARTICLE_FRAME)) fail(`${what}[${i}].type ${type} is unknown`);
    return { type: type as ParticleType, color: str(o.color, `${what}[${i}].color`), rate: num(o.rate, `${what}[${i}].rate`) };
  });
}

function parseMaterial(value: unknown, what: string): MaterialKit {
  const o = obj(value, what);
  return {
    tiles: list(o.tiles, `${what}.tiles`).map((t, i) => num(t, `${what}.tiles[${i}]`)),
    roughness: num(o.roughness, `${what}.roughness`),
    metalness: o.metalness === undefined ? 0 : num(o.metalness, `${what}.metalness`),
    height: num(o.height, `${what}.height`),
  };
}

function parseRegion(name: RegionName, value: unknown): RegionKit {
  const w = `regions.${name}`;
  const o = obj(value, w);
  const hemi = obj(o.hemi, `${w}.hemi`);
  const torch = obj(o.torch, `${w}.torch`);
  const flicker = obj(torch.flicker, `${w}.torch.flicker`);
  const water = obj(o.water, `${w}.water`);
  const scroll = list(water.scroll, `${w}.water.scroll`);
  const boss = obj(o.boss, `${w}.boss`);
  const accent = obj(boss.accent, `${w}.boss.accent`);
  const bossName = text(boss.name, `${w}.boss.name`);
  if (!(BOSS_NAMES as readonly string[]).includes(bossName)) fail(`${w}.boss.name ${bossName} is unknown`);
  const override: Record<string, Partial<MaterialKit>> = {};
  for (const [key, patch] of Object.entries(obj(o.override ?? {}, `${w}.override`))) {
    const p = obj(patch, `${w}.override.${key}`);
    override[key] = {
      ...(p.roughness !== undefined ? { roughness: num(p.roughness, `${w}.override.${key}.roughness`) } : {}),
      ...(p.metalness !== undefined ? { metalness: num(p.metalness, `${w}.override.${key}.metalness`) } : {}),
    };
  }
  const emissive: Record<string, string | boolean> = {};
  for (const [key, colour] of Object.entries(obj(o.emissive ?? {}, `${w}.emissive`))) {
    emissive[key] = typeof colour === 'boolean' ? colour : str(colour, `${w}.emissive.${key}`);
  }
  const lights = list(o.lights ?? [], `${w}.lights`).map((item, i) => {
    const l = obj(item, `${w}.lights[${i}]`);
    return { tile: num(l.tile, `${w}.lights[${i}].tile`), color: str(l.color, `${w}.lights[${i}].color`), intensity: num(l.intensity, `${w}.lights[${i}].intensity`), distance: num(l.distance, `${w}.lights[${i}].distance`) };
  });
  const window = o.window ? obj(o.window, `${w}.window`) : null;
  const surfaceReflect = water.reflect === null ? null : str(water.reflect, `${w}.water.reflect`);
  return {
    name,
    depths: list(o.depths, `${w}.depths`).map((d, i) => num(d, `${w}.depths[${i}]`)),
    override,
    ambient: parseTint(o.ambient, `${w}.ambient`),
    hemi: { sky: str(hemi.sky, `${w}.hemi.sky`), ground: str(hemi.ground, `${w}.hemi.ground`), intensity: num(hemi.intensity, `${w}.hemi.intensity`) },
    torch: {
      color: str(torch.color, `${w}.torch.color`),
      intensity: num(torch.intensity, `${w}.torch.intensity`),
      distance: num(torch.distance, `${w}.torch.distance`),
      decay: num(torch.decay, `${w}.torch.decay`),
      flicker: { hz: num(flicker.hz, `${w}.torch.flicker.hz`), amp: num(flicker.amp, `${w}.torch.flicker.amp`) },
      shadows: torch.shadows === true,
    },
    fog: parseFog(o.fog, `${w}.fog`),
    particles: parseParticles(o.particles, `${w}.particles`),
    water: {
      surface: str(water.surface, `${w}.water.surface`),
      reflect: surfaceReflect,
      reflectStrength: num(water.reflectStrength, `${w}.water.reflectStrength`),
      scroll: [num(scroll[0], `${w}.water.scroll[0]`), num(scroll[1], `${w}.water.scroll[1]`)],
      ripple: str(water.ripple, `${w}.water.ripple`),
      ...(water.emissive !== undefined ? { emissive: str(water.emissive, `${w}.water.emissive`), emissiveIntensity: num(water.emissiveIntensity, `${w}.water.emissiveIntensity`) } : {}),
    },
    emissive,
    lights,
    ...(window ? { window: { tile: num(window.tile, `${w}.window.tile`), color: str(window.color, `${w}.window.color`), intensity: num(window.intensity, `${w}.window.intensity`) } } : {}),
    boss: {
      depth: num(boss.depth, `${w}.boss.depth`),
      name: bossName as BossName,
      ambient: parseTint(boss.ambient, `${w}.boss.ambient`),
      fog: parseFog(boss.fog, `${w}.boss.fog`),
      accent: { color: str(accent.color, `${w}.boss.accent.color`), intensity: num(accent.intensity, `${w}.boss.accent.intensity`) },
      particles: parseParticles(boss.particles, `${w}.boss.particles`),
    },
  };
}

/** The `sprites` block: every number optional (the defaults above stand in), but a number that is there must be one. */
function parseSprites(value: unknown): SpriteKit {
  if (value === undefined) return DEFAULT_SPRITES;
  const o = obj(value, 'sprites');
  const d = DEFAULT_SPRITES;
  const pick = (block: unknown, key: string, fallback: number, what: string): number => {
    const b = block as Record<string, unknown>;
    return b[key] === undefined ? fallback : num(b[key], `${what}.${key}`);
  };
  const shadow = o.shadow === undefined ? {} : obj(o.shadow, 'sprites.shadow');
  const fly = o.fly === undefined ? {} : obj(o.fly, 'sprites.fly');
  const bob = fly.bob === undefined ? {} : obj(fly.bob, 'sprites.fly.bob');
  const rim = o.rim === undefined ? {} : obj(o.rim, 'sprites.rim');
  return {
    selfLight: pick(o, 'selfLight', d.selfLight, 'sprites'),
    shadow: {
      width: pick(shadow, 'width', d.shadow.width, 'sprites.shadow'), squash: pick(shadow, 'squash', d.shadow.squash, 'sprites.shadow'),
      opacity: pick(shadow, 'opacity', d.shadow.opacity, 'sprites.shadow'), offset: pick(shadow, 'offset', d.shadow.offset, 'sprites.shadow'),
    },
    fly: {
      hover: pick(fly, 'hover', d.fly.hover, 'sprites.fly'), shadowScale: pick(fly, 'shadowScale', d.fly.shadowScale, 'sprites.fly'),
      shadowFade: pick(fly, 'shadowFade', d.fly.shadowFade, 'sprites.fly'), bobHz: pick(bob, 'hz', d.fly.bobHz, 'sprites.fly.bob'),
      bobAmp: pick(bob, 'amp', d.fly.bobAmp, 'sprites.fly.bob'),
    },
    rim: {
      on: rim.on === undefined ? d.rim.on : rim.on === true, strength: pick(rim, 'strength', d.rim.strength, 'sprites.rim'),
      max: pick(rim, 'max', d.rim.max, 'sprites.rim'), px: pick(rim, 'px', d.rim.px, 'sprites.rim'),
    },
  };
}

/** Reads the kit's JSON; whatever is missing or the wrong shape is named in the error (a kit that cannot be read leaves the game in 2D). */
export function parseKit(json: unknown): Kit {
  const o = obj(json, 'kit');
  const camera = obj(o.camera, 'camera');
  const three = obj(o.three, 'three');
  const bloom = obj(o.bloom, 'bloom');
  const hero = obj(o.hero_light, 'hero_light');
  const regions = obj(o.regions, 'regions');
  const parsed = {} as Record<RegionName, RegionKit>;
  for (const name of REGION_NAMES) parsed[name] = parseRegion(name, regions[name]);
  const materials: Record<string, MaterialKit> = {};
  for (const [key, value] of Object.entries(obj(o.materials, 'materials'))) materials[key] = parseMaterial(value, `materials.${key}`);
  for (const need of ['floor', 'wall_face', 'wall_top', 'door', 'water', 'chasm']) if (!materials[need]) fail(`materials.${need} is missing`);
  const bolts: Record<string, BoltKit> = {};
  for (const [key, value] of Object.entries(obj(o.bolts, 'bolts'))) {
    const b = obj(value, `bolts.${key}`);
    bolts[key] = {
      color: str(b.color, `bolts.${key}.color`),
      light: b.light === null ? null : str(b.light, `bolts.${key}.light`),
      intensity: num(b.intensity, `bolts.${key}.intensity`),
      distance: num(b.distance, `bolts.${key}.distance`),
    };
  }
  return {
    camera: { pitch: num(camera.pitch, 'camera.pitch'), fov: num(camera.fov, 'camera.fov') },
    sprites: parseSprites(o.sprites),
    three: {
      ambientScale: num(three.ambientScale, 'three.ambientScale'),
      hemiScale: num(three.hemiScale, 'three.hemiScale'),
      torchDecayAdd: num(three.torchDecayAdd, 'three.torchDecayAdd'),
    },
    bloom: { threshold: num(bloom.threshold, 'bloom.threshold'), strength: num(bloom.strength, 'bloom.strength'), radius: num(bloom.radius, 'bloom.radius') },
    hero_light: { color: str(hero.color, 'hero_light.color'), intensity: num(hero.intensity, 'hero_light.intensity'), distance: num(hero.distance, 'hero_light.distance'), decay: num(hero.decay, 'hero_light.decay') },
    materials,
    regions: parsed,
    bolts,
  };
}

/** The boss whose arena a depth is (5 Goo, 10 Tengu, 15 DM-300, 20 the King of Dwarves, 25 Yog-Dzewa), or null. */
export function bossAt(depth: number): BossName | null {
  return isBossDepth(depth) ? (BOSS_NAMES[Math.min(4, Math.floor(depth / 5) - 1)] ?? null) : null;
}

/** The kit's region of a level: the region whose look it takes (sprites.ts levelRegion), 0 to 4. */
export function regionKit(kit: Kit, region: number): RegionKit {
  return kit.regions[REGION_NAMES[Math.max(0, Math.min(4, region))]!];
}

/** The kit's material of a kind of terrain in a region: the common one with the region's changes laid over it. */
export function materialOf(kit: Kit, region: number, key: string): MaterialKit {
  const base = kit.materials[key];
  if (!base) throw new Error(`hd2d kit: no material ${key}`);
  return { ...base, ...(regionKit(kit, region).override[key] ?? {}) };
}

/** What a floor of a region (and of a boss's arena) is lit and fogged with. */
export interface Atmosphere {
  region: RegionKit;
  boss: BossName | null;
  ambient: Tint;
  fog: FogKit;
  particles: ParticleKit[];
  /** The boss arena's accent light, or null. */
  accent: { color: string; intensity: number } | null;
}

export function atmosphere(kit: Kit, region: number, depth: number): Atmosphere {
  const r = regionKit(kit, region);
  const boss = bossAt(depth);
  // Only the region's own boss changes its air: the boss depth of another region's floor (the arena of waves) does not.
  const here = boss !== null && r.boss.name === boss;
  return {
    region: r,
    boss: here ? boss : null,
    ambient: here ? r.boss.ambient : r.ambient,
    fog: here ? r.boss.fog : r.fog,
    particles: here ? [...r.particles.slice(0, 1), ...r.boss.particles] : r.particles,
    accent: here ? r.boss.accent : null,
  };
}

/** The intensities the renderer sets, with the kit's multipliers for Three.js r169 applied (and nowhere else). */
export interface Lights {
  ambient: { color: number; intensity: number };
  hemi: { sky: number; ground: number; intensity: number };
  torch: { color: number; intensity: number; distance: number; decay: number; flicker: Flicker };
  hero: { color: number; intensity: number; distance: number; decay: number };
}

export function lights(kit: Kit, a: Atmosphere): Lights {
  const r = a.region;
  const h = kit.hero_light;
  return {
    ambient: { color: hex(a.ambient.color), intensity: a.ambient.intensity * kit.three.ambientScale },
    hemi: { sky: hex(r.hemi.sky), ground: hex(r.hemi.ground), intensity: r.hemi.intensity * kit.three.hemiScale },
    torch: { color: hex(r.torch.color), intensity: r.torch.intensity, distance: r.torch.distance, decay: r.torch.decay + kit.three.torchDecayAdd, flicker: r.torch.flicker },
    hero: { color: hex(h.color), intensity: h.intensity, distance: h.distance, decay: h.decay },
  };
}

/** The kit's name for each bolt colour of view.ts (`BOLT_COLORS` keys) and the other bolts of the game. */
export const BOLT_OF: Readonly<Record<string, string>> = {
  magic: 'magicMissile', fire: 'firebolt', lightning: 'lightning', poison: 'poison', slow: 'slowness', beam: 'disintegration',
  regrowth: 'regrowth', teleport: 'teleportation', blink: 'blink', amok: 'amok', rocks: 'avalanche', flock: 'flock', reach: 'reach',
  shadow: 'slowness',
};

export function boltOf(kit: Kit, name: string): BoltKit {
  return kit.bolts[BOLT_OF[name] ?? 'magicMissile'] ?? kit.bolts.magicMissile!;
}
