import type { QuestCard } from './questcard';
import type { QuestWords } from './quest-words';

/*
 * The words of a quest card, made from the card (questcard.ts) and the texts (quest-words.ts): the goal, the progress line
 * («Ore: 3 / 15», «Rose: not found»), the reward on offer, and the HUD chip's short line. Pure, so that both languages are checked.
 */

/** «Ore: 3 / 15» for a counted errand, «Rose: not found» for a single thing, and nothing for a finished one. */
export function progressLine(card: QuestCard, words: QuestWords): string {
  const label = words.card.label[card.goal];
  if (card.count) return words.card.progress(label, card.count.have, card.count.need);
  const state = words.card.state[card.goal];
  return state ? words.card.flag(label, state[card.found ? 1 : 0]) : label;
}

export const goalLine = (card: QuestCard, words: QuestWords): string => words.card.goal[card.goal];

/** The reward as the card offers it; the blacksmith's says whether his reforging is still to be had once the errand is done. */
export function rewardLine(card: QuestCard, words: QuestWords): string {
  const base = words.card.reward[card.reward];
  return card.stage === 'done' && card.spent !== undefined ? `${base} (${words.card.spent[card.spent ? 1 : 0]})` : base;
}

/** The line that sums the stage up under the progress: where to go next. Null while the errand is under way. */
export const stageLine = (card: QuestCard, words: QuestWords): string | null =>
  card.stage === 'ready' ? words.card.backTo[card.id] : card.stage === 'done' ? words.card.done : null;

/** What the HUD chip says: the progress («Ore 3/15», «Rose: no»), or where to go once the goal is met. */
export function chipLine(card: QuestCard, words: QuestWords): string {
  if (card.stage === 'ready') return words.card.chipBack[card.id];
  const label = words.card.label[card.goal];
  if (card.count) return `${label} ${card.count.have}/${card.count.need}`;
  const state = words.card.state[card.goal];
  return state ? words.card.flag(label, state[card.found ? 1 : 0]) : label;
}

/** The toast for a quest item taken up (null when it is not one): the count so far, or the word that the thing is found. */
export function pickupToast(card: QuestCard, words: QuestWords): string | null {
  if (card.count) return words.toast.count(words.card.label[card.goal], card.count.have, card.count.need);
  return words.toast.found[card.goal] ?? null;
}
