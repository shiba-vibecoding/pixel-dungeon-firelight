import { describe, expect, it } from 'vitest';
import { itemById } from '../../client/src/catalog';
import { SEASON } from '../src/boards';
import { CONNECTIONS_MAX, cleanNote, NOTE_MAX, type PlayerCard, refOfStart } from '../src/friends';
import { type BotApi, type BotConfig, handleUpdate, type Payload, type Wallets } from '../src/payments';
import { acceptGift, connectByRef, friendsOf, giftInvoice, giftLetters, noFacts, type ShopDeps } from '../src/shopapi';
import { applyWalletChange, emptyRecord, parseWalletChange, shopOf, type WalletRecord, walletView, type WalletView } from '../src/wallet';

/* Gift notes, and the friends who play (friends.ts): what is kept, what is shown, and what counts as a real link. */

const NOW = Date.UTC(2026, 9, 16);

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
const CARDS: Record<number, PlayerCard> = {
  7: { name: 'Ann', heroClass: 'mage' }, 8: { name: 'Bob', heroClass: 'warrior' }, 9: { name: 'Cy' }, 10: { name: 'Dee', heroClass: 'huntress' },
};

function setup() {
  const wallets = memoryWallets();
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const api: BotApi = async (method, params) => {
    calls.push({ method, params });
    return method === 'createInvoiceLink' ? 'https://t.me/$invoice' : true;
  };
  let n = 0;
  const deps: ShopDeps = {
    wallets, api, config, now: NOW, season: SEASON, facts: async () => noFacts(), code: (user) => `${user}_${String(++n).padStart(8, '0')}`,
    card: async (user) => CARDS[user] ?? null,
  };
  const pay = (user: number, sku: string, charge: string, extra: Partial<Payload> = {}): Promise<void> =>
    handleUpdate({
      message: {
        chat: { id: user, type: 'private' }, from: { id: user, first_name: 'Ann', language_code: 'en' },
        successful_payment: { currency: 'XTR', total_amount: itemById(sku)!.stars, invoice_payload: JSON.stringify({ u: user, s: sku, ...extra }), telegram_payment_charge_id: charge },
      },
    }, api, wallets, config, NOW);
  const refund = (user: number, charge: string, payload: Payload): Promise<void> =>
    handleUpdate({
      message: {
        chat: { id: user, type: 'private' }, from: { id: user, first_name: 'Ann', language_code: 'en' },
        refunded_payment: { invoice_payload: JSON.stringify(payload), telegram_payment_charge_id: charge },
      },
    }, api, wallets, config, NOW);
  return { wallets, calls, deps, pay, refund };
}
type Setup = ReturnType<typeof setup>;

const connectedIds = async (s: Setup, user: number): Promise<string[]> => Object.keys(shopOf(await s.wallets.get(user)).connections ?? {}).sort();

describe('gift notes', () => {
  it('cleans a note: plain text, trimmed, control and invisible characters out, line breaks as spaces', () => {
    expect(cleanNote(undefined)).toEqual({ ok: true });
    expect(cleanNote(null)).toEqual({ ok: true });
    expect(cleanNote('   \n\t ')).toEqual({ ok: true });
    expect(cleanNote('  Не замёрзни   там!  ')).toEqual({ ok: true, note: 'Не замёрзни там!' });
    expect(cleanNote('a\u0000b\u0007c\u007fd\u009fe')).toEqual({ ok: true, note: 'abcde' });
    expect(cleanNote('line one\r\nline two\tend')).toEqual({ ok: true, note: 'line one line two end' });
    // Bidi overrides and zero-width characters cannot hide or reorder text.
    expect(cleanNote('ab‮cd​ef⁦gh﻿ij')).toEqual({ ok: true, note: 'abcdefghij' });
    // Markup is only text: it is shown as text, never as markup.
    expect(cleanNote('<b>hi</b>')).toEqual({ ok: true, note: '<b>hi</b>' });
  });

  it('allows 80 characters and refuses 81, counting what is seen (an emoji is one); a note that is no string is refused', () => {
    expect(NOTE_MAX).toBe(80);
    expect(cleanNote('x'.repeat(80))).toMatchObject({ ok: true });
    expect(cleanNote('я'.repeat(81))).toEqual({ ok: false, error: 'note too long' });
    expect(cleanNote('🔥'.repeat(80))).toMatchObject({ ok: true });
    expect(cleanNote('🔥'.repeat(81))).toEqual({ ok: false, error: 'note too long' });
    // Control characters do not count towards the limit once stripped; blanks around it are trimmed.
    expect(cleanNote(`\u0000${'x'.repeat(80)}\u0000   `)).toMatchObject({ ok: true });
    expect(cleanNote('x'.repeat(5000))).toEqual({ ok: false, error: 'note too long' });
    for (const bad of [5, true, {}, ['a']]) expect(cleanNote(bad)).toEqual({ ok: false, error: 'bad note' });
  });

  it('a gift with a note: paid by the giver, the note lands in the friend’s mail with the gift, and the invoice is as ever', async () => {
    const s = setup();
    const result = await giftInvoice(s.deps, 7, { sku: 'pet.bat', to: 8, note: '  Не замёрзни\u0000 там!  ' }, 'ru');
    expect(result.status).toBe(200);
    // The payload is as it was (the note is kept in the giver's wallet, not in the 128 bytes Telegram allows).
    expect(s.calls.find((call) => call.method === 'createInvoiceLink')!.params.payload).toBe(JSON.stringify({ u: 7, s: 'pet.bat', g: 8 }));
    expect(JSON.stringify(s.calls)).not.toContain('замёрзни');
    await s.pay(7, 'pet.bat', 'g1', { g: 8 });
    expect(shopOf(await s.wallets.get(7)).sent.g1).toMatchObject({ to: 8, delivered: true, note: 'Не замёрзни там!' });
    // No longer pending once paid.
    expect(shopOf(await s.wallets.get(7)).notes).toBeUndefined();
    const friend = await s.wallets.get(8);
    expect(shopOf(friend).inbox).toMatchObject([{ id: 'g1', note: 'Не замёрзни там!' }]);
    expect(giftLetters(friend, NOW)[0]!.gifts[0]).toMatchObject({ type: 'item', sku: 'pet.bat', from: 7, note: 'Не замёрзни там!' });
    // The bot's message to the friend does not carry it (it is for the camp's mail).
    expect(JSON.stringify(s.calls.filter((call) => call.method === 'sendMessage'))).not.toContain('замёрзни');
  });

  it('a gift without a note has none, and a note not meant any more is not sent with the next gift', async () => {
    const s = setup();
    await giftInvoice(s.deps, 7, { sku: 'pet.bat', to: 8 }, 'en');
    await s.pay(7, 'pet.bat', 'g1', { g: 8 });
    expect(shopOf(await s.wallets.get(8)).inbox[0]).not.toHaveProperty('note');
    expect(giftLetters(await s.wallets.get(8), NOW)[0]!.gifts[0]).not.toHaveProperty('note');
    // A note for a gift never paid, then the same gift asked for again without one: that gift has no note.
    await giftInvoice(s.deps, 7, { sku: 'hat.crown', to: 8, note: 'first' }, 'en');
    await giftInvoice(s.deps, 7, { sku: 'hat.crown', to: 8 }, 'en');
    await s.pay(7, 'hat.crown', 'g2', { g: 8 });
    expect(shopOf(await s.wallets.get(8)).inbox.find((note) => note.id === 'g2')).not.toHaveProperty('note');
    // Blank is no note.
    await giftInvoice(s.deps, 7, { sku: 'hat.wizard', to: 8, note: '   ' }, 'en');
    expect(shopOf(await s.wallets.get(7)).notes).toBeUndefined();
  });

  it('refuses a note too long or not text, before any invoice is made', async () => {
    const s = setup();
    expect((await giftInvoice(s.deps, 7, { sku: 'pet.bat', to: 8, note: 'x'.repeat(81) }, 'en')).status).toBe(400);
    expect((await giftInvoice(s.deps, 7, { sku: 'pet.bat', link: true, note: 'x'.repeat(81) }, 'en')).status).toBe(400);
    expect((await giftInvoice(s.deps, 7, { sku: 'pet.bat', to: 8, note: 12 }, 'en')).body).toEqual({ error: 'bad note' });
    expect(s.calls.filter((call) => call.method === 'createInvoiceLink')).toHaveLength(0);
    expect(shopOf(await s.wallets.get(7)).notes).toBeUndefined();
  });

  it('a link gift carries its note to whoever opens the link', async () => {
    const s = setup();
    const result = await giftInvoice(s.deps, 7, { sku: 'bundle.camp', link: true, note: 'With love' }, 'en');
    expect(result.body.code).toBe('7_00000001');
    await s.pay(7, 'bundle.camp', 'g1', { l: '7_00000001' });
    expect(shopOf(await s.wallets.get(7)).links['7_00000001']).toMatchObject({ note: 'With love' });
    await acceptGift(s.deps, 8, '7_00000001');
    expect(giftLetters(await s.wallets.get(8), NOW)[0]!.gifts[0]).toMatchObject({ from: 7, note: 'With love' });
  });

  it('a refunded gift takes its note with it; the pending notes are few and do not last', async () => {
    const s = setup();
    await giftInvoice(s.deps, 7, { sku: 'hat.crown', to: 8, note: 'hello' }, 'en');
    await s.pay(7, 'hat.crown', 'g1', { g: 8 });
    await s.refund(7, 'g1', { u: 7, s: 'hat.crown', g: 8 });
    expect(shopOf(await s.wallets.get(7)).sent).toEqual({});
    expect(shopOf(await s.wallets.get(8)).inbox).toHaveLength(0);
    // Twelve unpaid notes: the ten newest are kept.
    for (let i = 1; i <= 12; i++) await s.wallets.apply(7, { kind: 'note', key: `l:${i}`, text: `n${i}`, at: NOW + i });
    expect(Object.keys(shopOf(await s.wallets.get(7)).notes!).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `l:${i + 3}`).sort());
    // A note not paid for in three days is dropped by the next one written.
    await s.wallets.apply(7, { kind: 'note', key: 'l:late', text: 'late', at: NOW + 4 * 86_400_000 });
    expect(Object.keys(shopOf(await s.wallets.get(7)).notes!)).toEqual(['l:late']);
  });

  it('a wallet change with a bad note is no change, and one with a note is cleaned', () => {
    expect(parseWalletChange({ kind: 'note', key: 'k', text: 'x'.repeat(81), at: 1 })).toBeNull();
    expect(parseWalletChange({ kind: 'note', key: 'k', text: 'ok', at: 1 })).toEqual({ kind: 'note', key: 'k', text: 'ok', at: 1 });
    expect(parseWalletChange({ kind: 'gift', id: 'a', sku: 'pet.bat', from: 7, at: 1, note: 'a\u0000b' })).toMatchObject({ note: 'ab' });
    expect(parseWalletChange({ kind: 'gift', id: 'a', sku: 'pet.bat', from: 7, at: 1, note: 'x'.repeat(200) })).not.toHaveProperty('note');
  });
});

describe('friends who play', () => {
  it('starts with nobody, and says how to invite: a share link of the player’s own', async () => {
    const s = setup();
    expect((await friendsOf(s.deps, 7)).body).toEqual({ friends: [], invite: 'https://t.me/bot/app?startapp=ref_7' });
    // An old wallet with no connections at all is the same.
    expect(shopOf(await s.wallets.get(7)).connections).toBeUndefined();
  });

  it('a share link opened by another player connects the two, both ways, once', async () => {
    const s = setup();
    expect(refOfStart('ref_7')).toBe(7);
    expect((await connectByRef(s.deps, 8, refOfStart('ref_7'))).body).toEqual({ connected: true });
    await connectByRef(s.deps, 8, 7);
    expect(await connectedIds(s, 7)).toEqual(['8']);
    expect(await connectedIds(s, 8)).toEqual(['7']);
    expect(shopOf(await s.wallets.get(7)).connections!['8']).toMatchObject({ via: 'invite' });
    expect((await friendsOf(s.deps, 7)).body.friends).toMatchObject([{ name: 'Bob', heroClass: 'warrior' }]);
    expect((await friendsOf(s.deps, 8)).body.friends).toMatchObject([{ name: 'Ann', heroClass: 'mage' }]);
  });

  it('shows only a name and a class: no id anywhere in what is sent', async () => {
    const s = setup();
    await connectByRef(s.deps, 8, 7);
    s.deps.now += 1000;
    await connectByRef(s.deps, 9, 7);
    const friends = (await friendsOf(s.deps, 7)).body.friends as Array<Record<string, unknown>>;
    for (const friend of friends) expect(Object.keys(friend).filter((key) => key !== 'heroClass').sort()).toEqual(['h', 'name']);
    expect(JSON.stringify(friends)).not.toMatch(/\b[89]\b/);
    expect(friends.map((friend) => friend.name)).toEqual(['Cy', 'Bob']);
    // The class is left out when the friend has not played a hero yet.
    expect(friends[0]).not.toHaveProperty('heroClass');
  });

  it('counts only real links: not oneself, not a stranger the game does not know, not a start parameter that is no invite', async () => {
    const s = setup();
    expect((await connectByRef(s.deps, 7, 7)).body).toEqual({ connected: false });
    expect((await connectByRef(s.deps, 7, 4242)).body).toEqual({ connected: false });
    expect((await connectByRef(s.deps, 7, null)).body).toEqual({ connected: false });
    for (const start of ['daily', 'arena', 'gift_7_0011223344556677', 'room_abc', 'ref_', 'ref_0', 'ref_12345678901234567', 'ref_7x', '', undefined, 7]) {
      expect(refOfStart(start), String(start)).toBeNull();
    }
    expect(refOfStart('daily_r7')).toBe(7);
    expect(refOfStart('arena_r8')).toBe(8);
    expect(await connectedIds(s, 7)).toEqual([]);
    // Nobody is connected by simply being in the game, or by paying for one's own things.
    await s.pay(7, 'hat.crown', 'own1');
    expect(await connectedIds(s, 7)).toEqual([]);
    expect((await friendsOf(s.deps, 7)).body.friends).toEqual([]);
  });

  it('gifts connect the giver and the friend, by id and by link', async () => {
    const s = setup();
    await s.pay(7, 'hat.crown', 'g1', { g: 8 });
    expect(await connectedIds(s, 7)).toEqual(['8']);
    expect(await connectedIds(s, 8)).toEqual(['7']);
    expect(shopOf(await s.wallets.get(8)).connections!['7']).toMatchObject({ via: 'gift' });
    await s.pay(7, 'hat.wizard', 'g2', { l: '7_00000001' });
    expect(await connectedIds(s, 9)).toEqual([]);
    await acceptGift(s.deps, 9, '7_00000001');
    expect(await connectedIds(s, 9)).toEqual(['7']);
    expect(await connectedIds(s, 7)).toEqual(['8', '9']);
    // A link that was taken connects nobody more.
    expect((await acceptGift(s.deps, 10, '7_00000001')).status).toBe(409);
    expect(await connectedIds(s, 10)).toEqual([]);
  });

  it('a gift to a friend of the list is made with their handle, and only a handle of one’s own list works', async () => {
    const s = setup();
    await connectByRef(s.deps, 8, 7);
    await connectByRef(s.deps, 10, 9);
    const [bob] = (await friendsOf(s.deps, 7)).body.friends as Array<{ h: string }>;
    const [cy] = (await friendsOf(s.deps, 10)).body.friends as Array<{ h: string }>;
    const result = await giftInvoice(s.deps, 7, { sku: 'pet.bat', friend: bob!.h, note: 'hi' }, 'en');
    expect(result.status).toBe(200);
    expect(s.calls.find((call) => call.method === 'createInvoiceLink')!.params.payload).toBe(JSON.stringify({ u: 7, s: 'pet.bat', g: 8 }));
    await s.pay(7, 'pet.bat', 'g1', { g: 8 });
    expect(giftLetters(await s.wallets.get(8), NOW)[0]!.gifts[0]).toMatchObject({ from: 7, note: 'hi' });
    // Another player's handle, a made-up one, and a number name no friend.
    expect((await giftInvoice(s.deps, 7, { sku: 'pet.bat', friend: cy!.h }, 'en')).status).toBe(400);
    expect((await giftInvoice(s.deps, 7, { sku: 'pet.bat', friend: '0123456789ab' }, 'en')).status).toBe(400);
    expect((await giftInvoice(s.deps, 7, { sku: 'pet.bat', friend: '8' }, 'en')).status).toBe(400);
  });

  it('a full list takes no more links, and a friend the game does not know is left out of what is shown', async () => {
    const s = setup();
    for (let id = 1000; id < 1000 + CONNECTIONS_MAX + 5; id++) {
      await s.wallets.apply(7, { kind: 'connect', with: id, via: 'invite', at: NOW + id, h: id.toString(16).padStart(12, '0') });
    }
    expect(await connectedIds(s, 7)).toHaveLength(CONNECTIONS_MAX);
    await connectByRef(s.deps, 8, 7);
    expect(await connectedIds(s, 7)).not.toContain('8');
    expect(await connectedIds(s, 8)).toEqual(['7']);
    // None of those ids is a known player: nobody to show.
    expect((await friendsOf(s.deps, 7)).body.friends).toEqual([]);
  });

  it('a connection that cannot be written does not stop a gift', async () => {
    const s = setup();
    const real = s.wallets.apply.bind(s.wallets);
    s.wallets.apply = async (user, change) => {
      if (change.kind === 'connect') throw new Error('down');
      return real(user, change);
    };
    await s.pay(7, 'hat.crown', 'g1', { g: 8 });
    expect(shopOf(await s.wallets.get(8)).inbox).toHaveLength(1);
    expect(shopOf(await s.wallets.get(7)).sent.g1!.delivered).toBe(true);
  });
});
