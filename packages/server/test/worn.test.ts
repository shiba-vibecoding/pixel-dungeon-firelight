import { describe, expect, it } from 'vitest';
import { CATALOG, DEFAULT_OWNED, HEROES, itemById, type Slot, slotOf } from '../../client/src/catalog';
import { type DailyEntry, Leaderboard, servedEntry, type Worn } from '../src/leaderboard';
import { applyWalletChange, emptyRecord, ownedItems, shopOf, type WalletRecord } from '../src/wallet';
import { act, createItem, fingerprint, heroById } from '@pd/core';
import { armorTierOf, cleanWorn, legacyFields, wornByClass, wornOf } from '../src/worn';
import { emptyProfile, ME, PlayerLogic } from '../src/runs';

/** A small deterministic random source, so a failure can be replayed. */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let a = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

const sellable = CATALOG.filter((entry) => entry.stars > 0 && !entry.earn && !entry.pack);

/** What each field of a Worn is allowed to be, by catalogue category. */
const CATEGORY: Record<Exclude<keyof Worn, 'a' | 'lg'>, string> = { l: 'look', h: 'hat', p: 'pet', f: 'campfire', fr: 'frame', tt: 'title', nc: 'namecolor' };

/** A wallet that bought a few things at random and put on whatever it could (the wallet refuses what is not owned). */
function randomWallet(random: () => number): WalletRecord {
  let record = emptyRecord();
  const buys = Math.floor(random() * 14);
  for (let i = 0; i < buys; i++) {
    const item = sellable[Math.floor(random() * sellable.length)]!;
    record = applyWalletChange(record, { kind: 'pay', sku: item.id, charge: `c${i}`, stars: item.stars, at: 1 });
  }
  for (let i = 0; i < 40; i++) {
    const item = CATALOG[Math.floor(random() * CATALOG.length)]!;
    const slot = slotOf(item);
    if (slot) record = applyWalletChange(record, { kind: 'equip', slot, id: item.id });
  }
  return record;
}

const pay = (record: WalletRecord, sku: string, charge: string): WalletRecord =>
  applyWalletChange(record, { kind: 'pay', sku, charge, stars: itemById(sku)!.stars, at: 1 });
const wear = (record: WalletRecord, sku: string): WalletRecord =>
  applyWalletChange(record, { kind: 'equip', slot: slotOf(itemById(sku)!) as Slot, id: sku });

describe('the hero a board shows (worn.ts)', () => {
  it('is always a subset of what the wallet owns, in the right slots, on random wallets', () => {
    let shown = 0;
    for (let n = 0; n < 300; n++) {
      const record = randomWallet(rng(n + 1));
      const shop = record.shop ?? shopOf({ ...record.wallet });
      const owned = new Set([...ownedItems(shop), ...DEFAULT_OWNED]);
      for (const heroClass of HEROES) {
        const worn = wornOf(shop, heroClass);
        if (!worn) continue;
        shown++;
        for (const [field, id] of Object.entries(worn).filter(([key]) => key !== 'a' && key !== 'lg') as Array<[Exclude<keyof Worn, 'a' | 'lg'>, string]>) {
          expect(owned.has(id), `${id} is owned`).toBe(true);
          expect(itemById(id)?.category, `${id} is a ${CATEGORY[field]}`).toBe(CATEGORY[field]);
        }
        // The look is the class played's own.
        if (worn.l) expect(itemById(worn.l)?.heroClass).toBe(heroClass);
      }
    }
    expect(shown).toBeGreaterThan(100);
  });

  it('never shows what is worn but not owned (a stale or tampered wallet), nor a look of another class', () => {
    const shop = shopOf({ ...emptyRecord().wallet });
    shop.grants['charge:1'] = ['hat.crown'];
    shop.equipped = {
      slots: { hat: 'hat.crown', pet: 'pet.ember', campfire: 'fire.golden', frame: 'frame.sunforge', 'look.mage': 'skin.mage.ember', 'look.warrior': 'skin.mage.ember', title: 'title.nonsense' },
      decor: [],
    };
    expect(wornOf(shop, 'mage')).toEqual({ h: 'hat.crown' });
    expect(wornOf(shop, 'warrior')).toEqual({ h: 'hat.crown' });
    expect(wornOf(shop, 'rogue')).toEqual({ h: 'hat.crown' });
  });

  it('shows what is owned and worn, the look for the class played only, and leaves the classic fire out', () => {
    let record = emptyRecord();
    const things = ['skin.mage.ember', 'skin.warrior.moss', 'hat.crown', 'pet.ember', 'fire.golden', 'frame.stars', 'name.gold', 'title.kindler'];
    things.forEach((sku, i) => {
      record = wear(pay(record, sku, `c${i}`), sku);
    });
    const shop = record.shop!;
    expect(wornOf(shop, 'mage')).toEqual({ l: 'skin.mage.ember', h: 'hat.crown', p: 'pet.ember', f: 'fire.golden', fr: 'frame.stars', nc: 'name.gold', tt: 'title.kindler' });
    expect(wornOf(shop, 'warrior')?.l).toBe('skin.warrior.moss');
    expect(wornOf(shop, 'rogue')?.l).toBeUndefined();
    // The classic fire (what everyone has) is worn by saying nothing.
    const classic = wear(wear(pay(emptyRecord(), 'hat.crown', 'c'), 'fire.classic'), 'hat.crown');
    expect(wornOf(classic.shop!, 'mage')).toEqual({ h: 'hat.crown' });
    expect(wornOf(wear(emptyRecord(), 'fire.classic').shop!, 'mage')).toBeUndefined();
  });

  it('is small: the fullest snapshot is under 220 bytes', () => {
    const worn: Worn = { l: 'skin.huntress.wildfire', h: 'hat.eyepatch', p: 'pet.skull', f: 'fire.rainbow', fr: 'frame.sunforge', tt: 'title.alchemist', nc: 'name.champion' };
    expect(JSON.stringify(worn).length).toBeLessThan(220);
  });

  it('a refund takes the purchase off the snapshot', () => {
    let record = wear(pay(emptyRecord(), 'hat.crown', 'c1'), 'hat.crown');
    expect(wornOf(record.shop!, 'mage')).toEqual({ h: 'hat.crown' });
    record = applyWalletChange(record, { kind: 'refund', charge: 'c1' });
    expect(wornOf(record.shop!, 'mage')).toBeUndefined();
  });

  it('cleanWorn keeps only the known fields, as short strings', () => {
    expect(cleanWorn({ h: 'hat.crown', x: 'bad', p: 7, l: '' })).toEqual({ h: 'hat.crown' });
    expect(cleanWorn({ h: 'x'.repeat(200) })).toBeUndefined();
    expect(cleanWorn(null)).toBeUndefined();
    expect(cleanWorn({ nc: 'name.gold', tt: 'title.kindler' })).toEqual({ nc: 'name.gold', tt: 'title.kindler' });
  });
});

describe('patching the open boards', () => {
  const entry = (id: string, owner: string, heroClass: string, score: number, w?: Worn): DailyEntry => ({
    id, owner, name: id, heroClass, depth: 3, level: 3, gold: 0, won: false, score, at: 1, ...(w ? { w, ...legacyFields(w) } : {}),
  } as DailyEntry);

  it('gives a player\'s entry the look of its own class as worn now, and no one else\'s', () => {
    const board = new Leaderboard([entry('a', 'tgA', 'mage', 300), entry('b', 'tgB', 'mage', 200), entry('c', 'tgA', 'warrior', 100)]);
    const byClass = { mage: { l: 'skin.mage.ember', fr: 'frame.ember' }, warrior: { h: 'hat.crown' } };
    expect(board.patchWorn('tgA', byClass)).toBe(true);
    const [a, b, c] = board.entries();
    expect(a!.w).toEqual({ l: 'skin.mage.ember', fr: 'frame.ember' });
    expect(a!.fr).toBe('frame.ember');
    expect(b!.w).toBeUndefined();
    expect(c!.w).toEqual({ h: 'hat.crown' });
    // The same look again changes nothing (nothing to write).
    expect(board.patchWorn('tgA', byClass)).toBe(false);
  });

  it('takes a refunded item off, old per-field values included, and wearing nothing is no `w`', () => {
    const board = new Leaderboard([{ ...entry('a', 'tgA', 'mage', 300), nc: 'name.gold', tt: 'title.kindler', fr: 'frame.moss' }]);
    expect(board.patchWorn('tgA', { mage: { tt: 'title.kindler' } })).toBe(true);
    expect(board.entries()[0]).toMatchObject({ w: { tt: 'title.kindler' }, tt: 'title.kindler' });
    expect(board.entries()[0]!.nc).toBeUndefined();
    expect(board.entries()[0]!.fr).toBeUndefined();
    expect(board.patchWorn('tgA', { mage: undefined })).toBe(true);
    expect(board.entries()[0]!.w).toBeUndefined();
    expect(board.entries()[0]!.tt).toBeUndefined();
  });

  it('serves entries without an owner: `w` when they have one, none for entries from before it', () => {
    const board = new Leaderboard([entry('a', 'tgA', 'mage', 300, { h: 'hat.crown' }), entry('b', 'tgB', 'rogue', 200)]);
    const served = board.top(10);
    expect(served.every((e) => !('owner' in e))).toBe(true);
    expect(served[0]!.w).toEqual({ h: 'hat.crown' });
    expect('w' in served[1]!).toBe(false);
    expect(servedEntry(board.entries()[0]!).owner).toBeUndefined();
  });

  it('a better run of the player takes its own snapshot', () => {
    const board = new Leaderboard([entry('a', 'tgA', 'mage', 300, { h: 'hat.crown' })]);
    board.put(entry('a', 'tgA', 'mage', 900, { p: 'pet.bat' }));
    expect(board.entries()).toHaveLength(1);
    expect(board.entries()[0]!.w).toEqual({ p: 'pet.bat' });
  });
});

describe('the class snapshots', () => {
  it('has one for each class, undefined where nothing is worn', () => {
    const record = wear(pay(emptyRecord(), 'hat.crown', 'c'), 'hat.crown');
    const by = wornByClass(record.shop!);
    expect(Object.keys(by).sort()).toEqual([...HEROES].sort());
    expect(by.mage).toEqual({ h: 'hat.crown' });
    expect(wornByClass(shopOf({ ...emptyRecord().wallet })).mage).toBeUndefined();
  });
});

describe('the armour worn at the end of the run', () => {
  it('is the tier of the armour of the hero in the verified final world, kept on the summary of the run', () => {
    for (const [kind, tier] of [['armor.cloth', 1], ['armor.leather', 2], ['armor.mail', 3], ['armor.scale', 4], ['armor.plate', 5], ['armor.warrior', 6]] as const) {
      const logic = new PlayerLogic(emptyProfile('Alice'));
      const run = logic.start({ slot: 'dungeon', heroClass: 'warrior', challenges: 0, name: 'Alice', seed: 7, id: 'r1', now: 0, today: '2026-10-13' });
      const device = structuredClone(run.world);
      // The same armour on both copies of the world: the server's word is the world it has.
      for (const world of [logic.runs.dungeon!.world, device]) heroById(world, ME)!.armor = createItem(kind);
      let finish;
      for (let batch = 0; batch < 40 && !finish; batch++) {
        const from = logic.runs.dungeon!.seq;
        const actions = [];
        for (let i = 0; i < 400 && !device.over; i++) if (act(device, ME, { type: 'wait' }).ok) actions.push({ type: 'wait' as const });
        finish = logic.sync('dungeon', 'r1', from, actions, fingerprint(device), 1000).finish;
      }
      expect(finish!.summary.armor).toBe(tier);
      expect(armorTierOf(heroById(logic.runs.dungeon!.world, ME)!)).toBe(tier);
      expect(wornOf({ ...emptyShopForTest() }, 'warrior', finish!.summary.armor)).toEqual({ a: tier });
    }
  });

  it('goes on the snapshot beside what is worn, and only as a tier the sheet has', () => {
    let record = wear(pay(emptyRecord(), 'hat.crown', 'c1'), 'hat.crown');
    expect(wornOf(record.shop!, 'mage', 5)).toEqual({ h: 'hat.crown', a: 5 });
    expect(wornOf(record.shop!, 'mage', 9)).toEqual({ h: 'hat.crown' });
    expect(wornOf(record.shop!, 'mage', -1)).toEqual({ h: 'hat.crown' });
    expect(wornOf(record.shop!, 'mage', 2.5)).toEqual({ h: 'hat.crown' });
    expect(wornOf(record.shop!, 'mage')).toEqual({ h: 'hat.crown' });
    record = applyWalletChange(record, { kind: 'refund', charge: 'c1' });
    expect(wornOf(record.shop!, 'mage', 3)).toEqual({ a: 3 });
    expect(cleanWorn({ a: 4, h: 'hat.crown' })).toEqual({ h: 'hat.crown', a: 4 });
    expect(cleanWorn({ a: 99 })).toBeUndefined();
  });

  it('stays on the entry when the wallet patches it, and an entry without one has none (drawn as cloth)', () => {
    const entry = (w?: Worn): DailyEntry => ({ id: 'a', owner: 'tgA', name: 'A', heroClass: 'mage', depth: 3, level: 3, gold: 0, won: false, score: 1, at: 1, ...(w ? { w } : {}) });
    const board = new Leaderboard([entry({ a: 4, h: 'hat.crown' })]);
    expect(board.patchWorn('tgA', { mage: { p: 'pet.bat' } })).toBe(true);
    expect(board.entries()[0]!.w).toEqual({ p: 'pet.bat', a: 4 });
    expect(board.patchWorn('tgA', { mage: undefined })).toBe(true);
    expect(board.entries()[0]!.w).toEqual({ a: 4 });
    const old = new Leaderboard([entry()]);
    expect(old.patchWorn('tgA', { mage: undefined })).toBe(false);
    expect(old.top(1)[0]!.w).toBeUndefined();
  });
});

const emptyShopForTest = () => shopOf({ ...emptyRecord().wallet });
