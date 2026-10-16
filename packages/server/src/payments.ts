import { emptyWallet, forSale, inSeason, type Offer, offerBySku, SUBSCRIPTION_SECONDS, type Wallet } from '@pd/core';
import { forSale as itemForSale, type Item, itemById, isPassSku, passSeason } from '../../client/src/catalog';
import { ADMIN_USAGE, type AdminCommand, type AdminOps, describePayments, isAdminChat, parseAdminCommand } from './admin';
import { SEASON } from './boards';
import { type InvoiceText, invoiceText, itemInvoiceText, speaksRussian } from './catalogue';
import type { WindowLimiter } from './limits';
import { type GiftTarget, recentCharges, shopOf, type WalletChange, type WalletView } from './wallet';

/*
 * Pixel-Mart's payments in Telegram Stars (core.telegram.org/bots/payments-stars):
 * the server makes an invoice link for a player (createInvoiceLink, currency
 * XTR, no provider token); Telegram asks the bot's webhook to confirm the
 * checkout (pre_checkout_query, within 10 seconds), then tells it the payment
 * went through (successful_payment) or was refunded (refunded_payment), and
 * the player's wallet is updated. The same webhook answers the bot's commands:
 * /start, /paysupport and /terms, which Telegram's rules for payments require,
 * passes what players write to support on to the admin, and takes the admin's
 * own commands (admin.ts).
 *
 * Kept apart from the Worker so it can be tested with a fake Bot API.
 */

/** A call to the Bot API: method and parameters in, its `result` out. */
export type BotApi = (method: string, params: Record<string, unknown>) => Promise<unknown>;

/** Players' wallets, wherever they are kept; a change is applied where the wallet is, all at once (wallet.ts). */
export interface Wallets {
  get(user: number): Promise<WalletView>;
  apply(user: number, change: WalletChange): Promise<WalletView>;
}

/**
 * What an invoice carries back to the webhook: who pays and for what (at most 128 bytes). A gift names its friend (`g`, a Telegram
 * id) or its share link (`l`, a code that starts with the giver's id).
 */
export interface Payload {
  u: number;
  s: string;
  g?: number;
  l?: string;
}

function parsePayload(text: unknown): Payload | null {
  try {
    const payload = JSON.parse(String(text)) as Payload;
    if (typeof payload.u !== 'number' || typeof payload.s !== 'string') return null;
    if (payload.g !== undefined && (!Number.isInteger(payload.g) || payload.g <= 0 || payload.g === payload.u)) return null;
    if (payload.l !== undefined && (typeof payload.l !== 'string' || !payload.l.startsWith(`${payload.u}_`))) return null;
    return payload;
  } catch {
    return null;
  }
}

/** What is for sale under a sku: its price, its words and whether it renews. Without a price, why not. */
interface Priced {
  stars: number;
  subscription: boolean;
  text(language: string | undefined, gift: boolean): InvoiceText;
  /** A catalogue item (or bundle), as against the first shop's offers. */
  item?: Item;
}

function priced(sku: string, now: number, season: number): Priced | { error: string } {
  const offer: Offer | undefined = offerBySku(sku);
  if (offer) {
    if (!forSale(offer)) return { error: 'not for sale' };
    if (!inSeason(offer, now)) return { error: 'out of season' };
    return { stars: offer.stars, subscription: Boolean(offer.subscription), text: (language) => invoiceText(offer, language) };
  }
  const entry = itemById(sku);
  if (!entry || !itemForSale(entry)) return { error: 'not for sale' };
  // Only the pass of the season now on is sold.
  if (isPassSku(sku) && passSeason(sku) !== season) return { error: 'out of season' };
  return { stars: entry.stars, subscription: false, item: entry, text: (language, gift) => itemInvoiceText(entry, language, gift) };
}

/** What an invoice may be made with. */
export interface InvoiceOptions {
  /** A gift for a friend (by Telegram id) or for whoever opens a share link (its code). */
  gift?: { to: number } | { link: string };
  /** What the one who will have it owns already (the buyer, or the friend). */
  owned?: ReadonlySet<string>;
  /** The season the pass sold is of (the world's; tests give their own). */
  season?: number;
}

/** An invoice link for an offer, worded from the server's catalogue in the buyer's language, or why there is none. */
export async function createInvoice(
  api: BotApi, user: number, sku: string, language?: string, now = Date.now(), options: InvoiceOptions = {},
): Promise<{ link: string } | { error: string }> {
  const offer = priced(sku, now, options.season ?? SEASON);
  if ('error' in offer) return offer;
  const gift = options.gift;
  // Only the catalogue's things can be given, and not to oneself.
  if (gift && (!offer.item || ('to' in gift && gift.to === user))) return { error: 'cannot be a gift' };
  if (offer.item && options.owned && (offer.item.items ?? [offer.item.id]).every((id) => options.owned!.has(id))) return { error: 'already owned' };
  const text = offer.text(language, Boolean(gift));
  const payload: Payload = { u: user, s: sku, ...(gift && 'to' in gift ? { g: gift.to } : {}), ...(gift && 'link' in gift ? { l: gift.link } : {}) };
  const link = await api('createInvoiceLink', {
    title: text.title,
    description: text.description,
    payload: JSON.stringify(payload),
    currency: 'XTR',
    prices: [{ label: text.title, amount: offer.stars }],
    ...(offer.subscription ? { subscription_period: SUBSCRIPTION_SECONDS } : {}),
  });
  return typeof link === 'string' ? { link } : { error: 'telegram refused' };
}

/** True if a checkout is for something on sale today, at its price, in Stars, by whom it was made out to. */
export function checkoutValid(checkout: NonNullable<TelegramUpdate['pre_checkout_query']>, now: number, season: number = SEASON): boolean {
  const payload = parsePayload(checkout.invoice_payload);
  const offer = payload && priced(payload.s, now, season);
  if (!payload || !offer || 'error' in offer) return false;
  // A gift is of the catalogue's things only.
  if ((payload.g !== undefined || payload.l !== undefined) && !offer.item) return false;
  return checkout.currency === 'XTR' && checkout.total_amount === offer.stars && payload.u === checkout.from.id;
}

/** What the bot says, in the player's language. */
export interface BotText {
  greeting(name: string): string;
  play: string;
  thanks: string;
  /** To the giver once a gift is paid: it is in the friend's mail. */
  giftDelivered: string;
  /** To the giver once a gift link is paid: the link to pass on. */
  giftLink(link: string): string;
  paySupport: string;
  /** A message to support went to the admin. */
  passedOn: string;
  /** There is no admin chat to pass it to (ADMIN_CHAT_ID unset), or the player wrote too much at once. */
  writeDirectly: string;
  terms: string;
  fullTerms: string;
}

/** Where players can always reach a person. */
const CONTACT = '@barboskich';

const EN: BotText = {
  greeting: (name) => `The dungeon awaits, ${name}. Go down, and mind the traps.`,
  play: 'Play Pixel Dungeon',
  thanks: 'Thank you! It is yours: open the game to wear it.',
  giftDelivered: 'Thank you! The gift is in your friend’s mail in the game.',
  giftLink: (link) => `Thank you! Send this link to a friend: whoever opens it first gets the gift.
${link}`,
  paySupport:
    'Trouble with a purchase? Write here, in one message, what happened and when; it goes to the developer, who ' +
    'answers within two days and refunds Stars for anything that did not arrive. Purchases are looks only: they ' +
    'never change the game itself.',
  passedOn: 'Thank you, your message has been passed on. The developer will answer here within two days.',
  writeDirectly: `Please write to ${CONTACT} about it: they answer within two days.`,
  terms:
    'Pixel-Mart sells looks for Telegram Stars: hero recolours, effects and portrait frames, and a monthly ' +
    'patronage. They change nothing in the game. Purchases are kept by your Telegram account; a patronage renews ' +
    'monthly until cancelled in Telegram. Refunds through /paysupport.',
  fullTerms: 'The full terms:',
};

const RU: BotText = {
  greeting: (name) => `Подземелье ждёт, ${name}. Спускайтесь и смотрите под ноги.`,
  play: 'Играть в Pixel Dungeon',
  thanks: 'Спасибо! Покупка ваша — откройте игру, чтобы надеть её.',
  giftDelivered: 'Спасибо! Подарок лежит в почте у вашего друга, в игре.',
  giftLink: (link) => `Спасибо! Отправьте эту ссылку другу: подарок достанется тому, кто откроет её первым.
${link}`,
  paySupport:
    'Что-то не так с покупкой? Напишите сюда одним сообщением, что и когда случилось: оно уйдёт разработчику, ' +
    'он ответит в течение двух дней и вернёт звёзды за то, что не пришло. Все покупки — только облик, на саму ' +
    'игру они не влияют.',
  passedOn: 'Спасибо, ваше сообщение передано. Разработчик ответит здесь в течение двух дней.',
  writeDirectly: `Пожалуйста, напишите об этом ${CONTACT}: ответ — в течение двух дней.`,
  terms:
    'В Пиксель-Марте за звёзды Telegram продаётся облик: перекраски героев, эффекты, рамки портрета и подписка ' +
    '«Покровитель» на месяц. На игру они не влияют. Покупки привязаны к вашему аккаунту Telegram; подписка ' +
    'продлевается каждый месяц, пока вы не отмените её в Telegram. Возврат — через /paysupport.',
  fullTerms: 'Полные условия:',
};

const textFor = (language?: string): BotText => (speaksRussian(language) ? RU : EN);

export interface TelegramUpdate {
  pre_checkout_query?: { id: string; from: { id: number }; currency: string; total_amount: number; invoice_payload: string };
  message?: {
    message_id?: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string; is_bot?: boolean };
    text?: string;
    caption?: string;
    photo?: unknown;
    document?: unknown;
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

type Message = NonNullable<TelegramUpdate['message']>;

/** How the bot is set up (wrangler.jsonc). */
export interface BotConfig {
  /** The Mini App's t.me link, for the play button. */
  appLink: string;
  /** The chat that receives support messages and may give admin commands (admin.ts). */
  adminChatId?: string;
  /** The terms page, for /terms. */
  termsUrl?: string;
  /** How often one player's messages reach the admin; unlimited without one. */
  supportLimiter?: WindowLimiter;
  /** What /bughunter and /outage do (the Worker's); without it they say they cannot. */
  ops?: AdminOps;
}

/** Handles one webhook update. */
export async function handleUpdate(update: TelegramUpdate, api: BotApi, wallets: Wallets, config: BotConfig, now = Date.now()): Promise<void> {
  const checkout = update.pre_checkout_query;
  if (checkout) {
    // Confirm only what we sell today, at its price, to whom it was made out.
    await api('answerPreCheckoutQuery', checkoutValid(checkout, now)
      ? { pre_checkout_query_id: checkout.id, ok: true }
      : { pre_checkout_query_id: checkout.id, ok: false, error_message: 'This offer is no longer available.' });
    return;
  }
  const message = update.message;
  if (!message || message.from?.is_bot) return;

  // The admin's chat may be a group: its commands are taken before the private-chat check.
  if (isAdminChat(message.chat.id, config.adminChatId)) {
    const command = parseAdminCommand(message.text ?? '');
    if (command) {
      await runAdminCommand(command, message.chat.id, api, wallets, config.ops, now);
      return;
    }
  }
  if (message.chat.type !== 'private') return;
  const text = textFor(message.from?.language_code);

  const paid = message.successful_payment;
  if (paid) {
    const payload = parsePayload(paid.invoice_payload);
    if (payload && paid.currency === 'XTR') {
      const expiresAt = paid.subscription_expiration_date ? paid.subscription_expiration_date * 1000 : undefined;
      const charge = paid.telegram_payment_charge_id;
      const gift: GiftTarget | undefined = payload.g !== undefined ? { to: payload.g } : payload.l !== undefined ? { link: payload.l } : undefined;
      const after = await wallets.apply(payload.u, {
        kind: 'pay', sku: payload.s, charge, stars: paid.total_amount, at: now, ...(expiresAt ? { expiresAt } : {}), ...(gift ? { gift } : {}),
      });
      let reply = text.thanks;
      if (gift && 'link' in gift) {
        reply = text.giftLink(config.appLink ? `${config.appLink}?startapp=gift_${gift.link}` : gift.link);
      } else if (gift) {
        // The friend's mail gets it now; if that cannot be done the giver's wallet remembers it is owed (redeliver, shopapi.ts).
        await deliverGift(api, wallets, payload.u, message.from, charge, after, config).catch(() => false);
        reply = text.giftDelivered;
      }
      await api('sendMessage', { chat_id: message.chat.id, text: reply, ...playButton(text, config.appLink) });
    }
    return;
  }
  const refund = message.refunded_payment;
  if (refund) {
    const payload = parsePayload(refund.invoice_payload);
    if (payload) await refundCharge(wallets, payload.u, refund.telegram_payment_charge_id);
    return;
  }

  const words = (message.text ?? '').trim();
  const command = words.startsWith('/') ? words.split(/\s|@/)[0]!.toLowerCase() : '';
  // "/paysupport <what happened>" is a message to support as much as one written after it.
  const toSupport = command === '/paysupport' ? /\s\S/.test(words) : !command && isSupportMessage(message);
  // The admin writing to the bot is not a support request to themselves.
  if (toSupport && message.from && !isAdminChat(message.chat.id, config.adminChatId)) {
    await passOn(message, text, api, wallets, config, now);
    return;
  }
  const reply =
    command === '/paysupport' ? text.paySupport
    : command === '/terms' ? (config.termsUrl ? `${text.terms}\n\n${text.fullTerms} ${config.termsUrl}` : text.terms)
    : text.greeting(message.from?.first_name ?? '');
  await api('sendMessage', { chat_id: message.chat.id, text: reply, ...playButton(text, config.appLink) });
}

/** A player's own words (or picture, or file), not a sticker or a service message. */
function isSupportMessage(message: Message): boolean {
  return message.message_id !== undefined && !!(message.text?.trim() || message.caption || message.photo || message.document);
}

/** Who wrote and what they paid for, so the admin can find the payment. */
export function supportHeader(from: NonNullable<Message['from']>, wallet: Wallet): string {
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ');
  const charges = recentCharges(wallet, 5).map((c) => `${c.charge} (${c.sku}, ${c.stars}★)`);
  return [
    `Support message from ${from.id}${from.username ? ` @${from.username}` : ''}${name ? ` (${name})` : ''}`,
    charges.length ? `Recent charges: ${charges.join(', ')}` : 'No payments',
    `Answer: /reply ${from.id} <text>`,
  ].join('\n');
}

/** Passes a player's message to the admin, and tells the player it was passed on (or where to write). */
async function passOn(message: Message, text: BotText, api: BotApi, wallets: Wallets, config: BotConfig, now: number): Promise<void> {
  const from = message.from!;
  const admin = config.adminChatId?.trim();
  if (!admin || (config.supportLimiter && !config.supportLimiter.allow(String(from.id), now))) {
    await api('sendMessage', { chat_id: message.chat.id, text: text.writeDirectly });
    return;
  }
  await api('sendMessage', { chat_id: admin, text: supportHeader(from, await wallets.get(from.id)) });
  await api('forwardMessage', { chat_id: admin, from_chat_id: message.chat.id, message_id: message.message_id });
  await api('sendMessage', { chat_id: message.chat.id, text: text.passedOn });
}

async function runAdminCommand(command: AdminCommand, chat: number, api: BotApi, wallets: Wallets, ops: AdminOps | undefined, now: number): Promise<void> {
  const say = (text: string): Promise<unknown> => api('sendMessage', { chat_id: chat, text });
  switch (command.kind) {
    case 'usage':
      await say(ADMIN_USAGE);
      return;
    case 'bughunter': {
      if (!ops) return void (await say('Not available here.'));
      const result = await ops.bugHunter(command.id);
      await say(result === 'unknown' ? `No report ${command.id}.` : result === 'already' ? `Report ${command.id}: its reporter has the badge already.` : `Report ${command.id}: the reporter got the «Bug hunter» badge.`);
      return;
    }
    case 'outage': {
      if (!ops) return void (await say('Not available here.'));
      const days = await ops.outages(command.op === 'list' ? undefined : { op: command.op, day: command.day });
      const head = command.op === 'add' ? `Outage day ${command.day} added.` : command.op === 'remove' ? `Outage day ${command.day} taken off.` : 'Outage days:';
      const list = days.length > 0 ? `\n${days.join('\n')}` : command.op === 'list' ? ' none' : '\nNo outage days.';
      await say(`${head}${list}`);
      return;
    }
    case 'payments':
      await say(describePayments(command.user, await wallets.get(command.user), now));
      return;
    case 'reply':
      try {
        await api('sendMessage', { chat_id: command.user, text: command.text });
        await say(`Sent to ${command.user}.`);
      } catch (error) {
        await say(`Not sent: ${(error as Error).message}`);
      }
      return;
    case 'refund': {
      try {
        await api('refundStarPayment', { user_id: command.user, telegram_payment_charge_id: command.charge });
      } catch (error) {
        await say(`Telegram refused the refund: ${(error as Error).message}`);
        return;
      }
      // Telegram may also send a refunded_payment message; a refund applied twice changes nothing.
      const before = await wallets.get(command.user);
      const paid = before.charges[command.charge];
      await refundCharge(wallets, command.user, command.charge);
      await say(`Refunded ${command.charge} to ${command.user}${paid ? ` (${paid.sku}, ${paid.stars}★)` : ' (not in the wallet)'}.`);
      return;
    }
  }
}

/** Gives a refund: the charge's goods go from the wallet, and a gift is taken back from the friend it went to. */
export async function refundCharge(wallets: Wallets, user: number, charge: string): Promise<void> {
  const shop = shopOf(await wallets.get(user));
  const sent = shop.sent[charge];
  // Who opened a share link is known to the giver's wallet only, which the refund is about to forget.
  const opener = sent?.link !== undefined ? shop.links[sent.link]?.by : undefined;
  await wallets.apply(user, { kind: 'refund', charge });
  if (sent?.to !== undefined) await wallets.apply(sent.to, { kind: 'revokeGift', id: charge });
  if (sent?.link !== undefined && opener !== undefined) await wallets.apply(opener, { kind: 'revokeGift', id: `l-${sent.link}` });
}

/**
 * Puts a paid gift into the friend's mail (the friend is the payload's `g`), then marks it delivered in the giver's wallet, and
 * tells the friend in the bot. Idempotent: a gift already delivered is not delivered or announced again. True if it was delivered now.
 */
export async function deliverGift(
  api: BotApi, wallets: Wallets, giver: number, from: Message['from'], charge: string, wallet: WalletView, config: BotConfig,
): Promise<boolean> {
  const sent = shopOf(wallet).sent[charge];
  if (!sent || sent.to === undefined || sent.delivered) return false;
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || from?.username;
  await wallets.apply(sent.to, { kind: 'gift', id: charge, sku: sent.sku, from: giver, at: sent.at, ...(name ? { name } : {}) });
  await wallets.apply(giver, { kind: 'delivered', charge });
  try {
    await api('sendMessage', { chat_id: sent.to, text: GIFT_NOTE(name), ...playButton(EN, config.appLink) });
  } catch {
    // The friend may not have started the bot: the gift is in their mail all the same.
  }
  return true;
}

/** Told to the friend in both languages (their own is not known): a gift waits in the game's mail. */
const GIFT_NOTE = (from?: string): string =>
  `🎁 ${from ? `${from} дарит вам подарок` : 'Вам подарок'}: он ждёт в почте игры.
🎁 ${from ? `${from} sent you a gift` : 'A gift for you'}: it is waiting in the game’s mail.`;

function playButton(text: BotText, appLink: string): Record<string, unknown> {
  // Opened over the whole screen (Bot API 8.0 direct links' mode).
  return appLink ? { reply_markup: { inline_keyboard: [[{ text: text.play, url: `${appLink}?mode=fullscreen` }]] } } : {};
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
