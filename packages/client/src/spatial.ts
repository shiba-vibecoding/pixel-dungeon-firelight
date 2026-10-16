/*
 * Where a sound comes from, as the hero hears it: panned to the side it came from, quieter and duller the farther it is.
 * Pure arithmetic (no audio), so audio.ts and the tests share it.
 */

export interface Place {
  x: number;
  y: number;
}

/** World pixels per cell, for distances. */
export const CELL = 16;

/** Beyond this many cells a sound is not heard at all. */
export const EARSHOT = 30;

export interface Heard {
  /** Multiplies the sound's level, 0..1. */
  gain: number;
  /** -1 (left) to 1 (right), never all the way: the hero is in the middle of the world. */
  pan: number;
  /** A low-pass at this many Hz (20000: none): air takes the top off what is far. */
  cutoff: number;
  /** Cells away. */
  distance: number;
  audible: boolean;
}

/** How a sound at `source` is heard by a hero at `listener` (both in world pixels). */
export function heard(source: Place, listener: Place): Heard {
  const dx = (source.x - listener.x) / CELL;
  const dy = (source.y - listener.y) / CELL;
  const distance = Math.hypot(dx, dy);
  const gain = 1 / (1 + Math.max(0, distance - 1.5) * 0.14);
  const cutoff = distance <= 4 ? 20000 : Math.max(900, 16000 / (1 + (distance - 4) * 0.35));
  return {
    gain,
    pan: Math.max(-0.75, Math.min(0.75, dx / 7)),
    cutoff,
    distance,
    audible: distance <= EARSHOT && gain >= 0.01,
  };
}
