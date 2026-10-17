/*
 * The typewriter of a dialogue: a line comes out letter by letter, a little slower at the end of a clause and a sentence, and a tap
 * brings out the rest at once. Pure: the schedule of a text and how much of it is shown after so long. The window (questui.ts) only
 * draws what this says, and plays a blip now and then.
 */

/** Letters a second at the even pace. */
export const CPS = 80;
/** The extra wait after a clause's end and a sentence's, ms. */
export const CLAUSE_MS = 70;
export const SENTENCE_MS = 150;

const SENTENCE_END = /[.!?…]/;
const CLAUSE_END = /[,;:—]/;

/** When each letter of the text has come out, ms from the start (the first at once); one entry per UTF-16 unit. */
export function schedule(text: string, cps = CPS): Float64Array {
  const times = new Float64Array(text.length);
  const step = 1000 / cps;
  let at = 0;
  for (let i = 0; i < text.length; i++) {
    times[i] = at;
    const ch = text[i]!;
    const next = text[i + 1] ?? ' ';
    // A pause only where the mark ends something: not inside «...» (the dots), not before a closing quote or a letter.
    if (SENTENCE_END.test(ch) && !SENTENCE_END.test(next) && /[\s»"')]/.test(next)) at += SENTENCE_MS;
    else if (CLAUSE_END.test(ch) && /\s/.test(next)) at += CLAUSE_MS;
    at += ch === ' ' ? step * 0.5 : step;
  }
  return times;
}

/** How long the whole text takes, ms. */
export function totalMs(text: string, cps = CPS): number {
  if (text.length === 0) return 0;
  const times = schedule(text, cps);
  return times[times.length - 1]! + 1000 / cps;
}

/** How many letters are out after `elapsed` ms (all of them once the schedule is through). */
export function shown(times: Float64Array, elapsed: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (times[mid]! <= elapsed) low = mid + 1;
    else high = mid;
  }
  return low;
}
