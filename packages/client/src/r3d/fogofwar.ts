/*
 * The fog of war and the air of the level, as one thing the shaders read: a 48 x 48 texture (one byte a cell: 0 in sight, 0.55
 * remembered, 1 unknown, eased from turn to turn) that every vertex looks up where it stands, and the region's haze (the kit's fog:
 * near and far in cells from the hero, toward its colour). Nothing here is a pass: the terrain's and the sprites' own shaders have
 * the lines added by `withFog`.
 */
import { Color, DataTexture, LinearFilter, type MeshBasicMaterial, type MeshLambertMaterial, type MeshStandardMaterial, RedFormat, type Texture, UnsignedByteType, Vector2 } from 'three';
import { HEIGHT, LENGTH, WIDTH } from '@pd/core';

/** How dark each state is (the 2D renderer's own numbers, render.ts). */
export const FOG_REMEMBERED = 0.55;
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
}

export function makeAir(fog: Texture): AirUniforms {
  return {
    tFog: { value: fog },
    uHero: { value: new Vector2() },
    uHaze: { value: new Vector2(9, 24) },
    uFogColor: { value: new Color(0x0e1a17) },
    uBg: { value: new Color(0x040605) },
  };
}

/** The fog of war as a texture: one byte a cell, easing toward where each cell should be. */
export class Fog {
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
}

function spriteFragment(look: SpriteLook): string {
  const f = (n: number): string => n.toFixed(6);
  return [
    '#include <emissivemap_fragment>',
    `totalEmissiveRadiance += diffuseColor.rgb * ${f(look.selfLight)};`,
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
 * at its own place, a sprite's at its feet) and the fragment drains the colour of what is remembered, fades the distance into the
 * region's haze and the unknown into the dark. `mode`: 'attribute' for geometry carrying its own fog coordinates (`aFog`),
 * 'instance' for instanced sprites (which also carry their rectangle of the atlas, `aUv`).
 */
export function withFog(
  material: MeshLambertMaterial | MeshBasicMaterial | MeshStandardMaterial, air: AirUniforms, mode: 'attribute' | 'instance', sprite?: SpriteLook,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tFog = air.tFog;
    shader.uniforms.uHero = air.uHero;
    shader.uniforms.uHaze = air.uHaze;
    shader.uniforms.uFogColor = air.uFogColor;
    shader.uniforms.uBg = air.uBg;
    const declarations = [
      '#include <common>', 'uniform sampler2D tFog;', 'varying float vFog;', 'varying vec2 vWPos;',
      mode === 'attribute' ? 'attribute vec2 aFog;' : 'attribute vec4 aUv;',
      ...(sprite ? ['attribute vec3 aRim;', 'attribute vec3 aRimColor;', 'varying vec3 vRim;', 'varying vec3 vRimColor;', 'varying vec4 vRect;'] : []),
    ].join(NEWLINE);
    const fetch =
      mode === 'attribute'
        ? 'vFog = texture2D(tFog, aFog).r; vWPos = position.xz;'
        : `vec4 fogAt = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); vFog = texture2D(tFog, vec2(fogAt.x / ${WIDTH}.0, fogAt.z / ${HEIGHT}.0)).r; vWPos = fogAt.xz;`;
    let vertex = shader.vertexShader.replace('#include <common>', declarations).replace('#include <begin_vertex>', ['#include <begin_vertex>', fetch].join(NEWLINE));
    if (mode === 'instance') {
      vertex = vertex.replace('#include <uv_vertex>', ['#ifdef USE_MAP', 'vMapUv = aUv.xy + uv * aUv.zw;', '#endif', '#ifdef USE_EMISSIVEMAP', 'vEmissiveMapUv = aUv.xy + uv * aUv.zw;', '#endif'].join(NEWLINE));
    }
    if (sprite) vertex = vertex.replace('#include <begin_vertex>', ['#include <begin_vertex>', 'vRim = aRim; vRimColor = aRimColor; vRect = aUv;'].join(NEWLINE));
    shader.vertexShader = vertex;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', ['#include <common>', ...(sprite ? ['varying vec3 vRim;', 'varying vec3 vRimColor;', 'varying vec4 vRect;'] : []), 'varying float vFog;', 'varying vec2 vWPos;', 'uniform vec2 uHero;', 'uniform vec2 uHaze;', 'uniform vec3 uFogColor;', 'uniform vec3 uBg;'].join(NEWLINE))
      .replace('#include <emissivemap_fragment>', sprite ? spriteFragment(sprite) : '#include <emissivemap_fragment>')
      .replace(
        '#include <opaque_fragment>',
        [
          '#include <opaque_fragment>',
          '{',
          '  float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));',
          `  float rem = clamp(vFog / ${FOG_REMEMBERED.toFixed(2)}, 0.0, 1.0);`,
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(lum) * vec3(0.44, 0.49, 0.62), rem * 0.8);',
          '  float haze = smoothstep(uHaze.x, uHaze.y, distance(vWPos, uHero));',
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, haze * 0.85);',
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, uBg, smoothstep(0.52, 1.0, vFog));',
          '}',
        ].join(NEWLINE),
      );
  };
  material.customProgramCacheKey = () => `pdair-${mode}${sprite ? `-${sprite.selfLight}-${sprite.texel[0]}` : ''}`;
}
