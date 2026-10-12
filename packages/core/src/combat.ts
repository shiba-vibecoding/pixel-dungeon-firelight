import {
  type Hero, heroArmor, heroAttackSkill, heroDamageRoll, heroDefenseSkill, isAlive, maxExp, type Mob, MOBS,
} from './actors';
import { type Char, type Ctx, heroesOn, isHero, leaveCell } from './floor';

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

function damageRoll(ctx: Ctx, char: Char): number {
  if (isHero(char)) return heroDamageRoll(char, ctx.rng);
  const [min, max] = MOBS[char.kind].damage;
  return ctx.rng.normalIntRange(min, max);
}

export function attack(ctx: Ctx, attacker: Char, defender: Char): void {
  const hit = ctx.rng.floatMax(attackSkill(attacker)) >= ctx.rng.floatMax(defenseSkill(defender));
  if (!hit) {
    ctx.effects.push({ type: 'attack', depth: ctx.depth, attacker: attacker.id, target: defender.id, hit, damage: 0 });
    return;
  }
  const reduction = ctx.rng.intRange(0, armor(defender));
  const damage = Math.max(damageRoll(ctx, attacker) - reduction, 0);
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
