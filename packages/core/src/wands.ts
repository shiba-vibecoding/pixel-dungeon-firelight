import { type Hero, isAlive, type Mob, MOBS } from './actors';
import { ballistica, randomRespawnCell } from './ai';
import { hurt } from './combat';
import { charAt, type Ctx, enterCell, isHero, isWater, leaveCell } from './floor';
import { type Item, magicMissileDamage } from './items';
import { distance, LENGTH, NEIGHBOURS8 } from './level/geometry';
import { F, hasFlag, T } from './level/terrain';
import { burst } from './traps';

/*
 * The wands (Wand and its kinds), zapped at a cell. A bolt flies until it
 * hits someone or something; disintegration and avalanche go through
 * creatures. As with thrown weapons, a hero's wand never harms another hero.
 */

/** How a bolt looks in flight. */
export type Bolt = 'magic' | 'lightning' | 'fire' | 'poison' | 'slow' | 'teleport' | 'blink' | 'beam' | 'rocks';

/** The monster at a cell, if any; heroes are never the target of a hero's wand. */
function mobAt(ctx: Ctx, cell: number): Mob | undefined {
  const char = charAt(ctx.world, ctx.depth, cell);
  return char && !isHero(char) && isAlive(char) ? char : undefined;
}

export function zapWand(ctx: Ctx, hero: Hero, wand: Item, target: number): void {
  const { world, depth, level, rng } = ctx;
  const power = wand.level;
  const fx = (to: number, bolt: Bolt, from = hero.pos): void => {
    ctx.effects.push({ type: 'zapped', depth, from, to, bolt });
  };
  const strike = (victim: Mob, damage: number): void => {
    ctx.effects.push({ type: 'attack', depth, attacker: hero.id, target: victim.id, hit: true, damage });
    hurt(ctx, victim, damage, hero);
  };

  switch (wand.kind) {
    case 'wand.magicMissile': {
      // A bolt of magic that never misses.
      const end = ballistica(ctx, hero.pos, target).at(-1)!;
      fx(end, 'magic');
      const victim = mobAt(ctx, end);
      if (victim) {
        const [min, max] = magicMissileDamage(wand);
        strike(victim, rng.intRange(min, max));
      }
      return;
    }

    case 'wand.firebolt': {
      // A bolt of fire: whatever can burn on its way catches fire, and so does its target.
      const trace = ballistica(ctx, hero.pos, target);
      const end = trace.at(-1)!;
      fx(end, 'fire');
      for (const cell of trace.slice(1, -1)) {
        if (hasFlag(level.map[cell]!, F.FLAMABLE)) {
          level.map[cell] = T.EMBERS;
          ctx.effects.push({ type: 'burnt', depth, pos: cell });
        }
      }
      if (charAt(world, depth, end) && !mobAt(ctx, end)) return;
      const victim = mobAt(ctx, end);
      burst(ctx, end, 'fire', 0);
      if (victim && isAlive(victim)) strike(victim, rng.intBetween(1, Math.trunc(2 * power ** 1.5) + 6));
      return;
    }

    case 'wand.lightning': {
      // Lightning leaps from its target to a creature next to it, and on, weaker each time.
      const end = ballistica(ctx, hero.pos, target).at(-1)!;
      let victim = mobAt(ctx, end);
      if (!victim) {
        fx(end, 'lightning');
        return;
      }
      const struck = new Set<Mob>();
      let from = hero.pos;
      let damage = rng.intBetween(5 + Math.trunc(power / 2), 10 + power);
      while (victim && damage >= 1) {
        struck.add(victim);
        fx(victim.pos, 'lightning', from);
        from = victim.pos;
        const dealt = isWater(level.map[victim.pos]!) && !MOBS[victim.kind].flying ? damage * 2 : damage;
        const next = NEIGHBOURS8.map((n) => mobAt(ctx, victim!.pos + n)).filter((m): m is Mob => !!m && !struck.has(m));
        strike(victim, dealt);
        victim = next.length > 0 ? rng.element(next) : undefined;
        damage = rng.intBetween(Math.trunc(damage / 2), damage);
      }
      return;
    }

    case 'wand.poison': {
      const end = ballistica(ctx, hero.pos, target).at(-1)!;
      fx(end, 'poison');
      const victim = mobAt(ctx, end);
      if (victim) {
        victim.poison = Math.max(victim.poison ?? 0, 5 + power);
        victim.alerted = true;
      }
      return;
    }

    case 'wand.slowness': {
      const end = ballistica(ctx, hero.pos, target).at(-1)!;
      fx(end, 'slow');
      const victim = mobAt(ctx, end);
      if (victim) victim.slowed = Math.max(victim.slowed ?? 0, power + 4);
      return;
    }

    case 'wand.teleportation': {
      // Sends the creature it hits somewhere else on the level.
      const end = ballistica(ctx, hero.pos, target).at(-1)!;
      fx(end, 'teleport');
      const victim = mobAt(ctx, end);
      if (!victim || victim.state === 'passive') return;
      const pos = randomRespawnCell(rng, world, level, () => true);
      if (pos === -1) return;
      const from = victim.pos;
      victim.pos = pos;
      leaveCell(world, level, depth, from);
      enterCell(level, pos);
      victim.state = 'wandering';
      victim.target = -1;
      ctx.effects.push({ type: 'jumped', depth, mob: victim.id, from, to: pos });
      return;
    }

    case 'wand.blink': {
      // The hero is carried along the bolt, up to a few cells, never into someone.
      const trace = ballistica(ctx, hero.pos, target);
      const range = power + 4;
      let dest = trace.at(-1)!;
      if (trace.length - 1 > range) dest = trace[range]!;
      else if (charAt(world, depth, dest) && trace.length > 2) dest = trace[trace.length - 2]!;
      if (dest === hero.pos || charAt(world, depth, dest)) return;
      fx(dest, 'blink');
      const from = hero.pos;
      hero.pos = dest;
      leaveCell(world, level, depth, from);
      enterCell(level, dest);
      ctx.effects.push({ type: 'teleported', hero: hero.id });
      return;
    }

    case 'wand.disintegration': {
      // A beam through everyone in its way, the stronger the more it pierces.
      const trace = ballistica(ctx, hero.pos, target, false).slice(0, power + 5);
      const end = trace.at(-1)!;
      fx(end, 'beam');
      const victims: Mob[] = [];
      for (const cell of trace.slice(1)) {
        const victim = mobAt(ctx, cell);
        if (victim) victims.push(victim);
        const terrain = level.map[cell]!;
        if (terrain === T.DOOR || terrain === T.OPEN_DOOR || terrain === T.SIGN) {
          level.map[cell] = T.EMBERS;
          ctx.effects.push({ type: 'burnt', depth, pos: cell });
        } else if (terrain === T.HIGH_GRASS) {
          level.map[cell] = T.GRASS;
        }
      }
      const lvl = power + victims.length;
      for (const victim of victims) strike(victim, rng.normalIntRange(lvl, 8 + Math.trunc((lvl * lvl) / 3)));
      return;
    }

    case 'wand.avalanche': {
      // Rocks fall around where it strikes, bruising and stunning.
      const trace = ballistica(ctx, hero.pos, target, false).slice(0, 9 + power);
      const center = trace.at(-1)!;
      fx(center, 'rocks');
      const size = 1 + Math.trunc(power / 3);
      const dist = new Int32Array(LENGTH).fill(-1);
      dist[center] = 0;
      const queue = [center];
      for (let head = 0; head < queue.length; head++) {
        const cell = queue[head]!;
        if (dist[cell]! >= size) continue;
        for (const n of NEIGHBOURS8) {
          const next = cell + n;
          if (next < 0 || next >= LENGTH || dist[next]! >= 0 || distance(cell, next) !== 1) continue;
          if (hasFlag(level.map[next]!, F.SOLID)) continue;
          dist[next] = dist[cell]! + 1;
          queue.push(next);
        }
      }
      ctx.effects.push({ type: 'avalanche', depth, cells: queue });
      for (const cell of queue) {
        const victim = mobAt(ctx, cell);
        if (!victim) continue;
        const d = dist[cell]!;
        strike(victim, rng.intBetween(2, (size + 4 - d) * (power + 1)));
        if (isAlive(victim) && rng.int(power + 2 + d) < power + 1) {
          victim.paralysed = Math.max(victim.paralysed ?? 0, rng.intRange(2, 6));
        }
      }
      return;
    }
  }
}
