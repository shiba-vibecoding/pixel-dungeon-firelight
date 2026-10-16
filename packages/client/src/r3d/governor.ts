/*
 * The new renderer's keeper of frame time, with no DOM and no clock of its own (frames come in with their lengths, so tests run
 * under a virtual one): it measures the display's real refresh from the gaps between animation frames, picks the highest quality
 * tier that still holds that refresh while the player is moving. There is no going back to 2D: the lowest tier is kept, whatever
 * the pace.
 */

/** Settings of each tier: the 3D renderer reads them, and nothing else decides them. */
export interface Tier {
  name: 'high' | 'mid' | 'low' | 'min';
  /** Shadow-casting torches (0 to 2) and the size of their maps (phones: 512). */
  shadowLights: number;
  /** The most device pixels per CSS pixel the canvas has. */
  dpr: number;
  /** Mist, dust and light shafts. */
  particles: boolean;
}

export const TIERS: readonly Tier[] = [
  { name: 'high', shadowLights: 2, dpr: 2, particles: true },
  { name: 'mid', shadowLights: 1, dpr: 2, particles: true },
  { name: 'low', shadowLights: 0, dpr: 1.5, particles: false },
  { name: 'min', shadowLights: 0, dpr: 1, particles: false },
];

/** From this tier down, a 120 Hz screen held at a playable 60 is good enough (it is not stepped further down for the 120). */
const SETTLE = TIERS.findIndex((tier) => tier.name === 'low');

/** Refreshes a screen has; the measured one is rounded to the nearest. */
const RATES = [30, 48, 60, 72, 90, 120, 144, 165] as const;

/** Reads the display's refresh rate from animation frame times alone. */
export class RefreshMeter {
  private readonly gaps: number[] = [];
  private last = -1;
  private rate = 60;
  private since = 0;

  /** Notes an animation frame (its timestamp, ms). Gaps over 60 ms (a hidden tab, a window) are not frames of the display's own pace. */
  note(now: number): void {
    const gap = this.last < 0 ? -1 : now - this.last;
    this.last = now;
    if (gap <= 0 || gap > 60) return;
    this.gaps.push(gap);
    if (this.gaps.length > 90) this.gaps.shift();
    if (++this.since < 30 || this.gaps.length < 30) return;
    this.since = 0;
    // A frame the page dropped is a longer gap, never a shorter one: the display's period is the low end of the gaps.
    const sorted = [...this.gaps].sort((a, b) => a - b);
    const period = sorted[Math.floor(sorted.length * 0.25)]!;
    const hz = 1000 / period;
    this.rate = RATES.reduce((best, r) => (Math.abs(r - hz) < Math.abs(best - hz) ? r : best), 60 as number);
  }

  get hz(): number {
    return this.rate;
  }
}

/** How a frame is judged. */
export interface GovernorOptions {
  /** How long frames are watched before a verdict (ms of moving frames). */
  windowMs?: number;
  /** A tier holds while its average frame is within this many times the display's period. */
  slack?: number;
}

export type Verdict = 'ok' | 'demote';

export class Governor {
  private index = 0;
  private sum = 0;
  private count = 0;
  private elapsed = 0;
  private holding = 0;

  constructor(private readonly options: GovernorOptions = {}) {}

  get tier(): Tier {
    return TIERS[this.index]!;
  }

  /**
   * Notes a frame the renderer drew while something was moving (a calm frame, drawn at the slow cadence, says nothing about
   * speed): `dt` is the time since the previous drawn frame, `hz` the display's refresh.
   */
  /** Frames are not judged for this long (ms of frames): shaders are being compiled, a floor built, a texture uploaded. */
  hold(ms: number): void {
    this.holding = Math.max(this.holding, ms);
    this.sum = this.count = this.elapsed = 0;
  }

  frame(dt: number, hz: number): Verdict {
    if (this.holding > 0) {
      if (dt > 0 && dt <= 250) this.holding -= dt;
      return 'ok';
    }
    // Gaps that are not frames (a window over the map, a hidden tab) are not counted.
    if (dt <= 0 || dt > 250) return 'ok';
    this.sum += dt;
    this.count++;
    this.elapsed += dt;
    if (this.elapsed < (this.options.windowMs ?? 1500)) return 'ok';
    const average = this.sum / this.count;
    this.sum = 0;
    this.count = 0;
    this.elapsed = 0;
    // Holding the refresh means frames come every period; a 120 Hz screen may settle for 60 when the phone cannot do more.
    const period = 1000 / Math.max(30, hz);
    const slack = this.options.slack ?? 1.3;
    const holds = average <= period * slack;
    const playable = average <= 1000 / 55;
    if (holds || (hz > 70 && playable && this.index >= SETTLE)) return 'ok';
    if (this.index < TIERS.length - 1) {
      this.index++;
      return 'demote';
    }
    // The lowest tier, however slow: it stays (Firelight has no 2D view to go back to).
    return 'ok';
  }
}
