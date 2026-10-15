import { CHALLENGES } from '@pd/core';

/*
 * What the camp and the first screen need to know about the challenges, and the device's erasing: apart from meta.ts (the windows), which is a
 * chunk of its own fetched when one is opened.
 */

/** The challenges in the original's order, as bits (Challenges.MASKS): the order of the list in `t.meta.challengeList`. */
export const CHALLENGE_MASKS: readonly number[] = CHALLENGES.map((challenge) => challenge.mask);

export function countChallenges(mask: number): number {
  return CHALLENGE_MASKS.filter((bit) => mask & bit).length;
}

/** Everything this game keeps on the device, except what the season clears elsewhere and what is bought (purchases live on the server). */
export function eraseDevice(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('pd-')) localStorage.removeItem(key);
    }
    sessionStorage.clear();
  } catch {
    // Nothing could be kept either.
  }
}
