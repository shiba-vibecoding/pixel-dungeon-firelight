import type { Goal, QuestId, Reward } from './questcard';

/*
 * What the quest givers and the quest card say: the shape of the texts (the words themselves are i18n-quest.ts, English, and
 * i18n-quest.ru.ts, Russian) and the little that is done with them.
 *
 * Every spoken line is a pair: the clean version first, the foul one second. «Foul» is the fork's quip setting «с матом» (quips.ts):
 * only there does a quest giver swear; «без мата» and «выкл» both get the clean line. A line with no foul version says the same in
 * both. The lines keep every fact of the original's (what is wanted, where, what is given); the numbers are filled in from the core's
 * own (ORE_WANTED, TOKENS_WANTED) through {n}, never typed into the text.
 */

/** A spoken line: [clean, foul?]. */
export type Say = readonly [clean: string, foul?: string];

export type Register = 'clean' | 'foul';

/** The quip setting, as far as it concerns words: only «foul» swears. */
export const registerOf = (mode: 'foul' | 'clean' | 'off'): Register => (mode === 'foul' ? 'foul' : 'clean');

/** What a line may name: the number wanted, the number the hero has, the hero's class. */
export interface Vars {
  n?: number;
  have?: number;
  cls?: string;
}

/** The line in the register, with {n}, {have} and {cls} filled in. */
export function say(line: Say, register: Register, vars: Vars = {}): string {
  const text = register === 'foul' ? line[1] ?? line[0] : line[0];
  return text.replace(/\{(n|have|cls)\}/g, (_, key: 'n' | 'have' | 'cls') => String(vars[key] ?? ''));
}

/** Every spoken line of the four givers. */
export const LINE_IDS = [
  'ghost.intro.rose', 'ghost.intro.rat', 'ghost.intro.curse',
  'ghost.remind.rose', 'ghost.remind.rat', 'ghost.remind.curse',
  'ghost.reward.rose', 'ghost.reward.rat', 'ghost.reward.curse',
  'ghost.farewell', 'ghost.ask', 'ghost.where.rose', 'ghost.where.rat',
  'wand.intro.dust', 'wand.intro.berry', 'wand.intro.fish',
  'wand.remind.dust', 'wand.remind.berry', 'wand.remind.fish',
  'wand.reward', 'wand.farewell', 'wand.ask', 'wand.where.dust', 'wand.where.berry', 'wand.where.fish',
  'smith.intro.gold', 'smith.intro.blood', 'smith.noPickaxe', 'smith.noGold', 'smith.noBlood', 'smith.completed', 'smith.reforge', 'smith.busy',
  'smith.ask', 'smith.where.gold', 'smith.where.blood',
  'imp.intro.golem', 'imp.intro.monk', 'imp.remind.golem', 'imp.remind.monk', 'imp.reward', 'imp.farewell', 'imp.ask', 'imp.where.golem', 'imp.where.monk',
] as const;
export type LineId = (typeof LINE_IDS)[number];

/** The little answers the player taps, in each giver's own manner. They change nothing: a tap closes, or asks for a word more. */
export interface ReplyWords {
  ok: Say;
  later: Say;
  /** «And what do I get for it?» */
  ask: Say;
  /** «Where do I look?» */
  where: Say;
  bye: Say;
}

export interface QuestWords {
  lines: Record<LineId, Say>;
  replies: Record<QuestId, ReplyWords>;
  /** The line under the giver's name in the dialogue. */
  role: Record<QuestId, string>;
  card: {
    title: string;
    depth: (n: number) => string;
    goal: Record<Goal, string>;
    /** The short name of what is counted or sought: «Ore», «Tokens». */
    label: Record<Goal, string>;
    /** For what is one thing: [not yet, yes]. */
    state: Partial<Record<Goal, readonly [string, string]>>;
    reward: Record<Reward, string>;
    rewardTitle: string;
    spent: readonly [string, string];
    backTo: Record<QuestId, string>;
    chipBack: Record<QuestId, string>;
    done: string;
    noPickaxe: string;
    progress: (label: string, have: number, need: number) => string;
    flag: (label: string, state: string) => string;
  };
  toast: {
    count: (label: string, have: number, need: number) => string;
    found: Partial<Record<Goal, string>>;
  };
  talk: {
    skip: string;
    done: string;
    rewardIs: string;
  };
}
