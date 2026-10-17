import type { Hero, World } from '@pd/core';
import { foodIn, foodTurns, hungerReport } from './hungerinfo';
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
