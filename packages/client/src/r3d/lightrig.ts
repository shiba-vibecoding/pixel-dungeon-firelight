/*
 * The lights of the scene, a fixed handful so the shaders never change: the hero's, two torches that cast shadows (their maps drawn
 * only when a torch or a wall changes), two plain accent lights, one for what moves (a bolt, a blast's flash) and one for a boss's
 * arena. The accent lights are the nearest of the level's other sources: more torches, and the kit's glowing tiles (a caves' fungus
 * patch, a city's forge door, lava, a prison's barred window, a hall's rune). Values are the kit's, with its r169 multipliers.
 */
import { Color, PointLight, type Scene } from 'three';
import { HEIGHT, LENGTH, T, WIDTH } from '@pd/core';
import { type Kit, type Lights, type RegionKit, hex } from './kit';
import { K_WALL, K_WATER, type LevelGeom } from './levelgeom';

/** A source of light in the level, from which the nearest are lit. */
export interface Source {
  x: number;
  y: number;
  z: number;
  cell: number;
  color: number;
  intensity: number;
  distance: number;
  decay: number;
  /** Flicker (Hz and the share of the intensity), none for steady light. */
  hz: number;
  amp: number;
  /** A wall torch: one of these may cast shadows. */
  torch: boolean;
}

/** How high a torch's light hangs, and how far it stands out from the wall's face, in cells. */
export const TORCH_Y = 1.35;
export const TORCH_OUT = 0.95;
const HERO_Y = 0.9;
/** Sources farther than this from the hero are not considered, cells. */
const REACH = 14;

/**
 * The level's sources of light: its wall torches, and the glowing tiles of the region (every `step`-th, as the kit says: a
 * fungus patch in three, lava one in about six cells), each with its colour, intensity and reach from the kit.
 */
export function sourcesOf(kit: Kit, region: RegionKit, geom: LevelGeom, depthTorches: boolean): Source[] {
  const out: Source[] = [];
  const decay = region.torch.decay + kit.three.torchDecayAdd;
  const t = region.torch;
  if (depthTorches) {
    for (const cell of geom.torches) {
      out.push({
        x: (cell % WIDTH) + 0.5, y: TORCH_Y, z: Math.trunc(cell / WIDTH) + 1 + TORCH_OUT, cell, color: hex(t.color), intensity: t.intensity,
        distance: t.distance, decay, hz: t.flicker.hz, amp: t.flicker.amp, torch: true,
      });
    }
  }
  const lit = (terrain: number): boolean => terrain === 12 && region.window !== undefined;
  const counts = new Map<number, number>();
  for (const tile of region.lights) counts.set(tile.tile, 0);
  for (let cell = 0; cell < LENGTH; cell++) {
    const terrain = geom.terrain[cell]!;
    const kind = geom.kinds[cell]!;
    const water = kind === K_WATER;
    for (const light of region.lights) {
      // The kit's lava light (tile 63) is on every lava cell, one in about six: any water cell of the halls.
      const match = light.tile === T.WATER ? water : terrain === light.tile;
      if (!match) continue;
      const n = counts.get(light.tile)!;
      counts.set(light.tile, n + 1);
      const step = light.tile === T.WATER ? 6 : light.tile === 5 ? 1 : 3;
      if (n % step !== 0) continue;
      out.push({
        x: (cell % WIDTH) + 0.5, y: light.tile === 5 ? 0.8 : 0.45, z: Math.trunc(cell / WIDTH) + (light.tile === 5 ? 1.2 : 0.5), cell,
        color: hex(light.color), intensity: light.intensity, distance: light.distance * 1.3, decay: 1.4, hz: 0, amp: 0, torch: false,
      });
    }
    // A barred window in the prison's wall: a cold light through the bars.
    if (lit(terrain) && geom.kinds[cell + WIDTH] !== undefined && geom.kinds[cell + WIDTH] === 0 && region.window) {
      out.push({
        x: (cell % WIDTH) + 0.5, y: 1.0, z: Math.trunc(cell / WIDTH) + 1.6, cell, color: hex(region.window.color), intensity: region.window.intensity * 1.4,
        distance: 7, decay: 1.4, hz: 0, amp: 0, torch: false,
      });
    }
  }
  return out;
}

/** Scratch for the nearest three, so choosing allocates nothing. */
const top = new Int32Array(3);
const topD = new Float64Array(3);

export class LightRig {
  readonly hero: PointLight;
  /** Torches that cast shadows. */
  readonly shadow: PointLight[] = [];
  readonly plain: PointLight[] = [];
  /** For what moves: a bolt, a blast. */
  readonly dynamic: PointLight;
  /** A boss arena's accent. */
  readonly accent: PointLight;
  private sources: Source[] = [];
  private d2 = new Float64Array(0);
  /** The source each of the four static lights shows (an index into `sources`), or -1. */
  private readonly slots = [-1, -1, -1, -1];
  private lights = new Array<PointLight>();
  /** A shadow map must be drawn again: a shadow light moved (or the walls changed). */
  shadowsStale = true;
  private shadowCount = 0;
  private heroBase = 4;
  private shadowSize = 512;

  constructor(scene: Scene, readonly phone: boolean) {
    this.hero = new PointLight(0xffe0b0, 4, 6, 1.6);
    for (let i = 0; i < 2; i++) this.shadow.push(new PointLight(0xffffff, 0, 9, 1.7));
    for (let i = 0; i < 2; i++) this.plain.push(new PointLight(0xffffff, 0, 6, 1.4));
    this.dynamic = new PointLight(0xffffff, 0, 4, 1.4);
    this.accent = new PointLight(0xffffff, 0, 7, 1.2);
    this.lights = [this.hero, ...this.shadow, ...this.plain, this.dynamic, this.accent];
    scene.add(...this.lights);
    this.shadowSize = phone ? 512 : 1024;
  }

  /** The level's own light: the kit's hero light, the region's torches. */
  configure(lights: Lights, sources: Source[], shadowLights: number): void {
    this.sources = sources;
    this.d2 = new Float64Array(sources.length);
    this.slots.fill(-1);
    this.hero.color.setHex(lights.hero.color);
    this.heroBase = lights.hero.intensity;
    this.hero.intensity = lights.hero.intensity;
    this.hero.distance = lights.hero.distance;
    this.hero.decay = lights.hero.decay;
    this.setShadowLights(shadowLights);
    for (const light of this.shadow) {
      light.shadow.mapSize.set(this.shadowSize, this.shadowSize);
      light.shadow.camera.near = 0.2;
      light.shadow.camera.far = 14;
      light.shadow.bias = -0.0008;
      light.shadow.normalBias = 0.03;
    }
    this.shadowsStale = true;
  }

  /** How many of the two torch lights cast shadows (the quality tier). */
  setShadowLights(n: number): void {
    this.shadowCount = n;
    for (let i = 0; i < this.shadow.length; i++) this.shadow[i]!.castShadow = i < n;
    this.shadowsStale = true;
  }

  /** The nearest few sources to the hero, written onto the four lights; true if a shadow light moved. */
  assign(hx: number, hz: number, explored: readonly boolean[], accents: number): void {
    const n = this.sources.length;
    const sources = this.sources;
    for (let i = 0; i < n; i++) {
      const s = sources[i]!;
      const dx = s.x - hx;
      const dz = s.z - hz;
      const d = dx * dx + dz * dz;
      this.d2[i] = explored[s.cell] && d <= REACH * REACH ? d : Infinity;
    }
    // Torches first: the two nearest cast the shadows.
    this.nearest(true, -1, -1);
    this.fill(0, 2, top, true);
    // The next two nearest of anything: the accents (a quality tier may allow fewer).
    this.nearest(false, this.slots[0]!, this.slots[1]!);
    this.fill(2, Math.min(2, accents), top, false);
    for (let i = 2 + accents; i < 4; i++) {
      this.slots[i] = -1;
      this.plain[i - 2]!.intensity = 0;
    }
  }

  /** The three nearest of the (torch or any) sources, not `skipA` or `skipB`, into `top`. */
  private nearest(torchOnly: boolean, skipA: number, skipB: number): void {
    top.fill(-1);
    topD.fill(Infinity);
    const sources = this.sources;
    for (let i = 0; i < sources.length; i++) {
      const d = this.d2[i]!;
      if (d === Infinity || i === skipA || i === skipB || (torchOnly && !sources[i]!.torch)) continue;
      if (d < topD[0]!) { top[2] = top[1]!; topD[2] = topD[1]!; top[1] = top[0]!; topD[1] = topD[0]!; top[0] = i; topD[0] = d; }
      else if (d < topD[1]!) { top[2] = top[1]!; topD[2] = topD[1]!; top[1] = i; topD[1] = d; }
      else if (d < topD[2]!) { top[2] = i; topD[2] = d; }
    }
  }

  /** Puts the nearest into `count` slots from `first`, keeping a source a slot already shows while it is among the nearest three. */
  private fill(first: number, count: number, near: Int32Array, shadow: boolean): void {
    const slots = this.slots;
    for (let s = first; s < first + count; s++) {
      const cur = slots[s]!;
      if (cur >= 0 && cur !== near[0] && cur !== near[1] && cur !== near[2]) slots[s] = -1;
    }
    for (let k = 0; k < 3; k++) {
      const want = near[k]!;
      if (want < 0) continue;
      let shown = false;
      for (let s = first; s < first + count; s++) if (slots[s] === want) shown = true;
      if (shown) continue;
      for (let s = first; s < first + count; s++) {
        if (slots[s] !== -1) continue;
        slots[s] = want;
        const light = shadow ? this.shadow[s - first]! : this.plain[s - first]!;
        const src = this.sources[want]!;
        light.position.set(src.x, src.y, src.z);
        light.color.setHex(src.color);
        light.distance = src.distance;
        light.decay = src.decay;
        if (shadow && s - first < this.shadowCount) this.shadowsStale = true;
        break;
      }
    }
    for (let s = first; s < first + count; s++) {
      if (slots[s]! < 0) (shadow ? this.shadow[s - first]! : this.plain[s - first]!).intensity = 0;
    }
  }

  /** Flicker and the hero's light, once a frame. */
  frame(time: number, hx: number, hz: number): void {
    this.hero.position.set(hx, HERO_Y, hz + 0.3);
    for (let s = 0; s < 4; s++) {
      const cur = this.slots[s]!;
      if (cur < 0) continue;
      const src = this.sources[cur]!;
      const light = s < 2 ? this.shadow[s]! : this.plain[s - 2]!;
      const flicker = src.hz > 0 ? 1 + src.amp * Math.sin((time / 1000) * src.hz * 6.2832 + src.cell * 2.1) * 0.8 : 1;
      light.intensity = src.intensity * flicker;
    }
  }

  /** The nearest source's kind of the slot, for tests and the overlay: the index in the sources, or -1. */
  slot(i: number): number {
    return this.slots[i] ?? -1;
  }

  get heroIntensity(): number {
    return this.heroBase;
  }

  /** What the arena's accent shines with (the kit's, scaled up as the viewer does). */
  setAccent(color: number, intensity: number): void {
    this.accent.color.setHex(color);
    this.accent.intensity = intensity;
  }

  dispose(scene: Scene): void {
    for (const light of this.lights) {
      scene.remove(light);
      light.shadow?.dispose();
      light.dispose();
    }
  }
}

/** The colour of a '#rrggbb' as the number Three.js takes, kept here so callers need one import. */
export const colour = (css: string): Color => new Color(css);


/** How far a baked pool reaches from a torch, and from other fixed light (a share of its own reach), cells. */
const POOL_REACH_TORCH = 6;
const POOL_REACH_MAX = 6;
/** How strong the pool is at the middle of each kind of fire (1: the whole of the pool strength). */
const POOL_TORCH = 0.7;

/** Whether a straight line of cells from (x0, z0) to (x1, z1) is open: no wall or door between them (the ends do not count). */
function clear(kinds: Uint8Array, x0: number, z0: number, x1: number, z1: number): boolean {
  const dx = Math.abs(x1 - x0);
  const dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1;
  const sz = z0 < z1 ? 1 : -1;
  let err = dx - dz;
  let x = x0;
  let z = z0;
  while (x !== x1 || z !== z1) {
    const e2 = err * 2;
    if (e2 > -dz) { err -= dz; x += sx; }
    if (e2 < dx) { err += dx; z += sz; }
    if ((x !== x1 || z !== z1) && kinds[x + z * WIDTH] === K_WALL) return false;
  }
  return true;
}

/**
 * The light of the level's fixed fires as one rgb byte triple a cell (the fog texture's other three channels): every source
 * (wall torches, and the region's glowing tiles: fungus, forge doors, lava, barred windows) lays a soft pool of its colour on the cells
 * round it that it can see, falling off to nothing at its reach. Worked out once per level (and again when a wall or a door goes),
 * a few thousand steps; the shader adds it to what the cell shows, in sight or only remembered, with a slow flicker of its own.
 */
export function bakePools(sources: readonly Source[], kinds: Uint8Array, out: Uint8Array = new Uint8Array(LENGTH * 3)): Uint8Array {
  const sum = new Float32Array(LENGTH * 3);
  for (const s of sources) {
    const ox = Math.floor(s.x);
    const oz = Math.floor(s.z);
    if (ox < 0 || oz < 0 || ox >= WIDTH || oz * WIDTH >= LENGTH) continue;
    const reach = s.torch ? POOL_REACH_TORCH : Math.min(POOL_REACH_MAX, Math.max(2.5, s.distance));
    // The strength follows the kit's intensity, a torch at its usual 11 to 14 being the most.
    const strength = s.torch ? POOL_TORCH : Math.min(0.55, 0.12 + s.intensity * 0.14);
    const r = Math.ceil(reach);
    const cr = ((s.color >> 16) & 255) / 255;
    const cg = ((s.color >> 8) & 255) / 255;
    const cb = (s.color & 255) / 255;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = ox + dx;
        const z = oz + dz;
        if (x < 0 || z < 0 || x >= WIDTH || z >= HEIGHT) continue;
        const d = Math.hypot(x + 0.5 - s.x, z + 0.5 - s.z);
        if (d >= reach) continue;
        if (!clear(kinds, ox, oz, x, z)) continue;
        const k = (1 - d / reach) ** 2 * strength;
        const i = (x + z * WIDTH) * 3;
        sum[i]! += cr * k;
        sum[i + 1]! += cg * k;
        sum[i + 2]! += cb * k;
      }
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.round(Math.min(1, sum[i]!) * 255);
  return out;
}
