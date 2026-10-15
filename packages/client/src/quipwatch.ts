import type { Effect, MobKind } from '@pd/core';
import type { Moment, QuipClass } from './quips';

/*
 * What the hero's last turn was, for his quips: read out of the effects the client gets after each turn (a kill, a blow, a bolt,
 * a thrown thing, a theft, hunger, the Amulet, a curse found out). One moment at most comes out of a turn: the one most worth a word.
 */

/** The parts of the hero this reads, after the turn. */
export interface WatchHero {
  id: string;
  pos: number;
  depth: number;
  hp: number;
  ht: number;
  /** All kills so far, this turn's included (Hero.kills). */
  kills: number;
}

/** Bosses, each with a moment of their own. */
const BOSSES: Partial<Record<MobKind, Moment>> = { goo: 'goo', tengu: 'tengu', dm300: 'dm300', king: 'king', yog: 'yog' };
/** Rats, crabs and the like: a kill hardly worth the breath. */
export const TRIVIAL: ReadonlySet<MobKind> = new Set<MobKind>(['rat', 'albino', 'crab', 'fetidRat']);
/** Whose death is nobody's triumph: the peaceful, the conjured and the cursed ghost. */
const NO_QUIP: ReadonlySet<MobKind> = new Set<MobKind>([
  'sheep', 'mirror', 'ghost', 'shopkeeper', 'wandmaker', 'blacksmith', 'imp', 'impShopkeeper', 'ratKing', 'curse', 'statue',
]);
const THIEVES: ReadonlySet<MobKind> = new Set<MobKind>(['thief', 'bandit']);

/** Which moment wins when one turn has several (the first of these). */
const PRIORITY: readonly Moment[] = [
  'death', 'amulet', 'goo', 'tengu', 'dm300', 'king', 'yog', 'nearDeath', 'firstBlood', 'streak',
  'thief', 'wand', 'ranged', 'oneHit', 'cursed', 'hungry', 'trivial', 'kill',
];

/** «Near death» is a win with less than this part of the health left. */
export const NEAR_DEATH = 0.15;
/** A streak is this many kills within this many turns. */
export const STREAK_KILLS = 3;
export const STREAK_TURNS = 10;
const MOB_MEMORY = 200;

export class QuipWatch {
  /** Blows that landed on each monster still alive (a kill in one blow is a one-hit kill). */
  private hits = new Map<string, number>();
  /** Thieves that stole from this hero. */
  private thieves = new Set<string>();
  private kills: number[] = [];

  reset(): void {
    this.hits.clear();
    this.thieves.clear();
    this.kills = [];
  }

  /** The moment this turn deserves a word for, if any. */
  read(effects: readonly Effect[], me: WatchHero, turn: number): Moment | null {
    if (this.hits.size > MOB_MEMORY) this.hits.clear();
    const found = new Set<Moment>();
    const here = (depth: number): boolean => depth === me.depth;
    // What the hero did this turn from where he stands: a bolt, a throw (he does not move while he does either).
    const zapped = effects.some((e) => e.type === 'zapped' && here(e.depth) && e.from === me.pos);
    const thrown = effects.some((e) => e.type === 'thrown' && here(e.depth) && e.from === me.pos);
    // The kills of this turn, in order, to number them: the last one is the hero's latest kill.
    const mine = effects.filter((e) => e.type === 'died' && e.by === me.id && e.who.startsWith('#') && here(e.depth)).length;
    let seen = 0;
    for (const effect of effects) {
      switch (effect.type) {
        case 'attack':
          if (effect.hit && effect.target.startsWith('#')) this.hits.set(effect.target, (this.hits.get(effect.target) ?? 0) + 1);
          break;
        case 'stole':
          if (effect.hero === me.id) this.thieves.add(effect.mob);
          break;
        case 'hunger':
          if (effect.hero === me.id && effect.state === 'hungry') found.add('hungry');
          break;
        case 'amulet':
          if (effect.hero === me.id && effect.first) found.add('amulet');
          break;
        case 'pickedUp':
          if (effect.hero === me.id && effect.item.cursed && !effect.item.curseUnknown) found.add('cursed');
          break;
        case 'revealed':
        case 'familiar':
        case 'cursedEquip':
          if (effect.hero === me.id && (effect.type === 'cursedEquip' || (effect.item.cursed && !effect.item.curseUnknown))) found.add('cursed');
          break;
        case 'died': {
          if (effect.who === me.id) {
            found.add('death');
            break;
          }
          if (!effect.who.startsWith('#')) break;
          const hits = this.hits.get(effect.who) ?? 0;
          this.hits.delete(effect.who);
          const stole = this.thieves.delete(effect.who);
          if (effect.by !== me.id || !here(effect.depth) || !effect.kind || NO_QUIP.has(effect.kind)) break;
          seen++;
          const kind = effect.kind;
          const melee = effects.some((e) => e.type === 'attack' && e.attacker === me.id && e.target === effect.who && e.hit);
          const boss = BOSSES[kind];
          if (boss) found.add(boss);
          if (me.hp > 0 && me.hp < me.ht * NEAR_DEATH) found.add('nearDeath');
          if (me.kills - mine + seen === 1) found.add('firstBlood');
          this.kills.push(turn);
          this.kills = this.kills.filter((at) => turn - at <= STREAK_TURNS);
          if (this.kills.length >= STREAK_KILLS) {
            found.add('streak');
            this.kills = [];
          }
          if (stole && THIEVES.has(kind)) found.add('thief');
          if (zapped) found.add('wand');
          else if (thrown) found.add('ranged');
          else if (melee && hits === 1 && !TRIVIAL.has(kind)) found.add('oneHit');
          found.add(TRIVIAL.has(kind) ? 'trivial' : 'kill');
          break;
        }
        default:
          break;
      }
    }
    return PRIORITY.find((m) => found.has(m)) ?? null;
  }
}
