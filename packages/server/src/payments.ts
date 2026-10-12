import { emptyWallet, forSale, inSeason, offerBySku, SUBSCRIPTION_SECONDS, type Wallet, walletPay, walletRefund } from '@pd/core';

/*
 * Pixel-Mart's payments in Telegram Stars (core.telegram.org/bots/payments-stars):
 * the server makes an invoice link for a player (createInvoiceLink, currency
 * XTR, no provider token); Telegram asks the bot's webhook to confirm the
 * checkout (pre_checkout_query, within 10 seconds), then tells it the payment
 * went through (successful_payment) or was refunded (refunded_payment), and
 * the player's wallet is updated. The same webhook answers the bot's commands:
 * /start, /paysupport and /terms, which Telegram's rules for payments require.
 *
 * Kept apart from the Worker so it can be tested with a fake Bot API.
 */

/** A call to the Bot API: method and parameters in, its `result` out. */
export type BotApi = (method: string, params: Record<string, unknown>) => Promise<unknown>;

/** A player's wallet, wherever it is kept. */
export interface Wallets {
  get(user: number): Promise<Wallet>;
  update(user: number, change: (wallet: Wallet) => Wallet): Promise<Wallet>;
}

/** What an invoice carries back to the webhook: who pays and for what (at most 128 bytes). */
interface Payload {
  u: number;
  s: string;
}

function parsePayload(text: unknown): Payload | null {
  try {
    const payload = JSON.parse(String(text)) as Payload;
    return typeof payload.u === 'number' && typeof payload.s === 'string' ? payload : null;
  } catch {
    return null;
  }
}

export interface InvoiceText {
  title: string;
  description: string;
}

/** An invoice link for an offer, or why there is none. */
export async function createInvoice(
  api: BotApi, user: number, sku: string, text: InvoiceText, now = Date.now(),
): Promise<{ link: string } | { error: string }> {
  const offer = offerBySku(sku);
  if (!offer || !forSale(offer)) return { error: 'not for sale' };
  if (!inSeason(offer, now)) return { error: 'out of season' };
  const payload: Payload = { u: user, s: offer.sku };
  const link = await api('createInvoiceLink', {
    title: text.title.slice(0, 32),
    description: text.description.slice(0, 255),
    payload: JSON.stringify(payload),
    currency: 'XTR',
    prices: [{ label: text.title.slice(0, 32), amount: offer.stars }],
    ...(offer.subscription ? { subscription_period: SUBSCRIPTION_SECONDS } : {}),
  });
  return typeof link === 'string' ? { link } : { error: 'telegram refused' };
}

/** What the bot says, in the player's language. */
export interface BotText {
  greeting(name: string): string;
  play: string;
  thanks: string;
  paySupport: string;
  terms: string;
}

const EN: BotText = {
  greeting: (name) => `The dungeon awaits, ${name}. Go down, and mind the traps.`,
  play: 'Play Pixel Dungeon',
  thanks: 'Thank you! It is yours: open the game to wear it.',
  paySupport:
    'Trouble with a purchase? Write here what happened and when; we answer within two days and refund Stars ' +
    'for anything that did not arrive. Purchases are looks only: they never change the game itself.',
  terms:
    'Pixel-Mart sells looks for Telegram Stars: hero recolours, effects and portrait frames, and a monthly ' +
    'patronage. They change nothing in the game. Purchases are kept by your Telegram account; a patronage renews ' +
    'monthly until cancelled in Telegram. Refunds through /paysupport.',
};

const RU: BotText = {
  greeting: (name) => `Подземелье ждёт, ${name}. Спускайтесь и смотрите под ноги.`,
  play: 'Играть в Pixel Dungeon',
  thanks: 'Спасибо! Покупка ваша — откройте игру, чтобы надеть её.',
  paySupport:
    'Что-то не так с покупкой? Напишите сюда, что и когда случилось: ответим в течение двух дней и вернём звёзды ' +
    'за то, что не пришло. Все покупки — только облик, на саму игру они не влияют.',
  terms:
    'В Пиксель-Марте за звёзды Telegram продаётся облик: перекраски героев, эффекты, рамки портрета и подписка ' +
    '«Покровитель» на месяц. На игру они не влияют. Покупки привязаны к вашему аккаунту Telegram; подписка ' +
    'продлевается каждый месяц, пока вы не отмените её в Telegram. Возврат — через /paysupport.',
};

const textFor = (language?: string): BotText => (/^(ru|uk|be|kk)/i.test(language ?? '') ? RU : EN);

interface TelegramUpdate {
  pre_checkout_query?: { id: string; from: { id: number }; currency: string; total_amount: number; invoice_payload: string };
  message?: {
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; language_code?: string; is_bot?: boolean };
    text?: string;
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
      subscription_expiration_date?: number;
    };
    refunded_payment?: { invoice_payload: string; telegram_payment_charge_id: string };
  };
}

/** Handles one webhook update. `appLink` is the Mini App's t.me link, for the play button. */
export async function handleUpdate(update: TelegramUpdate, api: BotApi, wallets: Wallets, appLink: string, now = Date.now()): Promise<void> {
  const checkout = update.pre_checkout_query;
  if (checkout) {
    // Confirm only what we sell, at its price, to whom it was made out.
    const payload = parsePayload(checkout.invoice_payload);
    const offer = payload && offerBySku(payload.s);
    const ok = !!offer && forSale(offer) && checkout.currency === 'XTR' && checkout.total_amount === offer.stars && payload!.u === checkout.from.id;
    await api('answerPreCheckoutQuery', ok
      ? { pre_checkout_query_id: checkout.id, ok: true }
      : { pre_checkout_query_id: checkout.id, ok: false, error_message: 'This offer is no longer available.' });
    return;
  }
  const message = update.message;
  if (!message || message.chat.type !== 'private' || message.from?.is_bot) return;
  const text = textFor(message.from?.language_code);

  const paid = message.successful_payment;
  if (paid) {
    const payload = parsePayload(paid.invoice_payload);
    if (payload && paid.currency === 'XTR') {
      const expires = paid.subscription_expiration_date ? paid.subscription_expiration_date * 1000 : undefined;
      await wallets.update(payload.u, (wallet) => walletPay(wallet, payload.s, paid.telegram_payment_charge_id, paid.total_amount, now, expires));
      await api('sendMessage', { chat_id: message.chat.id, text: text.thanks, ...playButton(text, appLink) });
    }
    return;
  }
  const refund = message.refunded_payment;
  if (refund) {
    const payload = parsePayload(refund.invoice_payload);
    if (payload) await wallets.update(payload.u, (wallet) => walletRefund(wallet, refund.telegram_payment_charge_id));
    return;
  }

  const command = (message.text ?? '').trim().split(/\s|@/)[0]!.toLowerCase();
  const reply =
    command === '/paysupport' ? text.paySupport
    : command === '/terms' ? text.terms
    : text.greeting(message.from?.first_name ?? '');
  await api('sendMessage', { chat_id: message.chat.id, text: reply, ...playButton(text, appLink) });
}

function playButton(text: BotText, appLink: string): Record<string, unknown> {
  return appLink ? { reply_markup: { inline_keyboard: [[{ text: text.play, url: appLink }]] } } : {};
}

/** The Bot API over HTTPS. */
export function botApi(token: string): BotApi {
  return async (method, params) => {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const body = (await response.json()) as { ok: boolean; result?: unknown; description?: string };
    if (!body.ok) throw new Error(`${method}: ${body.description ?? response.status}`);
    return body.result;
  };
}

export { emptyWallet };
