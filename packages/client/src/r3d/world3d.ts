/*
 * The new renderer («Новая графика (бета)»): the level as a Three.js diorama under the 2D game's own camera, HD-2D style, lit and
 * dressed from Claude Design's world kit (kit.ts). A chunk of its own, fetched only when the switch is on (main.ts). Built to a
 * frame budget (2.5 ms CPU, 5 ms GPU at 120 Hz), so:
 *
 *   - the static level is a few merged meshes (floor, boxes, water, contact shadows) sharing one atlas of the region's tiles, its
 *     glow and roughness maps and the wall kit; changes patch their buffers in place;
 *   - every character, item, flame and prop is one InstancedMesh over one sprite atlas, alpha-tested, leaned toward the camera;
 *     everything soft (shade, smoke, blood, gas) and everything bright (sparks, halos, ripples, bolts) is one more draw each;
 *   - nothing but the walls casts a shadow, so shadow maps are drawn only when a wall or a torch changes (autoUpdate off);
 *   - the fog of war is a 48 x 48 texture read by the vertex shaders, the region's haze is a line in the same shaders: no pass;
 *   - nothing is made in the frame loop: vectors, matrices and records are made once and written in place.
 * What does not come over: the kit's mirror under water (a second render of the scene; the water is a bright surface that shines
 * under the lights instead), its bloom, and the haze pass of the demon halls.
 */
import {
  AmbientLight, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, FrontSide, HemisphereLight, InstancedBufferAttribute, InstancedMesh, MathUtils,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, NearestFilter, NeutralToneMapping, OrthographicCamera, PCFShadowMap, PerspectiveCamera,
  PlaneGeometry, RepeatWrapping, Scene, SRGBColorSpace, Texture, WebGLRenderer,
} from 'three';
import { LENGTH, type Level, WIDTH } from '@pd/core';
import { type Assets, frameAt, levelRegion } from '../sprites';
import { sheet as worldSheet } from '../worldsheets';
import { fx } from '../fx';
import { knockback, LUNGE_MS } from '../render';
import { FALL_MS, type Puppet, TILE, type View } from '../view';
import { ATLAS_H, ATLAS_W, Atlas } from './atlas';
import { type RegionImages, type SharedImages, type TerrainTextures, buildTerrain, loadKit, loadRegion, propCutout } from './assets3d';
import { Effects3D, type FxContext, parseCss } from './effects3d';
import { Fog, makeAir, withFog } from './fogofwar';
import { type Kit, atmosphere, hex, lights, materialOf, regionKit } from './kit';
import { type Buffers, type GeomKit, LevelGeom } from './levelgeom';
import { LightRig, sourcesOf } from './lightrig';
import type { Tier } from './governor';
import { PerfOverlay } from './perfoverlay';
import { FEET_PX, LEAN, LEAN_STRETCH, PITCH } from './project';

/** What a frame draws from: the 2D loop's own data, read in place. */
export interface Frame3D {
  now: number;
  /** The camera the 2D game's CamControl gives, in the virtual screen (project.ts); device pixels of the canvas. */
  camX: number;
  camY: number;
  zoom: number;
  width: number;
  height: number;
  visible: readonly boolean[];
  explored: readonly boolean[];
  heaps: ReadonlyArray<{ pos: number; sprite: number }>;
  plants: ReadonlyArray<{ pos: number; index: number }> | undefined;
  gas: ReadonlyArray<{ pos: number; volume: number; color: string }> | undefined;
  view: View;
  seeAll: boolean;
  /** The hero's middle, world pixels. */
  focusX: number;
  focusY: number;
}

/** A character drawn this frame, for the 2D layer's marks (health, sleep, alert, names): where its feet are, in world pixels. */
export interface Shown {
  puppet: Puppet;
  x: number;
  y: number;
}

const MAX_SPRITES = 360;
const BOSS_KINDS: ReadonlySet<string> = new Set(['goo', 'tengu', 'dm300', 'king', 'yog']);
/** The tile props of the region that stand over the floor (high grass, fungi; a signpost) are cut out of. */
const HIGH_GRASS = 15;
const SIGN = 29;
/** A prop is drawn only this near the hero, cells. */
const PROP_REACH = 11;

/** How the sprite batch stands a picture up: leaned toward the camera (characters, items) or straight up (a sconce on a wall). */
const LEANED = 0;
const UPRIGHT = 1;

/** The kit's loaded files, once they have come (prepare). */
let kitState: { kit: Kit; images: SharedImages } | null = null;
let kitFailed = false;
let kitLoading = false;
const regionState = new Map<number, RegionImages>();
const regionLoading = new Set<number>();

/**
 * Starts fetching the kit and a region's maps; 'ready' when both have come (the renderer can be made, and a level of that region
 * built), 'failed' if they cannot (the game stays in 2D). Called every frame until ready: it only starts each fetch once.
 */
export function prepare(base: string, assets: Assets, region: number): 'ready' | 'loading' | 'failed' {
  if (kitFailed) return 'failed';
  if (!kitState && !kitLoading) {
    kitLoading = true;
    loadKit(base).then((v) => (kitState = v), () => (kitFailed = true));
  }
  if (!regionState.has(region) && !regionLoading.has(region)) {
    regionLoading.add(region);
    loadRegion(base, region, assets.tiles[region]!).then((v) => regionState.set(region, v), () => (kitFailed = true));
  }
  return kitState && regionState.has(region) ? 'ready' : 'loading';
}

function attrs(geometry: BufferGeometry, b: Buffers): void {
  const make = (array: Float32Array, size: number): BufferAttribute => new BufferAttribute(array, size).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', make(b.pos, 3));
  geometry.setAttribute('normal', make(b.normal, 3));
  geometry.setAttribute('uv', make(b.uv, 2));
  geometry.setAttribute('color', make(b.color, 3));
  geometry.setAttribute('aFog', make(b.fog, 2));
  geometry.setIndex(new BufferAttribute(b.index, 1).setUsage(DynamicDrawUsage));
  geometry.setDrawRange(0, b.indices);
}

/** Time the frame took, for the perf overlay and the governor. */
export interface PerfSample {
  cpuMs: number;
  /** The part of cpuMs spent inside Three's render() (the rest is this file's own preparation). */
  renderMs: number;
  gpuMs: number;
  /** The most draw calls any frame has made (a frame that redraws shadows makes the most). */
  maxCalls: number;
  calls: number;
  triangles: number;
  textures: number;
  geometries: number;
}

export interface World3DOptions {
  tier: Tier;
  /** A phone: smaller shadow maps. */
  phone: boolean;
  /** Time the GPU too (the ?perf=1 overlay). */
  perf: boolean;
  /** The kit's own camera (50 degrees, fov 30, in perspective) in place of the owner's (70 degrees, orthographic): `?cam=50`. */
  persp: boolean;
  /** Dev only (`?reveal=1`): the whole level is lit and seen, to look at a level the way the kit's frames show a room. */
  reveal?: boolean;
  /** The context was lost: the game goes back to 2D. */
  onLost: () => void;
}

export class World3D {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: OrthographicCamera | PerspectiveCamera;
  private readonly ortho: OrthographicCamera | null;
  private readonly persp: PerspectiveCamera | null;
  private tier: Tier;
  private readonly options: World3DOptions;
  private readonly kit: Kit;
  private readonly shared: SharedImages;
  private readonly atlas = new Atlas();
  private readonly fog = new Fog();
  private readonly air = makeAir(this.fog.texture);
  private readonly effects: Effects3D;
  private readonly rig: LightRig;
  private readonly ambient = new AmbientLight(0xffffff, 1);
  private readonly hemi = new HemisphereLight(0xffffff, 0x222222, 1);

  // Terrain.
  private geom: LevelGeom | null = null;
  private levelKey = '';
  private region = -1;
  private depth = 0;
  private images: RegionImages | null = null;
  private terrain: TerrainTextures | null = null;
  private waterTex: Texture | null = null;
  private floorMesh: Mesh | null = null;
  private boxMesh: Mesh | null = null;
  private waterMesh: Mesh | null = null;
  private decalMesh: Mesh | null = null;
  private seenFloor = -1;
  private seenBox = -1;
  private terrainMaterial: MeshStandardMaterial | null = null;
  private decalMaterial: MeshBasicMaterial | null = null;
  private waterMaterial: MeshStandardMaterial | null = null;
  private waterScroll: [number, number] = [0, 0.006];
  /** The cells of the level that carry a prop that stands over the floor (high grass, fungi, a signpost), and their cut-outs. */
  private props: number[] = [];
  private grassCut: { color: HTMLCanvasElement; glow: HTMLCanvasElement } | null = null;
  private signCut: { color: HTMLCanvasElement; glow: HTMLCanvasElement } | null = null;

  // Characters.
  private readonly sprites: InstancedMesh;
  private readonly spriteUv: InstancedBufferAttribute;
  private spriteCount = 0;
  /** Drawn this frame, for the marks the 2D layer puts over them. */
  readonly shown: Shown[] = [];
  shownCount = 0;
  private readonly at = { x: 0, y: 0 };
  private bossFound = false;
  private bossX = 0;
  private bossZ = 0;
  private bossSeen = false;
  private heroCell = -1;
  private sinceAssign = 0;

  // Instruments.
  private readonly perf: PerfSample = { cpuMs: 0, renderMs: 0, gpuMs: 0, calls: 0, maxCalls: 0, triangles: 0, textures: 0, geometries: 0 };
  private timer: { ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }; gl: WebGL2RenderingContext; pending: WebGLQuery | null } | null = null;
  /** The fog is easing: the 2D loop must keep drawing. */
  fogMoving = false;
  private current: Frame3D | null = null;
  private lost = false;
  private readonly lostHandler: (event: Event) => void;
  private readonly puppetPass: (puppet: Puppet) => void;
  private overlay: PerfOverlay | null = null;
  /** The display's refresh rate, as the 2D loop measured it (shown by the overlay). */
  hz = 60;
  private readonly fxContext: FxContext;
  private readonly everything: boolean[] = new Array<boolean>(LENGTH).fill(true);

  constructor(canvas: HTMLCanvasElement, private readonly assets: Assets, options: World3DOptions) {
    if (!kitState) throw new Error('the world kit is not loaded');
    this.kit = kitState.kit;
    this.shared = kitState.images;
    this.canvas = canvas;
    this.options = options;
    this.tier = options.tier;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(1);
    // Nothing blows out to white: light is compressed above 0.8, as the kit's frames are, and the pixel art keeps its colours below.
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = options.tier.shadowLights > 0;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.lostHandler = (event) => {
      event.preventDefault();
      this.lost = true;
      options.onLost();
    };
    canvas.addEventListener('webglcontextlost', this.lostHandler);

    // The camera: fixed pitch, no yaw; the frame sets where and how wide. Orthographic by default (the owner's), or the kit's.
    if (options.persp) {
      this.persp = new PerspectiveCamera(this.kit.camera.fov, 1, 1, 200);
      this.ortho = null;
      this.camera = this.persp;
    } else {
      this.ortho = new OrthographicCamera(-1, 1, 1, -1, 1, 120);
      this.persp = null;
      this.camera = this.ortho;
    }
    this.camera.rotation.x = -PITCH;

    this.scene.add(this.ambient, this.hemi);
    this.rig = new LightRig(this.scene, options.phone);
    this.effects = new Effects3D(this.scene, this.air, this.shared);

    // The sprite batch: one quad, many instances, one atlas (and the atlas of what glows).
    const quad = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const spriteMaterial = new MeshLambertMaterial({ map: this.atlas.color, emissiveMap: this.atlas.glow, emissive: 0xffffff, alphaTest: 0.5, side: DoubleSide });
    withFog(spriteMaterial, this.air, 'instance');
    this.sprites = new InstancedMesh(quad, spriteMaterial, MAX_SPRITES);
    this.sprites.instanceMatrix.setUsage(DynamicDrawUsage);
    this.sprites.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_SPRITES * 3).fill(1), 3);
    this.sprites.instanceColor.setUsage(DynamicDrawUsage);
    this.spriteUv = new InstancedBufferAttribute(new Float32Array(MAX_SPRITES * 4), 4);
    this.spriteUv.setUsage(DynamicDrawUsage);
    quad.setAttribute('aUv', this.spriteUv);
    this.sprites.frustumCulled = false;
    this.sprites.count = 0;
    this.scene.add(this.sprites);

    for (let i = 0; i < MAX_SPRITES; i++) this.shown.push({ puppet: undefined as unknown as Puppet, x: 0, y: 0 });
    this.puppetPass = (puppet) => this.addPuppet(puppet);
    this.fxContext = {
      now: 0, dt: 0, hx: 0, hz: 0, visible: [], explored: [], view: undefined as unknown as View, gas: undefined, bossFound: false, bossX: 0, bossZ: 0,
    };

    if (options.perf) {
      this.overlay = new PerfOverlay();
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
      if (ext) this.timer = { ext, gl, pending: null };
    }
    this.applyTier(options.tier);
  }

  /** Brings the renderer to a quality tier: shadows, particles, and the canvas density (the caller resizes). */
  applyTier(tier: Tier): void {
    this.tier = tier;
    const on = tier.shadowLights > 0;
    if (on !== this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = on;
      if (this.terrainMaterial) this.terrainMaterial.needsUpdate = true;
      if (this.waterMaterial) this.waterMaterial.needsUpdate = true;
    }
    this.rig.setShadowLights(tier.shadowLights);
    this.effects.setParticles(tier.particles);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  /** The kit's heights, in the form the geometry takes them. */
  private geomKit(region: number): GeomKit {
    const m = (key: string): number => materialOf(this.kit, region, key).height;
    return { wall: m('wall_face'), door: m('door'), statue: m('statue'), bookshelf: m('bookshelf'), barricade: m('barricade'), well: m('well'), chasm: m('chasm'), water: m('water') };
  }

  /** A new floor (or run): the geometry of its map, torches, a fresh fog. `key` tells one floor from another. */
  setLevel(level: Level, key: string): void {
    if (key === this.levelKey && this.geom) return;
    this.levelKey = key;
    const region = levelRegion(level);
    const images = regionState.get(region);
    if (!images) throw new Error(`the maps of region ${region} are not loaded`);
    this.depth = level.depth;
    if (region !== this.region || !this.terrain) {
      this.terrain?.dispose();
      this.waterTex?.dispose();
      this.terrainMaterial?.dispose();
      this.decalMaterial?.dispose();
      this.waterMaterial?.dispose();
      this.images = images;
      this.terrain = buildTerrain(images, this.kit, region);
      const water = new Texture(this.assets.water[region]!);
      water.colorSpace = SRGBColorSpace;
      water.magFilter = water.minFilter = NearestFilter;
      water.wrapS = water.wrapT = RepeatWrapping;
      water.generateMipmaps = false;
      water.needsUpdate = true;
      this.waterTex = water;
      this.region = region;
      this.makeMaterials(region);
      this.cutProps(images, region);
      this.dropMeshes();
    }
    const a = atmosphere(this.kit, region, level.depth);
    // Under high grass and a sign, the plain floor of the region: the prop itself is a card standing over it.
    const under = new Map<number, number>([[HIGH_GRASS, region >= 2 ? 1 : 2], [SIGN, 1]]);
    this.geom = new LevelGeom(level.map, 16, 16, this.geomKit(region), under);
    this.makeMeshes();
    this.scanProps();

    // The air: the kit's light, haze and particles of the region, or of the boss's arena.
    const L = lights(this.kit, a);
    this.ambient.color.setHex(L.ambient.color);
    this.ambient.intensity = L.ambient.intensity;
    this.hemi.color.setHex(L.hemi.sky);
    this.hemi.groundColor.setHex(L.hemi.ground);
    this.hemi.intensity = L.hemi.intensity;
    this.air.uHaze.value.set(a.fog.near, a.fog.far);
    this.air.uFogColor.value.setHex(hex(a.fog.color));
    this.air.uBg.value.setHex(hex(a.fog.color)).multiplyScalar(0.28);
    this.renderer.setClearColor(this.air.uBg.value, 1);
    this.rig.configure(L, sourcesOf(this.kit, a.region, this.geom, true), this.tier.shadowLights);
    if (a.accent) this.rig.setAccent(hex(a.accent.color), a.accent.intensity * 2.2);
    else this.rig.setAccent(0xffffff, 0);
    this.accentBase = a.accent ? a.accent.intensity * 2.2 : 0;
    this.bossName = a.boss;
    this.effects.configure(this.kit, a, this.geom, region, this.tier);
    this.effects.setMist(a.fog.mist);
    this.bossSeen = false;
    this.heroCell = -1;
    this.waterScroll = a.region.water.scroll;
    worldSheet('ambient1');
  }

  private accentBase = 0;
  private bossName: string | null = null;

  /** The terrain, water and decal materials of a region, from the kit's materials and maps. */
  private makeMaterials(region: number): void {
    const t = this.terrain!;
    this.terrainMaterial = new MeshStandardMaterial({
      map: t.color, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 1, roughnessMap: t.rough, roughness: 1, metalness: 0,
      vertexColors: true, alphaTest: 0.5,
    });
    withFog(this.terrainMaterial, this.air, 'attribute');
    this.decalMaterial = new MeshBasicMaterial({ map: t.color, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    withFog(this.decalMaterial, this.air, 'attribute');
    const w = materialOf(this.kit, region, 'water');
    const a = atmosphere(this.kit, region, 1).region.water;
    const lava = a.emissive !== undefined;
    // The water shines by itself: its texture tinted with the region's water colour, bright, and glossy to the lights. Lava glows.
    this.waterMaterial = new MeshStandardMaterial({
      map: this.waterTex, color: lava ? 0xffffff : hex(a.surface), roughness: w.roughness, metalness: w.metalness,
      emissive: lava ? hex(a.emissive!) : hex(a.surface), emissiveMap: this.waterTex, emissiveIntensity: lava ? a.emissiveIntensity ?? 0.8 : 1.1, vertexColors: true,
    });
    if (!lava) this.waterMaterial.color.multiplyScalar(1.6);
    withFog(this.waterMaterial, this.air, 'attribute');
  }

  /** Cuts the region's props (high grass or fungi, the signpost) out of its tiles, and puts them on the sprite atlas. */
  private cutProps(images: RegionImages, region: number): void {
    this.grassCut = propCutout(images, HIGH_GRASS, region >= 2 ? 1 : 2);
    this.signCut = propCutout(images, SIGN, 1);
  }

  /** Which cells of the level carry a prop that stands over the floor. */
  private scanProps(): void {
    this.props = [];
    const g = this.geom!;
    for (let i = 0; i < LENGTH; i++) if (g.terrain[i] === HIGH_GRASS || g.terrain[i] === SIGN) this.props.push(i);
  }

  /** A door opened, grass was trampled: the geometry follows the map. */
  patch(level: Level): void {
    const geom = this.geom;
    if (!geom) return;
    const change = geom.patch(level.map);
    if (change === 'same') return;
    if (change === 'rebuilt') {
      this.dropMeshes();
      this.makeMeshes();
    }
    this.scanProps();
    if (change !== 'patched') this.rig.shadowsStale = true;
  }

  private dropMeshes(): void {
    for (const mesh of [this.floorMesh, this.boxMesh, this.waterMesh, this.decalMesh]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.floorMesh = this.boxMesh = this.waterMesh = this.decalMesh = null;
    this.seenFloor = this.seenBox = -1;
  }

  private makeMeshes(): void {
    const geom = this.geom!;
    this.dropMeshes();
    const floor = new BufferGeometry();
    attrs(floor, geom.floor);
    this.floorMesh = new Mesh(floor, this.terrainMaterial!);
    this.floorMesh.receiveShadow = true;
    const boxes = new BufferGeometry();
    attrs(boxes, geom.boxes);
    this.boxMesh = new Mesh(boxes, this.terrainMaterial!);
    this.boxMesh.castShadow = true;
    this.boxMesh.receiveShadow = true;
    const water = new BufferGeometry();
    attrs(water, geom.water);
    this.waterMesh = new Mesh(water, this.waterMaterial!);
    this.waterMesh.receiveShadow = true;
    const decals = new BufferGeometry();
    attrs(decals, geom.decals);
    this.decalMesh = new Mesh(decals, this.decalMaterial!);
    this.decalMesh.renderOrder = 1;
    for (const mesh of [this.floorMesh, this.boxMesh, this.waterMesh, this.decalMesh]) {
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
    geom.grew = false;
    this.seenFloor = geom.floorVersion;
    this.seenBox = geom.boxVersion;
    // The walls' shadows are cast on the side facing the light; the floor and the walls take them.
    this.terrainMaterial!.shadowSide = FrontSide;
    this.rig.shadowsStale = true;
  }

  /** Uploads what the geometry has changed since the last frame. */
  private syncGeometry(): void {
    const geom = this.geom!;
    if (geom.grew) {
      this.dropMeshes();
      this.makeMeshes();
      return;
    }
    if (geom.floorVersion !== this.seenFloor) {
      this.seenFloor = geom.floorVersion;
      for (const name of ['uv', 'color'] as const) (this.floorMesh!.geometry.getAttribute(name) as BufferAttribute).needsUpdate = true;
    }
    if (geom.boxVersion !== this.seenBox) {
      this.seenBox = geom.boxVersion;
      for (const [mesh, b] of [[this.boxMesh!, geom.boxes], [this.waterMesh!, geom.water], [this.decalMesh!, geom.decals]] as const) {
        const g = mesh.geometry;
        for (const name of ['position', 'normal', 'uv', 'color', 'aFog'] as const) (g.getAttribute(name) as BufferAttribute).needsUpdate = true;
        g.getIndex()!.needsUpdate = true;
        g.setDrawRange(0, b.indices);
      }
    }
  }

  /** The new turn's sight. */
  setSight(visible: readonly boolean[], explored: readonly boolean[], snap: boolean): void {
    if (this.options.reveal) {
      this.fog.set(this.everything, this.everything, snap);
      this.fogMoving = true;
      return;
    }
    this.fog.set(visible, explored, snap);
    this.fogMoving = true;
  }

  // ---- sprites -------------------------------------------------------------------------------------------------------------

  /**
   * Writes one sprite into the batch: its frame (a rectangle of an image, which goes on the atlas the first time, with its glow if
   * it has one), where its feet are (cells) and how big. `mode`: leaned toward the camera, or straight up; `shear` sways its top.
   */
  private sprite(
    image: HTMLImageElement | HTMLCanvasElement, sx: number, sy: number, w: number, h: number, flip: boolean,
    x: number, y: number, z: number, width: number, height: number, tint: number, mode = LEANED, shear = 0, glow?: CanvasImageSource,
  ): void {
    if (this.spriteCount >= MAX_SPRITES) return;
    const spot = this.atlas.place(image, glow);
    if (!spot) return;
    const i = this.spriteCount++;
    const m = this.sprites.instanceMatrix.array as Float32Array;
    const o = i * 16;
    m[o] = width; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    if (mode === LEANED) {
      const sh = height * LEAN_STRETCH;
      const sinL = Math.sin(LEAN);
      const cosL = Math.cos(LEAN);
      m[o + 4] = shear * sh; m[o + 5] = sh * cosL; m[o + 6] = -sh * sinL; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = sinL; m[o + 10] = cosL; m[o + 11] = 0;
    } else {
      m[o + 4] = shear * height; m[o + 5] = height; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = 1; m[o + 11] = 0;
    }
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    const uv = this.spriteUv.array as Float32Array;
    const u0 = (spot.x + sx) / ATLAS_W;
    const du = w / ATLAS_W;
    const q = i * 4;
    uv[q] = flip ? u0 + du : u0;
    uv[q + 1] = 1 - (spot.y + sy + h) / ATLAS_H;
    uv[q + 2] = flip ? -du : du;
    uv[q + 3] = h / ATLAS_H;
    const c = this.sprites.instanceColor!.array as Float32Array;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = tint;
  }

  private addPuppet(puppet: Puppet): void {
    const f = this.current!;
    const { visible } = f;
    if (!(puppet.isHero || f.seeAll || visible[puppet.to] || visible[puppet.from] || (puppet.aim !== undefined && visible[puppet.aim]))) return;
    const now = f.now;
    const pos = f.view.positionInto(puppet, now, this.at);
    const { sheet, anims } = puppet.sprite;
    const anim = puppet.anim === 'idle' && puppet.pumped ? 'pump' : puppet.anim;
    const frame = frameAt(anims[anim], now - puppet.animStart);
    const sx = (frame % sheet.cols) * sheet.w;
    const sy = (Math.floor(frame / sheet.cols) + puppet.row) * sheet.h;
    const lunge = puppet.lungeStart !== undefined && now - puppet.lungeStart < LUNGE_MS ? Math.sin((Math.PI * (now - puppet.lungeStart)) / LUNGE_MS) : 0;
    const knock = knockback(puppet, now);
    // The 2D renderer's cell corner is the walker's own: the feet stand a little north of the cell's middle.
    const px = pos.x + TILE / 2 + lunge * (puppet.lungeX ?? 0) + knock * (puppet.knockX ?? 0);
    const py = pos.y + FEET_PX + lunge * (puppet.lungeY ?? 0) + knock * (puppet.knockY ?? 0);
    const hover = puppet.levitating && puppet.alive ? 4 + Math.round(Math.sin(now / 320)) : 0;
    let tint = 1;
    let scale = 1;
    if (puppet.invisible) tint = 0.45;
    if (puppet.fallStart !== undefined) {
      const k = Math.min(1, Math.max(0, (now - puppet.fallStart) / FALL_MS));
      scale = 1 - k;
      tint = 1 - k;
    } else if (!puppet.alive) {
      if (puppet.isHero) tint = 0.75;
      else if (!puppet.laid) tint = Math.max(0, Math.min(1, (puppet.removeAt - now) / 700));
    }
    if (now < puppet.flashUntil) tint = 2.4;
    else if (puppet.pumped && puppet.alive) tint = 1.35 + 0.35 * Math.sin(now / 60);
    if (tint <= 0 || scale <= 0) return;
    const tx = px / TILE;
    const tz = py / TILE;
    this.sprite(sheet.image, sx, sy, sheet.w, sheet.h, puppet.flip, tx, hover / TILE, tz, (sheet.w / TILE) * scale, (sheet.h / TILE) * scale, tint);
    if (puppet.alive || !puppet.laid) this.effects.shadowBlob(tx, tz, (hover ? 0.75 : 1.1) * Math.max(0.45, sheet.w / 14));
    if (BOSS_KINDS.has(puppet.kind) && puppet.alive) {
      this.bossFound = true;
      this.bossX = tx;
      this.bossZ = tz;
    }
    const mark = this.shown[this.shownCount++]!;
    mark.puppet = puppet;
    mark.x = pos.x;
    mark.y = pos.y;
  }

  // ---- the frame -----------------------------------------------------------------------------------------------------------

  /** Draws the scene. Returns false if the context is gone. */
  frame(given: Frame3D, dt: number): boolean {
    if (this.lost || !this.geom) return false;
    const f = this.options.reveal ? { ...given, visible: this.everything, explored: this.everything } : given;
    const t0 = performance.now();
    this.current = f;
    this.renderer.info.reset();
    this.syncGeometry();

    // The camera, from the 2D game's own: the centre of the screen on the ground, snapped to whole device pixels so the pixel art
    // holds still.
    const unit = TILE * f.zoom;
    const camX = Math.round(f.camX * f.zoom) / f.zoom;
    const ys = Math.sin(PITCH);
    const camYs = Math.round(f.camY * f.zoom * ys) / (f.zoom * ys);
    const halfW = f.width / (2 * unit);
    const halfH = f.height / (2 * unit);
    const cx = camX / TILE + halfW;
    const cz = camYs / TILE + f.height / ys / (2 * unit);
    const cam = this.camera;
    if (this.ortho) {
      this.ortho.left = -halfW; this.ortho.right = halfW; this.ortho.top = halfH; this.ortho.bottom = -halfH;
      cam.position.set(cx, 40 * ys, cz + 40 * Math.cos(PITCH));
      this.ortho.updateProjectionMatrix();
    } else if (this.persp) {
      // The kit's camera: the distance that shows the same width of the ground at the screen's middle.
      const aspect = f.width / f.height;
      const dist = halfW / (Math.tan(MathUtils.degToRad(this.persp.fov / 2)) * aspect);
      this.persp.aspect = aspect;
      this.persp.near = Math.max(1, dist - 40);
      this.persp.far = dist + 80;
      cam.position.set(cx, dist * ys, cz + dist * Math.cos(PITCH));
      this.persp.updateProjectionMatrix();
    }

    this.fogMoving = this.fog.step(dt);
    const hx = f.focusX / TILE;
    const hz = f.focusY / TILE;
    this.air.uHero.value.set(hx, hz);
    // The nearest sources of light are chosen when the hero has moved on a cell, and every few frames besides.
    const cell = Math.floor(hx) + Math.floor(hz) * WIDTH;
    if (cell !== this.heroCell || ++this.sinceAssign > 24) {
      this.heroCell = cell;
      this.sinceAssign = 0;
      this.rig.assign(hx, hz, f.explored, this.tier.name === 'high' ? 2 : this.tier.name === 'mid' ? 1 : 0);
    }
    this.rig.frame(f.now, hx, hz);

    // Sprites: characters, then what lies about, props, bodies, things in the air, sconces. The effects' batches fill alongside.
    this.spriteCount = 0;
    this.shownCount = 0;
    this.bossFound = false;
    this.effects.begin();
    f.view.puppets.forEach(this.puppetPass);
    this.addItems(f);
    this.addProps(f, hx, hz);
    this.addCorpses(f);
    this.addThrown(f);
    this.addSconces(f);
    const c = this.fxContext;
    c.now = f.now; c.dt = dt; c.hx = hx; c.hz = hz; c.visible = f.visible; c.explored = f.explored; c.view = f.view; c.gas = f.gas;
    c.bossFound = this.bossFound; c.bossX = this.bossX; c.bossZ = this.bossZ;
    this.effects.frame(c);
    this.effects.end();
    this.lightMoving();
    this.sprites.count = this.spriteCount;
    this.sprites.instanceMatrix.clearUpdateRanges();
    this.sprites.instanceMatrix.addUpdateRange(0, this.spriteCount * 16);
    this.sprites.instanceMatrix.needsUpdate = true;
    this.sprites.instanceColor!.clearUpdateRanges();
    this.sprites.instanceColor!.addUpdateRange(0, this.spriteCount * 3);
    this.sprites.instanceColor!.needsUpdate = true;
    this.spriteUv.clearUpdateRanges();
    this.spriteUv.addUpdateRange(0, this.spriteCount * 4);
    this.spriteUv.needsUpdate = true;
    this.atlas.flush();

    // Water drifts as the kit says: its texture slides.
    const w = this.waterTex!;
    w.offset.set(this.waterScroll[0] * 60 * (f.now / 1000), this.waterScroll[1] * 60 * (f.now / 1000));

    if (this.rig.shadowsStale && this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
      this.rig.shadowsStale = false;
    }
    this.measureBegin();
    const r0 = performance.now();
    this.renderer.render(this.scene, cam);
    this.perf.renderMs = performance.now() - r0;
    this.measureEnd();
    const info = this.renderer.info;
    const p = this.perf;
    p.cpuMs = performance.now() - t0;
    p.calls = info.render.calls;
    p.maxCalls = Math.max(p.maxCalls, p.calls);
    p.triangles = info.render.triangles;
    p.textures = info.memory.textures;
    p.geometries = info.memory.geometries;
    this.overlay?.note(f.now, p, this.hz, this.tier.name);
    return true;
  }

  /** The light that moves (a bolt, a blast) and the boss arena's accent follow what they belong to. */
  private lightMoving(): void {
    const d = this.effects.dynamic;
    const light = this.rig.dynamic;
    if (d.on) {
      light.position.set(d.x, d.y, d.z);
      light.color.setHex(d.color);
      light.intensity = d.intensity;
      light.distance = d.distance;
    } else light.intensity = 0;
    const accent = this.rig.accent;
    if (this.accentBase > 0 && this.bossFound) {
      this.bossSeen = true;
      const pulse = this.bossName === 'yog' ? 1 + 0.4 * Math.sin((this.current!.now / 1000) * Math.PI) : 1;
      accent.position.set(this.bossX, 2.2, this.bossZ + 1.2);
      accent.intensity = this.accentBase * pulse;
    } else if (!this.bossSeen) accent.intensity = 0;
  }

  private addItems(f: Frame3D): void {
    const { explored, visible } = f;
    const items = this.assets.items;
    for (let i = 0; i < f.heaps.length; i++) {
      const heap = f.heaps[i]!;
      if (!explored[heap.pos]) continue;
      const x = (heap.pos % WIDTH) + 0.5;
      const z = Math.trunc(heap.pos / WIDTH) + 0.6;
      const bob = visible[heap.pos] && !f.seeAll ? Math.sin(f.now / 520 + heap.pos) * 0.012 : 0;
      this.sprite(items, (heap.sprite % 8) * 16, Math.floor(heap.sprite / 8) * 16, 16, 16, false, x, 0.02 + bob, z, 0.7, 0.7, 1, LEANED, 0, this.shared.itemsEmissive);
      if (visible[heap.pos]) this.effects.shadowBlob(x, z, 0.6);
    }
    const plants = f.plants;
    if (plants) {
      for (let i = 0; i < plants.length; i++) {
        const plant = plants[i]!;
        if (!explored[plant.pos]) continue;
        this.sprite(this.assets.plants, plant.index * 16, 0, 16, 16, false, (plant.pos % WIDTH) + 0.5, 0, Math.trunc(plant.pos / WIDTH) + 0.7, 0.85, 0.85, 1);
      }
    }
  }

  /** High grass, fungi and signposts: cards standing over their cells (the grass sways), cut out of the region's tiles. */
  private addProps(f: Frame3D, hx: number, hz: number): void {
    const geom = this.geom!;
    const props = this.props;
    const t = f.now / 1000;
    for (let i = 0; i < props.length; i++) {
      const cell = props[i]!;
      if (!f.explored[cell]) continue;
      const x = cell % WIDTH;
      const z = Math.trunc(cell / WIDTH);
      if (Math.abs(x + 0.5 - hx) > PROP_REACH || Math.abs(z + 0.5 - hz) > PROP_REACH) continue;
      const terrain = geom.terrain[cell];
      if (terrain === HIGH_GRASS) {
        const sway = Math.sin(t * 3.77 + cell * 0.9) * 0.05;
        this.sprite(this.grassCut!.color, 0, 0, 16, 16, cell % 2 === 0, x + 0.5, 0, z + 0.62, 1, 1.05, 1, LEANED, sway, this.grassCut!.glow);
      } else if (terrain === SIGN) {
        this.sprite(this.signCut!.color, 0, 0, 16, 16, false, x + 0.5, 0, z + 0.62, 1, 1, 1, LEANED, 0, this.signCut!.glow);
      }
    }
  }

  /** Bodies left where monsters fell: the last frame of their death, lying, fading out. */
  private addCorpses(f: Frame3D): void {
    for (const c of fx.corpses) {
      if (f.now < c.at) continue;
      const cell = Math.trunc((c.y + c.image.height - 2) / TILE) * WIDTH + Math.trunc((c.x + c.image.width / 2) / TILE);
      if (!f.visible[cell]) continue;
      const fade = fx.corpseFade(c, f.now);
      if (fade <= 0) continue;
      this.sprite(c.image, 0, 0, c.image.width, c.image.height, false, (c.x + c.image.width / 2) / TILE, 0.01, (c.y + c.image.height - (TILE - FEET_PX)) / TILE, c.image.width / TILE, c.image.height / TILE, 0.7 * fade);
    }
  }

  /** What is thrown flies in an arc, higher the farther it goes, its shade running along the floor. */
  private addThrown(f: Frame3D): void {
    const projectiles = f.view.projectiles;
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i]!;
      if (p.sprite === null) continue;
      const k = Math.min(1, (f.now - p.start) / p.duration);
      const fromX = (p.from % WIDTH) + 0.5;
      const fromZ = Math.trunc(p.from / WIDTH) + 0.5;
      const x = fromX + ((p.to % WIDTH) + 0.5 - fromX) * k;
      const z = fromZ + (Math.trunc(p.to / WIDTH) + 0.5 - fromZ) * k;
      const cells = Math.max(Math.abs((p.to % WIDTH) - (p.from % WIDTH)), Math.abs(Math.trunc(p.to / WIDTH) - Math.trunc(p.from / WIDTH)));
      const height = Math.sin(k * Math.PI) * Math.min(0.9, 0.15 + cells * 0.15);
      this.sprite(this.assets.items, (p.sprite % 8) * 16, Math.floor(p.sprite / 8) * 16, 16, 16, false, x, 0.25 + height, z, 0.6, 0.6, 1, LEANED, 0, this.shared.itemsEmissive);
      this.effects.shadowBlob(x, z, 0.5 - height * 0.2);
    }
  }

  /** The wall sconces: a torch on the face of each wall the party has seen, and a halo round the flames in sight. */
  private addSconces(f: Frame3D): void {
    const sheet = worldSheet('ambient1');
    const frames = sheet?.anims.torch;
    if (!sheet || !frames || frames.length === 0) return;
    const torches = this.geom!.torches;
    const cycle = f.now * 0.01;
    const rgb = parseCss(regionKit(this.kit, this.region).torch.color);
    for (let i = 0; i < torches.length; i++) {
      const cell = torches[i]!;
      if (!f.explored[cell]) continue;
      const frame = frames[Math.floor(cycle + cell) % frames.length]!;
      const x = (cell % WIDTH) + 0.5;
      const z = Math.trunc(cell / WIDTH) + 1;
      // On the face of the wall, a little over half its height, standing straight up.
      this.sprite(sheet.image, frame.x, frame.y, frame.w, frame.h, false, x, 0.2, z + 0.02, 1.1, 1.4, 1.15, UPRIGHT, 0, sheet.image);
      if (f.visible[cell]) {
        const flicker = 0.38 + 0.16 * Math.sin(f.now / 70 + cell) * Math.sin(f.now / 23 + cell * 3);
        this.effects.halo(x, 1.1, z + 0.3, rgb, 2.4, flicker);
      }
    }
  }

  // ---- instruments ---------------------------------------------------------------------------------------------------------

  private measureBegin(): void {
    const timer = this.timer;
    if (!timer || timer.pending) return;
    const query = timer.gl.createQuery();
    if (!query) return;
    timer.gl.beginQuery(timer.ext.TIME_ELAPSED_EXT, query);
    timer.pending = query;
  }

  private measureEnd(): void {
    const timer = this.timer;
    if (!timer) return;
    const { gl, ext, pending } = timer;
    if (pending && gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      return;
    }
    // A query ended earlier: read it when it is ready.
    if (pending && gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)) {
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) this.perf.gpuMs = Number(gl.getQueryParameter(pending, gl.QUERY_RESULT)) / 1e6;
      gl.deleteQuery(pending);
      timer.pending = null;
    }
  }

  /** The numbers of the last frame. */
  get sample(): PerfSample {
    return this.perf;
  }

  /** Counts of the level's buffers (tests, the overlay). */
  get quads(): { floor: number; boxes: number; water: number; decals: number } | null {
    return this.geom?.quads ?? null;
  }

  get torchCount(): number {
    return this.geom?.torches.length ?? 0;
  }

  /** Everything given back: geometry, textures, the context. */
  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.lostHandler);
    this.overlay?.remove();
    this.dropMeshes();
    this.terrainMaterial?.dispose();
    this.decalMaterial?.dispose();
    this.waterMaterial?.dispose();
    this.terrain?.dispose();
    this.waterTex?.dispose();
    this.atlas.dispose();
    this.fog.dispose();
    this.effects.dispose(this.scene);
    this.rig.dispose(this.scene);
    this.sprites.geometry.dispose();
    (this.sprites.material as MeshLambertMaterial).dispose();
    this.sprites.dispose();
    this.renderer.dispose();
    if (!this.lost) this.renderer.forceContextLoss();
    this.geom = null;
  }
}

