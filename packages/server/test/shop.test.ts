import { describe, expect, it } from 'vitest';
import { act, fingerprint } from '@pd/core';
import {
  bundleValue, CATALOG, DECOR_MAX, HEROES, itemById, LEGENDARY_MIN, passSku, PRICE_RANGE, validateCatalog,
} from '../../client/src/catalog';
import { awardRun, DAY_XP_CAP, levelProgress, PASS_LEVELS, passLevel, REWARDS, RUN_XP_CAP, runXp, validatePass, xpToReach } from '../../client/src/pass';
import { SEASON } from '../src/boards';
import { type BotApi, type BotConfig, checkoutValid, createInvoice, handleUpdate, type Payload, type Wallets } from '../src/payments';
import { emptyProfile, ME, PlayerLogic } from '../src/runs';
import {
  acceptGift, claimGifts, claimPass, earnedBy, equip, type Facts, giftInvoice, giftLetters, invoice, noFacts, type ShopDeps, shopState,
} from '../src/shopapi';
import { applyWalletChange, emptyRecord, ownedItems, shopOf, type WalletRecord, walletView, type WalletView } from '../src/wallet';

const NOW = Date.UTC(2026, 9, 16);

function fakeApi(fail: string[] = []): { api: BotApi; calls: Array<{ method: string; params: Record<string, unknown> }> } {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const api: BotApi = async (method, params) => {
    calls.push({ method, params });
    if (fail.includes(method)) throw new Error(`${method}: Bad Request`);
    return method === 'createInvoiceLink' ? 'https://t.me/$invoice' : true;
  };
  return { api, calls };
}

/** Wallets in memory, applying changes as the WalletStore object does. */
function memoryWallets(): Wallets & { records: Map<number, WalletRecord> } {
  const records = new Map<number, WalletRecord>();
  return {
    records,
    async get(user): Promise<WalletView> {
      return walletView(records.get(user) ?? emptyRecord());
    },
    async apply(user, change): Promise<WalletView> {
      const next = applyWalletChange(records.get(user) ?? emptyRecord(), change);
      records.set(user, next);
      return walletView(next);
    },
  };
}

const config: BotConfig = { appLink: 'https://t.me/bot/app' };
const private_ = (user: number, name = 'Ann') => ({ chat: { id: user, type: 'private' }, from: { id: user, first_name: name, language_code: 'en' } });
const payment = (user: number, payload: Payload, charge: string, amount: number) => ({
  message: { ...private_(user), successful_payment: { currency: 'XTR', total_amount: amount, invoice_payload: JSON.stringify(payload), telegram_payment_charge_id: charge } },
});
const refund = (user: number, payload: Payload, charge: string) => ({
  message: { ...private_(user), refunded_payment: { invoice_payload: JSON.stringify(payload), telegram_payment_charge_id: charge } },
});

interface Setup {
  wallets: ReturnType<typeof memoryWallets>;
  calls: ReturnType<typeof fakeApi>['calls'];
  deps: ShopDeps;
  facts: Record<number, Facts>;
  pay(user: number, sku: string, charge: string, extra?: Partial<Payload>): Promise<void>;
  refund(user: number, sku: string, charge: string, extra?: Partial<Payload>): Promise<void>;
}

function setup(): Setup {
  const wallets = memoryWallets();
  const { api, calls } = fakeApi();
  const facts: Record<number, Facts> = {};
  let n = 0;
  const deps: ShopDeps = {
    wallets, api, config, now: NOW, season: SEASON, facts: async (user) => facts[user] ?? noFacts(), code: (user) => `${user}_${String(++n).padStart(8, '0')}`,
  };
  const price = (sku: string): number => itemById(sku)!.stars;
  return {
    wallets, calls, deps, facts,
    pay: (user, sku, charge, extra = {}) => handleUpdate(payment(user, { u: user, s: sku, ...extra }, charge, price(sku)), api, wallets, config, NOW),
    refund: (user, sku, charge, extra = {}) => handleUpdate(refund(user, { u: user, s: sku, ...extra }, charge), api, wallets, config, NOW),
  };
}

describe('the catalogue', () => {
  it('is valid data', () => {
    expect(validateCatalog()).toEqual([]);
    expect(validatePass()).toEqual([]);
  });

  it('has hero looks for every class, each with a legendary one', () => {
    for (const heroClass of HEROES) {
      const looks = CATALOG.filter((entry) => entry.category === 'look' && entry.heroClass === heroClass && !entry.earn);
      expect(looks.length).toBeGreaterThanOrEqual(3);
      expect(looks.filter((entry) => entry.legendary).map((entry) => entry.stars)).toEqual([500]);
    }
  });

  it('prices: small things 25–50, looks 100–250, legendary 500 and up, bundles below their parts, earn-only free', () => {
    for (const entry of CATALOG) {
      if (entry.earn) expect(entry.stars, entry.id).toBe(0);
      else if (entry.category === 'bundle') expect(entry.stars, entry.id).toBeLessThan(bundleValue(entry));
      else if (entry.rarity === 'legendary') expect(entry.stars, entry.id).toBeGreaterThanOrEqual(LEGENDARY_MIN);
      else {
        const [min, max] = PRICE_RANGE[entry.category]!;
        expect(entry.stars, entry.id).toBeGreaterThanOrEqual(min);
        expect(entry.stars, entry.id).toBeLessThanOrEqual(max);
      }
    }
    expect(PRICE_RANGE.hat).toEqual([25, 50]);
    expect(PRICE_RANGE.look).toEqual([100, 250]);
  });

  it('catches a bad catalogue: duplicates, a bundle that is no bargain, a nested bundle, an unnamed item', () => {
    const rat = itemById('pet.rat')!;
    const bad = [
      ...CATALOG, rat,
      { ...itemById('bundle.starter')!, id: 'bundle.dear', stars: 999 },
      { ...itemById('bundle.starter')!, id: 'bundle.nest', items: ['bundle.starter', 'hat.cap'] },
      { ...itemById('hat.cap')!, id: 'hat.nameless', name: { ru: '', en: 'x' } },
      { ...itemById('hat.cap')!, id: 'hat.cheap', stars: 5 },
      { ...itemById('hat.halo')!, id: 'hat.fake', stars: 100 },
    ];
    const problems = validateCatalog(bad).join('\n');
    expect(problems).toMatch(/pet\.rat: duplicate id/);
    expect(problems).toMatch(/bundle\.dear: a bundle must cost less/);
    expect(problems).toMatch(/bundle\.nest: nested bundle/);
    expect(problems).toMatch(/hat\.nameless: missing name/);
    expect(problems).toMatch(/hat\.cheap: price 5 outside 25–50/);
    expect(problems).toMatch(/hat\.fake: legendary below 500/);
  });

  it('earn-only items by a streak or a place on a board are won by the facts', () => {
    expect(earnedBy(noFacts())).toEqual([]);
    expect(earnedBy({ ...noFacts(), streakBest: 7 })).toEqual(['title.undying']);
    expect(earnedBy({ ...noFacts(), streakBest: 30 })).toEqual(['title.undying', 'trail.streak_flame', 'pframe.laurel']);
    expect(earnedBy({ ...noFacts(), trophies: [{ board: 'daily:2026-10-01', place: 2 }] })).toEqual(['pframe.cup']);
    expect(earnedBy({ ...noFacts(), trophies: [{ board: 'week:2026-W40', place: 1 }] })).toEqual(['title.champion', 'namecolor.champion']);
    // A daily 5th place is no cup; a weekly 5th no champion.
    expect(earnedBy({ ...noFacts(), trophies: [{ board: 'daily:2026-10-01', place: 5 }, { board: 'week:2026-W40', place: 5 }] })).toEqual([]);
  });
});

describe('purchases', () => {
  it('makes an invoice for a single item at its price, worded in the buyer’s language, and for a bundle', async () => {
    const { api, calls } = fakeApi();
    expect(await createInvoice(api, 7, 'hat.wizard', 'ru', NOW)).toEqual({ link: 'https://t.me/$invoice' });
    expect(calls[0]!.params).toMatchObject({ currency: 'XTR', prices: [{ amount: 50 }], payload: JSON.stringify({ u: 7, s: 'hat.wizard' }), title: 'Колдовской колпак' });
    await createInvoice(api, 7, 'bundle.starter', 'en', NOW);
    expect(calls[1]!.params).toMatchObject({ prices: [{ amount: 99 }], title: 'Starter set' });
    expect(String(calls[1]!.params.description)).toMatch(/Includes: Cap, Blue fire, Ember trail, Gold name/);
    expect(calls[1]!.params.subscription_period).toBeUndefined();
    for (const entry of CATALOG.filter((candidate) => !candidate.earn)) {
      await createInvoice(api, 7, entry.id, 'ru', NOW);
      await createInvoice(api, 7, entry.id, 'en', NOW);
    }
    for (const call of calls) {
      expect(String(call.params.title).length).toBeLessThanOrEqual(32);
      expect(String(call.params.description).length).toBeLessThanOrEqual(255);
    }
  });

  it('does not sell what is only earned, what is unknown, the pass of another season, or what the buyer has', async () => {
    const { api } = fakeApi();
    expect(await createInvoice(api, 7, 'title.undying', 'en', NOW)).toEqual({ error: 'not for sale' });
    expect(await createInvoice(api, 7, 'hat.nonsense', 'en', NOW)).toEqual({ error: 'not for sale' });
    expect(await createInvoice(api, 7, passSku(SEASON - 1), 'en', NOW)).toEqual({ error: 'out of season' });
    expect(await createInvoice(api, 7, passSku(SEASON), 'en', NOW)).toHaveProperty('link');
    expect(await createInvoice(api, 7, 'hat.cap', 'en', NOW, { owned: new Set(['hat.cap']) })).toEqual({ error: 'already owned' });
    // A bundle with one part missing is still for sale; with all of them, not.
    const parts = itemById('bundle.starter')!.items!;
    expect(await createInvoice(api, 7, 'bundle.starter', 'en', NOW, { owned: new Set(parts.slice(1)) })).toHaveProperty('link');
    expect(await createInvoice(api, 7, 'bundle.starter', 'en', NOW, { owned: new Set(parts) })).toEqual({ error: 'already owned' });
  });

  it('confirms a checkout only at the catalogue price, in Stars, for the buyer', () => {
    const checkout = (from: number, amount: number, sku = 'hat.wizard', currency = 'XTR', extra: Partial<Payload> = {}) => checkoutValid(
      { id: 'q', from: { id: from }, currency, total_amount: amount, invoice_payload: JSON.stringify({ u: 7, s: sku, ...extra }) }, NOW,
    );
    expect(checkout(7, 50)).toBe(true);
    expect(checkout(7, 49)).toBe(false);
    expect(checkout(8, 50)).toBe(false);
    expect(checkout(7, 50, 'hat.wizard', 'USD')).toBe(false);
    expect(checkout(7, 99, 'bundle.starter')).toBe(true);
    expect(checkout(7, 0, 'title.undying')).toBe(false);
    expect(checkout(7, 299, passSku(SEASON))).toBe(true);
    expect(checkout(7, 299, passSku(SEASON + 1))).toBe(false);
    // A gift of the catalogue, but not of the first shop's offers, and not to oneself.
    expect(checkout(7, 50, 'hat.wizard', 'XTR', { g: 8 })).toBe(true);
    expect(checkout(7, 75, 'skin.mage.royal', 'XTR', { g: 8 })).toBe(false);
    expect(checkout(7, 50, 'hat.wizard', 'XTR', { g: 7 })).toBe(false);
    expect(checkout(7, 50, 'hat.wizard', 'XTR', { l: '8_00000001' })).toBe(false);
  });

  it('a single item lands in the wallet once, however often Telegram says so', async () => {
    const s = setup();
    await s.pay(7, 'hat.wizard', 'c1');
    await s.pay(7, 'hat.wizard', 'c1');
    expect([...ownedItems(shopOf(await s.wallets.get(7)))]).toEqual(['hat.wizard']);
    expect((await s.wallets.get(7)).charges.c1).toMatchObject({ sku: 'hat.wizard', stars: 50 });
    expect(s.calls.at(-1)).toMatchObject({ method: 'sendMessage', params: { chat_id: 7 } });
  });

  it('a bundle grants all its items, and a refund takes back exactly them', async () => {
    const s = setup();
    await s.pay(7, 'hat.cap', 'c0');
    await s.pay(7, 'bundle.starter', 'c1');
    expect([...ownedItems(shopOf(await s.wallets.get(7)))].sort()).toEqual([...itemById('bundle.starter')!.items!].sort());
    await s.refund(7, 'bundle.starter', 'c1');
    // The cap was bought on its own as well: it stays.
    expect([...ownedItems(shopOf(await s.wallets.get(7)))]).toEqual(['hat.cap']);
    // A payment delivered again after its refund does not bring it back.
    await s.pay(7, 'bundle.starter', 'c1');
    expect([...ownedItems(shopOf(await s.wallets.get(7)))]).toEqual(['hat.cap']);
  });

  it('keeps purchases through the first shop’s: a skin and the patronage still work beside the catalogue', async () => {
    const s = setup();
    await handleUpdate(payment(7, { u: 7, s: 'skin.mage.royal' }, 'old', 75), s.deps.api, s.wallets, config, NOW);
    await s.pay(7, 'hat.cap', 'new');
    const wallet = await s.wallets.get(7);
    expect(wallet.owned).toEqual(['skin.mage.royal']);
    expect([...ownedItems(shopOf(wallet))]).toEqual(['hat.cap']);
    expect(Object.keys(wallet.charges).sort()).toEqual(['new', 'old']);
  });
});

describe('gifts', () => {
  it('a gift for a friend is paid by the giver and lands in the friend’s mail, not the giver’s wallet', async () => {
    const s = setup();
    const result = await giftInvoice(s.deps, 7, { sku: 'pet.cat', to: 8 }, 'en');
    expect(result.status).toBe(200);
    const invoiceCall = s.calls.find((call) => call.method === 'createInvoiceLink')!;
    expect(invoiceCall.params).toMatchObject({ prices: [{ amount: 150 }], payload: JSON.stringify({ u: 7, s: 'pet.cat', g: 8 }) });
    expect(String(invoiceCall.params.title)).toMatch(/^Gift: /);

    await s.pay(7, 'pet.cat', 'g1', { g: 8 });
    const giver = shopOf(await s.wallets.get(7));
    expect(ownedItems(giver).size).toBe(0);
    expect(giver.sent.g1).toMatchObject({ sku: 'pet.cat', to: 8, delivered: true });
    const friend = await s.wallets.get(8);
    expect(shopOf(friend).inbox).toMatchObject([{ id: 'g1', sku: 'pet.cat', from: 7, name: 'Ann' }]);
    // Waiting in the mail, not yet owned.
    expect(ownedItems(shopOf(friend)).size).toBe(0);
    expect(giftLetters(friend, NOW)).toMatchObject([{ id: 'gift:g1', kind: 'gift', gifts: [{ type: 'item', sku: 'pet.cat', from: 7 }] }]);
    // The friend is told in the bot, the giver thanked.
    expect(s.calls.filter((call) => call.method === 'sendMessage').map((call) => call.params.chat_id)).toEqual([8, 7]);

    const claimed = await claimGifts(s.wallets, 8, 'g1', NOW);
    expect([...ownedItems(shopOf(claimed))]).toEqual(['pet.cat']);
    // Claimed twice is the same.
    expect([...ownedItems(shopOf(await claimGifts(s.wallets, 8, 'g1', NOW + 1)))]).toEqual(['pet.cat']);
    expect(giftLetters(claimed, NOW)[0]!.claimed).toBe(NOW);
  });

  it('a payment delivered twice delivers the gift once and tells the friend once', async () => {
    const s = setup();
    await s.pay(7, 'hat.crown', 'g1', { g: 8 });
    const before = s.calls.length;
    await s.pay(7, 'hat.crown', 'g1', { g: 8 });
    expect(shopOf(await s.wallets.get(8)).inbox).toHaveLength(1);
    expect(s.calls.slice(before).filter((call) => call.params.chat_id === 8)).toHaveLength(0);
  });

  it('a gift whose delivery failed is delivered the next time the giver looks at the shop', async () => {
    const s = setup();
    // The friend's wallet cannot be reached at the payment.
    const real = s.wallets.apply.bind(s.wallets);
    s.wallets.apply = async (user, change) => {
      if (user === 8 && change.kind === 'gift') throw new Error('down');
      return real(user, change);
    };
    await s.pay(7, 'hat.crown', 'g1', { g: 8 });
    expect(shopOf(await s.wallets.get(7)).sent.g1!.delivered).toBe(false);
    expect(shopOf(await s.wallets.get(8)).inbox).toHaveLength(0);
    s.wallets.apply = real;
    await shopState(s.deps, 7);
    expect(shopOf(await s.wallets.get(7)).sent.g1!.delivered).toBe(true);
    expect(shopOf(await s.wallets.get(8)).inbox).toHaveLength(1);
  });

  it('refuses a gift to oneself, an earn-only gift, a gift of the pass, one to a friend who has it, and a bad friend', async () => {
    const s = setup();
    expect((await giftInvoice(s.deps, 7, { sku: 'hat.cap', to: 7 }, 'en')).status).toBe(400);
    expect((await giftInvoice(s.deps, 7, { sku: 'title.undying', to: 8 }, 'en')).status).toBe(400);
    expect((await giftInvoice(s.deps, 7, { sku: passSku(SEASON), to: 8 }, 'en')).status).toBe(400);
    expect((await giftInvoice(s.deps, 7, { sku: 'hat.cap', to: 'x' }, 'en')).status).toBe(400);
    expect((await giftInvoice(s.deps, 7, { sku: 'skin.mage.royal', to: 8 }, 'en')).status).toBe(400);
    await s.pay(8, 'hat.cap', 'own');
    expect((await giftInvoice(s.deps, 7, { sku: 'hat.cap', to: 8 }, 'en')).status).toBe(409);
    expect((await giftInvoice(s.deps, 7, { sku: 'hat.cap', to: '8' }, 'en')).status).toBe(409);
    expect((await giftInvoice(s.deps, 7, { sku: 'hat.wizard', to: '8' }, 'en')).status).toBe(200);
  });

  it('a share link: paid by the giver, opened by one friend, who finds it in their mail', async () => {
    const s = setup();
    const result = await giftInvoice(s.deps, 7, { sku: 'bundle.starter', link: true }, 'en');
    expect(result.body).toMatchObject({ link: 'https://t.me/$invoice', code: '7_00000001' });
    await s.pay(7, 'bundle.starter', 'g1', { l: '7_00000001' });
    // The giver is sent the link to pass on; nothing is in anybody's mail yet.
    expect(String(s.calls.at(-1)!.params.text)).toContain('https://t.me/bot/app?startapp=gift_7_00000001');
    expect(shopOf(await s.wallets.get(8)).inbox).toHaveLength(0);

    expect((await acceptGift(s.deps, 7, '7_00000001')).status).toBe(400);
    expect((await acceptGift(s.deps, 8, 'nonsense')).status).toBe(400);
    expect((await acceptGift(s.deps, 8, '7_00000009')).status).toBe(404);
    expect((await acceptGift(s.deps, 8, '7_00000001')).status).toBe(200);
    // Opened again by the same friend: the same gift, once. By another: taken.
    expect((await acceptGift(s.deps, 8, '7_00000001')).status).toBe(200);
    expect((await acceptGift(s.deps, 9, '7_00000001')).status).toBe(409);
    expect(shopOf(await s.wallets.get(8)).inbox).toMatchObject([{ id: 'l-7_00000001', sku: 'bundle.starter', from: 7 }]);
    expect(shopOf(await s.wallets.get(9)).inbox).toHaveLength(0);
    await claimGifts(s.wallets, 8, null, NOW);
    expect([...ownedItems(shopOf(await s.wallets.get(8)))].sort()).toEqual([...itemById('bundle.starter')!.items!].sort());
  });

  it('a refunded gift is taken back from the friend, claimed or not, and the giver has nothing to lose', async () => {
    const s = setup();
    await s.pay(7, 'hat.crown', 'g1', { g: 8 });
    await s.pay(7, 'pet.cat', 'g2', { g: 8 });
    await s.pay(8, 'pet.cat', 'own');
    await claimGifts(s.wallets, 8, 'g1', NOW);
    await claimGifts(s.wallets, 8, 'g2', NOW);
    await s.wallets.apply(8, { kind: 'equip', slot: 'hat', id: 'hat.crown' });
    await s.refund(7, 'hat.crown', 'g1', { g: 8 });
    await s.refund(7, 'pet.cat', 'g2', { g: 8 });
    const friend = shopOf(await s.wallets.get(8));
    // The crown goes (and comes off); the cat they had bought themselves stays.
    expect([...ownedItems(friend)]).toEqual(['pet.cat']);
    expect(friend.equipped.slots.hat).toBeUndefined();
    expect(friend.inbox).toHaveLength(0);
    expect(shopOf(await s.wallets.get(7)).sent).toEqual({});
  });

  it('a refunded link gift is taken back from whoever opened it', async () => {
    const s = setup();
    await s.pay(7, 'hat.crown', 'g1', { l: '7_00000001' });
    await acceptGift(s.deps, 8, '7_00000001');
    await claimGifts(s.wallets, 8, null, NOW);
    expect(ownedItems(shopOf(await s.wallets.get(8))).has('hat.crown')).toBe(true);
    await s.refund(7, 'hat.crown', 'g1', { l: '7_00000001' });
    expect(ownedItems(shopOf(await s.wallets.get(8))).size).toBe(0);
  });
});

describe('equipping', () => {
  it('lets only owned things be worn, each in its own slot', async () => {
    const s = setup();
    expect((await equip(s.deps, 7, { slot: 'hat', id: 'hat.wizard' })).status).toBe(403);
    await s.pay(7, 'hat.wizard', 'c1');
    await s.pay(7, 'look.mage.ember', 'c2');
    expect((await equip(s.deps, 7, { slot: 'hat', id: 'hat.wizard' })).status).toBe(200);
    expect((await equip(s.deps, 7, { slot: 'trail', id: 'hat.wizard' })).status).toBe(400);
    expect((await equip(s.deps, 7, { slot: 'look.warrior', id: 'look.mage.ember' })).status).toBe(400);
    expect((await equip(s.deps, 7, { slot: 'look.mage', id: 'look.mage.ember' })).status).toBe(200);
    expect((await equip(s.deps, 7, { slot: 'nonsense', id: 'hat.wizard' })).status).toBe(400);
    expect((await equip(s.deps, 7, { slot: 'hat', id: 'nonsense' })).status).toBe(400);
    expect((await equip(s.deps, 7, { slot: 'hat' })).status).toBe(400);
    expect(shopOf(await s.wallets.get(7)).equipped.slots).toEqual({ hat: 'hat.wizard', 'look.mage': 'look.mage.ember' });
    // A look per class: the mage's look does not stand in the warrior's slot, and taking one off leaves the other.
    expect((await equip(s.deps, 7, { slot: 'hat', id: null })).status).toBe(200);
    expect(shopOf(await s.wallets.get(7)).equipped.slots).toEqual({ 'look.mage': 'look.mage.ember' });
  });

  it('wears every slot at once: look per class, hat, pet, trail, kill fx, death fx, numbers, quips, campfire, frame, title, name colour, decorations', async () => {
    const s = setup();
    const kit: Array<[string, string]> = [
      ['look.warrior', 'look.warrior.ember'], ['look.huntress', 'look.huntress.frost'], ['hat', 'hat.cap'], ['pet', 'pet.rat'], ['trail', 'trail.embers'],
      ['killfx', 'killfx.stars'], ['deathfx', 'deathfx.petals'], ['numbers', 'numbers.gold'], ['quips', 'quips.pirate'], ['campfire', 'fire.blue'],
      ['frame', 'pframe.ember'], ['title', 'title.delver'], ['namecolor', 'namecolor.gold'],
    ];
    let n = 0;
    for (const [, id] of kit) await s.pay(7, id, `c${n++}`);
    for (const [slot, id] of kit) expect((await equip(s.deps, 7, { slot, id })).status, slot).toBe(200);
    expect(Object.keys(shopOf(await s.wallets.get(7)).equipped.slots).sort()).toEqual(kit.map(([slot]) => slot).sort());
  });

  it('wears a set of decorations: owned, only decorations, no more than the limit', async () => {
    const s = setup();
    const decor = CATALOG.filter((entry) => entry.category === 'decor' && !entry.earn).map((entry) => entry.id);
    expect(decor.length).toBeGreaterThan(DECOR_MAX);
    for (const id of decor) await s.pay(7, id, `d-${id}`);
    await s.pay(7, 'hat.cap', 'hat');
    expect((await equip(s.deps, 7, { decor: decor.slice(0, DECOR_MAX) })).status).toBe(200);
    expect(shopOf(await s.wallets.get(7)).equipped.decor).toEqual(decor.slice(0, DECOR_MAX));
    expect((await equip(s.deps, 7, { decor })).status).toBe(400);
    expect((await equip(s.deps, 7, { decor: ['hat.cap'] })).status).toBe(400);
    expect((await equip(s.deps, 7, { decor: [decor[0], decor[0]] })).status).toBe(400);
    expect((await equip(s.deps, 8, { decor: [decor[0]] })).status).toBe(403);
    expect((await equip(s.deps, 7, { decor: [] })).status).toBe(200);
    expect(shopOf(await s.wallets.get(7)).equipped.decor).toEqual([]);
  });

  it('refuses at the wallet too: a change that names what is not owned wears nothing', async () => {
    const wallets = memoryWallets();
    await wallets.apply(7, { kind: 'equip', slot: 'hat', id: 'hat.crown' });
    await wallets.apply(7, { kind: 'decor', ids: ['decor.tent'] });
    expect(shopOf(await wallets.get(7)).equipped).toEqual({ slots: {}, decor: [] });
  });

  it('a refund takes off what it takes away', async () => {
    const s = setup();
    await s.pay(7, 'hat.crown', 'c1');
    await s.pay(7, 'decor.tent', 'c2');
    await equip(s.deps, 7, { slot: 'hat', id: 'hat.crown' });
    await equip(s.deps, 7, { decor: ['decor.tent'] });
    await s.refund(7, 'hat.crown', 'c1');
    await s.refund(7, 'decor.tent', 'c2');
    expect(shopOf(await s.wallets.get(7)).equipped).toEqual({ slots: {}, decor: [] });
  });

  it('is served by the shop state with what is owned', async () => {
    const s = setup();
    await s.pay(7, 'hat.crown', 'c1');
    await equip(s.deps, 7, { slot: 'hat', id: 'hat.crown' });
    const state = (await shopState(s.deps, 7)).body;
    expect(state).toMatchObject({ items: ['hat.crown'], equipped: { slots: { hat: 'hat.crown' }, decor: [] }, gifts: [], patron: false });
  });

  it('earned things are granted on a look at the shop, once, and kept', async () => {
    const s = setup();
    s.facts[7] = { ...noFacts(), streakBest: 8 };
    expect((await shopState(s.deps, 7)).body.items).toEqual(['title.undying']);
    expect((await shopState(s.deps, 7)).body.items).toEqual(['title.undying']);
    expect((await equip(s.deps, 7, { slot: 'title', id: 'title.undying' })).status).toBe(200);
    // The streak ends and the season wipes the profile: what was won stays.
    s.facts[7] = noFacts();
    expect((await shopState(s.deps, 7)).body.items).toEqual(['title.undying']);
  });

  it('purchases survive a season’s wipe: the wallet is not the profile', async () => {
    const s = setup();
    await s.pay(7, 'look.rogue.phoenix', 'c1');
    s.facts[7] = noFacts();
    const state = (await shopState({ ...s.deps, season: SEASON + 1 }, 7)).body;
    expect(state.items).toEqual(['look.rogue.phoenix']);
  });
});

describe('the season pass', () => {
  it('has 30 levels, each costing more than the last, and reaches level 30 at the sum', () => {
    expect(PASS_LEVELS).toBe(30);
    let total = 0;
    for (let level = 1; level <= PASS_LEVELS; level++) {
      total += 100 + 10 * (level - 1);
      expect(xpToReach(level)).toBe(total);
    }
    expect(passLevel(0)).toBe(0);
    expect(passLevel(99)).toBe(0);
    expect(passLevel(100)).toBe(1);
    expect(passLevel(xpToReach(17) - 1)).toBe(16);
    expect(passLevel(xpToReach(17))).toBe(17);
    expect(passLevel(1e9)).toBe(30);
    expect(levelProgress(150)).toEqual({ level: 1, into: 50, need: 110 });
    expect(levelProgress(1e9)).toEqual({ level: 30, into: 0, need: 0 });
  });

  it('has a reward on both tracks, every one a catalogue item that only the pass gives', () => {
    expect(REWARDS).toHaveLength(30);
    for (const reward of REWARDS) {
      for (const id of [reward.free, reward.paid]) {
        if (!id) continue;
        expect(itemById(id)!.earn, id).toMatchObject({ by: 'pass', level: reward.level });
      }
    }
    expect(REWARDS[29]).toMatchObject({ free: 'fire.pass_season', paid: 'look.warrior.pass_season' });
  });

  it('gives XP for depth, kills, a win and the daily dungeon; none for a run that does not rank; never more than the cap', () => {
    const run = { mode: 'dungeon' as const, daily: false, ranked: true, depth: 5, kills: 30, won: false };
    expect(runXp(run)).toBe(15 + 30 + 15);
    expect(runXp({ ...run, daily: true })).toBe(60 + 60);
    expect(runXp({ ...run, daily: true, won: true, depth: 26, kills: 500 })).toBe(RUN_XP_CAP);
    expect(runXp({ ...run, ranked: false })).toBe(0);
    expect(runXp({ ...run, mode: 'arena', depth: 10, kills: 30 })).toBe(10 + 80 + 10);
    expect(runXp({ ...run, depth: -3, kills: -5 })).toBe(15);
  });

  it('counts a run once, whoever tells it, and stops at the day’s cap', () => {
    const run = { id: 'r1', mode: 'dungeon' as const, daily: false, ranked: true, depth: 5, kills: 30, won: false };
    const first = awardRun(undefined, 3, run, '2026-10-16');
    expect(first.added).toBe(60);
    const again = awardRun(first.progress, 3, run, '2026-10-16');
    expect(again.added).toBe(0);
    expect(again.progress.xp).toBe(60);
    // Many runs in a day reach the cap and no further; the next day starts again.
    let progress = first.progress;
    for (let i = 0; i < 30; i++) progress = awardRun(progress, 3, { ...run, id: `x${i}` }, '2026-10-16').progress;
    expect(progress.xp).toBe(DAY_XP_CAP);
    expect(awardRun(progress, 3, { ...run, id: 'next' }, '2026-10-17').progress.xp).toBe(DAY_XP_CAP + 60);
    // A new season starts the pass afresh.
    expect(awardRun(progress, 4, { ...run, id: 'n4' }, '2026-10-17').progress).toMatchObject({ season: 4, xp: 60 });
  });

  it('takes XP from a checked run when it ends, once, and not from one that is not played to its end', () => {
    const logic = new PlayerLogic(emptyProfile('Alice'));
    const run = logic.start({ slot: 'dungeon', heroClass: 'warrior', challenges: 0, name: 'Alice', seed: 7, id: 'r1', now: 0, today: '2026-10-16' });
    expect(logic.profile.pass).toBeUndefined();
    const device = structuredClone(run.world);
    let finished = false;
    for (let batch = 0; batch < 40 && !finished; batch++) {
      const from = logic.runs.dungeon!.seq;
      const actions = [];
      for (let i = 0; i < 400 && !device.over; i++) if (act(device, ME, { type: 'wait' }).ok) actions.push({ type: 'wait' as const });
      finished = logic.sync('dungeon', 'r1', from, actions, fingerprint(device), 1000).finish !== undefined;
    }
    expect(finished).toBe(true);
    const xp = logic.profile.pass!.xp;
    expect(xp).toBeGreaterThan(0);
    expect(logic.profile.pass).toMatchObject({ season: SEASON, runs: ['r1'] });
    // The same run synced again (a request sent twice) adds nothing.
    logic.sync('dungeon', 'r1', logic.runs.dungeon!.seq, [], null, 2000);
    expect(logic.profile.pass!.xp).toBe(xp);
  });

  it('pays out the free track by level reached, once, and the paid track only to the one who bought it', async () => {
    const s = setup();
    const progress = (xp: number) => ({ season: SEASON, xp, runs: [], day: '', dayXp: 0 });
    s.facts[7] = { ...noFacts(), pass: progress(xpToReach(9)) };
    expect((await claimPass(s.deps, 7, 'paid')).status).toBe(403);
    const first = await claimPass(s.deps, 7, 'free');
    expect(first.body.claimed).toEqual([3, 6, 9]);
    expect([...ownedItems(shopOf(await s.wallets.get(7)))].sort()).toEqual(['title.pass_veteran', 'trail.pass_sparks', 'numbers.pass_pale'].sort());
    // Again: nothing new.
    expect((await claimPass(s.deps, 7, 'free')).body.claimed).toEqual([]);
    // More XP, more rewards; the ones before are not given again.
    s.facts[7] = { ...noFacts(), pass: progress(xpToReach(13)) };
    expect((await claimPass(s.deps, 7, 'free')).body.claimed).toEqual([12]);

    // The paid track: bought once a season by the Stars purchase, then claimed up to the level reached.
    await s.pay(7, passSku(SEASON), 'p1');
    expect(ownedItems(shopOf(await s.wallets.get(7))).has(passSku(SEASON))).toBe(true);
    const paid = await claimPass(s.deps, 7, 'paid');
    expect(paid.body.claimed).toEqual([1, 4, 5, 8, 10, 13]);
    const state = (await shopState(s.deps, 7)).body.pass as Record<string, unknown>;
    expect(state).toMatchObject({ season: SEASON, level: 13, paid: true, claimed: { free: [3, 6, 9, 12], paid: [1, 4, 5, 8, 10, 13] } });
  });

  it('gives nothing above the level the checked XP reached, and a device’s word for its level counts for nothing', async () => {
    const s = setup();
    s.facts[7] = { ...noFacts(), pass: { season: SEASON, xp: 50, runs: [], day: '', dayXp: 0 } };
    expect((await claimPass(s.deps, 7, 'free')).body.claimed).toEqual([]);
    // Even a change that asks for a high level directly is held to the level it says was reached.
    await s.wallets.apply(7, { kind: 'passClaim', season: SEASON, track: 'free', levels: [30], reached: 2 });
    expect(ownedItems(shopOf(await s.wallets.get(7))).size).toBe(0);
    // XP of another season is not this season's.
    s.facts[7] = { ...noFacts(), pass: { season: SEASON - 1, xp: 1e6, runs: [], day: '', dayXp: 0 } };
    expect((await claimPass(s.deps, 7, 'free')).body.claimed).toEqual([]);
  });

  it('buying the pass is one purchase a season: refused if owned, and only this season’s is sold', async () => {
    const s = setup();
    expect((await invoice(s.deps, 7, passSku(SEASON), 'en')).status).toBe(200);
    await s.pay(7, passSku(SEASON), 'p1');
    expect((await invoice(s.deps, 7, passSku(SEASON), 'en')).status).toBe(409);
    expect((await invoice(s.deps, 7, passSku(SEASON + 1), 'en')).status).toBe(400);
    // Next season's pass is another purchase, and does not unlock this season's paid track.
    const next = { ...s.deps, season: SEASON + 1 };
    expect((await invoice(next, 7, passSku(SEASON + 1), 'en')).status).toBe(200);
    s.facts[7] = { ...noFacts(), pass: { season: SEASON + 1, xp: xpToReach(5), runs: [], day: '', dayXp: 0 } };
    expect((await claimPass(next, 7, 'paid')).status).toBe(403);
  });

  it('a refunded pass takes back what its paid track gave, but not the free track’s', async () => {
    const s = setup();
    s.facts[7] = { ...noFacts(), pass: { season: SEASON, xp: xpToReach(10), runs: [], day: '', dayXp: 0 } };
    await s.pay(7, passSku(SEASON), 'p1');
    await claimPass(s.deps, 7, 'paid');
    await claimPass(s.deps, 7, 'free');
    await equip(s.deps, 7, { slot: 'hat', id: 'hat.pass_wreath' });
    await s.refund(7, passSku(SEASON), 'p1');
    const wallet = shopOf(await s.wallets.get(7));
    expect([...ownedItems(wallet)].sort()).toEqual(['numbers.pass_pale', 'title.pass_veteran', 'trail.pass_sparks']);
    expect(wallet.equipped.slots.hat).toBeUndefined();
    // The paid claims are not claimable again without the pass.
    expect((await claimPass(s.deps, 7, 'paid')).status).toBe(403);
  });
});
