/*
 * The short things drawn over the scene for a moment (r3d/places3d.ts): a column of light, a «z», a ring's spikes, a glyph's rune. A fixed
 * pool, written in place, so nothing is made when one starts or while it is drawn. A stamp that has run its life frees its slot.
 */

const CAP = 48;

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export const stamps = {
  cap: CAP,
  BEAM: 1,
  Z: 2,
  SPIKES: 3,
  RUNE: 4,
  CRACKS: 5,
  used: new Uint8Array(CAP),
  kind: new Uint8Array(CAP),
  /** Where it stands, in cells (x, z), and how high above the floor its middle is. */
  x: new Float32Array(CAP),
  z: new Float32Array(CAP),
  lift: new Float32Array(CAP),
  size: new Float32Array(CAP),
  rot: new Float32Array(CAP),
  /** Its colour, linear. */
  r: new Float32Array(CAP),
  g: new Float32Array(CAP),
  b: new Float32Array(CAP),
  born: new Float64Array(CAP),
  life: new Float32Array(CAP),
  next: 0,

  /** Starts one at `now` (the game clock), for `life` ms; `rgb` is sRGB 0..1. The oldest goes if the pool is full. */
  add(kind: number, x: number, z: number, lift: number, now: number, life: number, rgb: readonly [number, number, number], size = 1, rot = 0): void {
    let i = -1;
    for (let k = 0; k < CAP; k++) if (!this.used[k]) { i = k; break; }
    if (i < 0) i = this.next++ % CAP;
    this.used[i] = 1;
    this.kind[i] = kind;
    this.x[i] = x;
    this.z[i] = z;
    this.lift[i] = lift;
    this.size[i] = size;
    this.rot[i] = rot;
    this.r[i] = lin(rgb[0]);
    this.g[i] = lin(rgb[1]);
    this.b[i] = lin(rgb[2]);
    this.born[i] = now;
    this.life[i] = life;
  },

  /** Whether any is running or waiting (the scene is drawn while one is). */
  busy(now: number): boolean {
    for (let k = 0; k < CAP; k++) if (this.used[k] && now - this.born[k]! < this.life[k]!) return true;
    return false;
  },

  clear(): void {
    this.used.fill(0);
  },
};
