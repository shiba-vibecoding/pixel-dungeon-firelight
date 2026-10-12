import { HEIGHT, LENGTH, WIDTH } from './level/geometry';
import { F, hasFlag } from './level/terrain';

/*
 * Field of view: recursive shadow casting in eight sectors, ported from the
 * original ShadowCaster. Rows are scanned outward from the viewer; every
 * line-of-sight blocker adds an angular interval that hides the cells behind.
 */

export const MAX_VIEW_DISTANCE = 8;

/** rounding[r][p]: how far a row p cells out extends within a circle of radius r. */
const rounding: number[][] = (() => {
  const table: number[][] = [[]];
  for (let r = 1; r <= MAX_VIEW_DISTANCE; r++) {
    const row = new Array<number>(r + 1).fill(0);
    for (let p = 1; p <= r; p++) {
      row[p] = Math.min(p, Math.round(r * Math.cos(Math.asin(p / (r + 0.5)))));
    }
    table.push(row);
  }
  return table;
})();

class Obstacles {
  private readonly a1: number[] = [];
  private readonly a2: number[] = [];
  private length = 0;
  private limit = 0;

  reset(): void {
    this.length = 0;
    this.limit = 0;
  }

  add(o1: number, o2: number): void {
    if (this.length > this.limit && o1 <= this.a2[this.length - 1]!) {
      // Adjacent blocking cells merge into one interval.
      this.a2[this.length - 1] = o2;
    } else {
      this.a1[this.length] = o1;
      this.a2[this.length++] = o2;
    }
  }

  isBlocked(a: number): boolean {
    for (let i = 0; i < this.limit; i++) {
      if (a >= this.a1[i]! && a <= this.a2[i]!) {
        return true;
      }
    }
    return false;
  }

  nextRow(): void {
    this.limit = this.length;
  }
}

/** Cells visible from `pos`, given which cells block line of sight. */
export function castShadow(pos: number, losBlocking: (cell: number) => boolean, distance = MAX_VIEW_DISTANCE): boolean[] {
  const fov = new Array<boolean>(LENGTH).fill(false);
  const cx = pos % WIDTH;
  const cy = Math.trunc(pos / WIDTH);
  const limits = rounding[Math.min(distance, MAX_VIEW_DISTANCE)]!;
  const obstacles = new Obstacles();
  fov[pos] = true;

  const scan = (m1: number, m2: number, m3: number, m4: number): void => {
    obstacles.reset();
    for (let p = 1; p <= distance; p++) {
      const dq2 = 0.5 / p;
      for (let q = 0; q <= limits[p]!; q++) {
        const x = cx + q * m1 + p * m3;
        const y = cy + p * m2 + q * m4;
        if (y < 0 || y >= HEIGHT || x < 0 || x >= WIDTH) continue;
        const a0 = q / p;
        const a1 = a0 - dq2;
        const a2 = a0 + dq2;
        const cell = y * WIDTH + x;
        if (!(obstacles.isBlocked(a0) && obstacles.isBlocked(a1) && obstacles.isBlocked(a2))) {
          fov[cell] = true;
        }
        if (losBlocking(cell)) {
          obstacles.add(a1, a2);
        }
      }
      obstacles.nextRow();
    }
  };

  scan(+1, +1, 0, 0);
  scan(-1, +1, 0, 0);
  scan(+1, -1, 0, 0);
  scan(-1, -1, 0, 0);
  scan(0, 0, +1, +1);
  scan(0, 0, -1, +1);
  scan(0, 0, +1, -1);
  scan(0, 0, -1, -1);
  return fov;
}

export function terrainBlocksSight(map: readonly number[]): (cell: number) => boolean {
  return (cell) => hasFlag(map[cell]!, F.LOS_BLOCKING);
}
