/*
 * The kit's bloom (hd2d-kit.json `bloom`: threshold, strength, radius), the way the designer's viewer has it (the frame in linear light,
 * a blurred copy of what is brighter than the threshold added on, then the tone map), made cheap for a phone:
 *
 *   scene  - the frame is drawn into a half-float target instead of the canvas. It is the canvas as it was: the same blending in the
 *            same (sRGB-encoded) space, so every alpha in the scene looks as it did, only not tone-mapped yet and not clamped.
 *   bright - one pass reads it, keeps what is over the threshold and goes down to a quarter of the size.
 *   blur   - a dual-filter blur (Kawase): down to an eighth and a sixteenth, then back up, each step added onto the larger one:
 *            five small passes over targets of 1/4, 1/8 and 1/16 of the screen.
 *   output - the one pass over the full frame: the scene itself (read at each pixel's own centre, so the art is not filtered at all)
 *            plus the glow times the kit's strength, tone-mapped (the renderer's own, exposure included) and written to the canvas.
 *
 * Only light is added: the base image is never blurred. Nothing is made while a frame is drawn; the targets and the six materials
 * are made once and the uniforms written in place. It is for the two highest tiers (governor.ts): below them the scene is drawn
 * straight to the canvas as before, and none of this exists.
 */
import {
  BufferAttribute, BufferGeometry, CustomBlending, HalfFloatType, LinearFilter, Mesh, NoToneMapping, OneFactor, OrthographicCamera, RGBAFormat,
  type Camera, Scene, ShaderMaterial, SRGBColorSpace, Vector2, WebGLRenderTarget, type WebGLRenderer,
} from 'three';
import type { Kit } from './kit';

/** Whether the device can draw into a half-float target (the glow needs light above 1, and a copy of the frame that is not clamped). */
export function canPost(renderer: WebGLRenderer): boolean {
  return renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
}

/**
 * The weights the blur's two upward steps add the smaller levels with, from the kit's radius (its UnrealBloom mixes five mips, each
 * weighted from 1.0 down to 0.2 by `lerp(f, 1.2 - f, radius)`: the larger the radius, the more of the wide glow).
 */
export function bloomWeights(radius: number): { mid: number; wide: number } {
  const lerp = (f: number): number => f + (1.2 - f - f) * radius;
  return { mid: lerp(0.8) / lerp(1), wide: lerp(0.6) / lerp(1) };
}

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** sRGB-encoded (and possibly above 1) to linear: three's own encoding, undone. */
const DECODE = `
vec3 decode(vec3 c) {
  vec3 lo = c * 0.0773993808;
  vec3 hi = pow(max(c, vec3(0.0)) * 0.9478672986 + vec3(0.0521327014), vec3(2.4));
  return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.04045))));
}`;

const BRIGHT = `
uniform sampler2D tScene;
uniform vec2 uTexel;
uniform vec2 uThreshold;
varying vec2 vUv;
${DECODE}
vec4 tap(vec2 offset) {
  vec4 texel = texture2D(tScene, vUv + offset * uTexel);
  vec3 c = decode(texel.rgb);
  // The brightest channel counts as much as the luminance: a red lava or a green fungus is bright without being luminous.
  float luma = max(dot(c, vec3(0.299, 0.587, 0.114)), 0.6 * max(c.r, max(c.g, c.b)));
  float k = smoothstep(uThreshold.x, uThreshold.x + uThreshold.y, luma);
  c = min(c, vec3(6.0));
  // A single hot pixel must not make the glow flicker as the camera creeps: the taps are averaged with weights falling with their brightness.
  float w = 1.0 / (1.0 + luma);
  // The frame's alpha says how much of the pixel may glow: all of the terrain and the light effects, none of a plain figure (which would
  // only be bleached by the torch beside it), the strength of its own glow for one that glows (world3d.ts, fogofwar.ts).
  return vec4(c * k * w * texel.a, w);
}
void main() {
  vec4 sum = tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) + tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0));
  gl_FragColor = vec4(sum.rgb / sum.a, 1.0);
}`;

const DOWN = `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tSrc, vUv).rgb * 4.0;
  sum += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  sum += texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  sum += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  sum += texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  gl_FragColor = vec4(sum * 0.125, 1.0);
}`;

const UP = `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec2 h = uTexel * 0.5;
  vec3 sum = texture2D(tSrc, vUv + vec2(-2.0 * h.x, 0.0)).rgb;
  sum += texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0;
  sum += texture2D(tSrc, vUv + vec2(0.0, 2.0 * h.y)).rgb;
  sum += texture2D(tSrc, vUv + vec2(h.x, h.y)).rgb * 2.0;
  sum += texture2D(tSrc, vUv + vec2(2.0 * h.x, 0.0)).rgb;
  sum += texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0;
  sum += texture2D(tSrc, vUv + vec2(0.0, -2.0 * h.y)).rgb;
  sum += texture2D(tSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  gl_FragColor = vec4(sum * (uWeight / 12.0), 1.0);
}`;

const OUTPUT = `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uSize;
uniform float uStrength;
uniform float uHeat;
uniform float uTime;
${DECODE}
void main() {
  // The pixel's own centre: the art is read as it is, never filtered.
  vec2 px = floor(gl_FragCoord.xy);
  vec2 uv = (px + 0.5) / uSize;
  if (uHeat > 0.0) {
    // The heat haze over what burns (the kit's haze pass of the halls): the picture is read a pixel or so off, by whole pixels, in slow
    // waves, where the glow is (the lava, the flames), none elsewhere. The art is moved, never blurred.
    float heat = clamp(dot(texture2D(tBloom, uv).rgb, vec3(0.3, 0.5, 0.2)) * 3.0, 0.0, 1.0);
    vec2 wave = vec2(sin(px.y * 0.11 + uTime * 3.1), sin(px.x * 0.09 + px.y * 0.05 - uTime * 2.3));
    px += floor(wave * uHeat * heat + 0.5);
    uv = (px + 0.5) / uSize;
  }
  vec4 base = texture2D(tScene, uv);
  // Light is added over a figure too, but gently: its colours stay its own.
  vec3 c = decode(base.rgb) + texture2D(tBloom, uv).rgb * uStrength * mix(0.3, 1.0, base.a);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function pass(fragment: string, uniforms: ShaderMaterial['uniforms'], additive = false): ShaderMaterial {
  return new ShaderMaterial({
    uniforms, vertexShader: VERTEX, fragmentShader: fragment, depthTest: false, depthWrite: false,
    ...(additive ? { blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor, transparent: true } : {}),
  });
}

function target(width: number, height: number, depth: boolean): WebGLRenderTarget {
  return new WebGLRenderTarget(width, height, {
    type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: depth, stencilBuffer: false, generateMipmaps: false,
  });
}

export class Post {
  /** The frame is drawn into this. */
  readonly scene: WebGLRenderTarget;
  private readonly quarter: WebGLRenderTarget;
  private readonly eighth: WebGLRenderTarget;
  private readonly sixteenth: WebGLRenderTarget;
  private readonly bright: ShaderMaterial;
  private readonly downToEighth: ShaderMaterial;
  private readonly downToSixteenth: ShaderMaterial;
  private readonly upToEighth: ShaderMaterial;
  private readonly upToQuarter: ShaderMaterial;
  private readonly output: ShaderMaterial;
  private readonly screen = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly triangle: Mesh;
  private readonly size = new Vector2(1, 1);
  private readonly texel = {
    scene: new Vector2(), quarter: new Vector2(), eighth: new Vector2(), sixteenth: new Vector2(),
  };

  constructor(kit: Kit['bloom']) {
    this.scene = target(1, 1, true);
    // The target is drawn the way the canvas is (colours encoded as sRGB in the shaders), so that the blending of everything in the
    // frame is the one the game was made with; its tone map is off while it is drawn (world3d.ts) and applied by `output` below.
    this.scene.texture.colorSpace = SRGBColorSpace;
    (this.scene as WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    this.quarter = target(1, 1, false);
    this.eighth = target(1, 1, false);
    this.sixteenth = target(1, 1, false);
    const w = bloomWeights(kit.radius);
    this.bright = pass(BRIGHT, { tScene: { value: this.scene.texture }, uTexel: { value: this.texel.scene }, uThreshold: { value: new Vector2(kit.threshold, 0.12) } });
    this.downToEighth = pass(DOWN, { tSrc: { value: this.quarter.texture }, uTexel: { value: this.texel.quarter } });
    this.downToSixteenth = pass(DOWN, { tSrc: { value: this.eighth.texture }, uTexel: { value: this.texel.eighth } });
    // (Each step up is added onto the larger level, weighted: the eighth carries `mid`, the sixteenth `wide`.)
    this.upToEighth = pass(UP, { tSrc: { value: this.sixteenth.texture }, uTexel: { value: this.texel.sixteenth }, uWeight: { value: w.wide } }, true);
    this.upToQuarter = pass(UP, { tSrc: { value: this.eighth.texture }, uTexel: { value: this.texel.eighth }, uWeight: { value: w.mid } }, true);
    this.output = new ShaderMaterial({
      uniforms: { tScene: { value: this.scene.texture }, tBloom: { value: this.quarter.texture }, uSize: { value: this.size }, uStrength: { value: kit.strength }, uHeat: { value: 0 }, uTime: { value: 0 } },
      vertexShader: VERTEX, fragmentShader: OUTPUT, depthTest: false, depthWrite: false,
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.triangle = new Mesh(geometry, this.bright);
    this.triangle.frustumCulled = false;
    this.screen.add(this.triangle);
  }

  /** The canvas's size in device pixels (the renderer draws at a pixel ratio of 1). */
  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.scene.width === w && this.scene.height === h) return;
    this.size.set(w, h);
    this.scene.setSize(w, h);
    const q = [Math.max(1, Math.ceil(w / 4)), Math.max(1, Math.ceil(h / 4))] as const;
    const e = [Math.max(1, Math.ceil(q[0] / 2)), Math.max(1, Math.ceil(q[1] / 2))] as const;
    const s = [Math.max(1, Math.ceil(e[0] / 2)), Math.max(1, Math.ceil(e[1] / 2))] as const;
    this.quarter.setSize(q[0], q[1]);
    this.eighth.setSize(e[0], e[1]);
    this.sixteenth.setSize(s[0], s[1]);
    this.texel.scene.set(1 / w, 1 / h);
    this.texel.quarter.set(1 / q[0], 1 / q[1]);
    this.texel.eighth.set(1 / e[0], 1 / e[1]);
    this.texel.sixteenth.set(1 / s[0], 1 / s[1]);
  }

  /** Draws the scene into the frame's target (or another drawn the same way), with the tone map off (the output pass applies it). */
  renderScene(renderer: WebGLRenderer, scene: Scene, camera: Camera, into: WebGLRenderTarget = this.scene): void {
    const tone = renderer.toneMapping;
    renderer.setRenderTarget(into);
    renderer.toneMapping = NoToneMapping;
    renderer.render(scene, camera);
    renderer.toneMapping = tone;
  }

  private draw(renderer: WebGLRenderer, material: ShaderMaterial, to: WebGLRenderTarget | null): void {
    this.triangle.material = material;
    renderer.setRenderTarget(to);
    renderer.render(this.screen, this.camera);
  }

  /**
   * Starts compiling the programs of every pass, each in the state it is drawn in (the small passes into their half-float targets with no
   * tone map, the output pass to the canvas with the renderer's own), so that the first frame with the bloom does not wait for them.
   * Returns what to wait for.
   */
  compile(renderer: WebGLRenderer): Array<Promise<unknown>> {
    const jobs: Array<Promise<unknown>> = [];
    const tone = renderer.toneMapping;
    const before = renderer.getRenderTarget();
    renderer.toneMapping = NoToneMapping;
    const passes: ReadonlyArray<readonly [ShaderMaterial, WebGLRenderTarget]> = [
      [this.bright, this.quarter], [this.downToEighth, this.eighth], [this.downToSixteenth, this.sixteenth], [this.upToEighth, this.eighth], [this.upToQuarter, this.quarter],
    ];
    for (const [material, to] of passes) {
      this.triangle.material = material;
      renderer.setRenderTarget(to);
      jobs.push(renderer.compileAsync(this.screen, this.camera));
    }
    renderer.toneMapping = tone;
    this.triangle.material = this.output;
    renderer.setRenderTarget(null);
    jobs.push(renderer.compileAsync(this.screen, this.camera));
    renderer.setRenderTarget(before);
    return jobs;
  }

  /** Draws the small passes once into their targets (not the output pass: nothing reaches the canvas), so the targets are on the card. */
  warm(renderer: WebGLRenderer): void {
    const clear = renderer.autoClear;
    renderer.autoClear = false;
    const tone = renderer.toneMapping;
    renderer.toneMapping = NoToneMapping;
    this.draw(renderer, this.bright, this.quarter);
    this.draw(renderer, this.downToEighth, this.eighth);
    this.draw(renderer, this.downToSixteenth, this.sixteenth);
    this.draw(renderer, this.upToEighth, this.eighth);
    this.draw(renderer, this.upToQuarter, this.quarter);
    renderer.toneMapping = tone;
    renderer.setRenderTarget(null);
    renderer.autoClear = clear;
  }

  /** The heat haze of the level, in pixels (0 for none): the output pass moves the picture this far where the glow is. */
  setHeat(pixels: number): void {
    this.output.uniforms.uHeat!.value = pixels;
  }

  /** The glow and the canvas: five small passes and the one over the whole frame. `seconds`: the clock of the heat haze. */
  composite(renderer: WebGLRenderer, seconds = 0): void {
    this.output.uniforms.uTime!.value = seconds;
    const clear = renderer.autoClear;
    renderer.autoClear = false;
    const tone = renderer.toneMapping;
    renderer.toneMapping = NoToneMapping;
    // Bright to a quarter; down to an eighth and a sixteenth; each back up onto the one above it.
    this.draw(renderer, this.bright, this.quarter);
    this.draw(renderer, this.downToEighth, this.eighth);
    this.draw(renderer, this.downToSixteenth, this.sixteenth);
    this.draw(renderer, this.upToEighth, this.eighth);
    this.draw(renderer, this.upToQuarter, this.quarter);
    renderer.toneMapping = tone;
    this.draw(renderer, this.output, null);
    renderer.autoClear = clear;
  }

  dispose(): void {
    for (const t of [this.scene, this.quarter, this.eighth, this.sixteenth]) t.dispose();
    for (const m of [this.bright, this.downToEighth, this.downToSixteenth, this.upToEighth, this.upToQuarter, this.output]) m.dispose();
    this.triangle.geometry.dispose();
  }
}
