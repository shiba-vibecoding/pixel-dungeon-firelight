/*
 * The switch for the 3D renderer, kept on this device. It is ON by default: the best graphics are what everyone starts with. The
 * governor (governor.ts) still steps the quality down on a weak device, and when 3D cannot keep up or cannot start the game puts it
 * away by itself (`fallBack`: remembered, so the device does not try again every launch, until the player turns it on). A manual choice in
 * Settings is kept too. Before version 2 an 'off' was stored for the player who never chose (and for an automatic fallback): those
 * count as the default now, so they get the 3D view.
 */

const KEY = 'pd-3d';
const VERSION_KEY = 'pd-3d-v';
const FELL_KEY = 'pd-3d-fell';
const VERSION = '2';

export interface Storage3D {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
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
  /** The player chose in Settings (as against the default or an automatic fallback). */
  chosen: boolean;

  constructor(private readonly storage: Storage3D | null = defaultStorage()) {
    let choice: string | null = null;
    let fell = false;
    try {
      const raw = storage?.getItem(KEY) ?? null;
      if (storage?.getItem(VERSION_KEY) === VERSION && (raw === 'on' || raw === 'off')) choice = raw;
      fell = storage?.getItem(FELL_KEY) === '1';
    } catch {
      // The default.
    }
    this.chosen = choice !== null;
    this.on = choice !== null ? choice === 'on' : !fell;
  }

  /** The player's own choice (Settings). */
  set(on: boolean): void {
    this.on = on;
    this.chosen = true;
    try {
      this.storage?.setItem(VERSION_KEY, VERSION);
      this.storage?.setItem(KEY, on ? 'on' : 'off');
      if (on) this.safeRemove(FELL_KEY);
    } catch {
      // This session only.
    }
  }

  /** The game put 3D away by itself (too slow, would not start): off until the player turns it on. */
  fallBack(): void {
    this.on = false;
    this.chosen = false;
    try {
      this.safeRemove(KEY);
      this.storage?.setItem(FELL_KEY, '1');
    } catch {
      // This session only.
    }
  }

  private safeRemove(key: string): void {
    if (this.storage?.removeItem) this.storage.removeItem(key);
    else this.storage?.setItem(key, '');
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
