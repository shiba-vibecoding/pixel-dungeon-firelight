import { type Hero, type Item, type MobKind, ORE_WANTED, TOKENS_WANTED, type World } from '@pd/core';

/*
 * The quest card (the journal's «Notes» tab and the HUD chip): who asked, what for, how far it has come, and what is on offer.
 * Presentation only: the quests are the core's (quest.ts, wandmaker.ts, smith.ts, imp.ts) and none of them is changed. Progress is
 * counted from the world's state and from what the hero carries, the way the core itself counts it when the giver is spoken to
 * (ORE_WANTED pieces of ore, TOKENS_WANTED tokens, the item in the pack, the pickaxe's blood), and from nothing else: where the
 * rose lies, whether the fetid rat has come out, which kill carries a token are the dungeon's secrets and never reach a card.
 * A card is only made for a quest that has been taken on («given»), the same moment the journal learns of the giver.
 */

export type QuestId = 'ghost' | 'wandmaker' | 'smith' | 'imp';

/** What the errand is about: the thing to bring, to break or to gather. */
export type Goal = 'rose' | 'skull' | 'curse' | 'dust' | 'berry' | 'fish' | 'ore' | 'blood' | 'monk' | 'golem';

/** What the giver pays with, as far as the original tells before it is earned. */
export type Reward = 'gear' | 'wand' | 'reforge' | 'ring';

/** Under way, goal met (go back to the giver), or finished. */
export type Stage = 'active' | 'ready' | 'done';

export interface QuestCard {
  id: QuestId;
  giver: MobKind;
  depth: number;
  goal: Goal;
  stage: Stage;
  /** A count to reach («Ore: 3 / 15»), for the errands that are counted. */
  count?: { have: number; need: number };
  /** Whether the thing is found, for the errands that are one thing. */
  found?: boolean;
  reward: Reward;
  /** The blacksmith's errand only: the pickaxe is not with the hero (his word for that is «where is my pickaxe»). */
  noPickaxe?: boolean;
  /** The blacksmith's reward only: whether the reforging has been used. */
  spent?: boolean;
}

const carried = (hero: Hero, kind: string): Item[] => [...hero.items, ...(hero.weapon ? [hero.weapon] : [])].filter((item) => item.kind === kind);

const countOf = (hero: Hero, kind: string): number => hero.items.find((item) => item.kind === kind)?.qty ?? 0;

const has = (hero: Hero, kind: string): boolean => hero.items.some((item) => item.kind === kind);

/** The ore the hero holds (Blacksmith: only what is in the pack counts, as in the core's oreOf). */
export const oreHeld = (hero: Hero): number => countOf(hero, 'quest.ore');

/** The tokens the hero holds. */
export const tokensHeld = (hero: Hero): number => countOf(hero, 'quest.token');

/** The pickaxe, in the hand or in the pack. */
export const pickaxeOf = (hero: Hero): Item | undefined => carried(hero, 'weapon.pickaxe')[0];

/** The card of each quest that has been taken on, nearest the surface first. */
export function questCards(world: World, hero: Hero): QuestCard[] {
  const cards: QuestCard[] = [];
  const ghost = world.quest;
  if (ghost?.given) {
    const errand = ghost.type ?? 'rose';
    const goal: Goal = errand === 'rat' ? 'skull' : errand === 'curse' ? 'curse' : 'rose';
    const found = errand === 'curse' ? !!ghost.freed : has(hero, errand === 'rat' ? 'quest.skull' : 'quest.rose');
    cards.push({ id: 'ghost', giver: 'ghost', depth: ghost.depth, goal, stage: ghost.done ? 'done' : found ? 'ready' : 'active', found: ghost.done || found, reward: 'gear' });
  }
  const wand = world.wandQuest;
  if (wand?.given) {
    const wants = wand.wants ?? 'dust';
    const found = has(hero, wants === 'berry' ? 'seed.rotberry' : wants === 'fish' ? 'quest.fish' : 'quest.dust');
    cards.push({ id: 'wandmaker', giver: 'wandmaker', depth: wand.depth, goal: wants, stage: wand.done ? 'done' : found ? 'ready' : 'active', found: wand.done || found, reward: 'wand' });
  }
  const smith = world.smithQuest;
  if (smith?.given) {
    const pickaxe = pickaxeOf(hero);
    if (smith.wants === 'gold') {
      const have = oreHeld(hero);
      const ready = have >= ORE_WANTED && !!pickaxe;
      cards.push({
        id: 'smith', giver: 'blacksmith', depth: smith.depth, goal: 'ore', stage: smith.done ? 'done' : ready ? 'ready' : 'active',
        count: { have: smith.done ? ORE_WANTED : Math.min(have, ORE_WANTED), need: ORE_WANTED }, reward: 'reforge',
        ...(!smith.done && !pickaxe ? { noPickaxe: true } : {}), ...(smith.done ? { spent: smith.reforged } : {}),
      });
    } else {
      const found = !!pickaxe?.bloody;
      cards.push({
        id: 'smith', giver: 'blacksmith', depth: smith.depth, goal: 'blood', stage: smith.done ? 'done' : found ? 'ready' : 'active',
        found: smith.done || found, reward: 'reforge',
        ...(!smith.done && !pickaxe ? { noPickaxe: true } : {}), ...(smith.done ? { spent: smith.reforged } : {}),
      });
    }
  }
  const imp = world.impQuest;
  if (imp?.given) {
    const need = TOKENS_WANTED[imp.prey];
    const have = tokensHeld(hero);
    cards.push({
      id: 'imp', giver: 'imp', depth: imp.depth, goal: imp.prey, stage: imp.done ? 'done' : have >= need ? 'ready' : 'active',
      count: { have: imp.done ? need : Math.min(have, need), need }, reward: 'ring',
    });
  }
  return cards.sort((a, b) => a.depth - b.depth);
}

/** The cards still to be seen to: not finished. */
export const openCards = (cards: readonly QuestCard[]): QuestCard[] => cards.filter((card) => card.stage !== 'done');

/**
 * The one card the HUD chip speaks of: one that is ready (go and collect), else the one on the depth the hero is on, else the
 * nearest the surface. Null when no errand stands.
 */
export function chipCard(cards: readonly QuestCard[], depth: number): QuestCard | null {
  const open = openCards(cards);
  return open.find((card) => card.stage === 'ready') ?? open.find((card) => card.depth === depth) ?? open[0] ?? null;
}

/** The share of the goal reached, 0 to 1 (a bar): a count's own, or a thing found. */
export function share(card: QuestCard): number {
  if (card.count) return card.count.have / card.count.need;
  return card.found ? 1 : 0;
}

/** The goal met by this item kind: the thing a pick-up should be told about, or null. */
export const QUEST_ITEM_GOAL: Readonly<Record<string, Goal>> = {
  'quest.rose': 'rose', 'quest.skull': 'skull', 'quest.dust': 'dust', 'seed.rotberry': 'berry', 'quest.fish': 'fish', 'quest.ore': 'ore', 'quest.token': 'monk',
};

/** The card an item picked up belongs to (tokens count for the imp's prey, whichever it is), or undefined. */
export function cardForItem(cards: readonly QuestCard[], kind: string): QuestCard | undefined {
  const goal = QUEST_ITEM_GOAL[kind];
  if (!goal) return undefined;
  const open = openCards(cards);
  if (kind === 'quest.token') return open.find((card) => card.id === 'imp');
  return open.find((card) => card.goal === goal);
}
