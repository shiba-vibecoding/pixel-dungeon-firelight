import { emptyWallet, type Wallet, walletPay, walletRefund } from '@pd/core';

/*
 * A change to a player's Pixel-Mart wallet, as the wallet's own Durable
 * Object applies it (WalletStore, index.ts). The object reads the wallet,
 * applies the change and writes it back within one request, with nothing
 * but storage calls in between, so two payments arriving together can never
 * overwrite each other. Each change names its Telegram charge, so a payment
 * delivered twice counts once, and a refunded charge is remembered: a
 * payment Telegram sends again after its refund does not come back.
 */

export type WalletChange =
  | { kind: 'pay'; sku: string; charge: string; stars: number; at: number; expiresAt?: number }
  | { kind: 'refund'; charge: string };

/** A wallet as stored, with the charges refunded so far. */
export interface WalletRecord {
  wallet: Wallet;
  refunded: string[];
}

/** How many refunded charges are remembered; refunds are rare, and a payment is redelivered within days. */
export const REFUNDS_KEPT = 500;

export function applyWalletChange(record: WalletRecord, change: WalletChange): WalletRecord {
  if (change.kind === 'pay') {
    if (record.refunded.includes(change.charge)) return record;
    return { ...record, wallet: walletPay(record.wallet, change.sku, change.charge, change.stars, change.at, change.expiresAt) };
  }
  const wallet = walletRefund(record.wallet, change.charge);
  const refunded = record.refunded.includes(change.charge) ? record.refunded : [...record.refunded, change.charge].slice(-REFUNDS_KEPT);
  return { wallet, refunded };
}

/** A change as it came over HTTP, checked, or null. */
export function parseWalletChange(raw: unknown): WalletChange | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.charge !== 'string' || !c.charge) return null;
  if (c.kind === 'refund') return { kind: 'refund', charge: c.charge };
  if (c.kind !== 'pay' || typeof c.sku !== 'string' || !Number.isFinite(c.stars) || !Number.isFinite(c.at)) return null;
  return {
    kind: 'pay', sku: c.sku, charge: c.charge, stars: c.stars as number, at: c.at as number,
    ...(Number.isFinite(c.expiresAt) ? { expiresAt: c.expiresAt as number } : {}),
  };
}

export const emptyRecord = (): WalletRecord => ({ wallet: emptyWallet(), refunded: [] });

/** A wallet's charges, newest first: what support needs to find a payment. */
export function recentCharges(wallet: Wallet, count: number): Array<{ charge: string; sku: string; stars: number; at: number }> {
  return Object.entries(wallet.charges)
    .map(([charge, paid]) => ({ charge, ...paid }))
    .sort((a, b) => b.at - a.at)
    .slice(0, count);
}
