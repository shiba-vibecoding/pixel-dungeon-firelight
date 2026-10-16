import type { Env } from './index';
import type { Wallets } from './payments';
import type { WalletChange, WalletView } from './wallet';

/** Wallets by Telegram user id. Each change runs inside the user's own object (WalletStore, index.ts), which is named `tg<id>`. */
export function walletsOf(env: Pick<Env, 'WALLET'>): Wallets {
  const stub = (user: number): DurableObjectStub => env.WALLET.get(env.WALLET.idFromName(`tg${user}`));
  return {
    async get(user) {
      return (await (await stub(user).fetch('https://wallet/')).json()) as WalletView;
    },
    async apply(user, change: WalletChange) {
      const response = await stub(user).fetch('https://wallet/apply', { method: 'POST', body: JSON.stringify(change) });
      if (!response.ok) throw new Error(`wallet ${change.kind}: ${response.status}`);
      return (await response.json()) as WalletView;
    },
  };
}
