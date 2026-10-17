import type { Hero } from '@pd/core';
import { ITEMS, itemDef } from '@pd/core';
import { cleanEquipped, DEFAULT_OWNED, HEROES, type Slot } from '../../client/src/catalog';
import type { Worn } from './leaderboard';
import { TIERS as LEAGUE_KEYS } from './league-rules';
import { ownedItems, type ShopState } from './wallet';

/*
 * What a board row shows of a player's hero (the hero card, client herocard.ts): the look of the class played, the hat, the pet, the
 * camp fire, the profile frame, the title and the name colour, by catalogue item id. It is built HERE, from the player's wallet, and
 * from nothing a device says: only what the wallet owns AND has put on, in the slot each item fits (the same discipline as `equip`,
 * wallet.ts), so a board can never show something the player does not have. Looks only, like everything in Pixel-Mart.
 */

/** The wallet's slot of each field of a Worn (the look is `look.<class>`). */
const FIELDS: ReadonlyArray<readonly [field: Exclude<keyof Worn, 'l' | 'a' | 'wp' | 'lg'>, slot: Slot]> = [
  ['h', 'hat'], ['p', 'pet'], ['f', 'campfire'], ['fr', 'frame'], ['tt', 'title'], ['nc', 'namecolor'],
];

/** The classic fire is what everyone has: a card says it by saying nothing. */
const CLASSIC = 'fire.classic';

/** What a player's hero of `heroClass` wears on a board: only owned things in their own slots; undefined if nothing is worn. */
export function wornOf(shop: ShopState, heroClass: string, armor?: number, league?: string, weapon?: string): Worn | undefined {
  const slots = cleanEquipped(shop.equipped).slots;
  const owned = ownedItems(shop);
  const has = (id: string | undefined): id is string => id !== undefined && (owned.has(id) || DEFAULT_OWNED.includes(id));
  const worn: Worn = {};
  const look = slots[`look.${heroClass}` as Slot];
  if (has(look)) worn.l = look;
  for (const [field, slot] of FIELDS) {
    const id = slots[slot];
    if (!has(id) || (field === 'f' && id === CLASSIC)) continue;
    worn[field] = id;
  }
  if (armor !== undefined && Number.isInteger(armor) && armor >= 0 && armor <= ARMOR_TIERS) worn.a = armor;
  // The weapon in the hand at the end of the run: the final world's, and only a kind the game has a picture of.
  if (isHeldWeapon(weapon)) worn.wp = weapon;
  // The step of the league (a player's record, league-flow.ts), never a device's word.
  if (league !== undefined && LEAGUE_KEYS.includes(league)) worn.lg = league;
  return Object.keys(worn).length > 0 ? worn : undefined;
}

/** The rows of a hero's sheet: 0 no armour, 1 cloth, 2 leather, 3 mail, 4 scale, 5 plate, 6 the class armour. */
export const ARMOR_TIERS = 6;

/** The armour a hero wears, as the row of the hero's sheet: from the (verified) world's hero, never from a device. */
export function armorTierOf(hero: Pick<Hero, 'armor'>): number {
  return Math.max(0, Math.min(ARMOR_TIERS, (hero.armor ? itemDef(hero.armor.kind) : { tier: 0 }).tier ?? 0));
}

/** The kinds of weapon that can be in a hand and drawn there (design part 9): melee weapons and the thrown ones a hero may hold. */
export const WEAPON_KINDS: ReadonlySet<string> = new Set(Object.keys(ITEMS).filter((kind) => kind.startsWith('weapon.') || kind.startsWith('missile.')));

/** Whether a value is a known weapon kind (anything else, a device's or an old build's word, is dropped). */
export const isHeldWeapon = (kind: unknown): kind is string => typeof kind === 'string' && WEAPON_KINDS.has(kind);

/** The weapon a hero holds, as an item kind: from the (verified) final world's hero, never from a device. Bare hands (or a disarmed hero): undefined. */
export function weaponKindOf(hero: Pick<Hero, 'weapon'>): string | undefined {
  return hero.weapon && isHeldWeapon(hero.weapon.kind) ? hero.weapon.kind : undefined;
}

/** The snapshot for each class a player may have played: what a patch of the open boards carries (the board picks by the entry's class). */
export function wornByClass(shop: ShopState, league?: string): Record<string, Worn | undefined> {
  return Object.fromEntries(HEROES.map((heroClass) => [heroClass, wornOf(shop, heroClass, undefined, league)]));
}

/** The old per-field entry values (name colour, title, frame) a Worn stands for; kept on entries so a client of before `w` still shows them. */
export function legacyFields(worn: Worn | undefined): Pick<Worn, 'nc' | 'tt' | 'fr'> {
  return { ...(worn?.nc ? { nc: worn.nc } : {}), ...(worn?.tt ? { tt: worn.tt } : {}), ...(worn?.fr ? { fr: worn.fr } : {}) };
}

const WORN_KEYS: ReadonlyArray<Exclude<keyof Worn, 'a' | 'wp'>> = ['l', 'h', 'p', 'f', 'fr', 'tt', 'nc', 'lg'];

/** A Worn as it came between the objects (a patch): only the known fields, as short strings; undefined if none. */
export function cleanWorn(raw: unknown): Worn | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Worn = {};
  for (const key of WORN_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= 48) out[key] = value;
  }
  const armor = (raw as Record<string, unknown>).a;
  if (typeof armor === 'number' && Number.isInteger(armor) && armor >= 0 && armor <= ARMOR_TIERS) out.a = armor;
  const weapon = (raw as Record<string, unknown>).wp;
  if (isHeldWeapon(weapon)) out.wp = weapon;
  return Object.keys(out).length > 0 ? out : undefined;
}
