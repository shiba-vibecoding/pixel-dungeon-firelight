import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawVignette, type VignetteScene } from '../src/vignette';

/** A canvas context that only remembers what the vignette asked of it. */
function recorder(width: number, height: number): { ctx: CanvasRenderingContext2D; gradients: number[][]; fills: number[][] } {
  const gradients: number[][] = [];
  const fills: number[][] = [];
  const ctx = {
    canvas: { width, height },
    globalAlpha: 1,
    fillStyle: '',
    createRadialGradient: (...args: number[]) => {
      gradients.push(args);
      return { addColorStop: () => undefined };
    },
    fillRect: (...args: number[]) => void fills.push(args),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, gradients, fills };
}

const scene = (focus: { x: number; y: number }, on = true): VignetteScene => ({ focus, vignette: on });

describe('the hero\'s light at the view\'s edges', () => {
  it('is drawn on the canvas in the frame of the camera: at every step of a zoom its middle is where the hero is on the screen', () => {
    const focus = { x: 300, y: 420 };
    // The camera of a zoom in progress: zoom and position change together every frame, as camcontrol.ts moves them.
    for (const zoom of [1, 1.17, 1.6, 2.05, 2.7, 3]) {
      const camera = { x: 200 - zoom * 4, y: 330 - zoom * 3, zoom, ys: Math.sin((70 * Math.PI) / 180) };
      const { ctx, gradients, fills } = recorder(800, 600);
      drawVignette(ctx, scene(focus), camera);
      expect(gradients).toHaveLength(1);
      const [x0, y0, r0, x1, y1] = gradients[0]!;
      const heroX = (focus.x - camera.x) * zoom;
      const heroY = (focus.y - camera.y) * zoom * camera.ys;
      expect(x0).toBeCloseTo(heroX, 6);
      expect(y0).toBeCloseTo(heroY, 6);
      // One gradient from one centre, the lit disc as wide as three tiles of this very zoom.
      expect([x1, y1]).toEqual([x0, y0]);
      expect(r0).toBeCloseTo(16 * zoom * 3, 6);
      expect(fills).toEqual([[0, 0, 800, 600]]);
    }
  });

  it('is not drawn on the light effects', () => {
    const { ctx, gradients } = recorder(800, 600);
    drawVignette(ctx, scene({ x: 10, y: 10 }, false), { x: 0, y: 0, zoom: 2 });
    expect(gradients).toHaveLength(0);
  });

  it('is no layer of the page that could move on its own', () => {
    expect(readFileSync(new URL('../index.html', import.meta.url), 'utf8')).not.toContain('vignette');
    expect(readFileSync(new URL('../src/game.css', import.meta.url), 'utf8')).not.toContain('#vignette');
  });
});
