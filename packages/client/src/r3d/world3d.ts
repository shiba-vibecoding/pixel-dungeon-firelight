/*
 * The new renderer («Новая графика (бета)»): the level as a Three.js diorama under the 2D game's own camera, HD-2D style.
 * A chunk of its own, fetched only when the switch is on (main.ts). Built to a frame budget (4 ms CPU / 8 ms GPU at 60 Hz, half
 * of that at 120), so:
 *
 *   - the static level is three merged meshes (floor, boxes, water) sharing one tile sheet; changes patch their buffers in place;
 *   - every character, item and flame is one InstancedMesh over one texture atlas, alpha-tested, leaned toward the camera;
 *     their shadows are blobs (one more instanced draw); nothing else casts a shadow but the walls, so shadow maps are drawn
 *     only when a wall or a torch changes (autoUpdate off);
 *   - the fog of war is a 48 x 48 texture read by the vertex shaders: one fetch a vertex, no pass of its own;
 *   - nothing is made in the frame loop: vectors, matrices and records are made once and written in place.
 * What does not come over yet: bolts, gas, explosions and the other canvas effects are drawn flat onto the 2D layer over the scene.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DataTexture, DoubleSide,
  DynamicDrawUsage, FrontSide, HemisphereLight, InstancedBufferAttribute, InstancedMesh, LinearFilter, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, NearestFilter, OrthographicCamera, PCFShadowMap, PlaneGeometry, PointLight, Points, PointsMaterial,
  RedFormat, RepeatWrapping, Scene, SRGBColorSpace, Texture, UnsignedByteType, WebGLRenderer,
} from 'three';
import { HEIGHT, LENGTH, type Level, WIDTH } from '@pd/core';
import { type Assets, frameAt, levelRegion } from '../sprites';
import { sheet as worldSheet } from '../worldsheets';
import { knockback, LUNGE_MS } from '../render';
import { FALL_MS, type Puppet, TILE, type View } from '../view';
import { LevelGeom, type Buffers } from './levelgeom';
import { FEET_PX, LEAN, LEAN_STRETCH, PITCH, WALL_H, YS } from './project';
import type { Tier } from './governor';
import { PerfOverlay } from './perfoverlay';

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

const ATLAS_W = 2048;
const ATLAS_H = 1024;
const MAX_SPRITES = 160;
const MAX_BLOBS = 64;
const SIN_LEAN = Math.sin(LEAN);
const COS_LEAN = Math.cos(LEAN);
/** The soft hero light, and the torches: warm. */
const TORCH_COLOR = 0xff9448;
const HERO_COLOR = 0xffe2b0;
const TORCH_HEIGHT = 0.62;
/** The frames of a torch flame (ambient1.png's «torch»), and the size drawn, in tiles. */
const FLAME_SIZE = 0.8;

/** Fog of war: how dark each state is (the 2D renderer's own numbers, render.ts). */
const FOG_REMEMBERED = 0.55;
const FOG_REVEAL_MS = 70;
const FOG_FORGET_MS = 260;

/** Shelf-packed sheets: every sprite sheet is copied once onto one canvas, and the whole thing is one texture. */
class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  private readonly g: CanvasRenderingContext2D;
  private readonly spots = new Map<CanvasImageSource, { x: number; y: number }>();
  private shelfX = 0;
  private shelfY = 0;
  private shelfH = 0;
  /** The atlas has something new to upload before the next frame. */
  dirty = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_W;
    this.canvas.height = ATLAS_H;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
  }

  /** Where an image lies on the atlas (copied there the first time), or null if the atlas is full. */
  place(image: HTMLImageElement | HTMLCanvasElement): { x: number; y: number } | null {
    const known = this.spots.get(image);
    if (known) return known;
    const w = image.width;
    const h = image.height;
    if (this.shelfX + w > ATLAS_W) {
      this.shelfX = 0;
      this.shelfY += this.shelfH;
      this.shelfH = 0;
    }
    if (this.shelfY + h > ATLAS_H) return null;
    const spot = { x: this.shelfX, y: this.shelfY };
    this.g.drawImage(image, spot.x, spot.y);
    this.shelfX += w;
    this.shelfH = Math.max(this.shelfH, h);
    this.spots.set(image, spot);
    this.dirty = true;
    return spot;
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.spots.clear();
  }
}

/** The fog of war as a texture: one byte a cell, easing toward where each cell should be (0 in sight, 0.55 remembered, 1 unknown). */
class Fog {
  readonly texture: DataTexture;
  private readonly dark = new Float32Array(LENGTH).fill(1);
  private readonly target = new Float32Array(LENGTH).fill(1);
  private readonly bytes = new Uint8Array(LENGTH).fill(255);
  private easing = false;

  constructor() {
    this.texture = new DataTexture(this.bytes, WIDTH, HEIGHT, RedFormat, UnsignedByteType);
    this.texture.magFilter = this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;
  }

  /** A new turn's sight: where each cell is headed. `snap`: a new floor, no easing. */
  set(visible: readonly boolean[], explored: readonly boolean[], snap: boolean): void {
    for (let i = 0; i < LENGTH; i++) this.target[i] = visible[i] ? 0 : explored[i] ? FOG_REMEMBERED : 1;
    if (snap) {
      this.dark.set(this.target);
      this.write();
    } else this.easing = true;
  }

  private write(): void {
    for (let i = 0; i < LENGTH; i++) this.bytes[i] = Math.round(this.dark[i]! * 255);
    this.texture.needsUpdate = true;
  }

  /** Eases the cells; true while something is still moving (so the frame must be drawn). */
  step(dt: number): boolean {
    if (!this.easing) return false;
    const d = Math.min(100, Math.max(0, dt));
    const reveal = 1 - Math.exp(-d / FOG_REVEAL_MS);
    const forget = 1 - Math.exp(-d / FOG_FORGET_MS);
    let moving = false;
    for (let i = 0; i < LENGTH; i++) {
      const goal = this.target[i]!;
      const now = this.dark[i]!;
      if (now === goal) continue;
      const next = now + (goal - now) * (goal < now ? reveal : forget);
      this.dark[i] = Math.abs(next - goal) < 0.004 ? goal : next;
      if (this.dark[i] !== goal) moving = true;
    }
    if (!moving) this.easing = false;
    this.write();
    return moving;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/** Gives a Lambert material the fog of war: it reads the darkness of a vertex from the fog texture and dims and drains the colour. */
function withFog(material: MeshLambertMaterial | MeshBasicMaterial, fog: { value: Texture }, mode: 'attribute' | 'instance'): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tFog = fog;
    const fetch =
      mode === 'attribute'
        ? 'vFog = texture2D(tFog, aFog).r;'
        : `vec4 fogAt = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); vFog = texture2D(tFog, vec2(fogAt.x / ${WIDTH}.0, fogAt.z / ${HEIGHT}.0)).r;`;
    let vertex = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D tFog;\nvarying float vFog;\n${mode === 'attribute' ? 'attribute vec2 aFog;' : 'attribute vec4 aUv;'}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${fetch}`);
    if (mode === 'instance') vertex = vertex.replace('#include <uv_vertex>', '#ifdef USE_MAP\nvMapUv = aUv.xy + uv * aUv.zw;\n#endif');
    shader.vertexShader = vertex;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFog;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        {
          float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          float rem = clamp(vFog / ${FOG_REMEMBERED.toFixed(2)}, 0.0, 1.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(lum) * 0.5, rem * 0.78);
          gl_FragColor.rgb *= 1.0 - smoothstep(0.52, 1.0, vFog);
        }`,
      );
  };
  material.customProgramCacheKey = () => `pdfog-${mode}`;
}

function attrs(geometry: BufferGeometry, b: Buffers, dynamic: boolean): void {
  const make = (array: Float32Array, size: number): BufferAttribute => {
    const attribute = new BufferAttribute(array, size);
    if (dynamic) attribute.setUsage(DynamicDrawUsage);
    return attribute;
  };
  geometry.setAttribute('position', make(b.pos, 3));
  geometry.setAttribute('normal', make(b.normal, 3));
  geometry.setAttribute('uv', make(b.uv, 2));
  geometry.setAttribute('color', make(b.color, 3));
  geometry.setAttribute('aFog', make(b.fog, 2));
  const index = new BufferAttribute(b.index, 1);
  if (dynamic) index.setUsage(DynamicDrawUsage);
  geometry.setIndex(index);
  geometry.setDrawRange(0, b.indices);
}

/** A soft round dark spot, for a character's shadow (blended: the only blended things in the scene besides dust). */
function blobTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function dotTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 16);
  return new CanvasTexture(c);
}

/** Time the frame took, for the perf overlay and the governor. */
export interface PerfSample {
  cpuMs: number;
  gpuMs: number;
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
  /** The context was lost: the game goes back to 2D. */
  onLost: () => void;
}

export class World3D {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 100);
  private tier: Tier;
  private readonly options: World3DOptions;
  private readonly atlas = new Atlas();
  private readonly fog = new Fog();
  private readonly fogUniform = { value: this.fog.texture as Texture };
  private readonly blob = blobTexture();
  private readonly dot = dotTexture();

  // Terrain.
  private geom: LevelGeom | null = null;
  private levelKey = '';
  private region = -1;
  private tiles: Texture | null = null;
  private waterTex: Texture | null = null;
  private floorMesh: Mesh | null = null;
  private boxMesh: Mesh | null = null;
  private waterMesh: Mesh | null = null;
  private seenFloor = -1;
  private seenBox = -1;
  private terrainMaterial: MeshLambertMaterial | null = null;
  private waterMaterial: MeshLambertMaterial | null = null;

  // Characters.
  private readonly sprites: InstancedMesh;
  private readonly spriteUv: InstancedBufferAttribute;
  private readonly blobs: InstancedMesh;
  private spriteCount = 0;
  private blobCount = 0;
  /** Drawn this frame, for the marks the 2D layer puts over them. */
  readonly shown: Shown[] = [];
  shownCount = 0;
  private readonly at = { x: 0, y: 0 };

  // Lights.
  private readonly hemi = new HemisphereLight(0xdde3ff, 0x8a90ac, 2.5);
  private readonly heroLight = new PointLight(HERO_COLOR, 6, 6.5, 1.5);
  private readonly torchLights: PointLight[] = [];
  /** The torch (a cell of the level) each light stands at, or -1. */
  private readonly assigned = [-1, -1, -1];
  private shadowDirty = true;
  private shadowsOn: boolean;

  // Particles.
  private dust: Points | null = null;
  private dustPhase = new Float32Array(48 * 3);

  // Instruments.
  private readonly perf: PerfSample = { cpuMs: 0, gpuMs: 0, calls: 0, triangles: 0, textures: 0, geometries: 0 };
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

  constructor(canvas: HTMLCanvasElement, private readonly assets: Assets, options: World3DOptions) {
    this.canvas = canvas;
    this.options = options;
    this.tier = options.tier;
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.info.autoReset = false;
    this.shadowsOn = options.tier.shadowLights > 0;
    this.renderer.shadowMap.enabled = this.shadowsOn;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.lostHandler = (event) => {
      event.preventDefault();
      this.lost = true;
      options.onLost();
    };
    canvas.addEventListener('webglcontextlost', this.lostHandler);

    // The camera: orthographic, looking down at the fixed pitch, no yaw; the frame sets where and how wide.
    this.camera.rotation.x = -PITCH;
    this.camera.near = 1;
    this.camera.far = 120;

    this.scene.add(this.hemi, this.heroLight);
    for (let i = 0; i < 3; i++) {
      const light = new PointLight(TORCH_COLOR, 0, 9, 1.3);
      this.torchLights.push(light);
      this.scene.add(light);
    }
    this.configureShadows();

    // The sprite batch: one quad, many instances, one atlas.
    const quad = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const spriteMaterial = new MeshLambertMaterial({ map: this.atlas.texture, alphaTest: 0.5, side: DoubleSide });
    withFog(spriteMaterial, this.fogUniform, 'instance');
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

    const flat = new PlaneGeometry(1, 1);
    this.blobs = new InstancedMesh(flat, new MeshBasicMaterial({ map: this.blob, transparent: true, depthWrite: false }), MAX_BLOBS);
    this.blobs.instanceMatrix.setUsage(DynamicDrawUsage);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 2;
    this.blobs.count = 0;
    this.scene.add(this.blobs);

    for (let i = 0; i < MAX_SPRITES; i++) this.shown.push({ puppet: undefined as unknown as Puppet, x: 0, y: 0 });
    this.puppetPass = (puppet) => this.addPuppet(puppet);

    if (options.perf) {
      this.overlay = new PerfOverlay();
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
      if (ext) this.timer = { ext, gl, pending: null };
    }
    this.applyTier(options.tier);
  }

  /** Torches 0 and 1 cast shadows (the tier says how many are on); their maps are 512 on phones. */
  private configureShadows(): void {
    const size = this.options.phone ? 512 : 1024;
    for (let i = 0; i < this.torchLights.length; i++) {
      const light = this.torchLights[i]!;
      light.castShadow = i < this.tier.shadowLights;
      light.shadow.mapSize.set(size, size);
      light.shadow.camera.near = 0.2;
      light.shadow.camera.far = 14;
      light.shadow.bias = -0.0008;
      light.shadow.normalBias = 0.03;
    }
  }

  /** Brings the renderer to a quality tier: shadows, the dust, and the canvas density (the caller resizes). */
  applyTier(tier: Tier): void {
    this.tier = tier;
    const on = tier.shadowLights > 0;
    if (on !== this.shadowsOn) {
      this.shadowsOn = on;
      this.renderer.shadowMap.enabled = on;
      if (this.terrainMaterial) this.terrainMaterial.needsUpdate = true;
      if (this.waterMaterial) this.waterMaterial.needsUpdate = true;
    }
    this.configureShadows();
    this.shadowDirty = true;
    if (this.dust) this.dust.visible = tier.particles;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  private tileTexture(region: number): Texture {
    const image = this.assets.tiles[region]!;
    const texture = new Texture(image);
    texture.colorSpace = SRGBColorSpace;
    texture.magFilter = texture.minFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  /** A new floor (or run): the geometry of its map, torches, a fresh fog. `key` tells one floor from another. */
  setLevel(level: Level, key: string): void {
    if (key === this.levelKey && this.geom) return;
    this.levelKey = key;
    const region = levelRegion(level);
    if (region !== this.region || !this.tiles) {
      this.tiles?.dispose();
      this.waterTex?.dispose();
      this.tiles = this.tileTexture(region);
      const water = new Texture(this.assets.water[region]!);
      water.colorSpace = SRGBColorSpace;
      water.magFilter = water.minFilter = NearestFilter;
      water.wrapS = water.wrapT = RepeatWrapping;
      water.generateMipmaps = false;
      water.needsUpdate = true;
      this.waterTex = water;
      this.region = region;
      this.terrainMaterial?.dispose();
      this.waterMaterial?.dispose();
      this.terrainMaterial = new MeshLambertMaterial({ map: this.tiles, vertexColors: true, alphaTest: 0.5 });
      withFog(this.terrainMaterial, this.fogUniform, 'attribute');
      this.waterMaterial = new MeshLambertMaterial({ map: water, vertexColors: true });
      withFog(this.waterMaterial, this.fogUniform, 'attribute');
      this.dropMeshes();
    }
    const image = this.assets.tiles[region]!;
    this.geom = new LevelGeom(level.map, image.width / TILE, image.height / TILE);
    this.makeMeshes();
    this.assigned.fill(-1);
    this.shadowDirty = true;
    worldSheet('ambient1');
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
    if (change !== 'patched') this.shadowDirty = true;
  }

  private dropMeshes(): void {
    for (const mesh of [this.floorMesh, this.boxMesh, this.waterMesh]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.floorMesh = this.boxMesh = this.waterMesh = null;
    this.seenFloor = this.seenBox = -1;
  }

  private makeMeshes(): void {
    const geom = this.geom!;
    this.dropMeshes();
    const floor = new BufferGeometry();
    attrs(floor, geom.floor, true);
    this.floorMesh = new Mesh(floor, this.terrainMaterial!);
    this.floorMesh.receiveShadow = true;
    this.floorMesh.frustumCulled = false;
    const boxes = new BufferGeometry();
    attrs(boxes, geom.boxes, true);
    this.boxMesh = new Mesh(boxes, this.terrainMaterial!);
    this.boxMesh.castShadow = true;
    this.boxMesh.receiveShadow = true;
    this.boxMesh.frustumCulled = false;
    const water = new BufferGeometry();
    attrs(water, geom.water, true);
    this.waterMesh = new Mesh(water, this.waterMaterial!);
    this.waterMesh.receiveShadow = true;
    this.waterMesh.frustumCulled = false;
    this.scene.add(this.floorMesh, this.boxMesh, this.waterMesh);
    geom.grew = false;
    this.seenFloor = geom.floorVersion;
    this.seenBox = geom.boxVersion;
    // The boxes' shadows are cast on the side facing the light; the floor and walls take them.
    (this.boxMesh.material as MeshLambertMaterial).shadowSide = FrontSide;
  }

  /** Uploads what the geometry has changed since the last frame. */
  private syncGeometry(): void {
    const geom = this.geom!;
    if (geom.grew) {
      // A box or water buffer was made bigger: new geometry for them.
      this.dropMeshes();
      this.makeMeshes();
      return;
    }
    if (geom.floorVersion !== this.seenFloor) {
      this.seenFloor = geom.floorVersion;
      const g = this.floorMesh!.geometry;
      (g.getAttribute('uv') as BufferAttribute).needsUpdate = true;
    }
    if (geom.boxVersion !== this.seenBox) {
      this.seenBox = geom.boxVersion;
      for (const [mesh, b] of [[this.boxMesh!, geom.boxes], [this.waterMesh!, geom.water]] as const) {
        const g = mesh.geometry;
        for (const name of ['position', 'normal', 'uv', 'color', 'aFog'] as const) (g.getAttribute(name) as BufferAttribute).needsUpdate = true;
        g.getIndex()!.needsUpdate = true;
        g.setDrawRange(0, b.indices);
      }
    }
  }

  /** The new turn's sight. */
  setSight(visible: readonly boolean[], explored: readonly boolean[], snap: boolean): void {
    this.fog.set(visible, explored, snap);
    this.fogMoving = true;
  }

  // ---- sprites -------------------------------------------------------------------------------------------------------------

  /** Writes one leaned sprite into the batch: its frame (a rectangle of an image), where its feet are (tiles) and how big (tiles). */
  private sprite(
    image: HTMLImageElement | HTMLCanvasElement, sx: number, sy: number, w: number, h: number, flip: boolean,
    x: number, y: number, z: number, width: number, height: number, tint: number,
  ): void {
    if (this.spriteCount >= MAX_SPRITES) return;
    const spot = this.atlas.place(image);
    if (!spot) return;
    const i = this.spriteCount++;
    const m = this.sprites.instanceMatrix.array as Float32Array;
    const o = i * 16;
    const sh = height * LEAN_STRETCH;
    m[o] = width; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = sh * COS_LEAN; m[o + 6] = -sh * SIN_LEAN; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = SIN_LEAN; m[o + 10] = COS_LEAN; m[o + 11] = 0;
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

  private shadow(x: number, z: number, size: number): void {
    if (this.blobCount >= MAX_BLOBS) return;
    const m = this.blobs.instanceMatrix.array as Float32Array;
    const o = this.blobCount++ * 16;
    // Lying on the floor: its up (local y) runs north, its face looks up.
    m[o] = size; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = 0; m[o + 6] = -size * 0.62; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 1; m[o + 10] = 0; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = 0.015; m[o + 14] = z; m[o + 15] = 1;
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
    // The 2D renderer's cell corner is the walker's own: the feet stand a little south of the cell's middle.
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
    if (puppet.alive || !puppet.laid) this.shadow(tx, tz, (hover ? 0.7 : 0.95) * Math.max(0.4, sheet.w / 14));
    const mark = this.shown[this.shownCount++]!;
    mark.puppet = puppet;
    mark.x = pos.x;
    mark.y = pos.y;
  }

  // ---- lights --------------------------------------------------------------------------------------------------------------

  /** Chooses the three torches nearest the hero for the three torch lights, keeping those already lit, and says if shadows must be redrawn. */
  private assignTorches(hx: number, hz: number, explored: readonly boolean[]): void {
    const torches = this.geom!.torches;
    // The nearest three (squared distance), by a small insertion: no arrays made.
    let a = -1, b = -1, c = -1;
    let da = Infinity, db = Infinity, dc = Infinity;
    for (let i = 0; i < torches.length; i++) {
      const cell = torches[i]!;
      if (!explored[cell]) continue;
      const dx = (cell % WIDTH) + 0.5 - hx;
      const dz = Math.trunc(cell / WIDTH) + 1 - hz;
      const d = dx * dx + dz * dz;
      if (d > 20 * 20) continue;
      if (d < da) { c = b; dc = db; b = a; db = da; a = cell; da = d; }
      else if (d < db) { c = b; dc = db; b = cell; db = d; }
      else if (d < dc) { c = cell; dc = d; }
    }
    const wanted0 = a, wanted1 = b, wanted2 = c;
    const keep = (cell: number): boolean => cell === wanted0 || cell === wanted1 || cell === wanted2;
    const slots = this.assigned;
    for (let i = 0; i < 3; i++) if (slots[i]! >= 0 && !keep(slots[i]!)) slots[i] = -1;
    this.take(wanted0);
    this.take(wanted1);
    this.take(wanted2);
  }

  /** Gives a torch a free light, if it has none. */
  private take(cell: number): void {
    const slots = this.assigned;
    if (cell < 0 || cell === slots[0] || cell === slots[1] || cell === slots[2]) return;
    const free = slots[0]! < 0 ? 0 : slots[1]! < 0 ? 1 : slots[2]! < 0 ? 2 : -1;
    if (free < 0) return;
    slots[free] = cell;
    const light = this.torchLights[free]!;
    light.position.set((cell % WIDTH) + 0.5, TORCH_HEIGHT, Math.trunc(cell / WIDTH) + 1.15);
    if (free < this.tier.shadowLights) this.shadowDirty = true;
  }

  // ---- the frame -----------------------------------------------------------------------------------------------------------

  /** Draws the scene. Returns false if the context is gone. */
  frame(f: Frame3D, dt: number): boolean {
    if (this.lost || !this.geom) return false;
    const t0 = performance.now();
    this.current = f;
    this.renderer.info.reset();
    this.syncGeometry();

    // The camera, from the 2D game's own: the centre of the screen on the ground, snapped to whole device pixels so the
    // pixel art holds still.
    const unit = TILE * f.zoom;
    const camX = Math.round(f.camX * f.zoom) / f.zoom;
    const camYs = Math.round(f.camY * f.zoom * YS) / (f.zoom * YS);
    const halfW = f.width / (2 * unit);
    const halfH = f.height / (2 * unit);
    const cx = camX / TILE + halfW;
    const cz = camYs / TILE + (f.height / YS) / (2 * unit);
    const cam = this.camera;
    cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH;
    cam.position.set(cx, 40 * Math.sin(PITCH), cz + 40 * Math.cos(PITCH));
    cam.updateProjectionMatrix();

    this.fogMoving = this.fog.step(dt);
    const hx = f.focusX / TILE;
    const hz = f.focusY / TILE;
    this.assignTorches(hx, hz, f.explored);

    // Lights: the hero's, and the torches' flicker (intensity only: the shadow maps are not redrawn for it).
    this.heroLight.position.set(hx, 1.1, hz + 0.6);
    const now = f.now;
    for (let i = 0; i < 3; i++) {
      const cell = this.assigned[i]!;
      const light = this.torchLights[i]!;
      if (cell < 0) {
        light.intensity = 0;
        continue;
      }
      light.intensity = 9 * (0.86 + 0.14 * Math.sin(now / 70 + cell) * Math.sin(now / 23 + cell * 3));
    }

    // Sprites: characters, then what lies about, then flames.
    this.spriteCount = 0;
    this.blobCount = 0;
    this.shownCount = 0;
    f.view.puppets.forEach(this.puppetPass);
    this.addItems(f);
    this.addFlames(f);
    this.sprites.count = this.spriteCount;
    this.blobs.count = this.blobCount;
    this.sprites.instanceMatrix.clearUpdateRanges();
    this.sprites.instanceMatrix.addUpdateRange(0, this.spriteCount * 16);
    this.sprites.instanceMatrix.needsUpdate = true;
    this.sprites.instanceColor!.clearUpdateRanges();
    this.sprites.instanceColor!.addUpdateRange(0, this.spriteCount * 3);
    this.sprites.instanceColor!.needsUpdate = true;
    this.spriteUv.clearUpdateRanges();
    this.spriteUv.addUpdateRange(0, this.spriteCount * 4);
    this.spriteUv.needsUpdate = true;
    this.blobs.instanceMatrix.clearUpdateRanges();
    this.blobs.instanceMatrix.addUpdateRange(0, this.blobCount * 16);
    this.blobs.instanceMatrix.needsUpdate = true;
    this.atlas.flush();

    // Water drifts as it does in 2D: the texture slides.
    const drift = ((now / 120) % 32) / 32;
    this.waterTex!.offset.set(drift, drift * 0.5);

    if (this.dust && this.tier.particles) this.moveDust(now, hx, hz);

    if (this.shadowDirty && this.shadowsOn) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowDirty = false;
    }
    this.measureBegin();
    this.renderer.render(this.scene, cam);
    this.measureEnd();
    const info = this.renderer.info;
    const p = this.perf;
    p.cpuMs = performance.now() - t0;
    p.calls = info.render.calls;
    p.triangles = info.render.triangles;
    p.textures = info.memory.textures;
    p.geometries = info.memory.geometries;
    this.overlay?.note(now, p, this.hz, this.tier.name);
    return true;
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
      this.sprite(items, (heap.sprite % 8) * 16, Math.floor(heap.sprite / 8) * 16, 16, 16, false, x, 0.02 + bob, z, 0.7, 0.7, 1);
      if (visible[heap.pos]) this.shadow(x, z, 0.6);
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

  private addFlames(f: Frame3D): void {
    const sheet = worldSheet('ambient1');
    const frames = sheet?.anims.torch;
    if (!sheet || !frames || frames.length === 0) return;
    const torches = this.geom!.torches;
    const cycle = f.now * 0.01;
    for (let i = 0; i < torches.length; i++) {
      const cell = torches[i]!;
      if (!f.explored[cell]) continue;
      const frame = frames[Math.floor(cycle + cell) % frames.length]!;
      this.sprite(
        sheet.image, frame.x, frame.y, frame.w, frame.h, false,
        (cell % WIDTH) + 0.5, WALL_H - 0.04, Math.trunc(cell / WIDTH) + 0.97, FLAME_SIZE, FLAME_SIZE, 1.9,
      );
    }
  }

  // ---- dust ----------------------------------------------------------------------------------------------------------------

  /** Called once after construction when the tier has particles. */
  enableParticles(): void {
    if (this.dust) return;
    const count = 48;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage));
    for (let i = 0; i < count * 3; i++) this.dustPhase[i] = Math.random() * 6.28;
    const material = new PointsMaterial({
      map: this.dot, size: 2.5, sizeAttenuation: false, color: new Color(0xffe6b8), transparent: true, opacity: 0.55,
      depthWrite: false, blending: AdditiveBlending,
    });
    this.dust = new Points(geometry, material);
    this.dust.frustumCulled = false;
    this.dust.visible = this.tier.particles;
    this.scene.add(this.dust);
  }

  private moveDust(now: number, hx: number, hz: number): void {
    const position = this.dust!.geometry.getAttribute('position') as BufferAttribute;
    const a = position.array as Float32Array;
    const t = now / 1000;
    for (let i = 0; i < 48; i++) {
      const p = this.dustPhase;
      a[i * 3] = hx + Math.sin(t * 0.21 + p[i * 3]!) * 4.5 + Math.sin(t * 0.5 + p[i * 3 + 1]!) * 0.4;
      a[i * 3 + 1] = 0.25 + ((t * 0.05 + p[i * 3 + 1]! * 0.16) % 1) * 1.1;
      a[i * 3 + 2] = hz + Math.cos(t * 0.17 + p[i * 3 + 2]!) * 4.5;
    }
    position.needsUpdate = true;
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
  get quads(): { floor: number; boxes: number; water: number } | null {
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
    this.waterMaterial?.dispose();
    this.tiles?.dispose();
    this.waterTex?.dispose();
    this.atlas.dispose();
    this.fog.dispose();
    this.blob.dispose();
    this.dot.dispose();
    for (const mesh of [this.sprites, this.blobs] as const) {
      mesh.geometry.dispose();
      (mesh.material as MeshLambertMaterial).dispose();
      mesh.dispose();
    }
    if (this.dust) {
      this.dust.geometry.dispose();
      (this.dust.material as PointsMaterial).dispose();
    }
    for (const light of this.torchLights) light.shadow.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.geom = null;
  }
}
