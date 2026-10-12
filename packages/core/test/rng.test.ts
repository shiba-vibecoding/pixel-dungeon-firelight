import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/rng';

/*
 * java-rng.json is produced by the Java implementation:
 *   gradlew desktop:referenceDump -PdumpArgs="rng <path>"   (in pd-gdx)
 * The same script of calls must give bit-identical results here.
 */
interface JavaRngCase {
  seed: string;
  raw: number[];
  float: number[];
  floatMax: number[];
  floatRange: number[];
  int: number[];
  intBetween: number[];
  intRange: number[];
  normalIntRange: number[];
  chances: number[];
  shuffle: number[];
}

const cases: JavaRngCase[] = JSON.parse(
  readFileSync(new URL('./fixtures/java-rng.json', import.meta.url), 'utf8'),
);

const view = new DataView(new ArrayBuffer(4));
function floatBits(value: number): number {
  view.setFloat32(0, value);
  return view.getInt32(0);
}

function repeat<T>(count: number, fn: () => T): T[] {
  return Array.from({ length: count }, fn);
}

describe('Rng matches the Java seeded generator', () => {
  for (const reference of cases) {
    it(`seed ${reference.seed}`, () => {
      const rng = Rng.seeded(BigInt(reference.seed));
      expect(repeat(50, () => rng.int(16777216))).toEqual(reference.raw);
      expect(repeat(20, () => floatBits(rng.float()))).toEqual(reference.float);
      expect(repeat(20, () => floatBits(rng.floatMax(Math.fround(3.5))))).toEqual(reference.floatMax);
      expect(repeat(20, () => floatBits(rng.floatRange(Math.fround(0.25), Math.fround(7.75))))).toEqual(
        reference.floatRange,
      );
      expect(repeat(20, () => rng.int(10))).toEqual(reference.int);
      expect(repeat(20, () => rng.intBetween(5, 17))).toEqual(reference.intBetween);
      expect(repeat(20, () => rng.intRange(-3, 3))).toEqual(reference.intRange);
      expect(repeat(20, () => rng.normalIntRange(1, 12))).toEqual(reference.normalIntRange);
      const weights = [0.02, 0.01, 0.2, 1, 0, 5.5].map(Math.fround);
      expect(repeat(20, () => rng.chances(weights))).toEqual(reference.chances);
      const deck = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      rng.shuffle(deck);
      expect(deck).toEqual(reference.shuffle);
    });
  }

  it('state is plain data: a copy continues the same stream', () => {
    const a = Rng.seeded(7n);
    a.int(100);
    const b = new Rng(structuredClone(a.state));
    expect(repeat(10, () => a.int(1000))).toEqual(repeat(10, () => b.int(1000)));
  });
});
