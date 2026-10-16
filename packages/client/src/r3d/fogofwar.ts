/*
 * The fog of war and the air of the level, as one thing the shaders read: a 48 x 48 texture (a cell's red byte: 0 in sight, 0.55
 * remembered, 1 unknown, eased from turn to turn; its other three bytes: the light of the level's fixed fires, torches, lava and
 * the like, baked once per level, lightrig.ts bakePools) that every vertex looks up where it stands, and the region's haze (the kit's
 * fog: near and far in cells from the hero, toward its colour). Nothing here is a pass: the terrain's and the sprites' own shaders
 * have the lines added by `withFog`.
 */
import { Color, DataTexture, LinearFilter, type MeshBasicMaterial, type MeshLambertMaterial, type MeshStandardMaterial, RGBAFormat, type Texture, UnsignedByteType, Vector2 } from 'three';
import { HEIGHT, LENGTH, WIDTH } from '@pd/core';

/** How dark each state is (the 2D renderer's own numbers, render.ts). */
export const FOG_REMEMBERED = 0.55;
/**
 * What a remembered cell keeps of the look it has in the light (a share of its own colour, added in the shader, cool and washed out
 * so it still differs from what is in sight), and how strong a baked pool of fire light is at its middle.
 */
export const MEMORY_LIFT = 0.6;
export const POOL_STRENGTH = 0.85;
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
 * Gives a material the fog of war and the haze: a vertex reads the darkness where it stands from the fog texture (a terrain vertex
 * at its own place, a sprite's at its feet) and the fragment drains the colour of what is remembered (down to a cool, washed-out
 * share of its look in the light, so a mapped floor stays readable), adds the baked pools of the level's fires, fades the distance
 * into the region's haze and the unknown into the dark. `mode`: 'attribute' for geometry carrying its own fog coordinates (`aFog`),
 * 'instance' for instanced sprites (which also carry their rectangle of the atlas, `aUv`).
 */
export function withFog(material: MeshLambertMaterial | MeshBasicMaterial | MeshStandardMaterial, air: AirUniforms, mode: 'attribute' | 'instance'): void {
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
    const declarations = [
      '#include <common>', 'uniform sampler2D tFog;', 'varying float vFog;', 'varying vec3 vPool;', 'varying vec2 vWPos;',
      mode === 'attribute' ? 'attribute vec2 aFog;' : 'attribute vec4 aUv;',
    ].join(NEWLINE);
    const fetch =
      mode === 'attribute'
        ? 'vec4 fogTex = texture2D(tFog, aFog); vFog = fogTex.r; vPool = fogTex.gba; vWPos = position.xz;'
        : `vec4 fogAt = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); vec4 fogTex = texture2D(tFog, vec2(fogAt.x / ${WIDTH}.0, fogAt.z / ${HEIGHT}.0)); vFog = fogTex.r; vPool = fogTex.gba; vWPos = fogAt.xz;`;
    let vertex = shader.vertexShader.replace('#include <common>', declarations).replace('#include <begin_vertex>', ['#include <begin_vertex>', fetch].join(NEWLINE));
    if (mode === 'instance') {
      vertex = vertex.replace('#include <uv_vertex>', ['#ifdef USE_MAP', 'vMapUv = aUv.xy + uv * aUv.zw;', '#endif', '#ifdef USE_EMISSIVEMAP', 'vEmissiveMapUv = aUv.xy + uv * aUv.zw;', '#endif'].join(NEWLINE));
    }
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
          '  base += albedo * (uMem * rem * seen + uPool * flick * vPool * seen);',
          '  float lum = dot(base, vec3(0.299, 0.587, 0.114));',
          '  base = mix(base, vec3(lum) * vec3(0.86, 0.97, 1.22), rem * 0.7);',
          '  gl_FragColor.rgb = base + totalEmissiveRadiance;',
        ]
      : [
          '  float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));',
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(lum) * vec3(0.44, 0.49, 0.62), rem * 0.8);',
        ];
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        ['#include <common>', 'varying float vFog;', 'varying vec3 vPool;', 'varying vec2 vWPos;', 'uniform vec2 uHero;', 'uniform vec2 uHaze;', 'uniform vec3 uFogColor;', 'uniform vec3 uBg;', 'uniform float uTime;', 'uniform float uMem;', 'uniform float uPool;'].join(NEWLINE),
      )
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
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, uBg, smoothstep(0.52, 1.0, vFog));',
          '}',
        ].join(NEWLINE),
      );
  };
  material.customProgramCacheKey = () => `pdair-${mode}-${lit ? 'lit' : 'flat'}`;
}
