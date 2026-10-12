import { describe, expect, it } from 'vitest';
import { emptyWallet } from '@pd/core';
import { describePayments, isAdminChat, parseAdminCommand } from '../src/admin';
import { applyWalletChange, emptyRecord, parseWalletChange, recentCharges, REFUNDS_KEPT } from '../src/wallet';

describe('admin commands', () => {
  it('are taken only in the admin chat, and never when none is set', () => {
    expect(isAdminChat(900, '900')).toBe(true);
    expect(isAdminChat(-100123, ' -100123 ')).toBe(true);
    expect(isAdminChat(901, '900')).toBe(false);
    expect(isAdminChat(900, undefined)).toBe(false);
    expect(isAdminChat(900, '')).toBe(false);
    expect(isAdminChat(900, 'abc')).toBe(false);
  });

  it('parse a refund, a payments lookup and a reply', () => {
    expect(parseAdminCommand('/refund 42 stxAbC-12_x')).toEqual({ kind: 'refund', user: 42, charge: 'stxAbC-12_x' });
    expect(parseAdminCommand('/refund@pixel_dungeon_gamebot 42 c1')).toEqual({ kind: 'refund', user: 42, charge: 'c1' });
    expect(parseAdminCommand('  /payments   42 ')).toEqual({ kind: 'payments', user: 42 });
    expect(parseAdminCommand('/reply 42 Hello!\nYour stars are back.')).toEqual({ kind: 'reply', user: 42, text: 'Hello!\nYour stars are back.' });
  });

  it('answer arguments that do not fit with the usage, and leave other text alone', () => {
    for (const bad of ['/refund', '/refund 42', '/refund x c1', '/refund 42 c1 extra', '/refund 42 c<1>', '/payments', '/payments me', '/reply 42', '/reply x hi']) {
      expect(parseAdminCommand(bad), bad).toEqual({ kind: 'usage' });
    }
    expect(parseAdminCommand('/start')).toBeNull();
    expect(parseAdminCommand('refund 42 c1')).toBeNull();
    expect(parseAdminCommand('')).toBeNull();
  });

  it('describe a player’s payments, newest first', () => {
    let record = emptyRecord();
    record = applyWalletChange(record, { kind: 'pay', sku: 'frame.gold', charge: 'old', stars: 50, at: Date.UTC(2026, 0, 1) });
    record = applyWalletChange(record, { kind: 'pay', sku: 'tip.25', charge: 'new', stars: 25, at: Date.UTC(2026, 5, 1) });
    const text = describePayments(42, record.wallet, Date.UTC(2026, 6, 1));
    expect(text.split('\n')).toEqual(['42: 2 payment(s)', 'new · tip.25 · 25★ · 2026-06-01 00:00', 'old · frame.gold · 50★ · 2026-01-01 00:00']);
    expect(describePayments(42, emptyWallet(), 0)).toBe('42: no payments');
  });
});

describe('wallet changes', () => {
  it('pays once per charge and refunds what the charge bought', () => {
    const pay = { kind: 'pay', sku: 'skin.mage.royal', charge: 'c1', stars: 75, at: 1 } as const;
    let record = applyWalletChange(emptyRecord(), pay);
    record = applyWalletChange(record, pay);
    expect(record.wallet.owned).toEqual(['skin.mage.royal']);
    expect(Object.keys(record.wallet.charges)).toEqual(['c1']);
    record = applyWalletChange(record, { kind: 'refund', charge: 'c1' });
    expect(record.wallet.owned).toEqual([]);
    expect(record.refunded).toEqual(['c1']);
    // Refunded stays refunded, whatever comes again.
    record = applyWalletChange(record, pay);
    record = applyWalletChange(record, { kind: 'refund', charge: 'c1' });
    expect(record.wallet.owned).toEqual([]);
    expect(record.refunded).toEqual(['c1']);
  });

  it('remembers a bounded number of refunds', () => {
    let record = emptyRecord();
    for (let i = 0; i < REFUNDS_KEPT + 10; i++) record = applyWalletChange(record, { kind: 'refund', charge: `r${i}` });
    expect(record.refunded).toHaveLength(REFUNDS_KEPT);
    expect(record.refunded.at(-1)).toBe(`r${REFUNDS_KEPT + 9}`);
  });

  it('reads a change sent over HTTP, or refuses it', () => {
    expect(parseWalletChange({ kind: 'refund', charge: 'c' })).toEqual({ kind: 'refund', charge: 'c' });
    expect(parseWalletChange({ kind: 'pay', sku: 'patron', charge: 'c', stars: 99, at: 5, expiresAt: 9, junk: 1 }))
      .toEqual({ kind: 'pay', sku: 'patron', charge: 'c', stars: 99, at: 5, expiresAt: 9 });
    for (const bad of [null, {}, { kind: 'refund' }, { kind: 'pay', charge: 'c', sku: 'x', stars: 'many', at: 1 }, { kind: 'gift', charge: 'c' }]) {
      expect(parseWalletChange(bad)).toBeNull();
    }
  });

  it('lists recent charges newest first', () => {
    let record = emptyRecord();
    for (let i = 0; i < 8; i++) record = applyWalletChange(record, { kind: 'pay', sku: 'tip.25', charge: `c${i}`, stars: 25, at: i });
    expect(recentCharges(record.wallet, 3).map((c) => c.charge)).toEqual(['c7', 'c6', 'c5']);
  });
});
