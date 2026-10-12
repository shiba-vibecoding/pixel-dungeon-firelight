import { describe, expect, it } from 'vitest';
import { heroById, type HeroClass, isAlive, levelAt } from '../src/index';
import { marathon, partyMarathon } from './runner';

describe('a whole run', () => {
  const cases: Array<[number, HeroClass]> = [[101, 'warrior'], [202, 'mage'], [303, 'rogue'], [404, 'huntress']];
  for (const [seed, heroClass] of cases) {
    it(`a sturdy ${heroClass} goes from the first depth to the Amulet (seed ${seed})`, () => {
      const { world, effects, steps, trace } = marathon(seed, heroClass);
      const hero = heroById(world, 'p')!;
      const slain = new Set<string>(effects.flatMap((e) => (e.type === 'bossSlain' ? [e.kind] : [])));
      const level = levelAt(world, hero.depth);
      const where = `seed ${seed}: depth ${hero.depth} at ${hero.pos} (exit ${level.exit}), ${steps} steps, bosses ${[...slain].join(', ')}\n${trace.join('\n')}`;
      expect(isAlive(hero), where).toBe(true);
      expect(world, where).toMatchObject({ over: true, victory: true });
      for (const boss of ['goo', 'tengu', 'dm300', 'king', 'yog']) expect(slain.has(boss), `${where}: ${boss}`).toBe(true);
      expect(Object.keys(world.levels).length, where).toBe(26);
    }, 240000);
  }
});

describe('a whole run in a party', () => {
  for (const [seed, classes] of [[505, ['warrior', 'mage']], [606, ['rogue', 'huntress']]] as const) {
    it(`two sturdy heroes reach the Amulet together (seed ${seed})`, () => {
      const { world, steps, trace } = partyMarathon(seed, classes);
      const where = `seed ${seed}: depths ${world.heroes.map((h) => `${h.id}:${h.depth}@${h.pos}`).join(' ')}, ${steps} steps\n${trace.join('\n')}`;
      expect(world.victory, where).toBe(true);
    }, 240000);
  }
});

// Hunting rare bugs: PD_MANY=200 npx vitest run marathon plays that many more worlds, one class after another.
describe.skipIf(!process.env.PD_MANY)('many whole runs', () => {
  const classes: HeroClass[] = ['warrior', 'mage', 'rogue', 'huntress'];
  for (let i = 0; i < Number(process.env.PD_MANY ?? 0); i++) {
    const seed = 1000 + i;
    it(`seed ${seed}`, () => {
      const { world, steps, trace } = marathon(seed, classes[i % 4]!);
      const hero = heroById(world, 'p')!;
      expect(world.victory, `seed ${seed}: depth ${hero.depth} at ${hero.pos}, ${steps} steps\n${trace.join('\n')}`).toBe(true);
    }, 240000);
  }
});
