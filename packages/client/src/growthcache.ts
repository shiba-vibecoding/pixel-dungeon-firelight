import type { Hero, Item } from '@pd/core';
import { type Aura, auraOf } from './growth';

/*
 * `auraOf(hero)` once per change of what the hero wears, not once per frame. The 3D view asks for it every frame; this answers from the
 * last time unless a thing worn is another object, or one of the things that decide the answer has moved in it (its level, whether the
 * level or the curse is still hidden, a curse, its wear, an enchantment, a glyph). Items are changed in place by the core, so the object's
 * identity alone would miss an upgrade. After the first look a call allocates nothing.
 */

interface Snap {
  item: Item | null;
  kind: string;
  level: number;
  durability: number;
  flags: number;
  enchant: string;
  glyph: string;
}

const snap = (): Snap => ({ item: null, kind: '', level: 0, durability: 0, flags: 0, enchant: '', glyph: '' });
const flagsOf = (item: Item): number => (item.levelUnknown ? 1 : 0) | (item.curseUnknown ? 2 : 0) | (item.cursed ? 4 : 0);

function same(s: Snap, item: Item | null | undefined): boolean {
  if (!item) return s.item === null;
  return s.item === item && s.kind === item.kind && s.level === item.level && s.durability === (item.durability ?? -1) && s.flags === flagsOf(item)
    && s.enchant === (item.enchant ?? '') && s.glyph === (item.glyph ?? '');
}

function take(s: Snap, item: Item | null | undefined): void {
  s.item = item ?? null;
  if (!item) return;
  s.kind = item.kind;
  s.level = item.level;
  s.durability = item.durability ?? -1;
  s.flags = flagsOf(item);
  s.enchant = item.enchant ?? '';
  s.glyph = item.glyph ?? '';
}

/** Whether an aura shows anything at all. */
export const hasAura = (a: Aura): boolean => a.weapon > 0 || a.armor > 0 || a.enchant !== null || a.glyph !== null || a.cursed;

export class AuraCache {
  /** How many times the answer was worked out (the tests read it). */
  looks = 0;
  private aura: Aura | null = null;
  private readonly weapon = snap();
  private readonly armor = snap();
  private rings: Snap[] = [];
  private ringCount = -1;
  /** The hero it was last asked for (a different one drops the answer). */
  private owner = '';

  /** What the hero shows of his things now. The one object is kept while nothing changes. */
  get(hero: Hero): Aura {
    if (this.aura && this.owner === hero.id && same(this.weapon, hero.weapon) && same(this.armor, hero.armor) && this.ringsSame(hero.rings)) return this.aura;
    this.looks++;
    this.owner = hero.id;
    take(this.weapon, hero.weapon);
    take(this.armor, hero.armor);
    const rings = hero.rings;
    this.ringCount = rings.length;
    while (this.rings.length < rings.length) this.rings.push(snap());
    for (let i = 0; i < rings.length; i++) take(this.rings[i]!, rings[i]);
    this.aura = auraOf(hero);
    return this.aura;
  }

  private ringsSame(rings: readonly Item[]): boolean {
    if (rings.length !== this.ringCount) return false;
    for (let i = 0; i < rings.length; i++) if (!same(this.rings[i]!, rings[i])) return false;
    return true;
  }
}
