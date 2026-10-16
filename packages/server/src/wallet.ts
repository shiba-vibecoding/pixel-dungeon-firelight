import { emptyWallet, type Wallet, walletPay, walletRefund } from '@pd/core';
import {
  canonical, cleanEquipped, DECOR_MAX, DEFAULT_OWNED, type Equipped, earnOnly, emptyEquipped, grantedBy, isPassSku, itemById, passSeason, passSku, type Slot, slotOf,
} from '../../client/src/catalog';
import { PASS_LEVELS, rewardAt, type Track } from '../../client/src/pass';

/*
 * A change to a player's Pixel-Mart wallet, as the wallet's own Durable Object applies it (WalletStore, index.ts). The object reads
 * the wallet, applies the change and writes it back within one request, with nothing but storage calls in between, so two payments
 * arriving together can never overwrite each other. Each change names its Telegram charge, so a payment delivered twice counts
 * once, and a refunded charge is remembered: a payment Telegram sends again after its refund does not come back.
 *
 * Besides the core's wallet (the first shop's looks, the patronage, the charges) the object keeps the catalogue's state (ShopState):
 * what is owned, as GRANTS by their source (a charge, a gift, a pass level, an earned item), so a refund takes back exactly what its
 * charge gave and nothing another source also gives; what is worn (equipped, only ever owned things); gifts bought and gifts
 * waiting; and the pass levels claimed. All of it is kept through a season's wipe: nothing in it is game progress.
 */

/** A gift waiting in the recipient's mail. */
export interface GiftNote {
  /** The charge of the payment that bought it, or `l-<code>` for a gift link. */
  id: string;
  /** What it is: an item or a bundle. */
  sku: string;
  /** Who gave it (Telegram id) and the name they go by. */
  from: number;
  name?: string;
  at: number;
  /** When it was claimed from the mail. */
  claimed?: number;
}

/** A gift this player paid for. */
export interface SentGift {
  sku: string;
  /** Delivered to a friend by id, or waiting behind a share link. */
  to?: number;
  link?: string;
  at: number;
  /** The friend's mail has it (by id); a link's gift is delivered when someone opens it. */
  delivered: boolean;
}

export interface ShopState {
  /** What each source grants: `charge:<id>`, `gift:<id>`, `pass:s<season>:<track>:<level>`, `earn:<item>`. */
  grants: Record<string, string[]>;
  equipped: Equipped;
  /** Gifts for this player, newest first. */
  inbox: GiftNote[];
  /** Gifts this player bought, by charge. */
  sent: Record<string, SentGift>;
  /** Share links this player bought, by code: who opened it. */
  links: Record<string, { sku: string; charge: string; at: number; by?: number }>;
  /** Pass levels claimed, by season. */
  pass: Record<string, { free: number[]; paid: number[] }>;
}

export const emptyShop = (): ShopState => ({ grants: {}, equipped: emptyEquipped(), inbox: [], sent: {}, links: {}, pass: {} });

/** The wallet as served: the core's and the catalogue's. */
export type WalletView = Wallet & { shop?: ShopState };

export const shopOf = (wallet: WalletView): ShopState => wallet.shop ?? emptyShop();

export type GiftTarget = { to: number } | { link: string };

export type WalletChange =
  | { kind: 'pay'; sku: string; charge: string; stars: number; at: number; expiresAt?: number; gift?: GiftTarget }
  | { kind: 'refund'; charge: string }
  /** A gift lands in this player's mail (the giver's wallet is not touched). */
  | { kind: 'gift'; id: string; sku: string; from: number; name?: string; at: number }
  /** The giver's wallet: the gift reached the friend's mail. */
  | { kind: 'delivered'; charge: string }
  | { kind: 'claimGift'; id: string; at: number }
  /** A refunded gift is taken back from the friend, claimed or not. */
  | { kind: 'revokeGift'; id: string }
  /** The giver's wallet: a share link was opened by this player (the first to open it keeps it). */
  | { kind: 'takeLink'; code: string; by: number }
  /** Earn-only items won by a streak or a place on a board. */
  | { kind: 'earn'; ids: string[] }
  /** Pass rewards for these levels of a track, `reached` being the level the XP stands at. */
  | { kind: 'passClaim'; season: number; track: Track; levels: number[]; reached: number }
  | { kind: 'equip'; slot: string; id: string | null }
  | { kind: 'decor'; ids: string[] };

/** A wallet as stored, with the charges refunded so far. */
export interface WalletRecord {
  wallet: Wallet;
  refunded: string[];
  shop?: ShopState;
}

/** How many refunded charges are remembered; refunds are rare, and a payment is redelivered within days. */
export const REFUNDS_KEPT = 500;
/** How many gifts the mail keeps at once. */
export const INBOX_MAX = 60;

/** Every item the shop state grants (what every player has, the classic campfire, is not a grant: see mayWear). */
export function ownedItems(shop: ShopState): Set<string> {
  const owned = new Set<string>();
  // A grant of the first catalogue's placeholder counts as the item it became (catalog.ts LEGACY); storage keeps the old id.
  for (const items of Object.values(shop.grants)) for (const id of items) owned.add(canonical(id));
  return owned;
}

/**
 * The once-only offers (the starter kit, whatever the class) this wallet has bought: by its charges, so a refund frees the offer again.
 * Gifts are never once-only offers.
 */
export function onceTaken(wallet: Wallet): Set<string> {
  const taken = new Set<string>();
  for (const paid of Object.values(wallet.charges)) {
    const once = itemById(paid.sku)?.once;
    if (once) taken.add(once);
  }
  return taken;
}

/** Why an equip is refused, or null: the slot is known, the item fits it and is owned. */
export function equipProblem(owned: ReadonlySet<string>, slot: string, id: string | null): string | null {
  if (id === null) return null;
  const entry = itemById(id);
  if (!entry) return 'unknown item';
  if (slotOf(entry) !== slot) return 'does not fit the slot';
  if (!owned.has(id) && !DEFAULT_OWNED.includes(id)) return 'not owned';
  return null;
}

/** The decorations set, refused if too many, not decorations or not owned. */
export function decorProblem(owned: ReadonlySet<string>, ids: readonly string[]): string | null {
  if (ids.length > DECOR_MAX) return 'too many decorations';
  if (new Set(ids).size !== ids.length) return 'a decoration twice';
  for (const id of ids) {
    const entry = itemById(id);
    if (entry?.category !== 'decor') return 'not a decoration';
    if (!owned.has(id)) return 'not owned';
  }
  return null;
}

/** Takes off what is no longer owned. */
function pruneEquipped(shop: ShopState): void {
  const owned = ownedItems(shop);
  const slots: Equipped['slots'] = {};
  for (const [slot, id] of Object.entries(shop.equipped.slots)) if (id && (owned.has(id) || DEFAULT_OWNED.includes(id))) slots[slot as Slot] = id;
  shop.equipped = { slots, decor: shop.equipped.decor.filter((id) => owned.has(id)) };
}

const clone = (shop: ShopState | undefined): ShopState => {
  const base = shop ?? emptyShop();
  return {
    grants: { ...base.grants },
    equipped: cleanEquipped(base.equipped),
    inbox: base.inbox.map((note) => ({ ...note })),
    sent: { ...base.sent },
    links: { ...base.links },
    pass: Object.fromEntries(Object.entries(base.pass).map(([season, claimed]) => [season, { free: [...claimed.free], paid: [...claimed.paid] }])),
  };
};

const sourceOfPassLevel = (season: number, track: Track, level: number): string => `pass:s${season}:${track}:${level}`;

export function applyWalletChange(record: WalletRecord, change: WalletChange): WalletRecord {
  switch (change.kind) {
    case 'pay':
      if (record.refunded.includes(change.charge)) return record;
      if (itemById(canonical(change.sku))) return payItem(record, change);
      return { ...record, wallet: walletPay(record.wallet, change.sku, change.charge, change.stars, change.at, change.expiresAt) };
    case 'refund': {
      const paid = record.wallet.charges[change.charge];
      const wallet = walletRefund(record.wallet, change.charge);
      const refunded = record.refunded.includes(change.charge) ? record.refunded : [...record.refunded, change.charge].slice(-REFUNDS_KEPT);
      let shop = record.shop;
      if (shop) {
        shop = clone(shop);
        delete shop.grants[`charge:${change.charge}`];
        delete shop.sent[change.charge];
        for (const [code, link] of Object.entries(shop.links)) if (link.charge === change.charge) delete shop.links[code];
        // The paid track of a pass given back takes its rewards with it.
        if (paid && isPassSku(paid.sku)) {
          const prefix = `pass:s${passSeason(paid.sku)}:paid:`;
          for (const source of Object.keys(shop.grants)) if (source.startsWith(prefix)) delete shop.grants[source];
        }
        pruneEquipped(shop);
      }
      return { wallet, refunded, ...(shop ? { shop } : {}) };
    }
    default:
      return { ...record, shop: applyShopChange(clone(record.shop), change) };
  }
}

/** A purchase of a catalogue item: it, or the parts of a bundle, are granted by the charge; a gift is granted to the friend instead. */
function payItem(record: WalletRecord, change: Extract<WalletChange, { kind: 'pay' }>): WalletRecord {
  if (record.wallet.charges[change.charge]) return record;
  // A once-only offer paid for twice at once (two checkouts open together) is granted once: the second charge is kept for a refund.
  const again = !change.gift && itemById(change.sku)?.once !== undefined && onceTaken(record.wallet).has(itemById(change.sku)!.once!);
  const wallet: Wallet = { ...record.wallet, charges: { ...record.wallet.charges, [change.charge]: { sku: change.sku, stars: change.stars, at: change.at } } };
  const shop = clone(record.shop);
  if (again) return { ...record, wallet, shop };
  if (change.gift) {
    shop.sent[change.charge] = {
      sku: change.sku, at: change.at, delivered: 'link' in change.gift,
      ...('to' in change.gift ? { to: change.gift.to } : { link: change.gift.link }),
    };
    if ('link' in change.gift) shop.links[change.gift.link] = { sku: change.sku, charge: change.charge, at: change.at };
  } else {
    shop.grants[`charge:${change.charge}`] = grantedBy(change.sku);
  }
  return { ...record, wallet, shop };
}

function applyShopChange(shop: ShopState, change: Exclude<WalletChange, { kind: 'pay' | 'refund' }>): ShopState {
  switch (change.kind) {
    case 'gift':
      if (shop.inbox.some((note) => note.id === change.id) || !itemById(canonical(change.sku))) return shop;
      shop.inbox = [{ id: change.id, sku: change.sku, from: change.from, at: change.at, ...(change.name ? { name: change.name.slice(0, 32) } : {}) }, ...shop.inbox].slice(0, INBOX_MAX);
      return shop;
    case 'delivered':
      if (shop.sent[change.charge]) shop.sent[change.charge] = { ...shop.sent[change.charge]!, delivered: true };
      return shop;
    case 'claimGift': {
      const note = shop.inbox.find((candidate) => candidate.id === change.id);
      if (!note || note.claimed !== undefined) return shop;
      note.claimed = change.at;
      shop.grants[`gift:${note.id}`] = grantedBy(note.sku);
      return shop;
    }
    case 'revokeGift':
      shop.inbox = shop.inbox.filter((note) => note.id !== change.id);
      delete shop.grants[`gift:${change.id}`];
      pruneEquipped(shop);
      return shop;
    case 'takeLink': {
      const link = shop.links[change.code];
      if (link && link.by === undefined) shop.links[change.code] = { ...link, by: change.by };
      return shop;
    }
    case 'earn':
      for (const id of change.ids) {
        const entry = itemById(id);
        if (entry && earnOnly(entry) && entry.earn!.by !== 'pass') shop.grants[`earn:${id}`] = [id];
      }
      return shop;
    case 'passClaim': {
      const claimed = (shop.pass[String(change.season)] ??= { free: [], paid: [] });
      const mayPaid = ownedItems(shop).has(passSku(change.season));
      if (change.track === 'paid' && !mayPaid) return shop;
      for (const level of change.levels) {
        const reward = Number.isInteger(level) && level >= 1 && level <= Math.min(PASS_LEVELS, change.reached) ? rewardAt(change.track, level) : null;
        if (!reward || claimed[change.track].includes(level)) continue;
        claimed[change.track].push(level);
        shop.grants[sourceOfPassLevel(change.season, change.track, level)] = [reward];
      }
      return shop;
    }
    case 'equip': {
      const owned = ownedItems(shop);
      if (equipProblem(owned, change.slot, change.id) !== null) return shop;
      const slots = { ...shop.equipped.slots };
      if (change.id === null) delete slots[change.slot as Slot];
      else slots[change.slot as Slot] = change.id;
      shop.equipped = { ...shop.equipped, slots };
      return shop;
    }
    case 'decor':
      if (decorProblem(ownedItems(shop), change.ids) === null) shop.equipped = { ...shop.equipped, decor: [...change.ids] };
      return shop;
  }
}

/** A change as it came over HTTP, checked, or null. */
export function parseWalletChange(raw: unknown): WalletChange | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  const str = (value: unknown, max = 128): string | null => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : null);
  const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const int = (value: unknown): number | null => (Number.isInteger(value) ? (value as number) : null);
  switch (c.kind) {
    case 'refund': {
      const charge = str(c.charge);
      return charge ? { kind: 'refund', charge } : null;
    }
    case 'pay': {
      const charge = str(c.charge);
      const sku = str(c.sku);
      const stars = num(c.stars);
      const at = num(c.at);
      if (!charge || !sku || stars === null || at === null) return null;
      const g = c.gift as Record<string, unknown> | undefined;
      const gift: GiftTarget | undefined = g && int(g.to) !== null ? { to: g.to as number } : g && str(g.link) ? { link: g.link as string } : undefined;
      return {
        kind: 'pay', sku, charge, stars, at, ...(num(c.expiresAt) !== null ? { expiresAt: c.expiresAt as number } : {}), ...(gift ? { gift } : {}),
      };
    }
    case 'gift': {
      const id = str(c.id);
      const sku = str(c.sku);
      const from = int(c.from);
      const at = num(c.at);
      if (!id || !sku || from === null || at === null) return null;
      return { kind: 'gift', id, sku, from, at, ...(typeof c.name === 'string' && c.name ? { name: c.name.slice(0, 32) } : {}) };
    }
    case 'delivered': {
      const charge = str(c.charge);
      return charge ? { kind: 'delivered', charge } : null;
    }
    case 'claimGift': {
      const id = str(c.id);
      const at = num(c.at);
      return id && at !== null ? { kind: 'claimGift', id, at } : null;
    }
    case 'revokeGift': {
      const id = str(c.id);
      return id ? { kind: 'revokeGift', id } : null;
    }
    case 'takeLink': {
      const code = str(c.code);
      const by = int(c.by);
      return code && by !== null ? { kind: 'takeLink', code, by } : null;
    }
    case 'earn':
      return Array.isArray(c.ids) && c.ids.length <= 40 && c.ids.every((id) => typeof id === 'string') ? { kind: 'earn', ids: c.ids as string[] } : null;
    case 'passClaim': {
      const season = int(c.season);
      const reached = int(c.reached);
      if (season === null || reached === null || (c.track !== 'free' && c.track !== 'paid')) return null;
      if (!Array.isArray(c.levels) || c.levels.length > PASS_LEVELS || !c.levels.every((level) => Number.isInteger(level))) return null;
      return { kind: 'passClaim', season, track: c.track, levels: c.levels as number[], reached };
    }
    case 'equip': {
      const slot = str(c.slot);
      return slot && (c.id === null || str(c.id)) ? { kind: 'equip', slot, id: c.id === null ? null : (c.id as string) } : null;
    }
    case 'decor':
      return Array.isArray(c.ids) && c.ids.length <= 16 && c.ids.every((id) => typeof id === 'string') ? { kind: 'decor', ids: c.ids as string[] } : null;
    default:
      return null;
  }
}

export const emptyRecord = (): WalletRecord => ({ wallet: emptyWallet(), refunded: [] });

/** The record as the wallet's object serves it. */
export const walletView = (record: WalletRecord): WalletView => ({ ...record.wallet, shop: record.shop ?? emptyShop() });

/** A wallet's charges, newest first: what support needs to find a payment. */
export function recentCharges(wallet: Wallet, count: number): Array<{ charge: string; sku: string; stars: number; at: number }> {
  return Object.entries(wallet.charges)
    .map(([charge, paid]) => ({ charge, ...paid }))
    .sort((a, b) => b.at - a.at)
    .slice(0, count);
}
