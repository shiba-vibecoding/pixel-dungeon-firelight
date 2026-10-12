import { createMob, type Hero, heroAttackSkill, heroDamageRoll } from './actors';
import { canEnter, charAt, type Ctx, enterCell } from './floor';
import { NEIGHBOURS8 } from './level/geometry';

/*
 * Mirror images (MirrorImage): illusory twins of a hero, from a scroll of
 * mirror image or armour of multiplicity. Each goes for the nearest monster
 * in sight with its hero's skill and strength, and vanishes once it has
 * struck. Monsters pay them no heed, and nothing can harm them; a hero
 * walking into one swaps places with it.
 */

/** MirrorImage.duplicate, placed on up to `count` free cells around the hero; returns where they appeared. */
export function conjureImages(ctx: Ctx, hero: Hero, count: number): number[] {
  const { world, depth, level, rng, floor } = ctx;
  const free = NEIGHBOURS8.map((n) => hero.pos + n).filter((cell) => canEnter(level, cell) && !charAt(world, depth, cell));
  const placed: number[] = [];
  while (placed.length < count && free.length > 0) {
    const pos = free.splice(rng.index(free.length), 1)[0]!;
    const image = createMob(`#${++world.nextId}`, 'mirror', pos, 'passive', floor.now + 1);
    image.image = { owner: hero.id, attack: heroAttackSkill(hero), damage: Math.max(1, heroDamageRoll(hero, rng)) };
    floor.mobs.push(image);
    enterCell(level, pos);
    placed.push(pos);
  }
  if (placed.length > 0) ctx.effects.push({ type: 'mirrored', depth, hero: hero.id, cells: placed });
  return placed;
}
