import { describe, expect, it } from 'vitest';
import { emptyWallet, isPatron, type Wallet } from '@pd/core';
import { type BotApi, createInvoice, handleUpdate, type Wallets } from '../src/payments';

const NOW = Date.UTC(2026, 9, 12);

/** A Bot API that remembers its calls and makes up invoice links. */
function fakeApi(): { api: BotApi; calls: Array<{ method: string; params: Record<string, unknown> }> } {
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const api: BotApi = async (method, params) => {
    calls.push({ method, params });
    return method === 'createInvoiceLink' ? 'https://t.me/$invoice' : true;
  };
  return { api, calls };
}

function memoryWallets(): Wallets & { store: Map<number, Wallet> } {
  const store = new Map<number, Wallet>();
  return {
    store,
    async get(user) {
      return store.get(user) ?? emptyWallet();
    },
    async update(user, change) {
      const next = change(store.get(user) ?? emptyWallet());
      store.set(user, next);
      return next;
    },
  };
}

const private_ = (user: number) => ({ chat: { id: user, type: 'private' }, from: { id: user, first_name: 'Ann', language_code: 'ru' } });

describe('Pixel-Mart payments', () => {
  it('makes an invoice in Stars at the catalogue price, a subscription for the patron', async () => {
    const { api, calls } = fakeApi();
    expect(await createInvoice(api, 7, 'skin.mage.royal', { title: 'Royal', description: 'A look' }, NOW)).toEqual({ link: 'https://t.me/$invoice' });
    expect(calls[0]!.params).toMatchObject({ currency: 'XTR', prices: [{ amount: 75 }], payload: JSON.stringify({ u: 7, s: 'skin.mage.royal' }) });
    expect(calls[0]!.params.subscription_period).toBeUndefined();
    await createInvoice(api, 7, 'patron', { title: 'Patron', description: '' }, NOW);
    expect(calls[1]!.params).toMatchObject({ prices: [{ amount: 99 }], subscription_period: 2_592_000 });
  });

  it('sells nothing that is not for sale or out of season', async () => {
    const { api } = fakeApi();
    expect(await createInvoice(api, 7, 'skin.mage.ash', { title: '', description: '' }, NOW)).toEqual({ error: 'not for sale' });
    expect(await createInvoice(api, 7, 'nonsense', { title: '', description: '' }, NOW)).toEqual({ error: 'not for sale' });
    expect(await createInvoice(api, 7, 'effect.snow', { title: '', description: '' }, Date.UTC(2026, 6, 1))).toEqual({ error: 'out of season' });
  });

  it('confirms a checkout only at the right price, in Stars, for the buyer it was made out to', async () => {
    const { api, calls } = fakeApi();
    const wallets = memoryWallets();
    const checkout = (from: number, amount: number, currency = 'XTR') => handleUpdate({
      pre_checkout_query: { id: 'q', from: { id: from }, currency, total_amount: amount, invoice_payload: JSON.stringify({ u: 7, s: 'frame.gold' }) },
    }, api, wallets, '', NOW);
    await checkout(7, 50);
    await checkout(7, 1);
    await checkout(8, 50);
    await checkout(7, 50, 'USD');
    expect(calls.map((c) => c.params.ok)).toEqual([true, false, false, false]);
  });

  it('a payment lands in the wallet once, a refund takes it back, the patronage keeps Telegram’s date', async () => {
    const { api, calls } = fakeApi();
    const wallets = memoryWallets();
    const pay = (sku: string, charge: string, amount: number, expires?: number) => handleUpdate({
      message: {
        ...private_(7),
        successful_payment: {
          currency: 'XTR', total_amount: amount, invoice_payload: JSON.stringify({ u: 7, s: sku }), telegram_payment_charge_id: charge,
          ...(expires ? { subscription_expiration_date: expires } : {}),
        },
      },
    }, api, wallets, 'https://t.me/bot/app', NOW);
    await pay('skin.warrior.shadow', 'c1', 75);
    await pay('skin.warrior.shadow', 'c1', 75);
    expect(wallets.store.get(7)!.owned).toEqual(['skin.warrior.shadow']);
    expect(calls.at(-1)).toMatchObject({ method: 'sendMessage', params: { chat_id: 7 } });
    await pay('patron', 'p1', 99, Math.floor(NOW / 1000) + 3600);
    expect(isPatron(wallets.store.get(7)!, NOW + 1000)).toBe(true);
    expect(isPatron(wallets.store.get(7)!, NOW + 7200_000)).toBe(false);
    await handleUpdate({
      message: { ...private_(7), refunded_payment: { invoice_payload: JSON.stringify({ u: 7, s: 'skin.warrior.shadow' }), telegram_payment_charge_id: 'c1' } },
    }, api, wallets, '', NOW);
    expect(wallets.store.get(7)!.owned).toEqual([]);
  });

  it('answers /paysupport, /terms and anything else with the play button', async () => {
    const { api, calls } = fakeApi();
    const wallets = memoryWallets();
    for (const text of ['/paysupport', '/terms@pixel_dungeon_gamebot', 'hello']) {
      await handleUpdate({ message: { ...private_(7), text } }, api, wallets, 'https://t.me/bot/app', NOW);
    }
    expect(calls).toHaveLength(3);
    expect(String(calls[0]!.params.text)).toMatch(/вернём звёзды/);
    expect(String(calls[1]!.params.text)).toMatch(/подписка/);
    expect(String(calls[2]!.params.text)).toMatch(/Ann/);
    expect(calls[2]!.params.reply_markup).toEqual({ inline_keyboard: [[{ text: 'Играть в Pixel Dungeon', url: 'https://t.me/bot/app' }]] });
  });

  it('ignores groups and other bots', async () => {
    const { api, calls } = fakeApi();
    await handleUpdate({ message: { chat: { id: 1, type: 'group' }, from: { id: 1 }, text: '/start' } }, api, memoryWallets(), '', NOW);
    await handleUpdate({ message: { chat: { id: 2, type: 'private' }, from: { id: 2, is_bot: true }, text: '/start' } }, api, memoryWallets(), '', NOW);
    expect(calls).toHaveLength(0);
  });
});
