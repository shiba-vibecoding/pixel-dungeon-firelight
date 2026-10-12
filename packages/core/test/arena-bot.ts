import { type Action, adjacent, createItem, findPath, floorAt, heroById, hostile, isAlive, levelAt, type World } from '../src/index';

/* A simple player for the arena of waves, for the tests and the co-op simulation. */

/** A sturdy fighter: the run is about the arena's flow, not survival. */
export function strengthen(world: World, id: string): void {
  const hero = heroById(world, id)!;
  Object.assign(hero, { attackSkill: 600, defenseSkill: 80, ht: Math.max(hero.ht, 5000), str: 22, hunger: 0 });
  if (hero.hp > 0) hero.hp = hero.ht;
  if (hero.weapon?.kind !== 'weapon.warHammer' || hero.weapon.level < 20) hero.weapon = createItem('weapon.warHammer', 1, 20);
}

/** A simple player: picks the first reward and readies at rest; in a wave, strikes what is beside, or goes for the nearest monster. */
export function arenaBot(world: World, id: string): Action {
  const hero = heroById(world, id)!;
  const arena = world.arena!;
  if (arena.phase === 'rest') {
    if (arena.offers[id]) return { type: 'arenaPick', choice: 0 };
    return arena.ready.includes(id) ? { type: 'wait' } : { type: 'arenaReady' };
  }
  const floor = floorAt(world, hero.depth);
  const level = levelAt(world, hero.depth);
  const foes = floor.mobs.filter(hostile);
  const beside = foes.find((mob) => adjacent(mob.pos, hero.pos));
  if (beside) return { type: 'attack', target: beside.id };
  const others = new Set([...floor.mobs.map((m) => m.pos), ...world.heroes.filter((h) => h.id !== id && isAlive(h)).map((h) => h.pos)]);
  let best: number[] | null = null;
  for (const mob of foes) {
    others.delete(mob.pos);
    const path = findPath(level, hero.pos, mob.pos, others);
    others.add(mob.pos);
    if (path && path.length > 0 && (!best || path.length < best.length)) best = path;
  }
  if (best) {
    const inTheWay = floor.mobs.find((m) => m.pos === best![0]);
    if (inTheWay && hostile(inTheWay)) return { type: 'attack', target: inTheWay.id };
    if (!world.heroes.some((h) => h.id !== id && isAlive(h) && h.pos === best![0])) return { type: 'move', to: best[0]! };
  }
  return { type: 'wait' };
}

