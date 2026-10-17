import type { MobKind } from '@pd/core';
import type { Goal, QuestCard, QuestId } from './questcard';

/*
 * The designer's quest art on the card (assets/ui/quest/icons.png, progress.png, quest.json): which tile of the icon sheet is each
 * errand's goal and each giver's face, and the steps of the bar. Pure data and sums: what is counted is questcard.ts's, which counts
 * from the world and the pack only, so none of this can give away what the dungeon keeps hidden.
 */

/** The goal icons' tiles (row 0 of icons.png; quest.json icons.goals): the rose, the skull, the dust, the seed, the fish, the ore, the blood, the tokens, the curse. */
export const GOAL_ICON: Readonly<Record<Goal, number>> = {
  rose: 0, skull: 1, dust: 2, berry: 3, fish: 4, ore: 5, blood: 6, monk: 7, golem: 8, curse: 10,
};

/** The pickaxe's tile (the blacksmith's tool, quest.json goals.blacksmith.*.tool). */
export const PICKAXE_ICON = 9;

/** The givers' faces for the card and the HUD (row 1 of icons.png; quest.json icons.badges). */
export const BADGE_ICON: Readonly<Record<QuestId, number>> = { ghost: 0, wandmaker: 1, smith: 2, imp: 3 };

/** The portrait row each giver has in the designer's sheet (the class of `.fl-portrait`); the Rat King has none. */
export const PORTRAIT_OF: Readonly<Partial<Record<MobKind, 'ghost' | 'wandmaker' | 'blacksmith' | 'imp'>>> = {
  ghost: 'ghost', wandmaker: 'wandmaker', blacksmith: 'blacksmith', imp: 'imp',
};

/** The podium each reward stands on (the class of `.fl-reward-slot`, quest.json rewards): the ghost's weapon and armour, a wand, a ring. */
export function rewardKind(id: QuestId, index: number): string | null {
  switch (id) {
    case 'ghost': return index === 0 ? 'ghost-weapon' : 'ghost-armor';
    case 'wandmaker': return index === 0 ? 'wand-battle' : 'wand-utility';
    case 'imp': return 'ring';
    default: return null;
  }
}

/** The bar has a step a unit while the goal is no more than this many (quest.json progress.note). */
export const STEP_LIMIT = 15;

/** How the bar of a card is laid out: how many steps, how many are done, whether the whole is green (the goal is met or the errand over). */
export interface Steps {
  of: number;
  done: number;
  green: boolean;
}

/** The steps of a card: a step a unit for a counted errand (ore 15, tokens 8 or 6), one step for a single thing; a share beyond the limit. */
export function stepsOf(card: QuestCard): Steps {
  const green = card.stage !== 'active';
  if (card.count) {
    const { have, need } = card.count;
    if (need <= STEP_LIMIT) return { of: need, done: Math.min(have, need), green };
    return { of: STEP_LIMIT, done: Math.round((Math.min(have, need) / need) * STEP_LIMIT), green };
  }
  return { of: 1, done: card.found || card.stage === 'done' ? 1 : 0, green };
}
