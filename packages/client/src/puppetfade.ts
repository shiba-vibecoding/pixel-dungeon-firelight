/*
 * How opaque a figure is, as the original's AlphaTweener makes it: a wraith rising fades in over half a second, a ghost and the curse
 * that binds it swap places by one fading out as the other fades in, and the dead soft-bodied fade away after their death. No game
 * state, nothing from the page: only what a figure carries.
 */

export interface Fading {
  alive: boolean;
  isHero: boolean;
  laid?: boolean;
  fallStart?: number;
  removeAt: number;
  fadeMs?: number;
  fade?: { start: number; ms: number; from: number; to: number };
}

/** How opaque a figure is now: its fade in or out, and, dying (when `dying`), its fading away after the death. 1 for a whole figure. */
export function puppetAlpha(puppet: Fading, now: number, dying = true): number {
  let a = 1;
  const f = puppet.fade;
  if (f) a = f.from + (f.to - f.from) * Math.max(0, Math.min(1, (now - f.start) / f.ms));
  if (dying && !puppet.alive && !puppet.isHero && !puppet.laid && puppet.fallStart === undefined) {
    a *= Math.max(0, Math.min(1, (puppet.removeAt - now) / (puppet.fadeMs ?? 700)));
  }
  return a;
}
