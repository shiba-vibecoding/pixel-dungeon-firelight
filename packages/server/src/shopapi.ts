import { isPatron } from '@pd/core';
import { CATALOG, DEFAULT_OWNED, earnOnly, type Equipped, type Item, itemById, passSku } from '../../client/src/catalog';
import { levelProgress, PASS_LEVELS, type PassProgress, rewardAt, type Track } from '../../client/src/pass';
import { type BotApi, type BotConfig, createInvoice, deliverGift, type Wallets } from './payments';
import { decorProblem, equipProblem, type GiftNote, onceTaken, ownedItems, shopOf, type WalletView } from './wallet';

/*
 * What the Mini App asks of the shop beyond a first look at the wallet (index.ts routes POST /shop/<route> here, once the player is
 * known by their init data): the catalogue's state (what is owned, worn, waiting as gifts, and the season pass), invoices for any
 * item or bundle, gifts to a friend or behind a share link, wearing things and claiming the pass's rewards. Everything is decided
 * here from the wallet (wallet.ts) and the player's checked runs (the facts), never from what the device says it has.
 */

/** What the player's own object knows that the shop needs: the pass's XP, and the streak and places that earn things. */
export interface Facts {
  pass: PassProgress | null;
  streakBest: number;
  trophies: ReadonlyArray<{ board: string; place: number }>;
  /** The badges the checked runs have won (the titles of the first boss and of the amulet are earned by them). */
  badges?: readonly string[];
  /** What the competitions have given (honours.ts keys: a title of the boards, a season's frame): earned by `by: 'honour'`. */
  honour?: readonly string[];
}

export const noFacts = (): Facts => ({ pass: null, streakBest: 0, trophies: [], badges: [] });

export interface ShopDeps {
  wallets: Wallets;
  api: BotApi;
  config: BotConfig;
  /** The player's facts (their object's), or why they cannot be had. */
  facts(user: number): Promise<Facts>;
  now: number;
  /** The world's season: the pass sold and tracked. */
  season: number;
  /** A fresh share-link code for a giver. */
  code(user: number): string;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

const ok = (body: Record<string, unknown> = {}): Reply => ({ status: 200, body });
const fail = (status: number, error: string): Reply => ({ status, body: { error } });

/** The earn-only items a player's facts have won (a streak, a place on a finished board, a badge). */
export function earnedBy(facts: Facts, catalog: readonly Item[] = CATALOG): string[] {
  const won: string[] = [];
  for (const entry of catalog) {
    const earn = entry.earn;
    if (!earn || earn.by === 'pass') continue;
    if (earn.by === 'streak' && facts.streakBest >= earn.days) won.push(entry.id);
    if (earn.by === 'badge' && (facts.badges ?? []).includes(earn.badge)) won.push(entry.id);
    if (earn.by === 'honour' && (facts.honour ?? []).includes(earn.id)) won.push(entry.id);
    if (earn.by === 'board' && facts.trophies.some((trophy) => trophy.board.startsWith(`${earn.kind}:`) && trophy.place <= earn.place)) won.push(entry.id);
  }
  return won;
}

/** Where a player stands on the season pass. */
export function passState(wallet: WalletView, facts: Facts, season: number): Record<string, unknown> {
  const shop = shopOf(wallet);
  const xp = facts.pass && facts.pass.season === season ? facts.pass.xp : 0;
  const claimed = shop.pass[String(season)] ?? { free: [], paid: [] };
  return { season, xp, ...levelProgress(xp), paid: ownedItems(shop).has(passSku(season)), claimed, levels: PASS_LEVELS };
}

/** The gifts still to claim, newest first. */
export const waitingGifts = (wallet: WalletView): GiftNote[] => shopOf(wallet).inbox.filter((note) => note.claimed === undefined);

/** The shop as the Mini App shows it: what is owned and worn, the gifts waiting, the pass. Earned things are given on the way. */
export async function shopState(deps: ShopDeps, user: number): Promise<Reply> {
  const { wallets, now } = deps;
  let wallet = await wallets.get(user);
  const facts = await deps.facts(user).catch(noFacts);
  const owned = ownedItems(shopOf(wallet));
  // The patronage gives the Patron's title while it lasts (it is granted on a look at the shop, and kept).
  const won = [...earnedBy(facts), ...(isPatron(wallet, now) ? ['title.patron'] : [])].filter((id) => !owned.has(id));
  if (won.length > 0) wallet = await wallets.apply(user, { kind: 'earn', ids: won });
  // A gift paid for whose delivery failed is delivered now.
  for (const [charge, sent] of Object.entries(shopOf(wallet).sent)) {
    if (sent.to !== undefined && !sent.delivered) {
      wallet = (await deliverGift(deps.api, wallets, user, undefined, charge, wallet, deps.config).then(() => wallets.get(user)).catch(() => wallet));
    }
  }
  const shop = shopOf(wallet);
  return ok({
    owned: wallet.owned, patronUntil: wallet.patronUntil ?? null, patron: isPatron(wallet, now), tipped: wallet.tipped ?? 0,
    items: [...DEFAULT_OWNED, ...ownedItems(shop)], equipped: shop.equipped, gifts: waitingGifts(wallet), pass: passState(wallet, facts, deps.season),
    // The once-only offers this account has bought (the starter kit), so the shop can hide them.
    taken: [...onceTaken(wallet)],
  });
}

/** Wears an item in its slot (id null takes the slot's off), or sets the decorations; only what the player owns. */
export async function equip(deps: ShopDeps, user: number, body: Record<string, unknown>): Promise<Reply> {
  const wallet = await deps.wallets.get(user);
  const owned = ownedItems(shopOf(wallet));
  let after: WalletView;
  if (Array.isArray(body.decor)) {
    const ids = body.decor.filter((id): id is string => typeof id === 'string');
    if (ids.length !== body.decor.length) return fail(400, 'bad decorations');
    const problem = decorProblem(owned, ids);
    if (problem) return fail(problem === 'not owned' ? 403 : 400, problem);
    after = await deps.wallets.apply(user, { kind: 'decor', ids });
  } else {
    const slot = typeof body.slot === 'string' ? body.slot : '';
    const id = typeof body.id === 'string' ? body.id : body.id === null ? null : undefined;
    if (!slot || id === undefined) return fail(400, 'bad equip');
    const problem = equipProblem(owned, slot, id);
    if (problem) return fail(problem === 'not owned' ? 403 : 400, problem);
    after = await deps.wallets.apply(user, { kind: 'equip', slot, id });
  }
  return ok({ equipped: shopOf(after).equipped satisfies Equipped, items: [...ownedItems(shopOf(after))] });
}

/** An invoice for an item, a bundle or the season pass (or the first shop's offers) for the player themselves. */
export async function invoice(deps: ShopDeps, user: number, sku: string, language?: string): Promise<Reply> {
  const owned = ownedItems(shopOf(await deps.wallets.get(user)));
  const result = await createInvoice(deps.api, user, sku, language, deps.now, { owned, season: deps.season, took: onceTaken(await deps.wallets.get(user)) });
  return 'link' in result ? ok(result) : fail(result.error === 'already owned' ? 409 : 400, result.error);
}

/**
 * An invoice for a gift: to a friend by Telegram id, or behind a share link (`link: true`: the reply carries the link's code, which
 * the bot sends on once it is paid). The friend gets it in their mail when the payment goes through (payments.ts).
 */
export async function giftInvoice(deps: ShopDeps, user: number, body: Record<string, unknown>, language?: string): Promise<Reply> {
  const sku = typeof body.sku === 'string' ? body.sku : '';
  const entry = itemById(sku);
  if (!entry || earnOnly(entry) || entry.category === 'pass' || entry.once) return fail(400, 'cannot be a gift');
  if (body.link === true) {
    const code = deps.code(user);
    const result = await createInvoice(deps.api, user, sku, language, deps.now, { gift: { link: code }, season: deps.season });
    return 'link' in result ? ok({ ...result, code }) : fail(400, result.error);
  }
  const to = typeof body.to === 'number' ? body.to : typeof body.to === 'string' && /^\d{1,15}$/.test(body.to) ? Number(body.to) : NaN;
  if (!Number.isInteger(to) || to <= 0) return fail(400, 'bad friend');
  if (to === user) return fail(400, 'cannot be a gift');
  const owned = ownedItems(shopOf(await deps.wallets.get(to)));
  const result = await createInvoice(deps.api, user, sku, language, deps.now, { gift: { to }, owned, season: deps.season });
  return 'link' in result ? ok(result) : fail(result.error === 'already owned' ? 409 : 400, result.error);
}

/** Opens a share link: its gift comes to this player's mail, if nobody else opened it first. */
export async function acceptGift(deps: ShopDeps, user: number, code: string): Promise<Reply> {
  const match = /^(\d{1,15})_[0-9a-f]{8,32}$/.exec(code);
  if (!match) return fail(400, 'bad link');
  const giver = Number(match[1]);
  if (giver === user) return fail(400, 'your own gift');
  const link = shopOf(await deps.wallets.get(giver)).links[code];
  if (!link) return fail(404, 'no such gift');
  if (link.by !== undefined && link.by !== user) return fail(409, 'taken');
  // The first to be recorded keeps it: read again after taking, in case two opened it together.
  const after = await deps.wallets.apply(giver, { kind: 'takeLink', code, by: user });
  if (shopOf(after).links[code]?.by !== user) return fail(409, 'taken');
  await deps.wallets.apply(user, { kind: 'gift', id: `l-${code}`, sku: link.sku, from: giver, at: link.at });
  return ok({ sku: link.sku });
}

/** Claims the pass's rewards on a track, every level reached whose reward is not claimed yet. */
export async function claimPass(deps: ShopDeps, user: number, track: Track): Promise<Reply> {
  const facts = await deps.facts(user).catch(noFacts);
  const xp = facts.pass && facts.pass.season === deps.season ? facts.pass.xp : 0;
  const reached = levelProgress(xp).level;
  const wallet = await deps.wallets.get(user);
  const shop = shopOf(wallet);
  if (track === 'paid' && !ownedItems(shop).has(passSku(deps.season))) return fail(403, 'the paid track is not bought');
  const claimed = shop.pass[String(deps.season)]?.[track] ?? [];
  const levels = Array.from({ length: reached }, (_, i) => i + 1).filter((level) => rewardAt(track, level) !== null && !claimed.includes(level));
  if (levels.length === 0) return ok({ claimed: [], pass: passState(wallet, facts, deps.season), items: [...ownedItems(shop)] });
  const after = await deps.wallets.apply(user, { kind: 'passClaim', season: deps.season, track, levels, reached });
  return ok({ claimed: levels, pass: passState(after, facts, deps.season), items: [...ownedItems(shopOf(after))] });
}

/* ---- The gifts in the mail ---- */

/** A gift as a letter of the mailbox (the client's Letter, mailui.ts). */
export interface GiftLetter {
  id: string;
  kind: 'gift';
  board: '';
  place: 0;
  at: number;
  gifts: Array<{ type: 'item'; sku: string; from: number; name?: string }>;
  read?: boolean;
  claimed?: number;
}

/** How long a claimed gift stays in the mail (ms). */
const CLAIMED_KEPT_MS = 30 * 86_400_000;

export function giftLetters(wallet: WalletView, now: number): GiftLetter[] {
  return shopOf(wallet).inbox
    .filter((note) => note.claimed === undefined || note.claimed + CLAIMED_KEPT_MS > now)
    .map((note) => ({
      id: `gift:${note.id}`, kind: 'gift' as const, board: '' as const, place: 0 as const, at: note.at,
      gifts: [{ type: 'item' as const, sku: note.sku, from: note.from, ...(note.name ? { name: note.name } : {}) }],
      ...(note.claimed !== undefined ? { claimed: note.claimed, read: true } : {}),
    }));
}

/** Claims a gift (or, with no id, all that wait) from the mail. */
export async function claimGifts(wallets: Wallets, user: number, id: string | null, now: number): Promise<WalletView> {
  let wallet = await wallets.get(user);
  const ids = id !== null ? [id] : waitingGifts(wallet).map((note) => note.id);
  for (const gift of ids) wallet = await wallets.apply(user, { kind: 'claimGift', id: gift, at: now });
  return wallet;
}
