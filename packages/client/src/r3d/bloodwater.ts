/*
 * Blood in water, in the 3D view: a 48 x 48 byte texture, one byte a cell (how red that cell's water is), which the water's shader
 * reads (withBlood). The cloud itself is the effects module's (fx.waterRed: it spreads from where the blood fell over a second and a
 * half and fades in nine); here it is only sampled into the bytes for the cells near live blood, and the texture is sent while any
 * is alive (and once more when the last is gone). No new draw and no geometry: the water mesh is already drawn.
 */
import { DataTexture, LinearFilter, type MeshStandardMaterial, RedFormat, UnsignedByteType } from 'three';
import { HEIGHT, LENGTH, WIDTH } from '@pd/core';
import { fx } from '../fx';
import { gore } from '../gore';

export class BloodWater {
  readonly texture: DataTexture;
  private readonly bytes = new Uint8Array(LENGTH);
  private dirty = false;
  /** The gore record the settled stain was last read from (its version), and whether the stain has changed since. */
  private seen = -1;
  private stained = true;

  constructor() {
    this.texture = new DataTexture(this.bytes, WIDTH, HEIGHT, RedFormat, UnsignedByteType);
    this.texture.magFilter = this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;
  }

  /** The water has stained a little more. */
  restain(): void {
    this.stained = true;
  }

  /** Puts the permanent stain (gore.ts: what each cloud leaves) under the clouds. */
  private base(): void {
    this.bytes.fill(0);
    for (const [cell, v] of gore.data.water) this.bytes[cell] = v;
  }

  /** Brings the texture to `now`: the settled stain, and over it the clouds of blood that are still spreading. */
  update(now: number): void {
    const bleeds = fx.bleeds;
    if (this.seen !== gore.version) {
      this.seen = gore.version;
      this.stained = true;
    }
    if (bleeds.length === 0) {
      if (this.dirty || this.stained) {
        this.base();
        this.texture.needsUpdate = true;
        this.dirty = false;
        this.stained = false;
      }
      return;
    }
    this.base();
    for (const b of bleeds) {
      const reach = b.reach + 1;
      const c0 = Math.max(0, Math.floor(b.x / 16 - reach));
      const c1 = Math.min(WIDTH - 1, Math.ceil(b.x / 16 + reach));
      const r0 = Math.max(0, Math.floor(b.y / 16 - reach));
      const r1 = Math.min(HEIGHT - 1, Math.ceil(b.y / 16 + reach));
      for (let z = r0; z <= r1; z++) {
        for (let x = c0; x <= c1; x++) {
          const v = Math.round(fx.waterRed(x + 0.5, z + 0.5, now) * 255);
          const i = z * WIDTH + x;
          if (v > this.bytes[i]!) this.bytes[i] = v;
        }
      }
    }
    this.texture.needsUpdate = true;
    this.dirty = true;
    this.stained = false;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/**
 * Lets a water material take the red of the blood texture (after `withFog` has given it its fog): the cell's colour is mixed toward a
 * dark red, less where the cell is dark with fog.
 */
export function withBlood(material: MeshStandardMaterial, blood: BloodWater): void {
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.tBlood = { value: blood.texture };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tBlood;')
      .replace(
        '#include <tonemapping_fragment>',
        [
          '{',
          `  float shed = texture2D(tBlood, vWPos / vec2(${WIDTH}.0, ${HEIGHT}.0)).r * (1.0 - smoothstep(0.25, 0.75, vFog));`,
          '  vec3 red = gl_FragColor.rgb * vec3(2.1, 0.3, 0.32) + vec3(0.07, 0.0, 0.01);',
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, red, clamp(shed * 1.1, 0.0, 0.85));',
          '}',
          '#include <tonemapping_fragment>',
        ].join('\n'),
      );
  };
  material.customProgramCacheKey = () => `${key.call(material)}-blood`;
}
