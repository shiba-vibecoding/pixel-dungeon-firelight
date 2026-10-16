/*
 * The mirror under the water (hd2d-kit.json: `water.reflect`, `water.reflectStrength`): water shows a faint, darkened, rippled picture
 * of the walls and the lit things above it. As the designer's viewer has it (a Reflector under the water, seen through its
 * surface) but cheap, for the highest tier only:
 *
 *   - a second, reflected camera (looking up and north from under the water's plane) draws only what is on the mirror's layer, which is the
 *     walls and doors, the sprite batch (the torches on the walls, the light of a legendary look) and the batch of light (halos,
 *     sparks, bolts), into a target a third of the screen's size each way. Nothing under the plane is drawn (a chasm's rock).
 *     It is not made at all in a frame where no water is on the screen;
 *   - the water's shader (withMirror) looks the picture up at the place of each of its pixels through the same two matrices, wobbles
 *     it with two slow waves, darkens it, tints it with the kit's colour and lays it over the water at the kit's strength.
 *
 * Seen from 70 degrees a true reflection goes up steeply, and shows only the foot of a wall or of a figure at the shore; the mirror's camera
 * looks as the kit's own does (50 degrees, hd2d-kit.json camera.pitch), so that what the water reflects is as tall as in the designer's
 * frames: a stylised mirror of the same place, faint as the kit's strength says. Nothing is made while a frame is drawn.
 */
import {
  Color, DataTexture, HalfFloatType, LinearFilter, Matrix4, type MeshStandardMaterial, type Object3D, OrthographicCamera, RGBAFormat,
  SRGBColorSpace, UnsignedByteType, Vector3, WebGLRenderTarget, type WebGLRenderer,
} from 'three';
import { LENGTH, WIDTH } from '@pd/core';
import { K_CHASM, K_LOW, K_WALL, K_WATER } from './levelgeom';

/** What the reflected camera sees: the objects that are in this layer as well as the default one (and all the lights). */
export const MIRROR_LAYER = 1;
/** The picture is this share of the screen's size each way. */
export const MIRROR_SCALE = 0.34;

/** Puts an object in the mirror too. */
export function reflects(object: Object3D): void {
  object.layers.enable(MIRROR_LAYER);
}

/** The pieces of a mirror the water's shader reads. */
export interface MirrorUniforms {
  tMirror: { value: DataTexture | WebGLRenderTarget['texture'] };
  /** World to the picture's texture coordinates (the reflected camera's projection and view, with the bias to 0..1). */
  uMirror: { value: Matrix4 };
  /** 1 while a picture was made this frame, 0 otherwise (the water is then as it was). */
  uMirrorOn: { value: number };
  /** The kit's reflection colour, in linear light, and how much of the water it replaces: 0.6 times the kit's strength. */
  uReflect: { value: Color };
  uReflectK: { value: number };
}

/** A blank picture for the water to hold when there is no mirror. */
export function blankMirror(): DataTexture {
  const texture = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat, UnsignedByteType);
  texture.needsUpdate = true;
  return texture;
}

export function makeMirrorUniforms(blank: DataTexture): MirrorUniforms {
  return { tMirror: { value: blank }, uMirror: { value: new Matrix4() }, uMirrorOn: { value: 0 }, uReflect: { value: new Color(1, 1, 1) }, uReflectK: { value: 0 } };
}

const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export class Mirror {
  readonly target: WebGLRenderTarget;
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 120);
  private readonly sin: number;
  private readonly cos: number;
  private readonly right = new Vector3(-1, 0, 0);
  private readonly up = new Vector3();
  private readonly back = new Vector3();
  private readonly basis = new Matrix4();
  private readonly clear = new Color();
  /** Where the water is: cell columns and rows, for knowing whether any is on the screen. */
  private water = new Int16Array(0);
  private waterCount = 0;
  private chasm = false;
  private level = 0;

  /** `pitchDeg`: how steeply the mirror's camera looks up, the kit's camera pitch. */
  constructor(readonly uniforms: MirrorUniforms, pitchDeg: number, private readonly below: { value: number }) {
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
    });
    // Drawn exactly as the frame itself is (post.ts): the same shaders, colours encoded as sRGB, no tone map yet.
    this.target.texture.colorSpace = SRGBColorSpace;
    (this.target as WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    this.camera.layers.set(MIRROR_LAYER);
    const s = Math.sin((pitchDeg * Math.PI) / 180);
    const c = Math.cos((pitchDeg * Math.PI) / 180);
    this.sin = s;
    this.cos = c;
    // The real camera looks down and north; this one looks up and north from under the plane, turned over: its right is west.
    this.up.set(0, -c, -s);
    this.back.set(0, -s, c);
    this.basis.makeBasis(this.right, this.up, this.back);
    this.camera.quaternion.setFromRotationMatrix(this.basis);
  }

  /**
   * The cells of a level whose water can show a reflection: those with a wall or a block within two cells to the north (a reflection
   * goes up and north from the water: farther than that, in the open, there is nothing for it to show); and whether the level has a
   * chasm, whose rock must not show in the mirror.
   */
  configure(kinds: Uint8Array, waterY: number): void {
    let n = 0;
    this.chasm = false;
    if (this.water.length < LENGTH * 2) this.water = new Int16Array(LENGTH * 2);
    const tall = (cell: number): boolean => cell >= 0 && (kinds[cell] === K_WALL || kinds[cell] === K_LOW);
    for (let i = 0; i < LENGTH; i++) {
      const k = kinds[i];
      if (k === K_WATER) {
        if (!tall(i - WIDTH) && !tall(i - 2 * WIDTH) && !tall(i - 3 * WIDTH)) continue;
        this.water[n * 2] = i % WIDTH;
        this.water[n * 2 + 1] = Math.trunc(i / WIDTH);
        n++;
      } else if (k === K_CHASM) this.chasm = true;
    }
    this.waterCount = n;
    this.level = waterY;
  }

  resize(width: number, height: number): void {
    this.target.setSize(Math.max(64, Math.round(width * MIRROR_SCALE)), Math.max(64, Math.round(height * MIRROR_SCALE)));
  }

  /** Whether any water of the level is in the view (cells: x from `x0` to `x1`, z from `z0` to `z1`) and has been seen. */
  seen(x0: number, x1: number, z0: number, z1: number, explored: readonly boolean[]): boolean {
    const w = this.water;
    for (let i = 0; i < this.waterCount; i++) {
      const x = w[i * 2]!;
      const z = w[i * 2 + 1]!;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1 && explored[x + z * WIDTH]) return true;
    }
    return false;
  }

  /**
   * Puts the reflected camera over the ground the real one sees (its middle at cell (cx, cz), `halfW` cells to each side and `halfZ` up
   * and down the ground) and gives the water the matrix that finds a point of the plane in its picture.
   */
  update(cx: number, cz: number, halfW: number, halfZ: number): OrthographicCamera {
    const cam = this.camera;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfZ * this.sin;
    cam.bottom = -halfZ * this.sin;
    cam.position.set(cx, this.level - 40 * this.sin, cz + 40 * this.cos);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    this.uniforms.uMirror.value.copy(BIAS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    return cam;
  }

  /**
   * Draws the picture for this frame (see `update`): the mirror's layer only, with the world beneath the water cut away. `draw` is the
   * tone-map-free render of post.ts.
   */
  render(renderer: WebGLRenderer, cx: number, cz: number, halfW: number, halfZ: number, draw: (target: WebGLRenderTarget, camera: OrthographicCamera) => void): void {
    const cam = this.update(cx, cz, halfW, halfZ);
    // A picture with nothing in it is clear and black.
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clear);
    renderer.setClearColor(0x000000, 0);
    // Nothing under the water is drawn (a chasm's rock): the fog's shaders discard what lies below this height (fogofwar.ts uBelow).
    this.below.value = this.level;
    draw(this.target, cam);
    this.below.value = -1000;
    renderer.setClearColor(this.clear, alpha);
    this.uniforms.tMirror.value = this.target.texture;
    this.uniforms.uMirrorOn.value = 1;
  }

  dispose(): void {
    this.target.dispose();
  }
}


/**
 * Lets the water's material show the mirror (after `withFog`): its colour is mixed toward the picture (a darkened, wobbling copy tinted
 * with the kit's colour) where the picture has something in it, before the haze and the fog take their share.
 */
export function withMirror(material: MeshStandardMaterial, u: MirrorUniforms): void {
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.tMirror = u.tMirror;
    shader.uniforms.uMirror = u.uMirror;
    shader.uniforms.uMirrorOn = u.uMirrorOn;
    shader.uniforms.uReflect = u.uReflect;
    shader.uniforms.uReflectK = u.uReflectK;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uMirror;\nvarying vec2 vMirrorUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMirrorUv = (uMirror * vec4(position, 1.0)).xy;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', ['#include <common>', 'uniform sampler2D tMirror;', 'uniform float uMirrorOn;', 'uniform vec3 uReflect;', 'uniform float uReflectK;', 'varying vec2 vMirrorUv;'].join('\n'))
      .replace(
        '#include <opaque_fragment>',
        [
          '#include <opaque_fragment>',
          'if (uMirrorOn > 0.5) {',
          // Two slow waves wobble where the picture is read; what it holds is in sRGB (above 1 where something glows).
          '  vec2 ruv = vMirrorUv + vec2(sin(vWPos.y * 11.0 + uTime * 2.3), sin(vWPos.x * 9.0 + uTime * 1.9)) * 0.0035;',
          '  vec4 r = texture2D(tMirror, ruv);',
          '  vec3 lo = r.rgb * 0.0773993808;',
          '  vec3 hi = pow(max(r.rgb, vec3(0.0)) * 0.9478672986 + vec3(0.0521327014), vec3(2.4));',
          '  vec3 lin = mix(hi, lo, vec3(lessThanEqual(r.rgb, vec3(0.04045))));',
          '  float cover = clamp(r.a + smoothstep(0.012, 0.07, dot(lin, vec3(0.2126, 0.7152, 0.0722))), 0.0, 1.0);',
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, min(lin, vec3(1.5)) * uReflect * 0.85, cover * uReflectK);',
          '}',
        ].join('\n'),
      );
  };
  material.customProgramCacheKey = () => `${key.call(material)}-mirror`;
}
