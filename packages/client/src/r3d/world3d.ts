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
 * The kit's bloom is a pass (post.ts) at the two highest tiers: the frame goes through a half-float target and a blurred copy of its
 * bright part is added. At the highest, the water carries a faint mirror of the walls and what glows above them (mirror.ts). What
 * does not come over yet: the haze pass of the demon halls.
 */
import {
  AmbientLight, BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, FrontSide, HemisphereLight, InstancedBufferAttribute, InstancedMesh, MathUtils,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, NearestFilter, NeutralToneMapping, NoBlending, OrthographicCamera, PCFShadowMap, PerspectiveCamera,
  PlaneGeometry, RepeatWrapping, Scene, SRGBColorSpace, Texture, WebGLRenderer,
} from 'three';
import { LENGTH, type Level, WIDTH } from '@pd/core';
import { brightness } from '../brightness';
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
import { bakePools, doorGlow, LightRig, type Source, type Strongest, sourcesOf } from './lightrig';
import type { Tier } from './governor';
import { PerfOverlay } from './perfoverlay';
import { canPost, Post } from './post';
import { blankMirror, makeMirrorUniforms, Mirror, reflects, withMirror } from './mirror';
import { BloodWater, withBlood } from './bloodwater';
import { isSoft } from './softalpha';
import { FEET_PX, LEAN, LEAN_STRETCH, PITCH } from './project';
import type { WearQuad } from '../wearfx';

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
  /** My hero's id: what only it wears is drawn for it. */
  myId: string;
}

/** A character drawn this frame, for the 2D layer's marks (health, sleep, alert, names): where its feet are, in world pixels. */
export interface Shown {
  puppet: Puppet;
  x: number;
  y: number;
}

const MAX_SPRITES = 360;
const MAX_DEAD = 96;
/** How long a body lies in the 3D view before it fades away (the original's dead sprite fades out in about this). */
const CORPSE_FADE_MS = 1000;
/** The most soft-bodied figures (a ghost, a wraith, bees) drawn at once, in their own blended batch. */
const MAX_BLENDED = 48;
/** The cold glow round a ghost. */
const COLD = new Float32Array([0.45, 0.66, 0.95]);

/** Which sprite sheets have soft pixels (the image, read once). */
const softSheets = new WeakMap<object, boolean>();
function hasSoftBody(image: HTMLImageElement | HTMLCanvasElement): boolean {
  let known = softSheets.get(image);
  if (known === undefined) {
    known = false;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const g = canvas.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(image, 0, 0);
      known = isSoft(g.getImageData(0, 0, canvas.width, canvas.height).data);
    } catch {
      known = false;
    }
    softSheets.set(image, known);
  }
  return known;
}
const BOSS_KINDS: ReadonlySet<string> = new Set(['goo', 'tengu', 'dm300', 'king', 'yog']);
/** Monsters that hover (sprite rules: 0.35 cells up, bobbing, a smaller paler blob): the bat, the eye and the fly-like swarms. */
const FLYERS: ReadonlySet<string> = new Set(['bat', 'eye', 'bee', 'swarm']);
/** The tile props of the region that stand over the floor (high grass, fungi; a signpost) are cut out of. */
const HIGH_GRASS = 15;
const SIGN = 29;
/** A prop is drawn only this near the hero, cells. */
const PROP_REACH = 11;
/** A torch out of sight keeps its halo this near the hero, cells. */
const SCONCE_REACH = 14;
/**
 * With the bloom on, what glows is brighter than 1 in the frame before the tone map takes it down (the way light is, and the way the
 * designer's frames were made), so the bloom has it to take: by this much for what is lit by its glow map, and for lava.
 */
/** What a mirror is given for a level whose water shows no reflection. */
const NO_KINDS = new Uint8Array(LENGTH);
const GLOW_GAIN = { sprites: 1.5, terrain: 1.4, lava: 1.6 };

/** How the sprite batch stands a picture up: leaned toward the camera (characters, items) or straight up (a sconce on a wall). */
const LEANED = 0;
const UPRIGHT = 1;
/** Lying on the floor, its top to the north (footprints). */
const FLAT = 2;

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
  /** The kit's ambient and hemisphere light of this level, before the player's brightness; the brightness applied now. */
  private lightBase = { ambient: 1, hemi: 1 };
  private bright = 0;
  /** The level's fixed fires, whose light is baked into the fog texture. */
  private fires: Source[] = [];

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
  /** The glow of the water as the kit has it (lava glows; plain water shines a little), and whether it is lava. */
  private waterGlow = 1;
  /** The water of this region reflects (not lava). */
  private reflective = false;
  private lava = false;
  private decalMaterial: MeshBasicMaterial | null = null;
  private waterMaterial: MeshStandardMaterial | null = null;
  /** Blood in the water: the red a victim leaves in it (bloodwater.ts). */
  private readonly blood = new BloodWater();
  private waterScroll: [number, number] = [0, 0.006];
  /** The cells of the level that carry a prop that stands over the floor (high grass, fungi, a signpost), and their cut-outs. */
  private props: number[] = [];
  private grassCut: { color: HTMLCanvasElement; glow: HTMLCanvasElement } | null = null;
  private signCut: { color: HTMLCanvasElement; glow: HTMLCanvasElement } | null = null;

  // Characters.
  private readonly sprites: InstancedMesh;
  private readonly spriteUv: InstancedBufferAttribute;
  /**
   * The dying and the dead: their own batch (one more draw, only while a body is in sight), drawn after the floor and the blood and
   * before every living figure, and neither writing depth nor tested against the living: a body is under whoever stands over it,
   * whatever their rows (as in PD, where the sprite of the dead is put behind).
   */
  private readonly deadMesh: InstancedMesh;
  private readonly deadUv: InstancedBufferAttribute;
  private deadCount = 0;
  /** How far the next body written has dissolved (0 whole, 1 gone): a dither over its pixels, not a darkening. */
  private deadFade = 0;
  private readonly deadFades: InstancedBufferAttribute;
  private toDead = false;
  /** Per instance: the rim light's direction (texture axes, -1/0/1) and colour times strength. */
  private readonly spriteRim: InstancedBufferAttribute;
  private readonly spriteRimColor: InstancedBufferAttribute;
  private readonly strong: Strongest = { ux: 0, uz: 0, r: 0, g: 0, b: 0, strength: 0 };
  private spriteCount = 0;
  /** The blended batch for figures with soft bodies: alpha-blended, no depth written, sorted back to front; drawn only when one is on screen. */
  private readonly ghosts: InstancedMesh;
  private readonly ghostUv: InstancedBufferAttribute;
  private ghostCount = 0;
  private readonly ghostZ = new Float32Array(MAX_BLENDED);
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
  /** The bloom's targets and passes (post.ts), while the tier has the bloom and the device can draw into half-float targets. */
  private post: Post | null = null;
  private postFailed = false;
  /** The mirror under the water (mirror.ts): the highest tier, with the bloom's targets, in the orthographic view. */
  private mirror: Mirror | null = null;
  private readonly blankMirror = blankMirror();
  private readonly mirrorUniforms = makeMirrorUniforms(this.blankMirror);
  private width = 1;
  private height = 1;

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
    // What the mirror under the water sees: the lights (a camera's layer filters lights too), the batch of light, the sprites (below).
    for (const light of [this.ambient, this.hemi, ...this.rig.all]) reflects(light);
    reflects(this.effects.glow.mesh);

    // The sprite batch: one quad, many instances, one atlas (and the atlas of what glows).
    const quad = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const makeMaterial = (): MeshLambertMaterial => {
      // (No blending: a cut-out pixel is whole, and its alpha in the frame says how much of it glows, post.ts.)
      const m = new MeshLambertMaterial({ map: this.atlas.color, emissiveMap: this.atlas.glow, emissive: 0xffffff, alphaTest: 0.5, side: DoubleSide, blending: NoBlending });
      withFog(m, this.air, 'instance', { selfLight: this.kit.sprites.selfLight, texel: [this.kit.sprites.rim.px / ATLAS_W, this.kit.sprites.rim.px / ATLAS_H] });
      return m;
    };
    const spriteMaterial = makeMaterial();
    // Both batches go through the transparent queue (the alpha test still cuts them out, and they still write depth): after the floor,
    // the water and the blood, in an order we choose (renderOrder), not the opaque queue's: the dead (3), then the living (3.5), then the blended soft-bodied (3.7), then
    // the glow of the effects (4).
    spriteMaterial.transparent = true;
    // (A double-sided transparent material is otherwise drawn twice, back faces and front: one pass is all a flat sprite needs.)
    spriteMaterial.forceSinglePass = true;
    this.sprites = new InstancedMesh(quad, spriteMaterial, MAX_SPRITES);
    this.sprites.instanceMatrix.setUsage(DynamicDrawUsage);
    this.sprites.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_SPRITES * 3).fill(1), 3);
    this.sprites.instanceColor.setUsage(DynamicDrawUsage);
    this.spriteUv = new InstancedBufferAttribute(new Float32Array(MAX_SPRITES * 4), 4);
    this.spriteUv.setUsage(DynamicDrawUsage);
    quad.setAttribute('aUv', this.spriteUv);
    this.spriteRim = new InstancedBufferAttribute(new Float32Array(MAX_SPRITES * 3), 3).setUsage(DynamicDrawUsage);
    this.spriteRimColor = new InstancedBufferAttribute(new Float32Array(MAX_SPRITES * 3), 3).setUsage(DynamicDrawUsage);
    quad.setAttribute('aRim', this.spriteRim);
    quad.setAttribute('aRimColor', this.spriteRimColor);
    this.sprites.frustumCulled = false;
    this.sprites.count = 0;
    this.sprites.renderOrder = 3.5;
    reflects(this.sprites);
    this.scene.add(this.sprites);

    const deadMaterial = makeMaterial();
    deadMaterial.depthWrite = false;
    deadMaterial.transparent = true;
    deadMaterial.forceSinglePass = true;
    const deadQuad = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
    this.deadMesh = new InstancedMesh(deadQuad, deadMaterial, MAX_DEAD);
    this.deadMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.deadMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_DEAD * 3).fill(1), 3).setUsage(DynamicDrawUsage);
    this.deadUv = new InstancedBufferAttribute(new Float32Array(MAX_DEAD * 4), 4).setUsage(DynamicDrawUsage);
    deadQuad.setAttribute('aUv', this.deadUv);
    // (No rim on the dead; their glow is whole.)
    const deadRim = new Float32Array(MAX_DEAD * 3);
    for (let i = 0; i < MAX_DEAD; i++) deadRim[i * 3 + 2] = 1;
    deadQuad.setAttribute('aRim', new InstancedBufferAttribute(deadRim, 3));
    // (aRimColor, unused for the dead, carries how far each has dissolved, in x.)
    this.deadFades = new InstancedBufferAttribute(new Float32Array(MAX_DEAD * 3), 3).setUsage(DynamicDrawUsage);
    deadQuad.setAttribute('aRimColor', this.deadFades);
    const before = deadMaterial.onBeforeCompile;
    const key = deadMaterial.customProgramCacheKey;
    deadMaterial.onBeforeCompile = (shader, renderer) => {
      before.call(deadMaterial, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        '#include <alphatest_fragment>\n  if (fract(dot(floor(gl_FragCoord.xy * 0.5), vec2(0.7548776662, 0.5698402910))) < vRimColor.x) discard;',
      );
    };
    deadMaterial.customProgramCacheKey = () => `${key.call(deadMaterial)}-dissolve`;
    this.deadMesh.frustumCulled = false;
    this.deadMesh.count = 0;
    this.deadMesh.renderOrder = 3;
    this.scene.add(this.deadMesh);
    // The blended batch: the same atlas, the same fog and haze; the picture's own alpha, and a cold light of its own.
    const softQuad = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const softMaterial = new MeshLambertMaterial({
      map: this.atlas.color, emissive: 0x86aedb, transparent: true, depthWrite: false, alphaTest: 0.02, side: DoubleSide,
    });
    withFog(softMaterial, this.air, 'instance');
    this.ghosts = new InstancedMesh(softQuad, softMaterial, MAX_BLENDED);
    this.ghosts.instanceMatrix.setUsage(DynamicDrawUsage);
    this.ghosts.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_BLENDED * 3).fill(1), 3);
    this.ghosts.instanceColor.setUsage(DynamicDrawUsage);
    this.ghostUv = new InstancedBufferAttribute(new Float32Array(MAX_BLENDED * 4), 4);
    this.ghostUv.setUsage(DynamicDrawUsage);
    softQuad.setAttribute('aUv', this.ghostUv);
    this.ghosts.frustumCulled = false;
    this.ghosts.renderOrder = 3.7;
    this.ghosts.count = 0;
    this.ghosts.visible = false;
    this.scene.add(this.ghosts);

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
    this.setBloom(tier.bloom);
  }

  /** The bloom on or off: made when first wanted, given back when the tier goes without. */
  private setBloom(on: boolean): void {
    if (on && !this.post && !this.postFailed && canPost(this.renderer)) {
      this.post = new Post(this.kit.bloom);
      this.post.resize(this.width, this.height);
    } else if (!on && this.post) {
      this.post.dispose();
      this.post = null;
    }
    // The stand-in for the bloom (a soft glow over the shining tiles) is drawn only where there is no real one.
    this.effects.setBloom(this.post !== null);
    this.applyGlowGain();
    this.setMirror(on && this.tier.mirror && this.post !== null && this.ortho !== null);
  }

  /** The mirror under the water on or off: made when first wanted, given back when the tier goes without. */
  private setMirror(on: boolean): void {
    if (on && !this.mirror) {
      this.mirror = new Mirror(this.mirrorUniforms, this.kit.camera.pitch);
      this.mirror.resize(this.width, this.height);
      this.configureMirror();
    } else if (!on && this.mirror) {
      this.mirror.dispose();
      this.mirror = null;
      this.mirrorUniforms.tMirror.value = this.blankMirror;
      this.mirrorUniforms.uMirrorOn.value = 0;
    }
  }

  private configureMirror(): void {
    // (Lava reflects nothing: its level has a mirror with no water to show.)
    if (this.mirror && this.geom) this.mirror.configure(this.reflective ? this.geom.kinds : NO_KINDS, materialOf(this.kit, this.region, 'water').height);
  }

  /** What glows is brightened for the bloom (GLOW_GAIN), or put back as the kit has it. */
  private applyGlowGain(): void {
    const on = this.post !== null;
    for (const batch of [this.sprites, this.deadMesh]) (batch.material as MeshLambertMaterial).emissiveIntensity = on ? GLOW_GAIN.sprites : 1;
    if (this.terrainMaterial) this.terrainMaterial.emissiveIntensity = on ? GLOW_GAIN.terrain : 1;
    if (this.waterMaterial) this.waterMaterial.emissiveIntensity = this.waterGlow * (on && this.lava ? GLOW_GAIN.lava : 1);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.post?.resize(width, height);
    this.mirror?.resize(width, height);
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
    this.configureMirror();

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
    this.fires = sourcesOf(this.kit, a.region, this.geom, true);
    this.rig.configure(L, this.fires, this.tier.shadowLights);
    this.fog.setPools(bakePools([...this.fires, ...doorGlow(this.geom.terrain)], this.geom.kinds));
    this.lightBase = { ambient: L.ambient.intensity, hemi: L.hemi.intensity };
    this.bright = 0;
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
    withBlood(this.waterMaterial, this.blood);
    // The kit's mirror: its colour and how much of the water it takes (0.6 of its strength, as the designer's frames have it); lava has none.
    const mu = this.mirrorUniforms;
    mu.uReflect.value.setHex(a.reflect ? hex(a.reflect) : 0xffffff);
    mu.uReflectK.value = a.reflect && !lava ? 0.6 * a.reflectStrength : 0;
    this.reflective = Boolean(a.reflect) && !lava;
    if (a.reflect && !lava) withMirror(this.waterMaterial, mu);
    this.waterGlow = this.waterMaterial.emissiveIntensity;
    this.lava = lava;
    this.applyGlowGain();
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
    this.configureMirror();
    if (change !== 'patched') {
      this.rig.shadowsStale = true;
      // A wall or a door went: the pools of the fixed fires reach differently.
      this.fog.setPools(bakePools([...this.fires, ...doorGlow(geom.terrain)], geom.kinds));
    }
  }

  /** The player's brightness: the exposure, and the ambient light more steeply, so the dark outside the lights lifts. */
  private applyBrightness(b: number): void {
    this.bright = b;
    this.renderer.toneMappingExposure = b;
    const lift = b ** 1.6;
    this.ambient.intensity = this.lightBase.ambient * lift;
    this.hemi.intensity = this.lightBase.hemi * lift;
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
    reflects(this.boxMesh);
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
    blend = false,
  ): void {
    const dead = this.toDead && !blend;
    if (blend ? this.ghostCount >= MAX_BLENDED : dead ? this.deadCount >= MAX_DEAD : this.spriteCount >= MAX_SPRITES) return;
    const spot = this.atlas.place(image, glow);
    if (!spot) return;
    // Three batches: the living, the dead (under them, dissolving) and the soft-bodied (blended, sorted back to front).
    const batch = blend ? this.ghosts : dead ? this.deadMesh : this.sprites;
    const i = blend ? this.ghostCount++ : dead ? this.deadCount++ : this.spriteCount++;
    if (blend) this.ghostZ[i] = z;
    const m = batch.instanceMatrix.array as Float32Array;
    const o = i * 16;
    m[o] = width; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    if (mode === FLAT) {
      // Local up becomes north on the floor; the picture's face looks up.
      m[o + 4] = 0; m[o + 5] = 0; m[o + 6] = -height; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 1; m[o + 10] = 0; m[o + 11] = 0;
    } else if (mode === LEANED) {
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
    const uv = (blend ? this.ghostUv : dead ? this.deadUv : this.spriteUv).array as Float32Array;
    const u0 = (spot.x + sx) / ATLAS_W;
    const du = w / ATLAS_W;
    const q = i * 4;
    uv[q] = flip ? u0 + du : u0;
    uv[q + 1] = 1 - (spot.y + sy + h) / ATLAS_H;
    uv[q + 2] = flip ? -du : du;
    uv[q + 3] = h / ATLAS_H;
    const c = batch.instanceColor!.array as Float32Array;
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = tint;
    if (blend) return;
    if (dead) {
      (this.deadFades.array as Float32Array)[i * 3] = this.deadFade;
      return;
    }
    const r = this.spriteRim.array as Float32Array;
    r[i * 3] = r[i * 3 + 1] = 0;
    r[i * 3 + 2] = 1;
  }

  /** Puts the blended figures back to front (north to south: the camera is in the south), so soft bodies overlap as they should. */
  private sortBlended(): void {
    const n = this.ghostCount;
    if (n < 2) return;
    const z = this.ghostZ;
    const m = this.ghosts.instanceMatrix.array as Float32Array;
    const uv = this.ghostUv.array as Float32Array;
    const c = this.ghosts.instanceColor!.array as Float32Array;
    const swap = (a: number, b: number): void => {
      for (let k = 0; k < 16; k++) { const t = m[a * 16 + k]!; m[a * 16 + k] = m[b * 16 + k]!; m[b * 16 + k] = t; }
      for (let k = 0; k < 4; k++) { const t = uv[a * 4 + k]!; uv[a * 4 + k] = uv[b * 4 + k]!; uv[b * 4 + k] = t; }
      for (let k = 0; k < 3; k++) { const t = c[a * 3 + k]!; c[a * 3 + k] = c[b * 3 + k]!; c[b * 3 + k] = t; }
      const t = z[a]!; z[a] = z[b]!; z[b] = t;
    };
    for (let i = 1; i < n; i++) for (let j = i; j > 0 && z[j - 1]! > z[j]!; j--) swap(j - 1, j);
  }

  /** How strongly the sprite just written glows (a legendary look pulses): its emissive map is scaled by this (the shader's `aRim.z`). */
  private glowLast(k: number): void {
    if (this.spriteCount > 0) (this.spriteRim.array as Float32Array)[(this.spriteCount - 1) * 3 + 2] = k;
  }

  /**
   * Gives the sprite just written its rim: the one-pixel edge, on the side of its silhouette that faces the strongest light near it
   * (a torch, lava, a fungus, a boss's accent), in that light's colour. The direction is rounded to eight sides, so it is a pixel
   * edge and not a gradient, and turned into the texture's own axes (a flipped sprite reads its picture backwards). It also gives
   * back where that light lies, for the shade to slip away from; false if no light reaches the figure.
   */
  private rimLast(x: number, z: number, flip: boolean): boolean {
    const rim = this.kit.sprites.rim;
    if (!rim.on || this.spriteCount === 0) return false;
    const s = this.strong;
    if (!this.rig.strongest(x, z, rim.strength, rim.max, s)) return false;
    const i = this.spriteCount - 1;
    // Screen-right is +x and screen-up is -z; in the picture's own axes the first is flipped with the sprite.
    const up = -s.uz;
    const dx = s.ux > 0.383 ? 1 : s.ux < -0.383 ? -1 : 0;
    const dy = up > 0.383 ? 1 : up < -0.383 ? -1 : 0;
    if (dx === 0 && dy === 0) return true;
    const r = this.spriteRim.array as Float32Array;
    r[i * 3] = flip ? -dx : dx;
    r[i * 3 + 1] = dy;
    const c = this.spriteRimColor.array as Float32Array;
    c[i * 3] = s.r * s.strength;
    c[i * 3 + 1] = s.g * s.strength;
    c[i * 3 + 2] = s.b * s.strength;
    return true;
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
    const sk = this.kit.sprites;
    const flyer = FLYERS.has(puppet.kind) && puppet.alive;
    // A flyer hangs 0.35 cells up and bobs at 1.2 Hz (each out of step with the next); a levitating hero floats as before.
    const hover = puppet.levitating && puppet.alive ? 4 + Math.round(Math.sin(now / 320)) : 0;
    // The sad ghost floats a little off the floor and bobs gently, slowly, with a cold light round it.
    const spectral = puppet.kind === 'ghost' && puppet.alive;
    const lift = flyer ? sk.fly.hover + sk.fly.bobAmp * Math.sin((now / 1000) * sk.fly.bobHz * Math.PI * 2 + puppet.to * 0.7)
      : spectral ? 0.12 + 0.05 * Math.sin(now / 650 + puppet.to * 0.9) : hover / TILE;
    // A figure whose picture has soft pixels (a ghost, a wraith, bees' wings) is drawn blended, with its own alpha, not cut at one half.
    const blend = !puppet.isHero && hasSoftBody(sheet.image);
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
    const worn = puppet.worn;
    const look = worn?.look;
    // A legendary look's aura stands just behind the hero, bright (its own glow: it does not dim), a pixel lower.
    if (look?.aura) {
      const aura = look.aura;
      this.sprite(aura.image, (Math.floor(f.now / aura.ms) % aura.frames) * aura.w, 0, aura.w, aura.h, false, tx, lift - 1 / TILE, tz - 0.02, (aura.w / TILE) * scale, (aura.h / TILE) * scale, tint, LEANED, 0, aura.image);
    }
    // The dying are in the batch under the living (the hero's own body stays among them); a soft-bodied one keeps its blend.
    this.toDead = !puppet.alive && !puppet.isHero && !blend;
    if (this.toDead) {
      // (A dying body dissolves, as the dead do, rather than darkening.)
      this.deadFade = tint < 1 ? 1 - tint : 0;
      if (tint < 1) tint = 1;
    }
    this.sprite(sheet.image, sx, sy, sheet.w, sheet.h, puppet.flip, tx, lift, tz, (sheet.w / TILE) * scale, (sheet.h / TILE) * scale, tint, LEANED, 0, look?.glow, blend);
    this.toDead = false;
    if (spectral) this.effects.halo(tx, 0.55 + lift, tz, COLD, 1.7, 0.2 + 0.05 * Math.sin(now / 520 + puppet.to));
    if (look?.glow && !blend) this.glowLast(look.pulse.min + (look.pulse.max - look.pulse.min) * (0.5 + 0.5 * Math.sin((now / 1000) * look.pulse.hz * Math.PI * 2)));
    // The rim of the strongest light on the silhouette (not on the dead: they lie flat), and the shade slipping away from that light.
    const lit = puppet.alive && !blend && this.rimLast(tx, tz, puppet.flip);
    // The hat, a second picture by the same frame and armour, the hero's frame at (2, 7) of its cell: standing where he stands.
    const hat = worn?.hat;
    if (hat) {
      const col = frame % sheet.cols;
      const row = Math.floor(frame / sheet.cols) + puppet.row;
      this.sprite(hat.image, col * hat.w, row * hat.h, hat.w, hat.h, puppet.flip, tx, lift, tz, (hat.w / TILE) * scale, (hat.h / TILE) * scale, tint, LEANED, 0, hat.glow);
      if (hat.glow) this.glowLast(0.9);
      this.rimLast(tx, tz, puppet.flip);
    }
    if (puppet.alive || !puppet.laid) {
      const air = flyer || spectral || hover > 0;
      const size = Math.max(0.35, sk.shadow.width * (sheet.w / TILE)) * (air ? sk.fly.shadowScale : 1) * scale;
      const away = lit ? sk.shadow.offset : 0;
      this.effects.shadowBlob(tx - this.strong.ux * away, tz - this.strong.uz * away, size, sk.shadow.opacity * (air ? sk.fly.shadowFade : 1), sk.shadow.squash);
    }
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

    if (brightness.value !== this.bright) this.applyBrightness(brightness.value);
    this.air.uTime.value = f.now / 1000;
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
    this.deadCount = 0;
    this.ghostCount = 0;
    this.shownCount = 0;
    this.bossFound = false;
    this.blood.update(f.now);
    this.effects.begin();
    f.view.puppets.forEach(this.puppetPass);
    this.addWear(f);
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
    for (const a of [this.spriteRim, this.spriteRimColor]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.spriteCount * 3);
      a.needsUpdate = true;
    }
    this.spriteUv.clearUpdateRanges();
    this.spriteUv.addUpdateRange(0, this.spriteCount * 4);
    this.spriteUv.needsUpdate = true;
    const dead = this.deadMesh;
    dead.count = this.deadCount;
    dead.visible = this.deadCount > 0;
    if (this.deadCount > 0) {
      dead.instanceMatrix.clearUpdateRanges();
      dead.instanceMatrix.addUpdateRange(0, this.deadCount * 16);
      dead.instanceMatrix.needsUpdate = true;
      dead.instanceColor!.clearUpdateRanges();
      dead.instanceColor!.addUpdateRange(0, this.deadCount * 3);
      dead.instanceColor!.needsUpdate = true;
      this.deadUv.clearUpdateRanges();
      this.deadUv.addUpdateRange(0, this.deadCount * 4);
      this.deadUv.needsUpdate = true;
      this.deadFades.clearUpdateRanges();
      this.deadFades.addUpdateRange(0, this.deadCount * 3);
      this.deadFades.needsUpdate = true;
    }
    // The blended batch exists for the frame only if a soft-bodied figure is in sight: one more draw then, none otherwise.
    this.sortBlended();
    const g = this.ghostCount;
    this.ghosts.visible = g > 0;
    if (g > 0) {
      this.ghosts.count = g;
      this.ghosts.instanceMatrix.clearUpdateRanges();
      this.ghosts.instanceMatrix.addUpdateRange(0, g * 16);
      this.ghosts.instanceMatrix.needsUpdate = true;
      this.ghosts.instanceColor!.clearUpdateRanges();
      this.ghosts.instanceColor!.addUpdateRange(0, g * 3);
      this.ghosts.instanceColor!.needsUpdate = true;
      this.ghostUv.clearUpdateRanges();
      this.ghostUv.addUpdateRange(0, g * 4);
      this.ghostUv.needsUpdate = true;
    }
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
    const post = this.post;
    if (post) {
      const mirror = this.mirror;
      if (mirror && this.ortho) {
        // The cells in view, with a margin for what stands over the shore.
        const reach = f.height / ys / (2 * unit) + 2;
        if (mirror.seen(cx - halfW - 2, cx + halfW + 2, cz - reach, cz + reach, f.explored)) {
          mirror.render(this.renderer, cx, cz, halfW + 1, reach, (target, camera) => post.renderScene(this.renderer, this.scene, camera, target));
        } else this.mirrorUniforms.uMirrorOn.value = 0;
      }
      post.renderScene(this.renderer, this.scene, cam);
      post.composite(this.renderer);
    } else this.renderer.render(this.scene, cam);
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

  /**
   * What my hero's cosmetics put down (wearfx.ts): footprints lying on the floor, the effects of a kill and a fall and the pet as pictures
   * standing up like the characters; the pet's shade is a blob on the floor, smaller and paler for a flyer.
   */
  private addWear(f: Frame3D): void {
    const { quads, count } = f.view.wearQuads(f.myId, f.now);
    const sk = this.kit.sprites;
    for (let i = 0; i < count; i++) {
      const q: WearQuad = quads[i]!;
      if (!f.explored[Math.floor(q.x / TILE) + Math.floor(q.y / TILE) * WIDTH]) continue;
      const fx0 = q.x + TILE / 2;
      const fz0 = q.y + FEET_PX;
      // The picture's bottom middle, from the feet point (px).
      const bx = (fx0 + q.ox + (q.w / 2 - q.ax)) / TILE;
      const down = q.oy + (q.h - q.ay);
      if (q.kind === 'trail') {
        this.sprite(q.image, q.sx, q.sy, q.w, q.h, false, bx, 0.03, fz0 / TILE + down / TILE, q.w / TILE, q.h / TILE, 1, FLAT);
        continue;
      }
      const lift = Math.max(0, (q.lift - down) / TILE);
      if (q.shade > 0) this.effects.shadowBlob(fx0 / TILE, fz0 / TILE, q.shade / TILE, q.shadeAlpha, sk.shadow.squash);
      this.sprite(q.image, q.sx, q.sy, q.w, q.h, q.flip, bx, lift, fz0 / TILE, q.w / TILE, q.h / TILE, q.alpha, LEANED, 0, q.glow);
      if (q.kind === 'pet') this.rimLast(fx0 / TILE, fz0 / TILE, q.flip);
    }
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
      if (visible[heap.pos]) this.effects.shadowBlob(x, z, 0.6, this.kit.sprites.shadow.opacity, this.kit.sprites.shadow.squash);
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

  /**
   * Bodies left where monsters fell: the last frame of their death as the monster's own sprite, standing in its cell leaned like the
   * living, lit as they are (no darkening), fading out over a second as the original's dead do; in the batch under the living.
   * (The canvas keeps the darkened body for a minute; the pools of blood stay in the effects.)
   */
  private addCorpses(f: Frame3D): void {
    this.toDead = true;
    for (const c of fx.corpses) {
      const age = f.now - c.at;
      if (age < 0 || age >= CORPSE_FADE_MS) continue;
      const { src } = c;
      const image = src.image as HTMLImageElement;
      const cell = Math.trunc((c.y + src.h - 2) / TILE) * WIDTH + Math.trunc((c.x + src.w / 2) / TILE);
      if (!f.visible[cell]) continue;
      // Whole for the first part of its second, then dissolving.
      this.deadFade = Math.max(0, (age / CORPSE_FADE_MS - 0.3) / 0.7);
      this.sprite(image, src.sx, src.sy, src.w, src.h, src.flip, (c.x + src.w / 2) / TILE, 0, (c.y + src.h - (TILE - FEET_PX)) / TILE, src.w / TILE, src.h / TILE, 1);
    }
    this.toDead = false;
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
      this.effects.shadowBlob(x, z, 0.5 - height * 0.2, this.kit.sprites.shadow.opacity * (1 - height * 0.5), this.kit.sprites.shadow.squash);
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
      } else if (Math.abs(x - this.air.uHero.value.x) < SCONCE_REACH && Math.abs(z - this.air.uHero.value.y) < SCONCE_REACH) {
        // A torch seen before keeps its soft halo, breathing slowly (the pool of its light is baked into the fog, fogofwar.ts).
        this.effects.halo(x, 1.1, z + 0.3, rgb, 2.6, 0.42 + 0.06 * Math.sin(f.now / 900 + cell));
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
    this.mirror?.dispose();
    this.blankMirror.dispose();
    this.post?.dispose();
    this.atlas.dispose();
    this.fog.dispose();
    this.blood.dispose();
    this.effects.dispose(this.scene);
    this.rig.dispose(this.scene);
    this.sprites.geometry.dispose();
    (this.sprites.material as MeshLambertMaterial).dispose();
    this.sprites.dispose();
    this.deadMesh.geometry.dispose();
    (this.deadMesh.material as MeshLambertMaterial).dispose();
    this.deadMesh.dispose();
    this.ghosts.geometry.dispose();
    (this.ghosts.material as MeshLambertMaterial).dispose();
    this.ghosts.dispose();
    this.renderer.dispose();
    if (!this.lost) this.renderer.forceContextLoss();
    this.geom = null;
  }
}

