/*
 * Firelight is a 3D game: there is no switch and no fallback to the classic view. The governor (governor.ts) only steps the quality
 * down on a weak device. The keys earlier builds kept (a choice of 2D, a remembered fallback) are forgotten on start.
 */

const OLD_KEYS = ['pd-3d', 'pd-3d-v', 'pd-3d-fell'] as const;

export interface Storage3D {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

/** Forgets what earlier builds stored about the 2D view; storage injected for tests. */
export function forgetOld3dChoice(storage: Storage3D | null = defaultStorage()): void {
  try {
    for (const key of OLD_KEYS) if (storage?.getItem(key) !== null) storage?.removeItem(key);
  } catch {
    // Nothing to forget.
  }
}

function defaultStorage(): Storage3D | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
