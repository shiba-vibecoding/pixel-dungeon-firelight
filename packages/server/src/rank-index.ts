/*
 * How many players are on a board, and where any one of them stands, however far down: a sorted list of their rank keys (slices.ts
 * rankKey), best first. The board object keeps full entries for its top 100 only; everyone else is a number here and their own entry in
 * a row of its own. Pure; the board object stores `keys`.
 */

export class RankIndex {
  constructor(readonly keys: number[] = []) {}

  /** How many players. */
  get size(): number {
    return this.keys.length;
  }

  /** First position (0-based) whose key is not greater than `key` (the list is best first). */
  private after(key: number): number {
    let low = 0;
    let high = this.keys.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.keys[mid]! > key) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  /** The place (1-based) a key would take: one above the number of players strictly ahead of it. */
  rankOf(key: number): number {
    return this.after(key) + 1;
  }

  /** A player came in with this key, or bettered `old` to `key`. */
  add(key: number, old?: number): void {
    if (old !== undefined) this.remove(old);
    this.keys.splice(this.after(key), 0, key);
  }

  private remove(key: number): void {
    const at = this.after(key);
    // `after` stops at the first key not greater than ours: the same key if it is there.
    if (this.keys[at] === key) this.keys.splice(at, 1);
  }
}
