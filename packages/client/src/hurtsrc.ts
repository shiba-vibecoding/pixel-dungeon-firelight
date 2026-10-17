import type { Effect, HeroClass, ItemKind, MobKind, TrapKind } from '@pd/core';

/*
 * «Where the damage came from»: what hurt the hero (and, as an extra, what the hero's wand or missile did to a monster), worked out
 * from what the core already says: its effects and the hero's state. The core's `hurt` effect carries no cause (adding one would be
 * a change of the rules, and the rules are shared with the server), so for the hero's own wounds the cause is read from the
 * effects around it and, for the slow ones, from the conditions the hero is under:
 *
 *   - an `attack` names who struck: a monster (its portrait), or another hero;
 *   - a `hurt` right after a `fell`, a lightning or gripping `trap`, an `exploded`, a `bones`, a glyph, a lightning bolt is that;
 *   - the rest are the hero's ticking conditions (ooze, poison, deferred blows, bleeding, fire, and now and then hunger or gas), matched
 *     to the hurts in the order the core ticks them (world.ts tickHero) and by what each can have dealt.
 *
 * It is a reading, not a record: when two conditions could each have dealt a point the order decides, and what cannot be placed is
 * `unknown` (a skull). Pure: no DOM, no clock; test/hurtsrc.test.ts.
 */

export type Cause =
  | 'burning' | 'poison' | 'bleeding' | 'hunger' | 'ooze' | 'deferred' | 'gas' | 'trap' | 'fall' | 'lightning' | 'bones' | 'bomb'
  | 'multiplicity' | 'wand' | 'missile' | 'unknown';

/** What dealt damage: a monster, another hero, or a cause with what it needs to be drawn (a trap's kind, a wand's or a missile's item). */
export type Source =
  | { readonly mob: MobKind }
  | { readonly hero: HeroClass }
  | { readonly cause: Cause; readonly trap?: TrapKind; readonly item?: ItemKind };

/** The hero's conditions that hurt, at one moment. */
export interface Conditions {
  burning: boolean;
  poison: boolean;
  /** The size of the next bleeding tick, 0 when not bleeding. */
  bleeding: number;
  ooze: boolean;
  deferred: boolean;
  starving: boolean;
  /** Standing in toxic gas. */
  gas: boolean;
}

export const NO_CONDITIONS: Conditions = { burning: false, poison: false, bleeding: 0, ooze: false, deferred: false, starving: false, gas: false };

export interface Facts {
  myId: string;
  /** What kind of monster an id is (a monster that has just died too), if it is one. */
  mobKind(id: string): MobKind | undefined;
  heroClass(id: string): HeroClass | undefined;
  /** The hero's conditions before the effects took place (the previous look), if known, and after. */
  before: Conditions | null;
  after: Conditions;
  /** The depth the hero is on, which sets the most a flame can deal. */
  depth: number;
}

/** The bolt a wand shoots that does damage, and the wand it is. */
const WAND_OF: Readonly<Record<string, ItemKind>> = {
  magic: 'wand.magicMissile', fire: 'wand.firebolt', lightning: 'wand.lightning', beam: 'wand.disintegration', rocks: 'wand.avalanche',
};

/** How far back in the batch a hurt looks for what set it off. */
const LOOKBACK = 4;

/** The order the core ticks the hero's conditions in (world.ts): the ones that tick every turn. */
const TICKS: ReadonlyArray<Cause> = ['ooze', 'poison', 'deferred', 'bleeding', 'burning'];

/** Whether a condition can have dealt `damage` (the most a flame deals is Burning's 3 + depth / 4). */
function compatible(cause: Cause, damage: number, f: Facts): boolean {
  switch (cause) {
    case 'ooze':
    case 'hunger':
      return damage === 1;
    case 'bleeding':
      return damage === f.after.bleeding || damage <= (f.before?.bleeding ?? 0) || (f.before === null && damage > 0);
    case 'burning':
      return damage >= 1 && damage <= 3 + Math.trunc(f.depth / 4);
    default:
      return true;
  }
}

const active = (cause: Cause, f: Facts): boolean => {
  const has = (c: Conditions | null): boolean =>
    !!c && (cause === 'ooze' ? c.ooze : cause === 'poison' ? c.poison : cause === 'deferred' ? c.deferred : cause === 'bleeding' ? c.bleeding > 0 : cause === 'burning' ? c.burning : false);
  return has(f.before) || has(f.after);
};

/** What set off the hurt at `index` (the hero's), from the effects just before it, or null when nothing did. */
function setOff(effects: readonly Effect[], index: number, f: Facts): Source | null {
  for (let i = index - 1; i >= 0 && i >= index - LOOKBACK; i--) {
    const e = effects[i]!;
    // Another's wounds are no part of this one's story; a blow or a hurt of the hero's own ends the look.
    if (e.type === 'hurt' && e.who !== f.myId) continue;
    if (e.type === 'hurt' || e.type === 'attack') return null;
    switch (e.type) {
      case 'fell':
        if (e.hero === f.myId) return { cause: 'fall' };
        break;
      case 'trap':
        // Only the traps that wound at once; a poison or fire trap, a gas trap, set a condition, which ticks.
        if (e.hero === f.myId && (e.kind === 'lightning' || e.kind === 'gripping')) return { cause: 'trap', trap: e.kind };
        break;
      case 'bones':
      case 'wraiths':
        return { cause: 'bones' };
      case 'exploded':
        return { cause: 'bomb' };
      case 'glyph':
        if (e.hero === f.myId && e.glyph === 'multiplicity') return { cause: 'multiplicity' };
        break;
      case 'zapped':
        if (e.bolt === 'lightning') return { cause: 'lightning' };
        break;
      default:
        break;
    }
  }
  return null;
}

/** What the hero's own blow at a monster was, when it was a wand's bolt or a thrown missile; null for a blow in hand. */
function heroBlow(effects: readonly Effect[], index: number): Source | null {
  for (let i = index - 1; i >= 0 && i >= index - LOOKBACK; i--) {
    const e = effects[i]!;
    if (e.type === 'attack' || e.type === 'died') return null;
    if (e.type === 'zapped') return { cause: 'wand', ...(e.bolt && WAND_OF[e.bolt] ? { item: WAND_OF[e.bolt]! } : {}) };
    if (e.type === 'thrown') return e.item.startsWith('missile.') || e.item.startsWith('weapon.') ? { cause: 'missile', item: e.item } : null;
  }
  return null;
}

/**
 * The source of each damage in a batch of effects, by the index of the effect: the blows and hurts that the hero took, and the
 * hero's wand and missile hits on monsters. A damage nothing can be said of is left out.
 */
export function sourcesOf(effects: readonly Effect[], f: Facts): Map<number, Source> {
  const out = new Map<number, Source>();
  // The hero's slow wounds, in order: matched to the conditions after the pass below.
  const slow: number[] = [];
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i]!;
    if (e.type === 'attack') {
      if (!e.hit || e.damage <= 0) continue;
      if (e.target === f.myId) {
        const mob = f.mobKind(e.attacker);
        const hero = mob ? undefined : f.heroClass(e.attacker);
        out.set(i, mob ? { mob } : hero ? { hero } : { cause: 'unknown' });
      } else if (e.attacker === f.myId) {
        const blow = heroBlow(effects, i);
        if (blow) out.set(i, blow);
      }
    } else if (e.type === 'hurt' && e.who === f.myId && e.damage > 0) {
      const direct = setOff(effects, i, f);
      if (direct) out.set(i, direct);
      else slow.push(i);
    }
  }
  if (slow.length === 0) return out;

  const mandatory = TICKS.filter((cause) => active(cause, f));
  // The ones that tick now and then: hunger (starving) is taken first in a turn, gas (standing in a cloud) last. Wounds beyond what the
  // conditions that tick every turn account for are theirs; with one to place and both possible, the cloud is the likelier.
  const optional: Cause[] = [...(f.before?.starving || f.after.starving ? ['hunger' as const] : []), ...(f.before?.gas || f.after.gas ? ['gas' as const] : [])];
  const extra = Math.max(0, Math.min(slow.length - mandatory.length, optional.length));
  const chosen = extra === 0 ? [] : extra === optional.length ? optional : optional.slice(-extra);
  const seq: Cause[] = [...chosen.filter((c) => c === 'hunger'), ...mandatory, ...chosen.filter((c) => c === 'gas')];
  let at = 0;
  for (const index of slow) {
    const damage = (effects[index] as Extract<Effect, { type: 'hurt' }>).damage;
    // The next cause in the order that can have dealt it (the ones skipped did not tick, or dealt nothing); a second round, if need be.
    let q = -1;
    for (let n = 0; n < seq.length && q < 0; n++) {
      const at2 = (at + n) % seq.length;
      if (compatible(seq[at2]!, damage, f)) q = at2;
    }
    if (q < 0) {
      out.set(index, { cause: 'unknown' });
      continue;
    }
    out.set(index, { cause: seq[q]! });
    at = (q + 1) % seq.length;
  }
  return out;
}

/** A stable key for a source, for interning its icon and telling two apart. */
export function sourceKey(source: Source): string {
  if ('mob' in source) return `m:${source.mob}`;
  if ('hero' in source) return `h:${source.hero}`;
  return `c:${source.cause}${source.trap ? `:${source.trap}` : ''}${source.item ? `:${source.item}` : ''}`;
}
