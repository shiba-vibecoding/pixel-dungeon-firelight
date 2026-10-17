import { type Hero, type ItemKind, SEED_PLANTS, type World } from '@pd/core';
import type { BrewOdds, SeedCount } from './brewodds';
import { foodIn, foodTurns, hungerReport } from './hungerinfo';
import { plantText } from './examine';
import { capitalize, t } from './i18n';
import { I } from './i18n-info';

/*
 * The words of the information windows, put together from the numbers (hungerinfo.ts, brewodds.ts) and apart from the DOM,
 * so that the tests can read them.
 */

/** The lines of the hunger card, as text, for the window and for the tests. */
export function hungerLines(world: World, hero: Hero): { status: string; turns: string; meaning: string; food: string; items: string[]; rates: string[] } {
  const report = hungerReport(world, hero);
  const F = I.hunger;
  const turns = report.state === 'fed' ? F.fedLine(report.untilHungry, report.untilStarving)
    : report.state === 'hungry' ? F.hungryLine(report.untilStarving) : F.starvingLine;
  const food = foodTurns(world, hero);
  const lines = foodIn(hero);
  const rates = [report.rogue ? F.rogue(report.step) : F.rate(report.growth / report.step)];
  if (report.satiety !== 0) rates.push(F.ring(report.satiety, report.growth / report.step));
  if (report.hiddenRing) rates.push(F.hiddenRing);
  return {
    status: F.state[report.state],
    turns,
    meaning: F.meaning[report.state](report.starveEvery),
    food: lines.length === 0 ? F.noFood : F.food(food.turns),
    items: lines.map((line) => F.foodItem(capitalize(t.items[line.kind]), line.qty, line.energy)),
    rates,
  };
}

/** A chance as a player reads it: «~44%», or «<1%» for the faintest. */
export const percent = (chance: number): string => (chance < 0.005 ? '<1%' : `~${Math.round(chance * 100)}%`);

export interface PotLine {
  label: string;
  chance: number;
  /** Whether the potion is one the party knows by its name. */
  known: boolean;
}

/**
 * What the pot may brew, each outcome by the name the party knows: a potion known is named, one not known is told by the seed it
 * comes of («an unknown potion (firebloom seed)»), never by its colour: the colour would say which potion that colour is.
 */
export function potLines(world: World, odds: BrewOdds): PotLine[] {
  const lines: PotLine[] = odds.own.map(({ seed, potion, chance }) => {
    const known = world.known.includes(potion);
    return { label: known ? capitalize(t.items[potion]) : capitalize(I.pot.unknownPotion(t.items[seed])), chance, known };
  });
  if (odds.random > 0) lines.push({ label: capitalize(I.pot.random), chance: odds.random, known: true });
  return lines;
}

/** A seed as the player names it in a list: by its plant («Firebloom»), as the pot's players say it. */
export const seedName = (kind: ItemKind): string => {
  const plant = SEED_PLANTS[kind];
  return plant ? plantText(plant).name : capitalize(t.items[kind]);
};

/** The seeds as the player names them: «Firebloom ×2, Icecap ×1». */
export const seedList = (seeds: readonly SeedCount[]): string =>
  seeds.filter((s) => s.qty > 0).map((s) => `${seedName(s.kind)} ×${s.qty}`).join(', ');
