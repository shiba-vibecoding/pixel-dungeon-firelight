/*
 * The designer's effects on the 2D canvas: the same sheets, the same list of frames (fxplayer.ts) as the 3D view draws. Whole pixels,
 * no smoothing; added light is `lighter`. Light is a soft disc of the effect's colour at intensity / 8 (fx.json says), given to the
 * canvas' lights (fx-events.ts → lightsFor).
 */
import { fxp, MODE_FEET, MODE_FLOOR, MODE_HEAD } from './fxplayer';
import { fxState } from './fxsheet';
import type { Light } from './fx-events';

const TILE = 16;
/** A figure's feet are this many pixels under the middle of its cell. */
const FEET_DOWN = 5;
/** How many lights the canvas shows at once. */
const MAX_LIGHTS = 4;

const lit = Array.from({ length: MAX_LIGHTS }, () => ({ x: 0, z: 0, light: null as unknown as import('./fxsheet').FxLight, level: 0 }));

/** Draws the frame's effects in world space (the camera's transform already set). */
export function drawFx2D(ctx: CanvasRenderingContext2D, now: number, visible: ArrayLike<boolean> | null): void {
  const loaded = fxState();
  if (!loaded) return;
  const n = fxp.collect(now, visible);
  if (n === 0) return;
  const was = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  let op = '';
  let alpha = 1;
  for (let k = 0; k < n; k++) {
    const it = fxp.items[k]!;
    const d = it.def;
    const image = loaded.images.get(d.sheet);
    if (!image) continue;
    const want = d.blend === 'add' ? 'lighter' : 'source-over';
    if (want !== op) ctx.globalCompositeOperation = op = want;
    if (it.alpha !== alpha) ctx.globalAlpha = alpha = it.alpha;
    const sx = it.col * d.w;
    const sy = it.row * d.h;
    const dw = d.w * it.scale;
    const dh = d.h * it.scale;
    let x = it.x * TILE;
    let y = it.z * TILE;
    if (it.mode === MODE_FEET) y += FEET_DOWN - it.lift * TILE - dh / 2;
    else if (it.mode === MODE_FLOOR) y += it.feet ? FEET_DOWN : 0;
    else y -= (it.lift - 0.5) * TILE;
    if (it.turn) {
      // Turned along its path about its middle (a bolt's head is two pixels ahead of it).
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(Math.atan2(it.dz, it.dx));
      const ahead = it.mode === MODE_HEAD && d.anchor === 'head' ? 2 : 0;
      ctx.drawImage(image, sx, sy, d.w, d.h, -dw / 2 - ahead * it.scale, -dh / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(image, sx, sy, d.w, d.h, Math.round(x - dw / 2), Math.round(y - dh / 2), dw, dh);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = was;
}

/** The effects' light as the canvas' own lights (a soft disc each), added to `lights`. */
export function addFxLights(lights: Light[], now: number, visible: ArrayLike<boolean> | null): void {
  if (!fxp.ready) return;
  const n = fxp.lightsInto(now, MAX_LIGHTS, visible, lit);
  for (let i = 0; i < n; i++) {
    const l = lit[i]!;
    lights.push({ x: l.x * TILE, y: l.z * TILE, radius: l.light.radius * TILE, color: l.light.css, strength: (l.light.intensity / 8) * l.level });
  }
}
