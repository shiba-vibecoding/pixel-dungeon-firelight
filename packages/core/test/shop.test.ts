import { describe, expect, it } from 'vitest';
import { allowedLook, emptyWallet, forSale, inSeason, isPatron, OFFERS, offerBySku, walletPay, walletRefund } from '../src/index';

const NOW = Date.UTC(2026, 9, 12);

describe('Pixel-Mart', () => {
  it('every offer has a unique sku, and those for sale a price', () => {
    expect(new Set(OFFERS.map((o) => o.sku)).size).toBe(OFFERS.length);
    for (const offer of OFFERS) expect(forSale(offer) || offer.badge !== undefined || offer.sku === 'frame.patron', offer.sku).toBe(true);
  });

  it('a payment owns the look once, however often Telegram repeats it, and a refund takes it back', () => {
    let wallet = walletPay(emptyWallet(), 'skin.mage.royal', 'c1', 75, NOW);
    wallet = walletPay(wallet, 'skin.mage.royal', 'c1', 75, NOW);
    expect(wallet.owned).toEqual(['skin.mage.royal']);
    expect(Object.keys(wallet.charges)).toEqual(['c1']);
    wallet = walletRefund(wallet, 'c1');
    expect(wallet.owned).toEqual([]);
  });

  it('the patronage lasts until Telegram says, renews, and ends with a refund', () => {
    const until = NOW + 30 * 86_400_000;
    let wallet = walletPay(emptyWallet(), 'patron', 'p1', 99, NOW, until);
    expect(isPatron(wallet, NOW)).toBe(true);
    expect(isPatron(wallet, until + 1)).toBe(false);
    wallet = walletPay(wallet, 'patron', 'p2', 99, until, until + 30 * 86_400_000);
    expect(isPatron(wallet, until + 1)).toBe(true);
    wallet = walletRefund(wallet, 'p2');
    expect(isPatron(wallet, NOW)).toBe(false);
  });

  it('tips add up', () => {
    const wallet = walletPay(walletPay(emptyWallet(), 'tip.25', 't1', 25, NOW), 'tip.100', 't2', 100, NOW);
    expect(wallet.tipped).toBe(125);
    expect(wallet.owned).toEqual([]);
  });

  it('a look shows only what was bought, opened by a badge, or the patron’s own', () => {
    const wallet = walletPay(emptyWallet(), 'skin.warrior.royal', 'c1', 75, NOW);
    expect(allowedLook({ skin: 'royal', effect: 'sparks', frame: 'gold', patron: true }, wallet, 'warrior', NOW)).toEqual({ skin: 'royal' });
    // Royal for the warrior only: the mage has not bought it.
    expect(allowedLook({ skin: 'royal' }, wallet, 'mage', NOW)).toEqual({});
    // Badge looks are the client's to check.
    expect(allowedLook({ skin: 'ash', frame: 'bronze' }, wallet, 'rogue', NOW)).toEqual({ skin: 'ash', frame: 'bronze' });
    const patron = walletPay(emptyWallet(), 'patron', 'p1', 99, NOW, NOW + 1000);
    expect(allowedLook({ frame: 'patron' }, patron, 'mage', NOW)).toEqual({ frame: 'patron', patron: true });
  });

  it('snow falls only in winter', () => {
    const snow = offerBySku('effect.snow')!;
    expect(inSeason(snow, Date.UTC(2026, 11, 20))).toBe(true);
    expect(inSeason(snow, Date.UTC(2027, 1, 10))).toBe(true);
    expect(inSeason(snow, Date.UTC(2026, 6, 1))).toBe(false);
  });
});
