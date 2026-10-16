/*
 * High grass (and, in the caves, the glowing fungus that grows as it) as the kit says: crossed billboards standing over their cell
 * (hd2d-kit.json materials.high_grass: "crossed billboards per cell, sway 0.6 Hz"), two quads a cell turned a quarter apart (an X
 * from above), cut out of the region's own grass tile. All of it is one InstancedMesh, one draw call:
 *
 *   - an instance is a cell: its place and a little height of its own, and which way its picture faces. They are written when the
 *     level's grass changes (a level is made, grass is trampled), never in a frame;
 *   - the sway (0.6 Hz, each cell on its own phase) and the way it parts as the hero comes near (the tops lean away and the blades
 *     shorten) are in the vertex shader, which reads the hero from the same uniforms as the fog;
 *   - when the hero tramples a cell (the rules turn high grass into short grass, which is the floor's own tile, so the terrain change is
 *     what is followed) its crossed quads fold flat in a third of a second and are then gone: only the instances that are falling are
 *     touched, and only until they are done.
 *
 * Short grass stays a decal on the floor (the floor tile itself). Fog of war, haze, light and shadow are the other terrain's, by
 * `withFog`. Nothing is made while a frame is drawn.
 */
import {
  BufferAttribute, BufferGeometry, CanvasTexture, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, MeshLambertMaterial, NearestFilter,
  SRGBColorSpace,
} from 'three';
import { LENGTH, WIDTH } from '@pd/core';
import { type AirUniforms, withFog } from './fogofwar';
import { LEAN, LEAN_STRETCH } from './project';

/** How high the blades stand, in cells (before the lean's stretch), how wide each quad is, and how long a trampled cell takes to fold flat (ms). */
export const GRASS_H = 0.95;
const QUAD_W = 1.36;
export const FOLD_MS = 320;
/** The most cells drawn: more than a level has. */
export const GRASS_CAPACITY = Math.min(LENGTH, 1400);

/** A cell's own height, from the cell: the same grass is a little different from cell to cell (0.9 to 1.1). */
export const grassHeight = (cell: number): number => 0.9 + ((Math.imul(cell, 2654435761) >>> 24) / 255) * 0.2;

/** Whether a cell's picture faces the other way: every other cell, by a hash of the cell so that rows do not show. */
export const grassFlip = (cell: number): boolean => ((Math.imul(cell, 2246822519) >>> 28) & 1) === 1;

/** The two crossed quads in one geometry: eight vertices, leaned back toward the camera like the sprites. */
export function crossedQuads(): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const upY = GRASS_H * LEAN_STRETCH * Math.cos(LEAN);
  const upZ = -GRASS_H * LEAN_STRETCH * Math.sin(LEAN);
  [Math.PI / 4, -Math.PI / 4].forEach((yaw, q) => {
    const ax = (Math.cos(yaw) * QUAD_W) / 2;
    const az = (Math.sin(yaw) * QUAD_W) / 2;
    const v = q * 4;
    pos.push(-ax, 0, -az, ax, 0, az, ax, upY, az + upZ, -ax, upY, -az + upZ);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    index.push(v, v + 1, v + 2, v, v + 2, v + 3);
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  // The light on a blade is the floor's: the normal stands straight up.
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(Array.from({ length: 8 }, () => [0, 1, 0]).flat()), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geometry.setIndex(index);
  return geometry;
}

const nearest = (canvas: HTMLCanvasElement): CanvasTexture => {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  return texture;
};

/**
 * The sway, the parting and the fold, added to the vertex shader after the fog's: `h` is how far up the blade a vertex is, 0 at the foot
 * to 1 at the top, and the foot never moves.
 */
function withSway(material: MeshLambertMaterial, selfLight: number): void {
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFold;\nuniform vec2 uHero;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '{',
          `  float h = clamp(transformed.y / ${(GRASS_H * LEAN_STRETCH * Math.cos(LEAN)).toFixed(4)}, 0.0, 1.0);`,
          '  vec3 org = instanceMatrix[3].xyz;',
          '  float phase = org.x * 1.7 + org.z * 2.3;',
          // 0.6 Hz, each cell on its own phase, with a slower breath under it.
          '  float sway = sin(uTime * 3.77 + phase) * 0.05 + sin(uTime * 1.9 + phase * 1.7) * 0.02;',
          // The hero parts the grass: within about a cell the tops lean away and the blades shorten.
          '  vec2 away = org.xz - uHero;',
          '  float d = length(away);',
          '  float part = smoothstep(1.2, 0.3, d);',
          '  vec2 dir = away / max(d, 0.001);',
          '  transformed.x += (sway + dir.x * part * 0.4) * h;',
          '  transformed.z += (dir.y * part * 0.4) * h;',
          '  transformed.y *= (1.0 - 0.3 * part) * (1.0 - 0.9 * aFold);',
          '}',
        ].join('\n'),
      );
  };
  // A blade is never black: a little of its own colour is its own light, as a figure's is (the kit's sprites.selfLight).
  const fragment = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    fragment.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * ${selfLight.toFixed(6)};`,
    );
  };
  material.customProgramCacheKey = () => `${key.call(material)}-sway-${selfLight}`;
}

export class Grass {
  readonly mesh: InstancedMesh;
  readonly material: MeshLambertMaterial;
  private readonly textures: CanvasTexture[];
  private readonly uv: InstancedBufferAttribute;
  private readonly fold: InstancedBufferAttribute;
  private readonly cell = new Int32Array(GRASS_CAPACITY);
  /** When each cell began to fold (ms), or -1 for one that stands. */
  private readonly foldAt = new Float64Array(GRASS_CAPACITY).fill(-1);
  private count = 0;
  private folding = 0;
  private readonly next = new Uint8Array(LENGTH);
  private readonly has = new Uint8Array(LENGTH);

  constructor(air: AirUniforms, color: HTMLCanvasElement, glow: HTMLCanvasElement, selfLight: number) {
    const geometry = crossedQuads();
    this.textures = [nearest(color), nearest(glow)];
    this.material = new MeshLambertMaterial({ map: this.textures[0]!, emissiveMap: this.textures[1]!, emissive: 0xffffff, alphaTest: 0.5, side: DoubleSide });
    withFog(this.material, air, 'instance');
    withSway(this.material, selfLight);
    this.uv = new InstancedBufferAttribute(new Float32Array(GRASS_CAPACITY * 4), 4).setUsage(DynamicDrawUsage);
    this.fold = new InstancedBufferAttribute(new Float32Array(GRASS_CAPACITY), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute('aUv', this.uv);
    geometry.setAttribute('aFold', this.fold);
    this.mesh = new InstancedMesh(geometry, this.material, GRASS_CAPACITY);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  /** The picture's textures (the warm-up sends them to the card before they are first drawn). */
  get pictures(): CanvasTexture[] {
    return this.textures;
  }

  /** Cells that are drawn now (those that stand, and those folding). */
  get drawn(): number {
    return this.count;
  }

  /**
   * The cells that carry high grass now. Cells that did and no longer do (trampled) fold flat from `now`; new ones stand. Called when
   * a level is made and when its terrain changes, not in a frame.
   */
  set(cells: ArrayLike<number>, now: number, snap = false): void {
    const next = this.next;
    next.fill(0);
    for (let i = 0; i < cells.length; i++) next[cells[i]!] = 1;
    let kept = 0;
    this.has.fill(0);
    for (let i = 0; i < this.count; i++) {
      const c = this.cell[i]!;
      let fold = this.foldAt[i]!;
      if (snap) continue;
      if (fold < 0 && !next[c]) fold = now;
      if (fold >= 0 && now - fold >= FOLD_MS) continue;
      this.cell[kept] = c;
      this.foldAt[kept] = fold;
      if (fold < 0) this.has[c] = 1;
      kept++;
    }
    for (let i = 0; i < cells.length && kept < GRASS_CAPACITY; i++) {
      const c = cells[i]!;
      if (this.has[c]) continue;
      this.cell[kept] = c;
      this.foldAt[kept] = -1;
      this.has[c] = 1;
      kept++;
    }
    this.count = kept;
    this.write(now);
  }

  /** Writes every instance from its cell and fold. */
  private write(now: number): void {
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const uv = this.uv.array as Float32Array;
    const fold = this.fold.array as Float32Array;
    this.folding = 0;
    for (let i = 0; i < this.count; i++) {
      const c = this.cell[i]!;
      const o = i * 16;
      m.fill(0, o, o + 16);
      m[o] = 1; m[o + 5] = grassHeight(c); m[o + 10] = 1; m[o + 15] = 1;
      m[o + 12] = (c % WIDTH) + 0.5;
      m[o + 14] = Math.trunc(c / WIDTH) + 0.5;
      const flip = grassFlip(c);
      uv[i * 4] = flip ? 1 : 0; uv[i * 4 + 1] = 0; uv[i * 4 + 2] = flip ? -1 : 1; uv[i * 4 + 3] = 1;
      const at = this.foldAt[i]!;
      fold[i] = at < 0 ? 0 : Math.min(1, Math.max(0, (now - at) / FOLD_MS));
      if (at >= 0) this.folding++;
    }
    this.upload();
  }

  private upload(): void {
    const mesh = this.mesh;
    mesh.count = this.count;
    mesh.visible = this.count > 0;
    if (this.count === 0) return;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, this.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    this.uv.clearUpdateRanges();
    this.uv.addUpdateRange(0, this.count * 4);
    this.uv.needsUpdate = true;
    this.fold.clearUpdateRanges();
    this.fold.addUpdateRange(0, this.count);
    this.fold.needsUpdate = true;
  }

  /** Brings the folding cells to `now`; the ones that are flat are taken out. Nothing happens while none is folding. */
  frame(now: number): void {
    if (this.folding === 0) return;
    const fold = this.fold.array as Float32Array;
    let done = false;
    for (let i = 0; i < this.count; i++) {
      const at = this.foldAt[i]!;
      if (at < 0) continue;
      const k = Math.min(1, (now - at) / FOLD_MS);
      fold[i] = k;
      if (k >= 1) done = true;
    }
    if (done) {
      // The finished ones go: the standing cells stay as they are (the cells are the instances' own record).
      let kept = 0;
      for (let i = 0; i < this.count; i++) {
        if (this.foldAt[i]! >= 0 && now - this.foldAt[i]! >= FOLD_MS) continue;
        this.cell[kept] = this.cell[i]!;
        this.foldAt[kept] = this.foldAt[i]!;
        kept++;
      }
      this.count = kept;
      this.write(now);
    } else {
      this.fold.clearUpdateRanges();
      this.fold.addUpdateRange(0, this.count);
      this.fold.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    for (const t of this.textures) t.dispose();
    this.mesh.dispose();
  }
}

/** Most tufts at once: three for each of the figures that stand in short grass. */
export const TUFT_CAPACITY = 96;

/**
 * A few blades of short grass in front of the feet of whoever stands in it (the floor's grass is a decal, so it is under a figure's feet;
 * these stand over them): small crossed quads cut from the short-grass tile, in the same shader as the high grass, in one draw. Written
 * a frame at a time, into arrays made once (`begin`, `add`, `end`); nothing at all, not even the draw, when no one stands in grass.
 */
export class Tufts {
  readonly mesh: InstancedMesh;
  readonly material: MeshLambertMaterial;
  private readonly textures: CanvasTexture[];
  private readonly m: Float32Array;
  private count = 0;

  constructor(air: AirUniforms, color: HTMLCanvasElement, glow: HTMLCanvasElement, selfLight: number) {
    const geometry = crossedQuads();
    this.textures = [nearest(color), nearest(glow)];
    this.material = new MeshLambertMaterial({ map: this.textures[0]!, emissiveMap: this.textures[1]!, emissive: 0xffffff, alphaTest: 0.5, side: DoubleSide });
    withFog(this.material, air, 'instance');
    withSway(this.material, selfLight);
    const whole = new Float32Array(TUFT_CAPACITY * 4);
    for (let i = 0; i < TUFT_CAPACITY; i++) { whole[i * 4 + 2] = 1; whole[i * 4 + 3] = 1; }
    geometry.setAttribute('aUv', new InstancedBufferAttribute(whole, 4));
    geometry.setAttribute('aFold', new InstancedBufferAttribute(new Float32Array(TUFT_CAPACITY), 1));
    this.mesh = new InstancedMesh(geometry, this.material, TUFT_CAPACITY);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.m = this.mesh.instanceMatrix.array as Float32Array;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  get pictures(): CanvasTexture[] {
    return this.textures;
  }

  begin(): void {
    this.count = 0;
  }

  /** A tuft standing at (x, z) (cells), `size` cells across. */
  add(x: number, z: number, size: number): void {
    if (this.count >= TUFT_CAPACITY) return;
    const o = this.count++ * 16;
    const m = this.m;
    m.fill(0, o, o + 16);
    m[o] = size; m[o + 5] = size; m[o + 10] = size; m[o + 15] = 1;
    m[o + 12] = x; m[o + 13] = 0; m[o + 14] = z;
  }

  end(): void {
    const mesh = this.mesh;
    mesh.count = this.count;
    mesh.visible = this.count > 0;
    if (this.count === 0) return;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, this.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    for (const t of this.textures) t.dispose();
    this.mesh.dispose();
  }
}
