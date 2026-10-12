import { beckon, createMob, type Hero, heroArmor, isAlive, type Mob, rollMob } from './actors';
import { hurt } from './combat';
import { charAt, type Char, type Ctx, exploredCells, heroesOn, isHero, isPassable, isWater } from './floor';
import { distance, NEIGHBOURS8 } from './level/geometry';
import { F, hasFlag, T } from './level/terrain';
import { clearGas, seedGas } from './gas';

/*
 * Traps (levels/traps): set off by stepping on them, visible or hidden; then
 * they are spent. The gas traps of the original spread a cloud; here the
 * cloud's effect lands at once on everyone within two cells.
 */

export type TrapKind = 'toxic' | 'fire' | 'paralytic' | 'poison' | 'alarm' | 'lightning' | 'gripping' | 'summoning';

const TRAPS: ReadonlyMap<number, TrapKind> = new Map<number, TrapKind>([
  [T.TOXIC_TRAP, 'toxic'], [T.SECRET_TOXIC_TRAP, 'toxic'],
  [T.FIRE_TRAP, 'fire'], [T.SECRET_FIRE_TRAP, 'fire'],
  [T.PARALYTIC_TRAP, 'paralytic'], [T.SECRET_PARALYTIC_TRAP, 'paralytic'],
  [T.POISON_TRAP, 'poison'], [T.SECRET_POISON_TRAP, 'poison'],
  [T.ALARM_TRAP, 'alarm'], [T.SECRET_ALARM_TRAP, 'alarm'],
  [T.LIGHTNING_TRAP, 'lightning'], [T.SECRET_LIGHTNING_TRAP, 'lightning'],
  [T.GRIPPING_TRAP, 'gripping'], [T.SECRET_GRIPPING_TRAP, 'gripping'],
  [T.SUMMONING_TRAP, 'summoning'], [T.SECRET_SUMMONING_TRAP, 'summoning'],
]);

export const trapAt = (terrain: number): TrapKind | undefined => TRAPS.get(terrain);

const GAS_RADIUS = 2;
const BURNING_TURNS = 8;

/** Frost.DURATION; GasesImmunity, as a cleansing cloud gives it. */
const FROST_TURNS = 5;
const PURE_TURNS = 5;

/** What a gas trap or a shattered potion releases; purity cleanses the air instead. */
export type Burst = 'toxic' | 'paralytic' | 'fire' | 'frost' | 'purity';

/**
 * IMMUNITIES: Yog-Dzewa breathes no gas and does not burn, nor does its
 * burning fist; piranhas in their pool fear neither gas, fire nor frost.
 */
export function immuneTo(char: Char, harm: 'burning' | 'gas' | 'frost'): boolean {
  if (isHero(char)) return harm === 'gas' && (char.gasImmune ?? 0) > 0;
  if (char.kind === 'piranha') return true;
  // DM-300 breathes its own fumes unharmed.
  if (harm === 'gas' && char.kind === 'dm300') return true;
  return harm !== 'frost' && (char.kind === 'yog' || (harm === 'burning' && char.kind === 'burningFist'));
}

/**
 * Gas let out at a cell (`amount` of it, a cloud that spreads and lingers:
 * see gas.ts), or a burst of flame, frost or cleansing air reaching everyone
 * within `radius`. Flames set the grass around alight, but not those
 * standing in water.
 */
export function burst(ctx: Ctx, pos: number, kind: Burst, radius = GAS_RADIUS, silent = false, amount = 1000): void {
  ctx.effects.push({ type: 'burst', depth: ctx.depth, pos, kind, radius, ...(silent ? { silent } : {}) });
  if (kind === 'toxic' || kind === 'paralytic') {
    seedGas(ctx, pos, kind, amount);
    return;
  }
  const { level } = ctx;
  // PotionOfPurity.shatter: the air around is cleared of gas.
  if (kind === 'purity') clearGas(ctx, pos, radius);
  for (const char of around(ctx, pos, radius)) {
    if (kind === 'fire' && !isWater(level.map[char.pos]!) && !immuneTo(char, 'burning')) {
      char.burning = Math.max(char.burning ?? 0, BURNING_TURNS);
    }
    // Freezing: frozen stiff, and any fire put out.
    if (kind === 'frost' && !immuneTo(char, 'frost')) {
      char.paralysed = Math.max(char.paralysed ?? 0, Math.round(FROST_TURNS * ctx.rng.floatRange(1, 1.5)));
      char.burning = 0;
    }
    if (kind === 'purity' && isHero(char)) char.gasImmune = Math.max(char.gasImmune ?? 0, PURE_TURNS);
  }
  if (kind !== 'fire') return;
  // Whatever can burn nearby burns down to embers: grass, doors, barricades, bookshelves.
  for (let cell = 0; cell < level.map.length; cell++) {
    if (distance(cell, pos) <= radius + 1 && hasFlag(level.map[cell]!, F.FLAMABLE)) {
      level.map[cell] = T.EMBERS;
      ctx.effects.push({ type: 'burnt', depth: ctx.depth, pos: cell });
    }
  }
}

/** Everyone alive within `radius` of a cell. */
function around(ctx: Ctx, pos: number, radius: number): Char[] {
  const chars: Char[] = heroesOn(ctx.world, ctx.depth).filter((hero) => distance(hero.pos, pos) <= radius);
  chars.push(...ctx.floor.mobs.filter((mob) => mob.state !== 'passive' && distance(mob.pos, pos) <= radius));
  return chars;
}

export function triggerTrap(ctx: Ctx, hero: Hero, pos: number): void {
  const { level, rng, depth } = ctx;
  const kind = trapAt(level.map[pos]!);
  if (!kind) return;
  level.map[pos] = T.INACTIVE_TRAP;
  exploredCells(ctx.world, depth)[pos] = true;
  ctx.effects.push({ type: 'trap', depth, pos, kind, hero: hero.id });

  switch (kind) {
    case 'poison':
      hero.poison = Math.max(hero.poison, 4 + Math.trunc(depth / 2));
      break;
    case 'toxic':
    case 'paralytic':
      // ToxicTrap and ParalyticTrap: a cloud, the bigger the deeper.
      burst(ctx, pos, kind, GAS_RADIUS, false, kind === 'toxic' ? 300 + 20 * depth : 80 + 5 * depth);
      break;
    case 'fire':
      // A small fire on the trap itself, catching the grass around.
      burst(ctx, pos, 'fire', 0);
      break;
    case 'alarm':
      for (const mob of ctx.floor.mobs) beckon(mob, pos);
      break;
    case 'lightning': {
      const damage = Math.max(1, rng.intBetween(Math.trunc(hero.hp / 3), Math.trunc((2 * hero.hp) / 3)));
      ctx.effects.push({ type: 'hurt', depth, who: hero.id, damage });
      hurt(ctx, hero, damage, 'lightning');
      break;
    }
    case 'gripping': {
      const damage = Math.max(0, depth + 3 - rng.intRange(0, Math.trunc(heroArmor(hero) / 2)));
      ctx.effects.push({ type: 'hurt', depth, who: hero.id, damage });
      hurt(ctx, hero, damage, 'gripping');
      break;
    }
    case 'summoning': {
      let count = 1;
      if (rng.int(2) === 0) {
        count++;
        if (rng.int(2) === 0) count++;
      }
      const cells = NEIGHBOURS8.map((n) => pos + n).filter((c) => isPassable(level, c) && !charAt(ctx.world, depth, c));
      for (let i = 0; i < count && cells.length > 0; i++) {
        const cell = cells.splice(rng.index(cells.length), 1)[0]!;
        const mob: Mob = createMob(`#${++ctx.world.nextId}`, rollMob(rng, depth), cell, 'wandering', ctx.floor.now + 1);
        mob.target = pos;
        ctx.floor.mobs.push(mob);
      }
      break;
    }
  }
}

/** Hurt a monster's turn by the conditions traps leave behind; true if it loses the turn. */
export function mobConditions(ctx: Ctx, mob: Mob): boolean {
  if ((mob.slowed ?? 0) > 0) mob.slowed!--;
  if ((mob.crippled ?? 0) > 0) mob.crippled!--;
  // Bleeding: it hurts every turn, and eases, until it stops.
  if ((mob.bleeding ?? 0) > 0) {
    mob.bleeding = ctx.rng.intRange(Math.trunc(mob.bleeding! / 2), mob.bleeding!);
    if (mob.bleeding > 0) {
      ctx.effects.push({ type: 'hurt', depth: ctx.depth, who: mob.id, damage: mob.bleeding });
      hurt(ctx, mob, mob.bleeding, 'bleeding');
      if (!isAlive(mob)) return true;
    }
  }
  if ((mob.poison ?? 0) > 0) {
    mob.poison!--;
    ctx.effects.push({ type: 'hurt', depth: ctx.depth, who: mob.id, damage: 1 });
    hurt(ctx, mob, 1, 'poison');
    if (!isAlive(mob)) return true;
  }
  if ((mob.burning ?? 0) > 0) {
    mob.burning!--;
    if (mob.kind === 'elemental') {
      // Fire only feeds a fire elemental (Elemental.add).
      mob.burning = 0;
      if (mob.hp < mob.ht) mob.hp++;
    } else if (isWater(ctx.level.map[mob.pos]!) || immuneTo(mob, 'burning')) {
      mob.burning = 0;
    } else {
      const damage = ctx.rng.intRange(1, 3 + Math.trunc(ctx.depth / 4));
      ctx.effects.push({ type: 'hurt', depth: ctx.depth, who: mob.id, damage });
      hurt(ctx, mob, damage, 'burning');
      if (!isAlive(mob)) return true;
    }
  }
  if ((mob.paralysed ?? 0) > 0) {
    mob.paralysed!--;
    mob.enemySeen = false;
    return true;
  }
  return false;
}
