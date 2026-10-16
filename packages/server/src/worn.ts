import { cleanEquipped, DEFAULT_OWNED, HEROES, type Slot } from '../../client/src/catalog';
import type { Worn } from './leaderboard';
import { ownedItems, type ShopState } from './wallet';

/*
 * What a board row shows of a player's hero (the hero card, client herocard.ts): the look of the class played, the hat, the pet, the
 * camp fire, the profile frame, the title and the name colour, by catalogue item id. It is built HERE, from the player's wallet, and
 * from nothing a device says: only what the wallet owns AND has put on, in the slot each item fits (the same discipline as `equip`,
 * wallet.ts), so a board can never show something the player does not have. Looks only, like everything in Pixel-Mart.
 */

/** The wallet's slot of each field of a Worn (the look is `look.<class>`). */
const FIELDS: ReadonlyArray<readonly [field: Exclude<keyof Worn, 'l'>, slot: Slot]> = [
  ['h', 'hat'], ['p', 'pet'], ['f', 'campfire'], ['fr', 'frame'], ['tt', 'title'], ['nc', 'namecolor'],
];

/** The classic fire is what everyone has: a card says it by saying nothing. */
const CLASSIC = 'fire.classic';

/** What a player's hero of `heroClass` wears on a board: only owned things in their own slots; undefined if nothing is worn. */
export function wornOf(shop: ShopState, heroClass: string): Worn | undefined {
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
  return Object.keys(worn).length > 0 ? worn : undefined;
}

/** The snapshot for each class a player may have played: what a patch of the open boards carries (the board picks by the entry's class). */
export function wornByClass(shop: ShopState): Record<string, Worn | undefined> {
  return Object.fromEntries(HEROES.map((heroClass) => [heroClass, wornOf(shop, heroClass)]));
}

/** The old per-field entry values (name colour, title, frame) a Worn stands for; kept on entries so a client of before `w` still shows them. */
export function legacyFields(worn: Worn | undefined): Pick<Worn, 'nc' | 'tt' | 'fr'> {
  return { ...(worn?.nc ? { nc: worn.nc } : {}), ...(worn?.tt ? { tt: worn.tt } : {}), ...(worn?.fr ? { fr: worn.fr } : {}) };
}

const WORN_KEYS: ReadonlyArray<keyof Worn> = ['l', 'h', 'p', 'f', 'fr', 'tt', 'nc'];

/** A Worn as it came between the objects (a patch): only the known fields, as short strings; undefined if none. */
export function cleanWorn(raw: unknown): Worn | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const out: Worn = {};
  for (const key of WORN_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= 48) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
