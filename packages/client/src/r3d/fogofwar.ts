/*
 * The fog of war and the air of the level, as one thing the shaders read: a 48 x 48 texture (a cell's red byte: 0 in sight, 0.55
 * remembered, 1 unknown, eased from turn to turn; its other three bytes: the light of the level's fixed fires, torches, lava and
 * the like, baked once per level, lightrig.ts bakePools) that every vertex looks up where it stands, and the region's haze (the kit's
 * fog: near and far in cells from the hero, toward its colour). Nothing here is a pass: the terrain's and the sprites' own shaders
 * have the lines added by `withFog`.
 */
import { Color, DataTexture, LinearFilter, type MeshBasicMaterial, type MeshLambertMaterial, type MeshStandardMaterial, RGBAFormat, type Texture, UnsignedByteType, Vector2 } from 'three';
import { HEIGHT, LENGTH, WIDTH } from '@pd/core';
import {
  MEMORY_CONTRAST, MEMORY_DESATURATE, MEMORY_GLOW, MEMORY_GLOW_DESATURATE, MEMORY_LIFT, MEMORY_MID, MEMORY_POOL, MEMORY_TINT, POOL_STRENGTH,
} from './memory';

const vec3 = (v: readonly [number, number, number]): string => `vec3(${v[0].toFixed(3)}, ${v[1].toFixed(3)}, ${v[2].toFixed(3)})`;

/** How dark each state is (the 2D renderer's own numbers, render.ts). */
export const FOG_REMEMBERED = 0.55;
/**
 * What a remembered cell keeps of the look it has in the light (a share of its own colour, added in the shader, cool and washed out
 * so it still differs from what is in sight), and how strong a baked pool of fire light is at its middle.
 */
export { MEMORY_LIFT, POOL_STRENGTH };
const FOG_REVEAL_MS = 70;
const FOG_FORGET_MS = 260;

/** The uniforms the lines added by `withFog` read. */
export interface AirUniforms {
  tFog: { value: Texture };
  /** The hero, in cells (x, z). */
  uHero: { value: Vector2 };
  /** The haze begins and is whole at these distances from the hero, cells. */
  uHaze: { value: Vector2 };
  uFogColor: { value: Color };
  /** What the unknown fades to: the haze colour, dark. */
  uBg: { value: Color };
  /** Seconds, for the slow flicker of the baked fire light. */
  uTime: { value: number };
  /** The share of its colour a remembered cell keeps, and the pools' strength (MEMORY_LIFT, POOL_STRENGTH). */
  uMem: { value: number };
  uPool: { value: number };
  /** The low red mist of the demon halls (the kit's fog.mist): its opacity and its height in cells (0 for none), and its colour. */
  uMist: { value: Vector2 };
  uMistColor: { value: Color };
  /** The colour of the floor of the level in its light, in linear light: what a figure's feet take back from it (the bounce, SpriteLook.row). */
  uFloor: { value: Color };
  /** What lies below this height (world y) is not drawn by the terrain and water shaders: the mirror's pass sets it to the water's level, and it is far below the world otherwise. */
  uBelow: { value: number };
}

export function makeAir(fog: Texture): AirUniforms {
  return {
    tFog: { value: fog },
    uHero: { value: new Vector2() },
    uHaze: { value: new Vector2(9, 24) },
    uFogColor: { value: new Color(0x0e1a17) },
    uBg: { value: new Color(0x040605) },
    uTime: { value: 0 },
    uMem: { value: MEMORY_LIFT },
    uPool: { value: POOL_STRENGTH },
    uMist: { value: new Vector2(0, 0.4) },
    uMistColor: { value: new Color(0x5a1a10) },
    uFloor: { value: new Color(0.2, 0.18, 0.15) },
    uBelow: { value: -1000 },
  };
}

/** The fog of war as a texture: easing toward where each cell should be, with the baked light of the fixed fires beside it. */
export class Fog {
  readonly texture: DataTexture;
  private readonly dark = new Float32Array(LENGTH).fill(1);
  private readonly target = new Float32Array(LENGTH).fill(1);
  private readonly bytes = new Uint8Array(LENGTH * 4);
  /** The baked light of the fixed fires, one rgb byte triple a cell. */
  private readonly pools = new Uint8Array(LENGTH * 3);
  private easing = false;

  constructor() {
    for (let i = 0; i < LENGTH; i++) this.bytes[i * 4] = 255;
    this.texture = new DataTexture(this.bytes, WIDTH, HEIGHT, RGBAFormat, UnsignedByteType);
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

  /** The baked light of the level's fixed fires (lightrig.ts bakePools): rgb bytes, one triple a cell. */
  setPools(rgb: Uint8Array): void {
    this.pools.set(rgb);
    this.write();
  }

  private write(): void {
    const bytes = this.bytes;
    const pools = this.pools;
    for (let i = 0; i < LENGTH; i++) {
      const o = i * 4;
      const p = i * 3;
      bytes[o] = Math.round(this.dark[i]! * 255);
      bytes[o + 1] = pools[p]!;
      bytes[o + 2] = pools[p + 1]!;
      bytes[o + 3] = pools[p + 2]!;
    }
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

  /** How dark a cell is now, 0 to 1 (tests, the particles' spawns). */
  darkness(cell: number): number {
    return this.dark[cell] ?? 1;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

const NEWLINE = String.fromCharCode(10);

/**
 * What a sprite batch's material adds to the fog (firelight-sprites.md): a light of its own (`selfLight` of its colour, so a figure
 * is never black), and the one-pixel rim of the strongest light, picked on the CPU and sent per instance (`aRim`: direction as
 * -1/0/1 in the texture's own axes, `aRimColor`: the light's colour times its strength). `texel` is one art pixel in atlas uv.
 */
export interface SpriteLook {
  selfLight: number;
  texel: readonly [number, number];
  /** One row of the atlas in uv (1 / its height): the feet's shader counts the rows of a frame above its lowest opaque one. */
  row: number;
}

function spriteFragment(look: SpriteLook): string {
  const f = (n: number): string => n.toFixed(6);
  return [
    '#include <emissivemap_fragment>',
    `totalEmissiveRadiance += diffuseColor.rgb * ${f(look.selfLight)};`,
    // A figure stands on the floor (vFeet: the clear rows under its feet, the rows of water it wades in, and whether it is one): its
    // feet are a little darker where it meets the floor (the ambient light is shut out), the lower quarter takes back some of the floor's
    // own colour and the light that falls on it (the floor's bounce), and in water the lowest row is under the surface and the next two
    // are wet, cool and dark.
    'if (vFeet.z > 0.5) {',
    `  float above = (vMapUv.y - min(vRect.y, vRect.y + vRect.w)) / ${f(look.row)} - vFeet.x;`,
    `  float body = max(1.0, vRect.w / ${f(look.row)} - vFeet.x);`,
    '  if (vFeet.y > 0.0) {',
    '    if (above < 0.9) discard;',
    '    float wet = 1.0 - smoothstep(vFeet.y - 1.0, vFeet.y + 0.5, above);',
    '    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.5, 0.68, 0.82), wet);',
    '  }',
    '  diffuseColor.rgb *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 2.5, above));',
    '  float lowQuarter = 1.0 - smoothstep(0.0, 0.3 * body, above);',
    '  totalEmissiveRadiance += uFloor * lowQuarter * 0.5 * (1.0 + 2.5 * max(vPool.r, max(vPool.g, vPool.b)));',
    '}',
    'if (vRim.x != 0.0 || vRim.y != 0.0) {',
    '  vec2 lo = min(vRect.xy, vRect.xy + vRect.zw);',
    '  vec2 hi = max(vRect.xy, vRect.xy + vRect.zw);',
    `  vec2 q = vMapUv + vRim.xy * vec2(${f(look.texel[0])}, ${f(look.texel[1])});`,
    '  bool outside = any(lessThan(q, lo)) || any(greaterThan(q, hi));',
    '  float edge = outside ? 1.0 : step(texture2D(map, q).a, 0.5);',
    '  totalEmissiveRadiance += vRimColor * edge;',
    '}',
  ].join(NEWLINE);
}

/**
 * Gives a material the fog of war and the haze: a vertex reads the darkness where it stands from the fog texture (a terrain vertex
 * at its own place, a sprite's at its feet) and the fragment drains the colour of what is remembered (down to a cool, washed-out
 * share of its look in the light, so a mapped floor stays readable), adds the baked pools of the level's fires, fades the distance
 * into the region's haze and the unknown into the dark. `mode`: 'attribute' for geometry carrying its own fog coordinates (`aFog`),
 * 'instance' for instanced sprites (which also carry their rectangle of the atlas, `aUv`).
 */
export function withFog(
  material: MeshLambertMaterial | MeshBasicMaterial | MeshStandardMaterial, air: AirUniforms, mode: 'attribute' | 'instance', sprite?: SpriteLook,
): void {
  // A basic material (the floor's contact shadows) has no light of its own to lift, and no glow to keep.
  const lit = material.type !== 'MeshBasicMaterial';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tFog = air.tFog;
    shader.uniforms.uHero = air.uHero;
    shader.uniforms.uHaze = air.uHaze;
    shader.uniforms.uFogColor = air.uFogColor;
    shader.uniforms.uBg = air.uBg;
    shader.uniforms.uTime = air.uTime;
    shader.uniforms.uMem = air.uMem;
    shader.uniforms.uPool = air.uPool;
    shader.uniforms.uMist = air.uMist;
    shader.uniforms.uMistColor = air.uMistColor;
    shader.uniforms.uFloor = air.uFloor;
    shader.uniforms.uBelow = air.uBelow;
    const declarations = [
      '#include <common>', 'uniform sampler2D tFog;', 'varying float vFog;', 'varying vec3 vPool;', 'varying vec2 vWPos;', 'varying float vWY;',
      mode === 'attribute' ? 'attribute vec2 aFog;' : 'attribute vec4 aUv;',
      ...(sprite ? ['attribute vec3 aRim;', 'attribute vec3 aRimColor;', 'attribute vec3 aFeet;', 'varying vec3 vRim;', 'varying vec3 vRimColor;', 'varying vec3 vFeet;', 'varying vec4 vRect;'] : []),
    ].join(NEWLINE);
    const fetch =
      mode === 'attribute'
        ? 'vec4 fogTex = texture2D(tFog, aFog); vFog = fogTex.r; vPool = fogTex.gba; vWPos = position.xz; vWY = position.y;'
        : `vec4 fogAt = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); vec4 fogTex = texture2D(tFog, vec2(fogAt.x / ${WIDTH}.0, fogAt.z / ${HEIGHT}.0)); vFog = fogTex.r; vPool = fogTex.gba; vWPos = fogAt.xz; vWY = (instanceMatrix * vec4(position, 1.0)).y;`;
    let vertex = shader.vertexShader.replace('#include <common>', declarations).replace('#include <begin_vertex>', ['#include <begin_vertex>', fetch].join(NEWLINE));
    if (mode === 'instance') {
      vertex = vertex.replace('#include <uv_vertex>', ['#ifdef USE_MAP', 'vMapUv = aUv.xy + uv * aUv.zw;', '#endif', '#ifdef USE_EMISSIVEMAP', 'vEmissiveMapUv = aUv.xy + uv * aUv.zw;', '#endif'].join(NEWLINE));
    }
    if (sprite) vertex = vertex.replace('#include <begin_vertex>', ['#include <begin_vertex>', 'vRim = aRim; vRimColor = aRimColor; vFeet = aFeet; vRect = aUv;'].join(NEWLINE));
    // A figure is lit where its feet are, as the floor beside it is, not where each part of it happens to hang (a torch above a wall is nearer its head).
    if (sprite) vertex = vertex.replace('vViewPosition = - mvPosition.xyz;', 'vViewPosition = -(modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;');
    shader.vertexShader = vertex;
    const memory = lit
      ? [
          // What the place remembers: the cell's own colour, cool and washed out, at a share of how it looks in the light; and the
          // warm pool of the fires that burn there, flickering slowly (each cell on its own phase). The glow of the thing itself
          // (a flame, lava, fungus) is kept whole.
          '  vec3 albedo = diffuseColor.rgb;',
          '  float cellPhase = dot(floor(vWPos), vec2(1.7, 2.9));',
          '  float flick = 1.0 + 0.1 * sin(uTime * 2.3 + cellPhase) + 0.06 * sin(uTime * 5.1 + cellPhase * 1.9);',
          '  float seen = 1.0 - smoothstep(0.52, 1.0, vFog);',
          '  vec3 base = gl_FragColor.rgb - totalEmissiveRadiance;',
          // The fire's pools in remembered ground are a faint warmth, and what is remembered is flat grey with a cool cast, pulled toward
          // a mid-dark (legible, not darker); the glow of the thing itself keeps a third, drained. All of it by `rem`, so it eases in.
          `  float poolK = mix(1.0, ${MEMORY_POOL.toFixed(3)}, rem);`,
          '  base += albedo * (uMem * rem * seen + uPool * flick * vPool * seen * poolK);',
          '  float lum = dot(base, vec3(0.299, 0.587, 0.114));',
          `  vec3 flatGrey = mix(vec3(${MEMORY_MID.toFixed(3)}), vec3(lum), ${MEMORY_CONTRAST.toFixed(3)}) * ${vec3(MEMORY_TINT)};`,
          `  base = mix(base, flatGrey, rem * ${MEMORY_DESATURATE.toFixed(3)});`,
          '  float glowLum = dot(totalEmissiveRadiance, vec3(0.299, 0.587, 0.114));',
          `  vec3 glow = mix(totalEmissiveRadiance, vec3(glowLum) * ${vec3(MEMORY_TINT)}, rem * ${MEMORY_GLOW_DESATURATE.toFixed(3)}) * mix(1.0, ${MEMORY_GLOW.toFixed(3)}, rem);`,
          '  gl_FragColor.rgb = base + glow;',
        ]
      : [
          '  float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));',
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(lum) * vec3(0.44, 0.49, 0.62), rem * 0.8);',
        ];
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        ['#include <common>', ...(sprite ? ['varying vec3 vRim;', 'varying vec3 vRimColor;', 'varying vec3 vFeet;', 'varying vec4 vRect;', 'uniform vec3 uFloor;'] : []), 'varying float vFog;', 'varying vec3 vPool;', 'varying vec2 vWPos;', 'varying float vWY;', 'uniform vec3 uMistColor;', 'uniform vec2 uMist;', 'uniform float uBelow;', 'uniform vec2 uHero;', 'uniform vec2 uHaze;', 'uniform vec3 uFogColor;', 'uniform vec3 uBg;', 'uniform float uTime;', 'uniform float uMem;', 'uniform float uPool;'].join(NEWLINE),
      )
      .replace('#include <emissivemap_fragment>', sprite ? spriteFragment(sprite) : '#include <emissivemap_fragment>')
      // The terrain, the water and the decals do not draw what lies under the mirror's plane in the mirror's pass (a chasm's rock).
      .replace('#include <alphatest_fragment>', mode === 'attribute' ? '#include <alphatest_fragment>' + NEWLINE + '  if (vWY < uBelow) discard;' : '#include <alphatest_fragment>')
      .replace(
        '#include <opaque_fragment>',
        [
          '#include <opaque_fragment>',
          '{',
          `  float rem = clamp(vFog / ${FOG_REMEMBERED.toFixed(2)}, 0.0, 1.0);`,
          ...memory,
          '  float haze = smoothstep(uHaze.x, uHaze.y, distance(vWPos, uHero));',
          // Far away, in sight, the air thickens; what is only remembered is not hidden by it.
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, haze * 0.85 * (1.0 - 0.75 * rem));',
          // The kit's low mist (the halls' red): a layer of slow noise hugging the floor, thinning to nothing at its height.
          '  if (uMist.x > 0.0) {',
          '    float low = 1.0 - smoothstep(0.0, uMist.y, vWY);',
          '    float wave = 0.62 + 0.38 * sin(vWPos.x * 0.8 + uTime * 0.31) * sin(vWPos.y * 0.9 - uTime * 0.23) + 0.14 * sin((vWPos.x + vWPos.y) * 2.3 + uTime * 0.7);',
          '    gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, clamp(uMist.x * 2.4 * low * wave, 0.0, 0.75) * (1.0 - 0.6 * rem));',
          '  }',
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, uBg, smoothstep(0.52, 1.0, vFog));',
          // A sprite's alpha, once its pixel has been cut out, is what the bloom takes of it (post.ts): none for a plain figure, the
          // strength of its own glow where it has one (a legendary look, a wand); the batch is drawn without blending, so this is the
          // pixel's alpha in the frame. (On the canvas, with no alpha, it is nothing.)
          ...(sprite ? ['  #ifdef USE_EMISSIVEMAP', '  gl_FragColor.a = min(1.0, max(emissiveColor.r, max(emissiveColor.g, emissiveColor.b)));', '  #endif'] : []),
          '}',
        ].join(NEWLINE),
      );
  };
  material.customProgramCacheKey = () => `pdair-${mode}-${lit ? 'lit' : 'flat'}${sprite ? `-${sprite.selfLight}-${sprite.texel[0]}` : ''}`;
}
