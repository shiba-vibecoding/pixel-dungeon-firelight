import type { Env } from './index';
import type { Wallets } from './payments';
import type { WalletChange, WalletView } from './wallet';

/** The changes that alter what a player may show on a board: wearing something, a refund that takes a purchase back, a gift taken back. */
const CHANGES_WORN = new Set<WalletChange['kind']>(['equip', 'refund', 'revokeGift']);

/**
 * Wallets by Telegram user id. Each change runs inside the user's own object (WalletStore, index.ts), which is named `tg<id>`.
 * `afterWorn(user)` is told once a change that alters what the player wears or owns has been applied (the open boards are patched then).
 */
export function walletsOf(env: Pick<Env, 'WALLET'>, afterWorn?: (user: number) => void): Wallets {
  const stub = (user: number): DurableObjectStub => env.WALLET.get(env.WALLET.idFromName(`tg${user}`));
  return {
    async get(user) {
      return (await (await stub(user).fetch('https://wallet/')).json()) as WalletView;
    },
    async apply(user, change: WalletChange) {
      const response = await stub(user).fetch('https://wallet/apply', { method: 'POST', body: JSON.stringify(change) });
      if (!response.ok) throw new Error(`wallet ${change.kind}: ${response.status}`);
      if (afterWorn && CHANGES_WORN.has(change.kind)) afterWorn(user);
      return (await response.json()) as WalletView;
    },
  };
}
