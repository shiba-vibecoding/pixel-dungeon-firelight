import {
  type Hero, heroArmor, heroAttackSkill, heroDamageRoll, heroDefenseSkill, isAlive, maxExp, type Mob, MOBS,
} from './actors';
import { type Char, type Ctx, heroesOn, isHero, leaveCell } from './floor';
import { T } from './level/terrain';

/*
 * Melee combat as in Char.attack: an accuracy roll against an evasion roll,
 * then damage minus a roll of the defender's armour.
 */

function attackSkill(char: Char): number {
  return isHero(char) ? heroAttackSkill(char) : MOBS[char.kind].attack;
}

function defenseSkill(char: Char): number {
  if (isHero(char)) return heroDefenseSkill(char);
  // A monster that has not spotted its enemy is caught off guard.
  return char.enemySeen ? MOBS[char.kind].defense : 0;
}

function armor(char: Char): number {
  return isHero(char) ? heroArmor(char) : MOBS[char.kind].dr;
}

function damageRoll(ctx: Ctx, char: Char, range?: readonly [number, number]): number {
  if (isHero(char)) return heroDamageRoll(char, ctx.rng);
  const [min, max] = range ?? MOBS[char.kind].damage;
  return ctx.rng.normalIntRange(min, max);
}

/** Changes to an attacker's usual numbers, e.g. a pumped-up Goo. */
export interface AttackOverride {
  attack?: number;
  damage?: readonly [number, number];
}

export function attack(ctx: Ctx, attacker: Char, defender: Char, override: AttackOverride = {}): void {
  const skill = override.attack ?? attackSkill(attacker);
  const hit = ctx.rng.floatMax(skill) >= ctx.rng.floatMax(defenseSkill(defender));
  if (!hit) {
    ctx.effects.push({ type: 'attack', depth: ctx.depth, attacker: attacker.id, target: defender.id, hit, damage: 0 });
    return;
  }
  const reduction = ctx.rng.intRange(0, armor(defender));
  const damage = Math.max(damageRoll(ctx, attacker, override.damage) - reduction, 0);
  // Goo's touch may leave caustic ooze that burns until washed off in water.
  if (!isHero(attacker) && attacker.kind === 'goo' && ctx.rng.int(3) === 0 && isHero(defender)) {
    if (defender.ooze < 0) ctx.effects.push({ type: 'oozed', hero: defender.id });
    defender.ooze = 0;
  }
  ctx.effects.push({ type: 'attack', depth: ctx.depth, attacker: attacker.id, target: defender.id, hit, damage });
  hurt(ctx, defender, damage, attacker);
}

export function hurt(ctx: Ctx, victim: Char, damage: number, source: Char | null): void {
  if (!isAlive(victim)) return;
  if (!isHero(victim)) {
    if (victim.state === 'sleeping') victim.state = 'wandering';
    victim.alerted = true;
    // In a party, a monster turns on whoever hurt it.
    if (source && isHero(source)) victim.enemy = source.id;
  }
  victim.hp -= damage;
  if (!isAlive(victim)) {
    if (isHero(victim)) heroDied(ctx, victim);
    else mobDied(ctx, victim);
  }
}

function mobDied(ctx: Ctx, mob: Mob): void {
  mob.hp = 0;
  ctx.floor.mobs.splice(ctx.floor.mobs.indexOf(mob), 1);
  leaveCell(ctx.world, ctx.level, ctx.depth, mob.pos);
  ctx.effects.push({ type: 'died', depth: ctx.depth, who: mob.id, pos: mob.pos });

  // Everyone fighting on the depth learns from the kill, not just the killer.
  const stats = MOBS[mob.kind];
  for (const hero of heroesOn(ctx.world, ctx.depth)) {
    if (hero.lvl <= stats.maxLvl) earnExp(ctx, hero, stats.exp);
  }

  if (mob.kind === 'goo') {
    // The lair opens: the way back up dries out and the exit unlocks.
    const { level } = ctx;
    if (level.map[level.entrance] === T.WATER_TILES) level.map[level.entrance] = T.ENTRANCE;
    if (level.map[level.exit] === T.LOCKED_EXIT) level.map[level.exit] = T.UNLOCKED_EXIT;
    ctx.effects.push({ type: 'yell', depth: ctx.depth, mob: mob.id, line: 'death' });
    ctx.effects.push({ type: 'bossSlain', depth: ctx.depth });
  }
}

function heroDied(ctx: Ctx, hero: Hero): void {
  hero.hp = 0;
  hero.intent = null;
  leaveCell(ctx.world, ctx.level, ctx.depth, hero.pos);
  ctx.effects.push({ type: 'died', depth: ctx.depth, who: hero.id, pos: hero.pos });
  if (!ctx.world.heroes.some(isAlive)) {
    ctx.world.over = true;
  }
}

export function earnExp(ctx: Ctx, hero: Hero, exp: number): void {
  hero.exp += exp;
  ctx.effects.push({ type: 'exp', hero: hero.id, amount: exp });
  let levelUp = false;
  while (hero.exp >= maxExp(hero)) {
    hero.exp -= maxExp(hero);
    hero.lvl++;
    hero.ht += 5;
    hero.hp += 5;
    hero.attackSkill++;
    hero.defenseSkill++;
    levelUp = true;
  }
  if (levelUp) {
    ctx.effects.push({ type: 'levelUp', hero: hero.id, lvl: hero.lvl });
  }
}
