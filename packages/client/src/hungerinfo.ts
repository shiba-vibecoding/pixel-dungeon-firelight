import {
  type Hero, hungerGrowth, hungerStep, HUNGRY, type Item, itemDef, type ItemKind, kindKnown, levelKnown, ringBonus, STARVING, wandMaxCharges, type World,
} from '@pd/core';

/*
 * What the hunger icon tells: the turns left before hungry and before starving, the food in the pack counted in turns, and
 * what a meal eaten now would waste. Every number is the core's own: the thresholds (HUNGRY, STARVING), the step and the growth
 * of a step (hungerStep: a rogue's is longer; hungerGrowth: a ring of satiety takes some away), the time already run toward the
 * next step (hero.hungerTime) and a meal's energy (itemDef.energy). Nothing here changes the rules.
 */

/** World.starve: while starving, a step costs a hit point with this chance. */
export const STARVING_HIT_CHANCE = 0.3;

/**
 * The hero as far as the player may know it: a worn ring whose kind or level is still hidden is left out of the sums,
 * or the turns would give away what it is (and how good).
 */
function known(world: World, hero: Hero): Hero {
  return { ...hero, rings: hero.rings.filter((ring) => kindKnown(world, ring) && levelKnown(ring)) };
}

export interface HungerReport {
  /** The core's Hunger.level: 0 when fed, HUNGRY, STARVING. */
  hunger: number;
  state: 'fed' | 'hungry' | 'starving';
  /** Turns for the hunger to rise one step, and by how much it rises (null: it never does, a ring of satiety is that good). */
  step: number;
  growth: number;
  /** Hunger gained per turn. */
  perTurn: number;
  /** Turns until hungry and until starving (0 once there; null if never). */
  untilHungry: number | null;
  untilStarving: number | null;
  /** While starving, one hit point is lost about every this many turns. */
  starveEvery: number;
  rogue: boolean;
  /** The satiety rings worn that are fully known, as their levels added up (0: none). */
  satiety: number;
  /** A ring is worn whose kind or level is hidden: it is not in the figures. */
  hiddenRing: boolean;
}

/** The turns until the hunger reaches `limit`, counted in the hunger's own steps (World.starve), the one under way included. */
function turnsUntil(hero: Hero, limit: number, step: number, growth: number): number | null {
  if (hero.hunger >= limit) return 0;
  if (growth <= 0) return null;
  const steps = Math.ceil((limit - hero.hunger) / growth);
  // Whole turns: the hunger rises when the time run reaches the step, so the turn it does it in is the one counted.
  return Math.max(0, Math.ceil(steps * step - hero.hungerTime - 1e-9));
}

export function hungerReport(world: World, hero: Hero): HungerReport {
  const seen = known(world, hero);
  const step = hungerStep(seen);
  const growth = hungerGrowth(seen);
  const satiety = ringBonus(seen, 'ring.satiety');
  return {
    hunger: hero.hunger,
    state: hero.hunger >= STARVING ? 'starving' : hero.hunger >= HUNGRY ? 'hungry' : 'fed',
    step,
    growth,
    perTurn: growth / step,
    untilHungry: turnsUntil(hero, HUNGRY, step, growth),
    untilStarving: turnsUntil(hero, STARVING, step, growth),
    starveEvery: Math.round(step / STARVING_HIT_CHANCE),
    rogue: hero.heroClass === 'rogue',
    satiety,
    hiddenRing: hero.rings.length > seen.rings.length,
  };
}

export interface FoodLine {
  kind: ItemKind;
  qty: number;
  /** How much hunger one of them takes away. */
  energy: number;
}

/** The food in the pack (and its bags) that takes hunger away: Food.execute's energy. */
export function foodIn(hero: Hero): FoodLine[] {
  const lines: FoodLine[] = [];
  for (const item of hero.items) {
    const def = itemDef(item.kind);
    if (def.category === 'food' && def.energy !== undefined) lines.push({ kind: item.kind, qty: item.qty, energy: def.energy });
  }
  return lines;
}

/** All the hunger the food in the pack takes away, and how many turns of hunger that is at the present rate (null: it never runs out). */
export function foodTurns(world: World, hero: Hero): { energy: number; turns: number | null } {
  const energy = foodIn(hero).reduce((sum, line) => sum + line.energy * line.qty, 0);
  const report = hungerReport(world, hero);
  return { energy, turns: report.perTurn > 0 ? Math.floor(energy / report.perTurn) : null };
}

/**
 * Inventory.eat: hunger falls by the food's energy but not below nothing, so whatever energy is more than the hunger there is
 * goes to waste.
 */
export function wasteIfEaten(hero: Hero, item: Item): number {
  const energy = itemDef(item.kind).energy;
  return energy === undefined ? 0 : Math.max(0, Math.ceil(energy - hero.hunger));
}

/** What else a meal does for this hero besides hunger (Inventory.eat): a warrior is healed, a mage's wands gain a charge. */
export function mealBonus(hero: Hero, item: Item): 'heal' | 'charge' | null {
  if (itemDef(item.kind).category !== 'food') return null;
  if (hero.heroClass === 'warrior' && hero.hp < hero.ht) return 'heal';
  if (hero.heroClass === 'mage' && hero.items.some((wand) => wand.charges !== undefined && wand.charges < wandMaxCharges(wand))) return 'charge';
  return null;
}
