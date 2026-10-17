import { type Effect, type Hero, type Item, mobById, type World } from '@pd/core';
import { audio } from './audio';
import { showBanner, showLevelUp, showStrength } from './growhero';
import { arrives, grow, remember, remembersHit, sees } from './growmem';
import { t } from './i18n';
import { G } from './i18n-grow';

/*
 * Part 11 as the game's effects reach it: the core sends what happened (a level, a point of strength, a way chosen, a thing
 * upgraded...), this module keeps what the client remembers of it (growmem.ts) and calls the moments the player sees. It decides
 * nothing about the rules and tells nothing the player does not know: every moment is built from the effect itself and from what the
 * party knows. The caller (main.ts) hands in the few things only it has: the HUD's pop, the passport, a slot, a name, the bag's moments.
 */

export interface GrowHooks {
  /** The HUD's coal and bar of a new level. */
  levelPop(): void;
  openPassport(): void;
  slotOf(world: World, hero: Hero, item: Item): HTMLElement;
  nameOf(world: World, item: Item): string;
  /** The backpack's own moments (upgrade, reveal, enchant, uncurse): screens.ts. */
  bagMoment(kind: 'upgrade' | 'reveal' | 'enchant' | 'uncurse', item: Item | null, kindOf?: string): void;
  /** The mastery sigil flaring over the hero in 3D (r3d). */
  sigil(heroId: string): void;
}

let hooks: GrowHooks | null = null;
export function setGrowHooks(next: GrowHooks): void {
  hooks = next;
}

/** The effects of one batch, for the hero `myId`. Never throws into the game: a failure here is the screens' loss only. */
export function growEffects(effects: readonly Effect[], world: World, me: Hero, myId: string): void {
  if (!hooks || effects.length === 0) return;
  try {
    run(effects, world, me, myId, hooks);
  } catch (error) {
    console.error(error);
  }
}

function run(effects: readonly Effect[], world: World, me: Hero, myId: string, deps: GrowHooks): void {
  const at = { depth: me.depth, turn: world.turn };
  let changed = false;
  for (const effect of effects) {
    const kept = remember(grow.data, world, effect, myId, at);
    if (kept || effect.type === 'pickedUp' || effect.type === 'used' || effect.type === 'died' || effect.type === 'shattered') changed = true;
    if (effect.type === 'attack' && effect.target === myId && effect.hit) {
      if (remembersHit(grow.data, mobById(world, effect.depth, effect.attacker)?.kind, effect.damage, effect.depth)) changed = true;
    }
    if ('hero' in effect && effect.hero !== myId) continue;
    switch (effect.type) {
      case 'levelUp':
        showLevelUp(me, deps.openPassport, deps.levelPop);
        break;
      case 'strength':
        showStrength(me, (item) => deps.slotOf(world, me, item), (item) => deps.nameOf(world, item));
        break;
      case 'mastered':
        audio.play('badge');
        showBanner(t.subclasses[effect.subclass].toUpperCase(), G.hero.mastery);
        deps.sigil(myId);
        break;
      case 'classArmor':
        audio.play('equip');
        window.setTimeout(() => audio.play('badge'), 220);
        showBanner(deps.nameOf(world, effect.item).toUpperCase(), G.hero.classArmor);
        break;
      case 'upgraded':
        audio.play('hammer');
        window.setTimeout(() => audio.play('sparkle'), 160);
        deps.bagMoment('upgrade', effect.item);
        break;
      case 'revealed':
        audio.play('found');
        deps.bagMoment('reveal', effect.item);
        break;
      case 'familiar':
        audio.play('found');
        deps.bagMoment('reveal', effect.item);
        break;
      case 'identified':
        // A kind learned: every thing of that kind in the pack turns its face over.
        audio.play('found');
        deps.bagMoment('reveal', null, effect.kind);
        break;
      case 'imbued':
        audio.play('evoke');
        deps.bagMoment('enchant', effect.item);
        break;
      case 'scroll':
        if (effect.kind === 'removeCurse' && effect.count > 0) {
          audio.play('shatter');
          deps.bagMoment('uncurse', null);
        }
        break;
      default:
        break;
    }
  }
  if (changed) grow.touch();
}

/** The hero stands on a floor: a new depth is a line of the chronicle and a snapshot of the hero's growth (growmem.ts arrives). */
export function growArrive(me: Hero, turn: number): void {
  if (arrives(grow.data, me, turn)) grow.touch();
}

/** After each turn: what the hero can see (monsters met, things lying in view). */
export function growSight(world: World, me: Hero, visible: readonly boolean[]): void {
  if (sees(grow.data, world, me, visible)) grow.touch();
}
