/*
 * The caves' gold ore, as the kit says it (hd2d-kit.json, caves, override of wall_face: "the gold ore (12) is metal: roughness 0.3,
 * metalness 0.9, glints in light"). The ore is the flecks of gold on the face of the deco wall (and on tile 12 of the caves' sheet): the
 * pixels its glow map lights. Those pixels, and only those, are made metal on the terrain atlas, in the roughness and metalness maps:
 * the standard material then gives them a specular that follows the lights (the hero's, a torch's), and what it cannot give a flat
 * face seen from above (a metal reflects the world, and there is none here) a glint adds: each fleck, on a phase of its own, catches
 * the light now and then, more so near the hero.
 */
import { type MeshStandardMaterial } from 'three';

/** The kit's values for the gold. */
export const GOLD_ORE = { tile: 12, roughness: 0.3, metalness: 0.9 } as const;

/** The region whose tile 12 is gold: the caves (the prison's is a barred window, the others' are plain decoration). */
export const GOLD_REGION = 2;

/** Pixels (as indices of a 16 x 16 rectangle's RGBA data) that the glow map lights: the ore. */
export function orePixels(glow: Uint8ClampedArray | ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < 256; i++) {
    const o = i * 4;
    if (glow[o]! + glow[o + 1]! + glow[o + 2]! > 36) out.push(i);
  }
  return out;
}

/**
 * Gives a terrain material (after `withFog`) the glint of its metal pixels: added to the light the surface reflects, after the lights have
 * been summed. `metalnessFactor` is the pixel's own metalness (0 but on the ore).
 */
export function withGlint(material: MeshStandardMaterial): void {
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      [
        '#include <lights_fragment_end>',
        '{',
        '  float ore = clamp(metalnessFactor, 0.0, 1.0);',
        '  if (ore > 0.05) {',
        '    vec2 fleck = floor(vMapUv * 256.0);',
        '    float h = fract(sin(dot(fleck, vec2(12.9898, 78.233))) * 43758.5453);',
        '    float twinkle = pow(0.5 + 0.5 * sin(uTime * (1.4 + h * 2.4) + h * 31.4), 6.0);',
        '    float near = 1.0 - smoothstep(1.5, 7.0, distance(vWPos, uHero));',
        '    reflectedLight.indirectSpecular += material.specularColor * ore * (0.6 + 3.0 * twinkle) * (0.6 + 1.0 * near);',
        '  }',
        '}',
      ].join('\n'),
    );
  };
  material.customProgramCacheKey = () => `${key.call(material)}-glint`;
}
