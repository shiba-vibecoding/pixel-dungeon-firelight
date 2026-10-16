/*
 * The brightness setting («Яркость»): one number, 1 being the look the game had before the setting existed. It runs from very dark
 * (0.5) to much brighter (2.5), and starts a little above 1, because the dungeon was found too dark. The 3D view scales its exposure and
 * its ambient light by it (r3d/world3d.ts, so the dark outside the hero's light lifts and is not just washed grey), the 2D view puts a
 * brightness filter on its canvas (main.ts). Kept on this device, and applied live.
 */

export const BRIGHTNESS_MIN = 0.5;
export const BRIGHTNESS_MAX = 2.5;
export const BRIGHTNESS_DEFAULT = 1.3;
const KEY = 'pd-brightness';

export const clampBrightness = (value: number): number =>
  Number.isFinite(value) ? Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, value)) : BRIGHTNESS_DEFAULT;

function load(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? BRIGHTNESS_DEFAULT : clampBrightness(Number(raw));
  } catch {
    return BRIGHTNESS_DEFAULT;
  }
}

class Brightness {
  value = load();
  private readonly listeners = new Set<(value: number) => void>();

  set(value: number): void {
    this.value = clampBrightness(value);
    try {
      localStorage.setItem(KEY, String(Math.round(this.value * 100) / 100));
    } catch {
      // For this session only.
    }
    for (const listener of this.listeners) listener(this.value);
  }

  reset(): void {
    this.set(BRIGHTNESS_DEFAULT);
  }

  /** Called with each new value (the 2D view's filter). */
  onChange(listener: (value: number) => void): void {
    this.listeners.add(listener);
  }
}

export const brightness = new Brightness();
