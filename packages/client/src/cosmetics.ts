import type { HeroClass } from '@pd/core';
import {
  cleanEquipped, DECOR_MAX, type Equipped, emptyEquipped, grantedBy, isPassSku, type Item, itemById, passSku, type Slot, slotOf,
} from './catalog';
import { levelProgress, PASS_LEVELS, rewardAt, type Track } from './pass';
import { SEASON } from './season';
import { initData, inTelegram, openInvoice } from './telegram';

/*
 * What this player owns and wears from Pixel-Mart's catalogue (catalog.ts): the server's word (the wallet, by their Telegram account),
 * kept on the device so that it still shows while the server cannot be reached. Wearing is the server's too: it refuses what is not
 * owned (server wallet.ts). Nothing here changes the game: it is all looks (MONETIZATION.md).
 *
 * The readers at the foot are the renderer's hooks: the camp reads `fire` and `tint` now; the dungeon's renderer will read `trail`,
 * `hat`, `pet`, `killFx`, `deathFx` and `numbers` when their art arrives (TODO, listed with the catalogue in docs/telegram or the commit).
 *
 * Outside Telegram nothing can be bought; a development build fakes the shop on the device instead, to try it out.
 */

const CACHE_KEY = 'pd-shop2';
const DEV_KEY = 'pd-shop2-dev';
const DEV = import.meta.env.DEV && !inTelegram;

/** Where the player stands on the season pass (the server's passState). */
export interface PassView {
  season: number;
  xp: number;
  level: number;
  into: number;
  need: number;
  /** The paid track is bought. */
  paid: boolean;
  claimed: { free: number[]; paid: number[] };
}

export interface GiftNote {
  id: string;
  sku: string;
  from: number;
  name?: string;
  at: number;
}

interface Saved {
  items: string[];
  equipped: Equipped;
  pass?: PassView;
  /** A development build's pretend XP. */
  devXp?: number;
}

export type BuyStatus = 'paid' | 'cancelled' | 'failed' | 'pending' | 'expired' | 'owned';

function load(key: string): Saved {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Saved>;
      return { items: Array.isArray(saved.items) ? saved.items.filter((id): id is string => typeof id === 'string') : [], equipped: cleanEquipped(saved.equipped), ...(saved.pass ? { pass: saved.pass } : {}), ...(saved.devXp ? { devXp: saved.devXp } : {}) };
    }
  } catch {
    // Nothing kept.
  }
  return { items: [], equipped: emptyEquipped() };
}

const emptyPass = (): PassView => ({ season: SEASON, ...levelProgress(0), xp: 0, paid: false, claimed: { free: [], paid: [] } });

class Cosmetics {
  private saved = load(DEV ? DEV_KEY : CACHE_KEY);
  private items = new Set<string>(this.saved.items);
  private worn: Equipped = this.saved.equipped;
  private passView: PassView = this.saved.pass && this.saved.pass.season === SEASON ? this.saved.pass : emptyPass();
  private gifts: GiftNote[] = [];
  private listeners: Array<() => void> = [];
  private server = '';

  /** Payments go through the co-op server in Telegram; a development build pretends. */
  get open(): boolean {
    return (Boolean(this.server) && inTelegram) || DEV;
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  private changed(): void {
    try {
      localStorage.setItem(DEV ? DEV_KEY : CACHE_KEY, JSON.stringify({ items: [...this.items], equipped: this.worn, pass: this.passView, ...(this.saved.devXp ? { devXp: this.saved.devXp } : {}) } satisfies Saved));
    } catch {
      // Kept for this session only.
    }
    for (const listener of this.listeners) listener();
  }

  private url(route: string): string {
    return `${this.server.replace(/^ws/, 'http')}/shop/${route}`;
  }

  private async post<T>(route: string, body: Record<string, unknown>): Promise<{ status: number; body: T | null }> {
    try {
      const response = await fetch(this.url(route), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: initData(), ...body }),
      });
      return { status: response.status, body: response.ok ? ((await response.json()) as T) : null };
    } catch {
      return { status: 0, body: null };
    }
  }

  /** Learns from the server what this player owns, wears and has reached on the pass. */
  async refresh(server: string): Promise<void> {
    this.server = server;
    if (DEV) {
      this.passView = this.devPass();
      this.changed();
      return;
    }
    if (!server || !inTelegram) return;
    const answer = await this.post<{ items: string[]; equipped: Equipped; pass: PassView; gifts: GiftNote[] }>('me', {});
    if (!answer.body) return;
    this.items = new Set(answer.body.items);
    this.worn = cleanEquipped(answer.body.equipped);
    this.passView = answer.body.pass;
    this.gifts = answer.body.gifts;
    this.changed();
  }

  /* ---- Owning ---- */

  /** Whether an item is this player's. A bundle is: when all its parts are. */
  owns(item: Item): boolean {
    if (item.items) return item.items.every((id) => this.items.has(id));
    return this.items.has(item.id);
  }

  ownsId(id: string): boolean {
    return this.items.has(id);
  }

  get owned(): ReadonlySet<string> {
    return this.items;
  }

  /** Every item the player has, in catalogue order is the storefront's to say. */
  get pass(): PassView {
    return this.passView;
  }

  get waitingGifts(): readonly GiftNote[] {
    return this.gifts;
  }

  /* ---- Wearing ---- */

  get equipped(): Equipped {
    return this.worn;
  }

  isWorn(item: Item): boolean {
    if (item.category === 'decor') return this.worn.decor.includes(item.id);
    const slot = slotOf(item);
    return slot !== null && this.worn.slots[slot] === item.id;
  }

  /** What is worn in a slot, if anything and still owned. */
  inSlot(slot: Slot): Item | undefined {
    const id = this.worn.slots[slot];
    const item = id ? itemById(id) : undefined;
    return item && this.items.has(item.id) ? item : undefined;
  }

  /** Puts an item on, or (`on` false) takes it off. Optimistic: the server's answer settles it. */
  async wear(item: Item, on = true): Promise<boolean> {
    if (!this.items.has(item.id) && on) return false;
    const before = this.worn;
    let body: Record<string, unknown>;
    if (item.category === 'decor') {
      const set = this.worn.decor.filter((id) => id !== item.id);
      if (on) {
        if (set.length >= DECOR_MAX) set.shift();
        set.push(item.id);
      }
      this.worn = { ...this.worn, decor: set };
      body = { decor: set };
    } else {
      const slot = slotOf(item);
      if (!slot) return false;
      const slots = { ...this.worn.slots };
      if (on) slots[slot] = item.id;
      else delete slots[slot];
      this.worn = { ...this.worn, slots };
      body = { slot, id: on ? item.id : null };
    }
    this.changed();
    if (DEV || !this.open) return true;
    const answer = await this.post<{ equipped: Equipped }>('equip', body);
    if (answer.body) {
      this.worn = cleanEquipped(answer.body.equipped);
    } else if (answer.status === 403 || answer.status === 400) {
      // The server does not agree: back to what it has.
      this.worn = before;
    }
    this.changed();
    return answer.body !== null;
  }

  /* ---- Buying, giving ---- */

  /** Buys an item, a bundle or the pass: a Stars invoice in Telegram, then the wallet again. In a development build it is granted on the device. */
  async buy(item: Item): Promise<BuyStatus> {
    if (DEV) {
      this.grant(grantedBy(item.id));
      return 'paid';
    }
    if (!this.open) return 'failed';
    if (this.owns(item)) return 'owned';
    const answer = await this.post<{ link?: string }>('invoice', { sku: item.id });
    if (answer.status === 401) return 'expired';
    if (answer.status === 409) return 'owned';
    if (!answer.body?.link) return 'failed';
    return this.afterInvoice(answer.body.link, () => this.owns(item));
  }

  /** Buys an item as a gift: for a friend by Telegram id, or behind a share link the bot sends on once it is paid. */
  async give(item: Item, to: { friend: number } | { link: true }): Promise<BuyStatus | 'owned-by-friend' | 'bad-friend'> {
    if (DEV) return 'paid';
    if (!this.open) return 'failed';
    const answer = await this.post<{ link?: string }>('gift', 'friend' in to ? { sku: item.id, to: to.friend } : { sku: item.id, link: true });
    if (answer.status === 401) return 'expired';
    if (answer.status === 409) return 'owned-by-friend';
    if (answer.status === 400) return 'bad-friend';
    if (!answer.body?.link) return 'failed';
    return this.afterInvoice(answer.body.link, () => false);
  }

  private async afterInvoice(link: string, done: () => boolean): Promise<BuyStatus> {
    const status = await openInvoice(link);
    // The webhook records the payment a moment after Telegram reports it.
    if (status === 'paid' || status === 'pending') {
      for (const wait of [800, 2000, 5000]) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        await this.refresh(this.server);
        if (done()) break;
      }
    }
    return status;
  }

  /** A friend's share link was opened: the gift is in this player's mail. */
  async acceptGift(code: string): Promise<'ok' | 'taken' | 'failed'> {
    if (!this.open || DEV) return 'failed';
    const answer = await this.post('accept', { code });
    return answer.body ? 'ok' : answer.status === 409 ? 'taken' : 'failed';
  }

  /* ---- The season pass ---- */

  /** Claims every reward of a track that has been reached; which levels were claimed. */
  async claim(track: Track): Promise<number[]> {
    if (DEV) {
      const view = this.devPass();
      if (track === 'paid' && !view.paid) return [];
      const taken = view.claimed[track];
      const levels = Array.from({ length: view.level }, (_, i) => i + 1).filter((level) => rewardAt(track, level) !== null && !taken.includes(level));
      for (const level of levels) this.grant([rewardAt(track, level)!]);
      this.passView = { ...view, claimed: { ...view.claimed, [track]: [...taken, ...levels] } };
      this.saved = { ...this.saved };
      this.changed();
      return levels;
    }
    const answer = await this.post<{ claimed: number[]; pass: PassView; items: string[] }>('claim', { track });
    if (!answer.body) return [];
    this.items = new Set(answer.body.items);
    this.passView = answer.body.pass;
    this.changed();
    return answer.body.claimed;
  }

  /** A development build's pass: the pretend XP, and what the pretend purchases bought. */
  private devPass(): PassView {
    const xp = this.saved.devXp ?? 0;
    const was = this.passView;
    return { season: SEASON, xp, ...levelProgress(xp), paid: this.items.has(passSku(SEASON)), claimed: was.season === SEASON ? was.claimed : { free: [], paid: [] } };
  }

  /** (Development build only) adds pretend XP so the track can be tried. */
  devAddXp(amount: number): void {
    if (!DEV) return;
    this.saved = { ...this.saved, devXp: Math.min((this.saved.devXp ?? 0) + amount, 99_999) };
    this.passView = this.devPass();
    this.changed();
  }

  private grant(ids: readonly string[]): void {
    for (const id of ids) this.items.add(id);
    if (DEV) this.passView = this.devPass();
    this.changed();
  }

  /* ---- The renderer's hooks (a slot's item, when worn and owned) ---- */

  /** TODO(art): the dungeon's renderer draws footprints in the trail's tones behind the hero. */
  get trail(): Item | undefined { return this.inSlot('trail'); }
  /** TODO(art): a hat on the hero's head, in the dungeon and in the camp. */
  get hat(): Item | undefined { return this.inSlot('hat'); }
  /** TODO(art): a pet that follows the hero. */
  get pet(): Item | undefined { return this.inSlot('pet'); }
  /** TODO(art): an effect where the hero slays a foe. */
  get killFx(): Item | undefined { return this.inSlot('killfx'); }
  /** TODO(art): an effect where the hero falls. */
  get deathFx(): Item | undefined { return this.inSlot('deathfx'); }
  /** TODO(art): the damage numbers' colour and style (view.ts floating numbers). */
  get numbers(): Item | undefined { return this.inSlot('numbers'); }
  /** TODO(art): the decorations round the camp fire. */
  get decor(): Item[] { return this.worn.decor.map((id) => itemById(id)).filter((item): item is Item => item !== undefined && this.items.has(item.id)); }

  /** The campfire style worn: flame tint, then the sparks' colours (camp.ts CampDress.fire). */
  get fire(): readonly [string, string, string, string] | null {
    const tones = this.inSlot('campfire')?.tones;
    return tones && tones.length >= 4 ? [tones[0]!, tones[1]!, tones[2]!, tones[3]!] : null;
  }

  /** The tint of the look a class wears (camp.ts CampDress.tint), a placeholder until the recoloured sheets are drawn. */
  tint(heroClass: HeroClass): { color: string; strength: number } | undefined {
    const look = this.inSlot(`look.${heroClass}`);
    const color = look?.tones?.[0];
    return look && color ? { color, strength: look.legendary ? 0.58 : 0.42 } : undefined;
  }

  /** The quip pack worn: the id (quip-packs.ts), or null. */
  get quipPack(): string | null {
    return this.inSlot('quips')?.id ?? null;
  }

  /** The name colour, title and profile frame worn. */
  get nameColor(): Item | undefined { return this.inSlot('namecolor'); }
  get title(): Item | undefined { return this.inSlot('title'); }
  get frame(): Item | undefined { return this.inSlot('frame'); }
}

export const cosmetics = new Cosmetics();

