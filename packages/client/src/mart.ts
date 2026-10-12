import { type EffectId, type FrameId, forSale, type HeroClass, inSeason, type Look, type Offer, offerBySku, OFFERS, type SkinVariant } from '@pd/core';
import { earnedBadges } from './badges';
import { initData, inTelegram, openInvoice } from './telegram';

/*
 * Pixel-Mart on the client: what this player owns (the server's wallet, by
 * their Telegram account), what they wear (kept on the device), and buying
 * (a Stars invoice opened in Telegram). Nothing here changes the game: it is
 * all looks (MONETIZATION.md).
 *
 * Outside Telegram nothing can be bought; a development build fakes purchases
 * on the device instead, to try the shop out.
 */

const LOOK_KEY = 'pd-look';
const DEV_KEY = 'pd-dev-owned';

/** What is worn: a look for each class, one effect, one frame. */
interface Worn {
  skins: Partial<Record<HeroClass, SkinVariant>>;
  effect?: EffectId;
  frame?: FrameId;
}

function load<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Kept for this session only.
  }
}

type Listener = () => void;

class Mart {
  /** Bought looks, by sku. */
  private owned = new Set<string>(import.meta.env.DEV ? load<string[]>(DEV_KEY, []) : []);
  private patronUntil = import.meta.env.DEV ? load<number | null>(`${DEV_KEY}-patron`, null) : null;
  private tipped = 0;
  private worn: Worn = load<Worn>(LOOK_KEY, { skins: {} });
  private listeners: Listener[] = [];
  private server = '';

  /** Payments go through the co-op server; without one (or outside Telegram) the shop only shows. */
  get open(): boolean {
    return (Boolean(this.server) && inTelegram) || import.meta.env.DEV;
  }

  get patron(): boolean {
    return (this.patronUntil ?? 0) > Date.now();
  }

  get patronUntilDate(): Date | null {
    return this.patronUntil ? new Date(this.patronUntil) : null;
  }

  /** The «Patron of the arts» badge: anyone who tipped or is a patron. */
  get maecenas(): boolean {
    return this.tipped > 0 || this.patron;
  }

  onChange(listener: Listener): void {
    this.listeners.push(listener);
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  /** Learns what this player owns from the server. */
  async refresh(server: string): Promise<void> {
    this.server = server;
    if (!server || !inTelegram) return;
    try {
      const response = await fetch(`${server.replace(/^ws/, 'http')}/shop/me`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: initData() }),
      });
      if (!response.ok) return;
      const me = (await response.json()) as { owned: string[]; patronUntil: number | null; tipped: number };
      this.owned = new Set(me.owned);
      this.patronUntil = me.patronUntil;
      this.tipped = me.tipped;
      this.changed();
    } catch {
      // Offline: what was known stays.
    }
  }

  /** Whether an offer is this player's: bought, opened by a badge, or the patron's frame while a patron. */
  owns(offer: Offer): boolean {
    if (offer.kind === 'frame' && offer.frame === 'patron') return this.patron;
    if (offer.kind === 'patron') return this.patron;
    return this.owned.has(offer.sku) || (offer.badge !== undefined && earnedBadges().has(offer.badge as never));
  }

  /** What a hero of a class wears, of what this player may. */
  look(heroClass: HeroClass): Look {
    const look: Look = {};
    const skin = this.worn.skins[heroClass];
    if (skin && this.owns(offerBySku(`skin.${heroClass}.${skin}`)!)) look.skin = skin;
    if (this.worn.effect && this.owns(offerBySku(`effect.${this.worn.effect}`)!)) look.effect = this.worn.effect;
    if (this.worn.frame && this.owns(offerBySku(`frame.${this.worn.frame}`)!)) look.frame = this.worn.frame;
    if (this.patron) look.patron = true;
    return look;
  }

  isWorn(offer: Offer): boolean {
    if (offer.kind === 'skin') return this.worn.skins[offer.heroClass!] === offer.skin;
    if (offer.kind === 'effect') return this.worn.effect === offer.effect;
    if (offer.kind === 'frame') return this.worn.frame === offer.frame;
    return false;
  }

  /** Puts a look on, or (`on` false) takes it off. */
  wear(offer: Offer, on = true): void {
    if (offer.kind === 'skin') {
      if (on) this.worn.skins[offer.heroClass!] = offer.skin;
      else delete this.worn.skins[offer.heroClass!];
    } else if (offer.kind === 'effect') {
      this.worn.effect = on ? offer.effect : undefined;
    } else if (offer.kind === 'frame') {
      this.worn.frame = on ? offer.frame : undefined;
    }
    save(LOOK_KEY, this.worn);
    this.changed();
  }

  /** What can be bought now: for sale and in season. */
  buyable(offer: Offer, now = Date.now()): boolean {
    return forSale(offer) && inSeason(offer, now) && !this.owns(offer);
  }

  /**
   * Buys an offer: a Stars invoice in Telegram, then the wallet again. In a
   * development build outside Telegram it is granted on the device at once.
   */
  async buy(offer: Offer, text: { title: string; description: string }): Promise<'paid' | 'cancelled' | 'failed' | 'pending'> {
    if (!inTelegram && import.meta.env.DEV) {
      if (offer.kind === 'patron') {
        this.patronUntil = Date.now() + 30 * 86_400_000;
        save(`${DEV_KEY}-patron`, this.patronUntil);
      } else if (offer.kind === 'tip') {
        this.tipped += offer.stars;
      } else {
        this.owned.add(offer.sku);
        save(DEV_KEY, [...this.owned]);
      }
      this.changed();
      return 'paid';
    }
    if (!this.open) return 'failed';
    try {
      const response = await fetch(`${this.server.replace(/^ws/, 'http')}/shop/invoice`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: initData(), sku: offer.sku, ...text }),
      });
      const body = (await response.json()) as { link?: string };
      if (!body.link) return 'failed';
      const status = await openInvoice(body.link);
      // The webhook records the payment a moment after Telegram reports it.
      if (status === 'paid' || status === 'pending') {
        for (const wait of [800, 2000, 5000]) {
          await new Promise((resolve) => setTimeout(resolve, wait));
          await this.refresh(this.server);
          if (this.owns(offer) || offer.kind === 'tip') break;
        }
      }
      return status;
    } catch {
      return 'failed';
    }
  }
}

export const mart = new Mart();

/** The offers of a shelf, for one hero class where it matters. */
export function shelf(kind: 'skin' | 'effect' | 'frame', heroClass: HeroClass): Offer[] {
  return OFFERS.filter((offer) => offer.kind === kind && (kind !== 'skin' || offer.heroClass === heroClass));
}
