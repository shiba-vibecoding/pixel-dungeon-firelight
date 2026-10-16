/*
 * A batch of soft little quads in one draw: particles, halos, shadows, ripples, rings, clouds of gas, decals. One InstancedMesh each,
 * its own tiny shader (no lights: these are light themselves, or shade), added on or blended, never writing depth, so any number of
 * them cost one call and no sorting. Each instance has its matrix, a rectangle of its texture and a colour with alpha; each is dimmed
 * by the fog of war where it stands (the same 48 x 48 texture the terrain reads), so nothing glows in the dark of the unknown.
 * Nothing is made while a frame is drawn: the arrays are written in place.
 */
import {
  AdditiveBlending, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, NormalBlending, PlaneGeometry, ShaderMaterial, type Texture,
} from 'three';
import { HEIGHT, WIDTH } from '@pd/core';
import { LEAN, PITCH } from './project';

const VERTEX = `
attribute vec4 aUv;
attribute vec4 aColor;
uniform sampler2D tFog;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
void main() {
  vUv = aUv.xy + uv * aUv.zw;
  vColor = aColor;
  vec4 origin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vFog = texture2D(tFog, vec2(origin.x / ${WIDTH}.0, origin.z / ${HEIGHT}.0)).r;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = `
uniform sampler2D map;
uniform float uUseMap;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
void main() {
  vec4 c = vColor;
  if (uUseMap > 0.5) c *= texture2D(map, vUv);
  // Seen cells only: the unknown and (more softly) the remembered are dark, and what glows there does not.
  c.a *= 1.0 - smoothstep(0.25, 0.75, vFog);
  if (c.a < 0.004) discard;
  gl_FragColor = c;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * A mesh that never moves as an object (its vertices or instances carry every place): its matrix is the identity for good, so the scene's
 * walk each frame leaves it out (`matrixWorldAutoUpdate`), and never composes one for it.
 */
export function still<T extends { matrixAutoUpdate: boolean; matrixWorldAutoUpdate: boolean }>(object: T): T {
  object.matrixAutoUpdate = false;
  object.matrixWorldAutoUpdate = false;
  return object;
}

export interface QuadBatchOptions {
  capacity: number;
  texture: Texture | null;
  /** Added onto what is behind (light) rather than blended over it (smoke, shade). */
  additive: boolean;
  fog: { value: Texture };
  renderOrder: number;
  /** Hidden by walls in front of it (the default), or not. */
  depthTest?: boolean;
}

export class QuadBatch {
  readonly mesh: InstancedMesh;
  readonly material: ShaderMaterial;
  /** How many are in this frame's batch. */
  count = 0;
  readonly capacity: number;
  private readonly m: Float32Array;
  private readonly uv: InstancedBufferAttribute;
  private readonly col: InstancedBufferAttribute;

  constructor(o: QuadBatchOptions) {
    this.capacity = o.capacity;
    const quad = new PlaneGeometry(1, 1);
    this.uv = new InstancedBufferAttribute(new Float32Array(o.capacity * 4), 4).setUsage(DynamicDrawUsage);
    this.col = new InstancedBufferAttribute(new Float32Array(o.capacity * 4), 4).setUsage(DynamicDrawUsage);
    quad.setAttribute('aUv', this.uv);
    quad.setAttribute('aColor', this.col);
    this.material = new ShaderMaterial({
      uniforms: { map: { value: o.texture }, uUseMap: { value: o.texture ? 1 : 0 }, tFog: o.fog },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: o.depthTest ?? true,
      blending: o.additive ? AdditiveBlending : NormalBlending,
    });
    this.mesh = new InstancedMesh(quad, this.material, o.capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.m = this.mesh.instanceMatrix.array as Float32Array;
    this.mesh.frustumCulled = false;
    still(this.mesh);
    this.mesh.renderOrder = o.renderOrder;
    this.mesh.count = 0;
  }

  begin(): void {
    this.count = 0;
  }

  private slot(): number {
    return this.count < this.capacity ? this.count++ : -1;
  }

  private colour(i: number, u: number, v: number, du: number, dv: number, r: number, g: number, b: number, a: number): void {
    const q = i * 4;
    const uv = this.uv.array as Float32Array;
    uv[q] = u; uv[q + 1] = v; uv[q + 2] = du; uv[q + 3] = dv;
    const c = this.col.array as Float32Array;
    c[q] = r; c[q + 1] = g; c[q + 2] = b; c[q + 3] = a;
  }

  /** A quad facing the camera, centred on (x, y, z), `w` wide and `h` tall (tiles). The texture rectangle is (u, v, du, dv). */
  billboard(x: number, y: number, z: number, w: number, h: number, u: number, v: number, du: number, dv: number, r: number, g: number, b: number, a: number): void {
    const i = this.slot();
    if (i < 0) return;
    const m = this.m;
    const o = i * 16;
    const s = Math.sin(PITCH);
    const c = Math.cos(PITCH);
    m[o] = w; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = h * c; m[o + 6] = -h * s; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = s; m[o + 10] = c; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    this.colour(i, u, v, du, dv, r, g, b, a);
  }

  /** A quad lying on the floor (at height y), `w` wide (x) and `d` deep (z), turned `rot` radians about the vertical. */
  flat(x: number, y: number, z: number, w: number, d: number, rot: number, u: number, v: number, du: number, dv: number, r: number, g: number, b: number, a: number): void {
    const i = this.slot();
    if (i < 0) return;
    const m = this.m;
    const o = i * 16;
    const s = Math.sin(rot);
    const c = Math.cos(rot);
    m[o] = w * c; m[o + 1] = 0; m[o + 2] = -w * s; m[o + 3] = 0;
    m[o + 4] = -d * s; m[o + 5] = 0; m[o + 6] = -d * c; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 1; m[o + 10] = 0; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    this.colour(i, u, v, du, dv, r, g, b, a);
  }

  /**
   * A quad standing leaned back toward the camera, as the sprites do: its middle at (x, y, z), `w` wide and `h` tall (the caller has made
   * it as tall as it should look), turned `rot` radians in its own plane (an effect flying along a path).
   */
  leaned(x: number, y: number, z: number, w: number, h: number, rot: number, u: number, v: number, du: number, dv: number, r: number, g: number, b: number, a: number): void {
    const i = this.slot();
    if (i < 0) return;
    const m = this.m;
    const o = i * 16;
    const sl = Math.sin(LEAN);
    const cl = Math.cos(LEAN);
    const s = Math.sin(rot);
    const c = Math.cos(rot);
    m[o] = w * c; m[o + 1] = w * s * cl; m[o + 2] = -w * s * sl; m[o + 3] = 0;
    m[o + 4] = -h * s; m[o + 5] = h * c * cl; m[o + 6] = -h * c * sl; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = sl; m[o + 10] = cl; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    this.colour(i, u, v, du, dv, r, g, b, a);
  }

  /** Uploads the frame's batch. */
  end(): void {
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
    this.col.clearUpdateRanges();
    this.col.addUpdateRange(0, this.count * 4);
    this.col.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
