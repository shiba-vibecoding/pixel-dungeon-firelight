/*
 * The switch «Новая графика (бета)»: the 3D renderer, off by default, kept on this device. When the 3D renderer
 * cannot keep up (governor.ts) or cannot start, the game turns the switch off by itself and says so.
 */

const KEY = 'pd-3d';

export interface Storage3D {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): Storage3D | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The kept choice, with storage injected for tests. */
export class Beta3D {
  on: boolean;

  constructor(private readonly storage: Storage3D | null = defaultStorage()) {
    try {
      this.on = storage?.getItem(KEY) === 'on';
    } catch {
      this.on = false;
    }
  }

  set(on: boolean): void {
    this.on = on;
    try {
      this.storage?.setItem(KEY, on ? 'on' : 'off');
    } catch {
      // This session only.
    }
  }
}

export const beta3d = new Beta3D();

/**
 * Whether a floor is drawn in 3D when the switch is on: every depth, in the look of its region (the world kit has all five and the
 * five boss arenas); the arena of waves, which dresses its own sand and stands, stays in 2D.
 */
export function covers3D(_depth: number, _region: number, arena: boolean): boolean {
  return !arena;
}
