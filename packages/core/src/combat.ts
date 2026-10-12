import {
  BRUTE_ENRAGED_DAMAGE, createMob, type Hero, heroArmor, heroAttackSkill, heroDamageRoll, heroDefenseSkill, isAlive,
  maxExp, type Mob, MOBS,
} from './actors';
import { charAt, type Char, type Ctx, dropItem, enterCell, heroesOn, isHero, isPassable, leaveCell } from './floor';
import { createItem, type Item, itemDef, ItemGenerator, rollGold } from './items';
import { NEIGHBOURS4, NEIGHBOURS8 } from './level/geometry';
import { questKill } from './quest';
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
  if (range) return ctx.rng.normalIntRange(range[0], range[1]);
  if (isHero(char)) return heroDamageRoll(char, ctx.rng);
  const [min, max] = char.kind === 'brute' && char.enraged ? BRUTE_ENRAGED_DAMAGE : MOBS[char.kind].damage;
  return ctx.rng.normalIntRange(min, max);
}

/** Changes to an attacker's usual numbers, e.g. a pumped-up Goo. */
export interface AttackOverride {
  attack?: number;
  damage?: readonly [number, number];
}

/** One blow or shot; returns whether it hit. */
export function attack(ctx: Ctx, attacker: Char, defender: Char, override: AttackOverride = {}): boolean {
  // Striking gives an invisible hero away.
  if (isHero(attacker)) attacker.invisible = 0;
  const skill = override.attack ?? attackSkill(attacker);
  const hit = ctx.rng.floatMax(skill) >= ctx.rng.floatMax(defenseSkill(defender));
  if (!hit) {
    ctx.effects.push({ type: 'attack', depth: ctx.depth, attacker: attacker.id, target: defender.id, hit, damage: 0 });
    return false;
  }
  const reduction = ctx.rng.intRange(0, armor(defender));
  const damage = Math.max(damageRoll(ctx, attacker, override.damage) - reduction, 0);
  // Goo's touch may leave caustic ooze that burns until washed off in water.
  if (!isHero(attacker) && attacker.kind === 'goo' && ctx.rng.int(3) === 0 && isHero(defender)) {
    if (defender.ooze < 0) ctx.effects.push({ type: 'oozed', hero: defender.id });
    defender.ooze = 0;
  }
  // Char.attackProc and defenseProc: what a blow does besides the damage.
  if (!isHero(attacker)) {
    // The vampire bat drinks what it draws.
    if (attacker.kind === 'bat') attacker.hp += Math.min(damage, attacker.ht - attacker.hp);
    if (attacker.kind === 'thief' && !attacker.item && isHero(defender)) steal(ctx, attacker, defender);
  }
  if (!isHero(defender) && defender.kind === 'swarm') split(ctx, defender, damage);
  ctx.effects.push({ type: 'attack', depth: ctx.depth, attacker: attacker.id, target: defender.id, hit, damage });
  hurt(ctx, defender, damage, attacker);
  return true;
}

/** Shopkeeper.flee: attacked, he vanishes, and his wares with him. */
function shopkeeperFlees(ctx: Ctx, keeper: Mob): void {
  ctx.floor.heaps = ctx.floor.heaps.filter((heap) => heap.kind !== 'forSale');
  ctx.floor.mobs.splice(ctx.floor.mobs.indexOf(keeper), 1);
  leaveCell(ctx.world, ctx.level, ctx.depth, keeper.pos);
  ctx.effects.push({ type: 'shopkeeperFled', depth: ctx.depth, mob: keeper.id, pos: keeper.pos });
}

/** Thief.steal: a whole stack from the pack (never a key or a quest item), then off it runs. */
function steal(ctx: Ctx, thief: Mob, hero: Hero): void {
  const loot = hero.items.filter((item) => item.kind !== 'key.iron' && itemDef(item.kind).category !== 'quest');
  if (loot.length === 0) return;
  const item = ctx.rng.element(loot)!;
  hero.items.splice(hero.items.indexOf(item), 1);
  thief.item = item;
  thief.state = 'fleeing';
  ctx.effects.push({ type: 'stole', depth: ctx.depth, mob: thief.id, hero: hero.id, item });
}

/** Swarm.defenseProc: struck, the swarm splits, half of what is left flying off next to it. */
function split(ctx: Ctx, swarm: Mob, damage: number): void {
  if (swarm.hp < damage + 2) return;
  const { world, depth, level, rng, floor } = ctx;
  const cells = NEIGHBOURS4.map((n) => swarm.pos + n).filter((c) => isPassable(level, c) && !charAt(world, depth, c));
  if (cells.length === 0) return;
  const clone = createMob(`#${++world.nextId}`, 'swarm', rng.element(cells)!, 'hunting', floor.now + 1);
  clone.generation = (swarm.generation ?? 0) + 1;
  clone.hp = Math.trunc((swarm.hp - damage) / 2);
  clone.enemy = swarm.enemy;
  if ((swarm.burning ?? 0) > 0) clone.burning = swarm.burning;
  if ((swarm.poison ?? 0) > 0) clone.poison = 2;
  swarm.hp -= clone.hp;
  floor.mobs.push(clone);
  enterCell(level, clone.pos);
}

/** What hurts without being a character. */
export type Hazard = 'poison' | 'burning' | 'ooze' | 'lightning' | 'gripping' | 'hunger' | 'bones';

export function hurt(ctx: Ctx, victim: Char, damage: number, source: Char | Hazard): void {
  if (!isAlive(victim)) return;
  // The sad ghost cannot be harmed; the shopkeeper will not stay to be.
  if (!isHero(victim) && victim.state === 'passive') {
    if (victim.kind === 'shopkeeper') shopkeeperFlees(ctx, victim);
    return;
  }
  const by = typeof source === 'string' ? null : source;
  if (!isHero(victim)) {
    if (victim.state === 'sleeping') victim.state = 'wandering';
    victim.alerted = true;
    // In a party, a monster turns on whoever hurt it.
    if (by && isHero(by)) victim.enemy = by.id;
  }
  victim.hp -= damage;
  // Brute.damage: below a quarter of its health, the brute flies into a rage.
  if (!isHero(victim) && victim.kind === 'brute' && isAlive(victim) && !victim.enraged && victim.hp < victim.ht / 4) {
    victim.enraged = true;
    victim.time += 1;
    ctx.effects.push({ type: 'enraged', depth: ctx.depth, mob: victim.id });
  }
  if (!isAlive(victim)) {
    if (isHero(victim)) {
      victim.killedBy = typeof source === 'string' ? source : isHero(source) ? source.heroClass : source.kind;
      heroDied(ctx, victim);
    } else {
      if (by && isHero(by)) by.kills++;
      mobDied(ctx, victim);
    }
  }
}

/** Crab.lootChance. */
const CRAB_MEAT_CHANCE = 0.167;

function mobDied(ctx: Ctx, mob: Mob): void {
  mob.hp = 0;
  ctx.floor.mobs.splice(ctx.floor.mobs.indexOf(mob), 1);
  leaveCell(ctx.world, ctx.level, ctx.depth, mob.pos);
  ctx.effects.push({ type: 'died', depth: ctx.depth, who: mob.id, pos: mob.pos });

  // Everyone fighting on the depth learns from the kill, not just the killer.
  const stats = MOBS[mob.kind];
  const heroes = heroesOn(ctx.world, ctx.depth);
  for (const hero of heroes) {
    if (hero.lvl <= stats.maxLvl) earnExp(ctx, hero, stats.exp);
  }

  questKill(ctx, mob);

  // A thief's stolen goods fall where it dies.
  if (mob.item) dropItem(ctx.floor, mob.pos, mob.item);

  // Mob.dropLoot, unless the party has outgrown the monster.
  if (heroes.some((h) => h.lvl <= stats.maxLvl + 2)) {
    const loot = dropLoot(ctx, mob);
    if (loot) dropItem(ctx.floor, mob.pos, loot);
  }

  if (mob.kind === 'skeleton') explode(ctx, mob);

  if (mob.kind === 'goo' || mob.kind === 'tengu') {
    const { level } = ctx;
    // Goo's lair dries out behind the heroes; Tengu's arena opens.
    if (level.map[level.entrance] === T.WATER_TILES) level.map[level.entrance] = T.ENTRANCE;
    if (level.arenaDoor !== undefined && level.map[level.arenaDoor] === T.LOCKED_DOOR) {
      level.map[level.arenaDoor] = T.DOOR;
      ctx.effects.push({ type: 'arena', depth: ctx.depth, sealed: false });
    }
    if (level.map[level.exit] === T.LOCKED_EXIT) level.map[level.exit] = T.UNLOCKED_EXIT;
    ctx.effects.push({ type: 'yell', depth: ctx.depth, mob: mob.id, kind: mob.kind, line: 'death' });
    ctx.effects.push({ type: 'bossSlain', depth: ctx.depth, kind: mob.kind });
  }
}

/** What a monster leaves behind (Mob.loot and lootChance, or its own dropLoot). */
function dropLoot(ctx: Ctx, mob: Mob): Item | null {
  const { rng } = ctx;
  const generator = (): ItemGenerator => new ItemGenerator(rng, ctx.depth);
  switch (mob.kind) {
    case 'gnoll':
      return rng.float() < 0.5 ? rollGold(rng, ctx.depth) : null;
    case 'crab':
      return rng.float() < CRAB_MEAT_CHANCE ? createItem('food.meat') : null;
    case 'skeleton': {
      // The worst of three weapons, one time in five.
      if (rng.int(5) !== 0) return null;
      let loot = generator().of('weapon');
      for (let i = 0; i < 2; i++) {
        const other = generator().of('weapon');
        if (other.level < loot.level) loot = other;
      }
      return loot;
    }
    case 'swarm':
      return rng.int(5 * ((mob.generation ?? 0) + 1)) === 0 ? createItem('potion.healing') : null;
    case 'shaman':
      return rng.float() < 0.33 ? generator().of('scroll') : null;
    case 'bat':
      return rng.float() < 0.125 ? createItem('potion.healing') : null;
    case 'brute':
      return rng.float() < 0.5 ? rollGold(rng, ctx.depth) : null;
    default:
      return null;
  }
}

/** Skeleton.die: its bones fly apart, hurting everyone around. */
function explode(ctx: Ctx, skeleton: Mob): void {
  ctx.effects.push({ type: 'bones', depth: ctx.depth, pos: skeleton.pos });
  for (const n of NEIGHBOURS8) {
    const victim = charAt(ctx.world, ctx.depth, skeleton.pos + n);
    if (!victim || !isAlive(victim)) continue;
    const [min, max] = MOBS.skeleton.damage;
    const damage = Math.max(0, ctx.rng.normalIntRange(min, max) - ctx.rng.intRange(0, Math.trunc(armor(victim) / 2)));
    ctx.effects.push({ type: 'hurt', depth: ctx.depth, who: victim.id, damage });
    hurt(ctx, victim, damage, isHero(victim) ? 'bones' : skeleton);
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
