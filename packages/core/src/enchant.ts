import { type Hero, heroDamageRoll, isAlive, isStarving, type Mob, MOBS, STARVING } from './actors';
import { hurt } from './combat';
import { charAt, type Ctx, enterCell, heroView, isPassable, isWater, leaveCell } from './floor';
import { type Glyph, randomEnchantment } from './items';
import { isBossDepth } from './level/builder';
import { adjacent, LENGTH, NEIGHBOURS8 } from './level/geometry';
import { stepOnPlant } from './plants';
import { burst } from './traps';

/*
 * Enchanted weapons and inscribed armour (Weapon.Enchantment, Armor.Glyph).
 * An enchantment acts on the hero's blows, a glyph on the blows the hero
 * takes; the higher the item's level, the more often.
 */

/** Terror.DURATION; Frost.DURATION; Burning.DURATION. */
export const TERROR_TURNS = 10;
const FROST_TURNS = 5;
const BURNING_TURNS = 8;

/** Poison.set(n) hurts n/3+1 a turn, less and less; here poison hurts 1 a turn, for as many turns as that adds up to. */
function poisonTurns(duration: number): number {
  let total = 0;
  for (let left = duration; left > 0; left--) total += Math.trunc(left / 3) + 1;
  return total;
}

/** Weapon.proc: what the hero's enchanted weapon does as a blow lands, before its damage. */
export function weaponProc(ctx: Ctx, hero: Hero, mob: Mob, damage: number): void {
  let enchant = hero.weapon.enchant;
  if (!enchant || !isAlive(mob)) return;
  const { rng, depth, level: map } = ctx;
  // Instability: every blow, some other enchantment.
  if (enchant === 'instability') enchant = randomEnchantment(rng, 'instability');
  const level = Math.max(0, hero.weapon.level);
  const shown = (): void => {
    ctx.effects.push({ type: 'enchanted', depth, pos: mob.pos, enchant: enchant! });
  };
  const strike = (victim: Mob, amount: number): void => {
    ctx.effects.push({ type: 'hurt', depth, who: victim.id, damage: amount });
    hurt(ctx, victim, amount, hero);
  };

  switch (enchant) {
    case 'fire':
      if (rng.int(level + 3) < 2) return;
      if (rng.int(2) === 0 && !isWater(map.map[mob.pos]!)) mob.burning = Math.max(mob.burning ?? 0, BURNING_TURNS);
      shown();
      strike(mob, rng.intBetween(1, level + 2));
      return;
    case 'poison':
      if (rng.int(level + 3) < 2) return;
      mob.poison = Math.max(mob.poison ?? 0, poisonTurns(level + 1));
      shown();
      return;
    case 'death':
      // Grim: now and then, death outright.
      if (rng.int(level + 100) < 92) return;
      shown();
      strike(mob, mob.hp);
      return;
    case 'paralysis':
      if (rng.int(level + 8) < 7) return;
      mob.paralysed = Math.max(mob.paralysed ?? 0, Math.round(rng.floatRange(1, 1.5 + level)));
      shown();
      return;
    case 'leech': {
      // Vampiric: some of the blow flows back into the hero.
      const most = Math.trunc((damage * (level + 2)) / (level + 6));
      const healed = Math.min(rng.intRange(0, most), hero.ht - hero.hp);
      if (healed <= 0) return;
      hero.hp += healed;
      shown();
      ctx.effects.push({ type: 'healed', hero: hero.id, amount: healed });
      return;
    }
    case 'slow':
      if (rng.int(level + 4) < 3) return;
      mob.slowed = Math.max(mob.slowed ?? 0, Math.round(rng.floatRange(1, 1.5 + level)));
      shown();
      return;
    case 'shock': {
      // Shocking: lightning leaps from the victim to whoever stands next to it, never to a hero.
      if (rng.int(level + 4) < 3) return;
      shown();
      const struck = new Set<Mob>();
      let victim: Mob | undefined = mob;
      let amount = rng.intBetween(1, Math.max(2, Math.trunc(damage / 2)));
      let from = hero.pos;
      while (victim && amount >= 1) {
        struck.add(victim);
        ctx.effects.push({ type: 'zapped', depth, from, to: victim.pos, bolt: 'lightning' });
        from = victim.pos;
        const next: Mob[] = ctx.floor.mobs.filter(
          (m) => !struck.has(m) && isAlive(m) && m.state !== 'passive' && adjacent(m.pos, victim!.pos) && m.pos !== victim!.pos,
        );
        strike(victim, isWater(map.map[victim.pos]!) && !MOBS[victim.kind].flying ? amount * 2 : amount);
        victim = next.length > 0 ? rng.element(next) : undefined;
        amount = rng.intBetween(Math.trunc(amount / 2), amount);
      }
      return;
    }
    case 'horror':
      // Eldritch: the victim flees in terror.
      if (rng.int(level + 5) < 4) return;
      mob.terror = TERROR_TURNS;
      mob.terrorOf = hero.id;
      shown();
      return;
    case 'luck': {
      // Lucky: the best of a few more damage rolls.
      let best = damage;
      for (let i = 1; i <= level + 1; i++) best = Math.max(best, heroDamageRoll(hero, rng) - i);
      if (best <= damage) return;
      shown();
      strike(mob, best - damage);
      return;
    }
  }
}

/** Armor.proc: what the hero's inscribed armour does when a monster's blow lands; returns the damage that gets through. */
export function armorProc(ctx: Ctx, mob: Mob, hero: Hero, damage: number): number {
  const glyph: Glyph | undefined = hero.armor.glyph;
  if (!glyph) return damage;
  const { rng, depth, world } = ctx;
  const level = Math.max(0, hero.armor.level);
  const near = adjacent(mob.pos, hero.pos);
  const shown = (): void => {
    ctx.effects.push({ type: 'glyph', depth, hero: hero.id, glyph });
  };

  switch (glyph) {
    case 'bounce': {
      // The attacker is thrown back a step.
      if (!near || rng.int(level + 5) < 4) return damage;
      const to = mob.pos + (mob.pos - hero.pos);
      if (to < 0 || to >= LENGTH || !adjacent(mob.pos, to) || charAt(world, depth, to) || !isPassable(ctx.level, to)) return damage;
      shown();
      const from = mob.pos;
      mob.pos = to;
      leaveCell(world, ctx.level, depth, from);
      enterCell(ctx.level, to);
      ctx.effects.push({ type: 'pushed', depth, mob: mob.id, from, to });
      stepOnPlant(ctx, mob, to);
      return damage;
    }
    case 'affection': {
      // The attacker is charmed by the hero, and the hero a little by it.
      const gated = Math.min(level, 6);
      if (!near || rng.int(Math.trunc(gated / 2) + 5) < 4) return damage;
      const duration = rng.intRange(3, 7);
      mob.charmed = Math.max(mob.charmed ?? 0, duration);
      mob.charmedBy = hero.id;
      hero.charmed = Math.max(hero.charmed, Math.trunc(duration * rng.floatRange(0.5, 1)));
      hero.charmedBy = mob.id;
      shown();
      return damage;
    }
    case 'antiEntropy':
      // The attacker freezes; the hero catches fire.
      if (!near || rng.int(level + 6) < 5) return damage;
      mob.paralysed = Math.max(mob.paralysed ?? 0, Math.round(FROST_TURNS * rng.floatRange(1, 1.5)));
      mob.burning = 0;
      if (!isWater(ctx.level.map[hero.pos]!)) hero.burning = Math.max(hero.burning, BURNING_TURNS);
      shown();
      return damage;
    case 'potential': {
      // Lightning arcs back at the attacker, and some of it through the hero.
      if (!near || damage < 1 || rng.int(level + 7) < 6) return damage;
      shown();
      const back = rng.intRange(1, damage);
      ctx.effects.push({ type: 'zapped', depth, from: hero.pos, to: mob.pos, bolt: 'lightning' });
      ctx.effects.push({ type: 'hurt', depth, who: mob.id, damage: back });
      hurt(ctx, mob, back, 'lightning');
      const self = rng.intRange(1, back);
      ctx.effects.push({ type: 'hurt', depth, who: hero.id, damage: self });
      hurt(ctx, hero, self, 'lightning');
      return damage;
    }
    case 'metabolism': {
      // Wounds close at the cost of hunger.
      if (rng.int(Math.trunc(level / 2) + 5) < 4) return damage;
      const healing = Math.min(hero.ht - hero.hp, rng.intBetween(1, Math.max(2, Math.trunc(hero.ht / 5))));
      if (healing <= 0 || isStarving(hero)) return damage;
      hero.hunger = Math.min(STARVING, hero.hunger + STARVING / 10);
      hero.hp += healing;
      shown();
      ctx.effects.push({ type: 'healed', hero: hero.id, amount: healing });
      return damage;
    }
    case 'stench':
      // A cloud of stinking gas around the attacker.
      if (!near || rng.int(level + 5) < 4) return damage;
      shown();
      burst(ctx, mob.pos, 'toxic', 1);
      return damage;
    case 'viscosity':
      // The blow is taken a point a turn, later.
      if (damage <= 0 || rng.int(level + 7) < 6) return damage;
      hero.deferred = (hero.deferred ?? 0) + damage;
      shown();
      return 0;
    case 'displacement': {
      // The hero is flung somewhere else in sight.
      if (isBossDepth(depth)) return damage;
      const seen = heroView(world, hero);
      const tries = (hero.armor.level < 0 ? 1 : hero.armor.level + 1) * 5;
      for (let i = 0; i < tries; i++) {
        const pos = rng.int(LENGTH);
        if (!seen[pos] || !isPassable(ctx.level, pos) || charAt(world, depth, pos)) continue;
        const from = hero.pos;
        hero.pos = pos;
        leaveCell(world, ctx.level, depth, from);
        enterCell(ctx.level, pos);
        shown();
        ctx.effects.push({ type: 'teleported', hero: hero.id });
        break;
      }
      return damage;
    }
    case 'entanglement':
      // Roots hold the hero fast, and harden their skin.
      if (rng.int(4) !== 0) return damage;
      hero.rooted = Math.max(hero.rooted, 5 - Math.trunc(level / 5));
      hero.earthroot = { pos: hero.pos, level: Math.max(hero.earthroot?.pos === hero.pos ? hero.earthroot.level : 0, 5 * (level + 1)) };
      shown();
      return damage;
  }
}

