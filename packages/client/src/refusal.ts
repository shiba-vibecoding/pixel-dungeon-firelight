/*
 * A step the game refuses (a locked door, the boss's locked exit, a barricade, a trap in the way) is said once, not at every try. A key held
 * down toward the refusal repeats the step many times a second (its own auto-repeat, and the walk that goes on by itself): with nothing
 * to stop it the log filled with the same line, ×138. So a refusal ends the held key (main.ts), and this keeps the words from coming
 * again for the same cell and the same reason sooner than `REPEAT_MS`; a tap a moment later, or at another door, is told again.
 */
export const REPEAT_MS = 2000;

export class Refusals {
  private readonly said = new Map<string, number>();

  /** Whether the refusal (`reason` at `cell`) is to be said now: not if it was said within REPEAT_MS. Remembers it when it is. */
  allow(cell: number, reason: string, now: number): boolean {
    const key = `${reason}@${cell}`;
    const last = this.said.get(key);
    if (last !== undefined && now - last >= 0 && now - last < REPEAT_MS) return false;
    this.said.set(key, now);
    // Small: forget what is long past.
    if (this.said.size > 64) for (const [k, t] of this.said) if (now - t > REPEAT_MS) this.said.delete(k);
    return true;
  }

  clear(): void {
    this.said.clear();
  }
}
