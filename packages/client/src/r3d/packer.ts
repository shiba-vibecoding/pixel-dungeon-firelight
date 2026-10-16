/*
 * Packs rectangles into a fixed area, one at a time as they arrive (the sprite atlas's sheets come in the order the player meets them,
 * not in an order that packs well). MaxRects, best short side fit: a list of the free rectangles, the new one goes into the free
 * rectangle it fits best, and every free rectangle it overlaps is cut around it. Sheets of very different heights (a 16-high monster
 * strip beside a 128-high hero sheet) share the area without leaving a tall empty shelf behind the way one-row packing does.
 *
 * It allocates only when something is placed, never when something already placed is looked up.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class RectPacker {
  private free: Rect[];

  constructor(readonly width: number, readonly height: number) {
    this.free = [{ x: 0, y: 0, w: width, h: height }];
  }

  /** Where a rectangle of w x h goes (its top-left corner), or null if it fits nowhere. */
  place(w: number, h: number): { x: number; y: number } | null {
    let best: Rect | null = null;
    let shortSide = Infinity;
    let longSide = Infinity;
    for (const r of this.free) {
      if (r.w < w || r.h < h) continue;
      const a = Math.min(r.w - w, r.h - h);
      const b = Math.max(r.w - w, r.h - h);
      // The tightest fit; among equals the higher, then the more left one, so the used part stays at the top.
      if (a < shortSide || (a === shortSide && (b < longSide || (b === longSide && best !== null && (r.y < best.y || (r.y === best.y && r.x < best.x)))))) {
        best = r;
        shortSide = a;
        longSide = b;
      }
    }
    if (!best) return null;
    const spot = { x: best.x, y: best.y };
    this.cut(spot.x, spot.y, w, h);
    return spot;
  }

  /** Cuts the used rectangle out of every free one it overlaps, and drops free rectangles that lie wholly inside another. */
  private cut(x: number, y: number, w: number, h: number): void {
    const next: Rect[] = [];
    for (const r of this.free) {
      if (x >= r.x + r.w || x + w <= r.x || y >= r.y + r.h || y + h <= r.y) {
        next.push(r);
        continue;
      }
      if (x > r.x) next.push({ x: r.x, y: r.y, w: x - r.x, h: r.h });
      if (x + w < r.x + r.w) next.push({ x: x + w, y: r.y, w: r.x + r.w - x - w, h: r.h });
      if (y > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: y - r.y });
      if (y + h < r.y + r.h) next.push({ x: r.x, y: y + h, w: r.w, h: r.y + r.h - y - h });
    }
    const kept: Rect[] = [];
    for (let i = 0; i < next.length; i++) {
      const a = next[i]!;
      let inside = false;
      for (let j = 0; j < next.length && !inside; j++) {
        if (i === j) continue;
        const b = next[j]!;
        const within = a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
        // Of two equal rectangles keep the first.
        inside = within && (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y);
      }
      if (!inside) kept.push(a);
    }
    this.free = kept;
  }
}
