/*
 * The hero's light: the view's edges sink into the dark. Drawn on the canvas, with no DOM and no state, so it can be tested.
 */

import { TILE_PX } from './r3d/project';

/** What the vignette needs of a scene: the hero's place in world pixels, and whether it is on at all. */
export interface VignetteScene {
  focus?: { x: number; y: number };
  vignette?: boolean;
}

/** What it needs of the camera: the same numbers the map is drawn with this very frame. */
export interface VignetteCamera {
  x: number;
  y: number;
  zoom: number;
  /** How much the ground is squeezed up and down (the 3D view), 1 in 2D. */
  ys?: number;
}

/**
 * The hero's light, the view's edges sinking into the dark: a radial gradient on the canvas itself, in the very frame that moves
 * the camera and the hero, so it can never lag or drift from the map under it. (It was a layer of the page, moved with a transform
 * while its gradient was repainted at every step of a zoom; on a phone that repaint came late, and the dark slid off as a layer.)
 */
export function drawVignette(ctx: CanvasRenderingContext2D, scene: VignetteScene, camera: VignetteCamera): void {
  if (!scene.vignette || !scene.focus) return;
  const { canvas } = ctx;
  const x = (scene.focus.x - camera.x) * camera.zoom;
  const y = (scene.focus.y - camera.y) * camera.zoom * (camera.ys ?? 1);
  const inner = TILE_PX * camera.zoom * 3;
  const outer = Math.max(inner + 1, Math.max(canvas.width, canvas.height) * 0.7);
  const g = ctx.createRadialGradient(x, y, inner, x, y, outer);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

