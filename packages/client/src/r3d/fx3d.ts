/*
 * The designer's effects in the 3D view (fxplayer.ts decides what is playing; this draws it). Every sheet is put once into the effects
 * atlas, beside what that already holds, so a frame of an effect is one more instance in the same two batches: added on (light, fire,
 * magic) or blended (gas, glass, rock). No new draw, no new shadow caster, nothing made while a frame is drawn.
 *
 * A figure's effect stands leaned like a sprite and as tall as a sprite would be (project.ts: LEAN, LEAN_STRETCH); a flat one lies on the
 * floor at its `lift`; a bolt's head is turned along its path about the view axis. The brightest light of the frame is handed to the
 * scene's one moving light, if it is stronger than what a bolt or a blast of the older effects has put there.
 */
import type { CanvasTexture } from 'three';
import { fxp, MODE_FEET, MODE_FLOOR, MODE_HEAD } from '../fxplayer';
import { type FxLight, fxState, type LoadedFx, packSheets, type Rect } from '../fxsheet';
import type { Dynamic, FxContext } from './effects3d';
import { LEAN, LEAN_STRETCH, PITCH } from './project';
import type { QuadBatch } from './quadbatch';

/** Where the middle of a figure stands over the floor, and how far north of its cell's middle (its feet are 7/16 down the cell). */
const MIDDLE_Y = 0.73;
const MIDDLE_Z = -0.33;
/** A feet-anchored frame stands at the feet, a little north of the cell's middle. */
const FEET_Z = -0.0625;

const brightLight = { x: 0, z: 0, light: null as unknown as FxLight, level: 0 };

export class Fx3D {
  private rects = new Map<string, Rect>();
  private packedFor: LoadedFx | null = null;
  private failed: LoadedFx | null = null;

  constructor(
    private readonly soft: QuadBatch,
    private readonly glow: QuadBatch,
    private readonly texture: CanvasTexture,
    private readonly atlas: { w: number; h: number; regions: readonly Rect[] },
  ) {}

  /** Puts the sheets into the atlas, once the data has come; false while it has not (or if it does not fit: the older effects stay). */
  sync(): boolean {
    const loaded = fxState();
    if (!loaded) return false;
    if (this.packedFor === loaded) return true;
    if (this.failed === loaded) return false;
    const sizes = [...loaded.images].map(([path, image]) => ({ path, w: image.naturalWidth, h: image.naturalHeight }));
    // The boss card's pictures (the plate and the portraits) are in the page, not in the scene; the bosses' own effects (part 13) are.
    const wanted = sizes.filter((s) => s.w > 0 && s.path !== 'fx/boss/plate.png' && !s.path.startsWith('fx/boss/portrait-'));
    const placed = packSheets(wanted, this.atlas.regions);
    if (!placed) {
      this.failed = loaded;
      console.warn('effects: the sheets do not fit the atlas; the older effects stay');
      return false;
    }
    const canvas = this.texture.image as HTMLCanvasElement;
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (const [path, at] of placed) g.drawImage(loaded.images.get(path)!, at.x, at.y);
    this.texture.needsUpdate = true;
    this.rects = placed;
    this.packedFor = loaded;
    return true;
  }

  /** Whether the data is in the atlas and the effects are drawn from it. */
  get ready(): boolean {
    return this.packedFor !== null && this.packedFor === fxState();
  }

  /** Draws the frame's effects into the batches and offers their brightest light to the scene. Returns false if there is nothing to draw with. */
  frame(c: FxContext, dyn: Dynamic): boolean {
    if (!this.sync()) return false;
    // The loops of the places are drawn near the hero only.
    fxp.hx = c.hx;
    fxp.hz = c.hz;
    const n = fxp.collect(c.now, c.visible);
    const W = this.atlas.w;
    const H = this.atlas.h;
    const sinP = Math.sin(PITCH);
    const sinL = Math.sin(LEAN);
    const cosL = Math.cos(LEAN);
    for (let k = 0; k < n; k++) {
      const it = fxp.items[k]!;
      const d = it.def;
      const at = this.rects.get(d.sheet);
      if (!at) continue;
      const u = (at.x + it.col * d.w) / W;
      const v = 1 - (at.y + (it.row + 1) * d.h) / H;
      const du = d.w / W;
      const dv = d.h / H;
      const w = (d.w * it.scale) / 16;
      const h = (d.h * it.scale) / 16;
      const add = d.blend === 'add';
      const batch = add ? this.glow : this.soft;
      // Added light is a little brighter than the art, the large frames not; blended things are not lit by the scene, so a touch dimmer.
      const gain = add ? (d.w >= 48 ? 1 : 1.35) : 0.9;
      const a = it.alpha * (!add && d.behaviour === 'tile' ? 0.78 : 1);
      if (it.mode === MODE_FLOOR) {
        batch.flat(it.x, it.lift, it.z + (it.feet ? FEET_Z : 0), w, h, 0, u, v, du, dv, gain, gain, gain, a);
        continue;
      }
      const tall = h * LEAN_STRETCH;
      if (it.mode === MODE_FEET) {
        // Standing at the feet: its base on the floor, leaned.
        batch.leaned(it.x, it.lift + 0.5 * tall * cosL, it.z + FEET_Z - 0.5 * tall * sinL, w, tall, 0, u, v, du, dv, gain, gain, gain, a);
        continue;
      }
      let x = it.x;
      let y = it.lift - 0.5 + MIDDLE_Y;
      let z = it.z + MIDDLE_Z;
      let rot = 0;
      if (it.turn) {
        // Turned along its path as the screen sees it (the lean and its stretch keep a leaned quad true to the art on the screen).
        rot = Math.atan2(-it.dz * sinP, it.dx);
        if (it.mode === MODE_HEAD && d.anchor === 'head') {
          // The head of a bolt is at (10, 8) of 16: two pixels ahead of the middle.
          const off = 0.125 * w;
          x -= off * Math.cos(rot);
          y -= off * Math.sin(rot) * cosL;
          z += off * Math.sin(rot) * sinL;
        }
      }
      batch.leaned(x, y, z, w, tall, rot, u, v, du, dv, gain, gain, gain, a);
    }
    // Light: the brightest of them, if it beats the moving light of an older bolt or blast.
    if (fxp.brightest(c.now, c.hx, c.hz, c.visible, brightLight)) {
      const l = brightLight.light;
      const strength = l.intensity * brightLight.level;
      if (!dyn.on || strength > dyn.intensity) {
        dyn.on = true;
        dyn.x = brightLight.x;
        dyn.y = 0.7;
        dyn.z = brightLight.z;
        dyn.color = l.hex;
        dyn.intensity = strength;
        dyn.distance = l.radius;
      }
    }
    return true;
  }
}
