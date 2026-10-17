import { type Hero, type Item, type MobKind, ORE_WANTED, TOKENS_WANTED, type World } from '@pd/core';
import { oreHeld, type QuestId, tokensHeld } from './questcard';
import { type LineId, type QuestWords, type Register, say, type Vars } from './quest-words';

/*
 * What each giver says at each moment, and what the player may tap in answer: the plan of a dialogue, worked out from the world and
 * handed to the window (questui.ts). Nothing here draws, and nothing here is a rule: the moments are the core's own (the lines it
 * sends: intro, remind, reward, farewell; the blacksmith's noPickaxe, noGold, noBlood, completed, reforge, busy), the facts in the
 * words are the original's, and the choices that really exist (the ghost's gift, the wand, the curse's yes and no) are not touched.
 * Words and register are parameters, so that both languages and both registers can be checked.
 */

export type TalkLine = 'intro' | 'remind' | 'reward' | 'farewell';

/** The face the giver wears, as the designer's portraits have it (assets/ui/quest/quest.json portraits.mood). */
export type Mood = 'calm' | 'pleased' | 'annoyed';

/**
 * The mood of a moment: the greeting and the reminder are calm; the errand done, the reward and the parting words pleased; not enough,
 * no pickaxe, no blood, a busy smith, annoyed. His services (the reforging window) are calm business.
 */
export function moodOf(line: TalkLine | SmithTalk): Mood {
  switch (line) {
    case 'reward': case 'farewell': case 'completed': return 'pleased';
    case 'noGold': case 'noPickaxe': case 'noBlood': case 'busy': return 'annoyed';
    default: return 'calm';
  }
}

export interface ReplyPlan {
  label: string;
  /** What the giver says back; absent for a reply that only closes the window. */
  answer?: string;
}

export interface TalkPlan {
  id: QuestId;
  kind: MobKind;
  text: string;
  replies: ReplyPlan[];
  /** The one button of a farewell. */
  bye?: string;
  offers: Item[];
  /** The errand is done: the banner and the fanfare. */
  complete: boolean;
  /** The face of the portrait. */
  mood: Mood;
}

const lineOf = (words: QuestWords, id: LineId, register: Register, vars: Vars): string => say(words.lines[id], register, vars);

/** The replies of a moment: the yes first, then what may be asked, then the way out. */
function repliesFor(words: QuestWords, id: QuestId, register: Register, vars: Vars, ask?: LineId, where?: LineId, later = true): ReplyPlan[] {
  const r = words.replies[id];
  return [
    { label: say(r.ok, register) },
    ...(ask ? [{ label: say(r.ask, register), answer: lineOf(words, ask, register, vars) }] : []),
    ...(where ? [{ label: say(r.where, register), answer: lineOf(words, where, register, vars) }] : []),
    ...(later ? [{ label: say(r.later, register) }] : []),
  ];
}

/** The sad ghost: the errand is the rose, the rat or the curse; the curse's yes and no are the window's real question (main.ts). */
export function ghostPlan(
  words: QuestWords, world: World, hero: Hero, line: TalkLine, errand: 'rose' | 'rat' | 'curse', register: Register, cls: string,
): TalkPlan {
  const vars: Vars = { cls };
  const quest = world.quest;
  const base = { id: 'ghost' as const, kind: 'ghost' as const, complete: line === 'reward', mood: moodOf(line) };
  if (line === 'farewell') {
    return { ...base, text: lineOf(words, 'ghost.farewell', register, vars), replies: [], bye: say(words.replies.ghost.bye, register), offers: [] };
  }
  const text = lineOf(words, `ghost.${line}.${errand}`, register, vars);
  if (line === 'reward') return { ...base, text, replies: [], offers: quest ? [quest.weapon, quest.armor] : [] };
  const where = errand === 'curse' ? undefined : (`ghost.where.${errand}` as LineId);
  return {
    ...base, text, offers: [],
    replies: line === 'intro' ? repliesFor(words, 'ghost', register, vars, errand === 'curse' ? undefined : 'ghost.ask', where) : repliesFor(words, 'ghost', register, vars, undefined, where),
  };
}

/** The old wandmaker: corpse dust, a rotberry seed or a phantom fish; he gives the choice of two wands. */
export function wandmakerPlan(words: QuestWords, world: World, _hero: Hero, line: TalkLine, register: Register): TalkPlan {
  const quest = world.wandQuest;
  const wants = quest?.wants ?? 'dust';
  const vars: Vars = {};
  const base = { id: 'wandmaker' as const, kind: 'wandmaker' as const, complete: line === 'reward', mood: moodOf(line) };
  if (line === 'farewell') {
    return { ...base, text: lineOf(words, 'wand.farewell', register, vars), replies: [], bye: say(words.replies.wandmaker.bye, register), offers: [] };
  }
  if (line === 'reward') return { ...base, text: lineOf(words, 'wand.reward', register, vars), replies: [], offers: quest ? [quest.battle, quest.utility] : [] };
  const where = `wand.where.${wants}` as LineId;
  return {
    ...base, offers: [], text: lineOf(words, `wand.${line}.${wants}` as LineId, register, vars),
    replies: line === 'intro' ? repliesFor(words, 'wandmaker', register, vars, 'wand.ask', where) : repliesFor(words, 'wandmaker', register, vars, undefined, where),
  };
}

export type SmithTalk = 'intro' | 'noPickaxe' | 'noGold' | 'noBlood' | 'completed' | 'reforge' | 'busy';

/** The troll blacksmith. «completed» and «reforge» are his services (the reforging window, which takes his words as they are). */
export function smithPlan(words: QuestWords, world: World, hero: Hero, line: SmithTalk, register: Register): TalkPlan {
  const quest = world.smithQuest;
  const wants = quest?.wants ?? 'gold';
  const vars: Vars = { n: ORE_WANTED, have: oreHeld(hero) };
  const base = { id: 'smith' as const, kind: 'blacksmith' as const, offers: [] as Item[], complete: line === 'completed', mood: moodOf(line) };
  const text = lineOf(words, line === 'intro' ? (`smith.intro.${wants}` as LineId) : (`smith.${line}` as LineId), register, vars);
  if (line === 'intro') return { ...base, text, replies: repliesFor(words, 'smith', register, vars, 'smith.ask', `smith.where.${wants}` as LineId) };
  if (line === 'noGold' || line === 'noBlood') return { ...base, text, replies: repliesFor(words, 'smith', register, vars, undefined, `smith.where.${wants}` as LineId, false) };
  return { ...base, text, replies: [] };
}

/** The ambitious imp: monks or golems, a count of tokens, a ring. */
export function impPlan(words: QuestWords, world: World, hero: Hero, line: TalkLine, register: Register, cls: string): TalkPlan {
  const quest = world.impQuest;
  const prey = quest?.prey ?? 'golem';
  const vars: Vars = { n: TOKENS_WANTED[prey], have: tokensHeld(hero), cls };
  const base = { id: 'imp' as const, kind: 'imp' as const, complete: line === 'reward', mood: moodOf(line) };
  if (line === 'farewell') {
    return { ...base, text: lineOf(words, 'imp.farewell', register, vars), replies: [], bye: say(words.replies.imp.bye, register), offers: [] };
  }
  if (line === 'reward') return { ...base, text: lineOf(words, 'imp.reward', register, vars), replies: [], offers: quest ? [quest.reward] : [] };
  const where = `imp.where.${prey}` as LineId;
  return {
    ...base, offers: [], text: lineOf(words, `imp.${line}.${prey}` as LineId, register, vars),
    replies: line === 'intro' ? repliesFor(words, 'imp', register, vars, 'imp.ask', where) : repliesFor(words, 'imp', register, vars, undefined, where),
  };
}
