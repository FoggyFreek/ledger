import { describe, it, expect } from 'vitest';
import {
  parseBitvavoTrade,
  parseBitvavoBalances,
} from '../../src/lib/bitvavoParser';
import type { BitvavoHistoryEntry, BitvavoTransferEntry, BitvavoBalance } from '../../src/lib/bitvavo';

describe('parseBitvavoTrade', () => {
  it('buy: creates +asset and -EUR balance changes', () => {
    const entry: BitvavoHistoryEntry = {
      transactionId: 'test-buy-btc-1',
      executedAt: new Date(1700000000000).toISOString(),
      type: 'buy',
      priceCurrency: 'EUR',
      priceAmount: '40000',
      sentCurrency: 'EUR',
      sentAmount: '20000', // 0.5 * 40000, fee folds in
      receivedCurrency: 'BTC',
      receivedAmount: '0.5',
      feesCurrency: 'EUR',
      feesAmount: '20',
      address: '',
    };
    const tx = parseBitvavoTrade(entry);
    expect(tx.taxCategory).toBe('TRADE');
    expect(tx.blockTime).toBe(1700000000);
    expect(tx.slot).toBe(0);
    expect(tx.fee).toBe(0);

    const btcChange = tx.balanceChanges.find(bc => bc.mint === 'BTC');
    expect(btcChange).toBeDefined();
    expect(btcChange!.amount).toBe(0.5);

    const eurChange = tx.balanceChanges.find(bc => bc.mint === 'EUR');
    expect(eurChange).toBeDefined();
    // cost = 0.5 * 40000 + 20 = 20020
    expect(eurChange!.amount).toBeCloseTo(-20020, 2);
    expect(eurChange!.decimals).toBe(2);
  });

  it('sell: creates -asset and +EUR balance changes', () => {
    const entry: BitvavoHistoryEntry = {
      transactionId: 'test-sell-eth-1',
      executedAt: new Date(1700000000000).toISOString(),
      type: 'sell',
      priceCurrency: 'EUR',
      priceAmount: '2000',
      sentCurrency: 'ETH',
      sentAmount: '2',
      receivedCurrency: 'EUR',
      receivedAmount: '3996', // net: 2 * 2000 - 4
      feesCurrency: 'EUR',
      feesAmount: '0',
      address: '',
    };
    const tx = parseBitvavoTrade(entry);
    expect(tx.taxCategory).toBe('TRADE');

    const ethChange = tx.balanceChanges.find(bc => bc.mint === 'ETH');
    expect(ethChange!.amount).toBe(-2);

    const eurChange = tx.balanceChanges.find(bc => bc.mint === 'EUR');
    // proceeds = 2 * 2000 - 4 = 3996
    expect(eurChange!.amount).toBeCloseTo(3996, 2);
  });

  it('non-EUR fee: creates third balance change for fee currency', () => {
    const entry: BitvavoHistoryEntry = {
      transactionId: 'test-buy-btc-fee',
      executedAt: new Date(1700000000000).toISOString(),
      type: 'buy',
      priceCurrency: 'EUR',
      priceAmount: '30000',
      sentCurrency: 'EUR',
      sentAmount: '30000',
      receivedCurrency: 'BTC',
      receivedAmount: '1',
      feesCurrency: 'BTC',
      feesAmount: '0.0001',
      address: '',
    };
    const tx = parseBitvavoTrade(entry);
    expect(tx.balanceChanges).toHaveLength(3);

    const btcFee = tx.balanceChanges.find(bc => bc.mint === 'BTC' && bc.amount < 0);
    expect(btcFee).toBeDefined();
    expect(btcFee!.amount).toBeCloseTo(-0.0001, 8);

    // EUR should not include the BTC fee
    const eurChange = tx.balanceChanges.find(bc => bc.mint === 'EUR');
    expect(eurChange!.amount).toBeCloseTo(-30000, 2);
  });

  it('generates unique signatures for same-timestamp trades', () => {
    const entry1: BitvavoHistoryEntry = {
      transactionId: 'tx-btc-1',
      executedAt: new Date(1700000000000).toISOString(),
      type: 'buy',
      priceCurrency: 'EUR',
      priceAmount: '40000',
      sentCurrency: 'EUR',
      sentAmount: '20000',
      receivedCurrency: 'BTC',
      receivedAmount: '0.5',
      feesCurrency: 'EUR',
      feesAmount: '20',
      address: '',
    };
    const entry2: BitvavoHistoryEntry = {
      transactionId: 'tx-eth-2',
      executedAt: new Date(1700000000000).toISOString(),
      type: 'buy',
      priceCurrency: 'EUR',
      priceAmount: '2000',
      sentCurrency: 'EUR',
      sentAmount: '20000',
      receivedCurrency: 'ETH',
      receivedAmount: '10',
      feesCurrency: 'EUR',
      feesAmount: '20',
      address: '',
    };
    const tx1 = parseBitvavoTrade(entry1);
    const tx2 = parseBitvavoTrade(entry2);
    expect(tx1.signature).not.toBe(tx2.signature);
    expect(tx1.signature).toMatch(/^bitvavo-trade-/);
    expect(tx2.signature).toMatch(/^bitvavo-trade-/);
  });
});

describe('parseBitvavoBalances', () => {
  it('creates WalletHoldings with correct shape', () => {
    const balances: BitvavoBalance[] = [
      { symbol: 'BTC', available: '0.5', inOrder: '0.1' },
      { symbol: 'EUR', available: '1000', inOrder: '0' },
      { symbol: 'ZERO', available: '0', inOrder: '0' },
    ];
    const holdings = parseBitvavoBalances(balances);
    expect(holdings.solBalance).toBe(0);
    expect(holdings.solPrice).toBeNull();
    expect(holdings.slot).toBe(0);
    expect(holdings.walletAddress).toBe('bitvavo:account');

    // Zero balance should be filtered out
    expect(holdings.tokens).toHaveLength(2);

    const btc = holdings.tokens.find(t => t.symbol === 'BTC');
    expect(btc).toBeDefined();
    expect(btc!.uiAmount).toBeCloseTo(0.6, 8);
    expect(btc!.name).toBe('Bitcoin');
    expect(btc!.decimals).toBe(8);

    const eur = holdings.tokens.find(t => t.symbol === 'EUR');
    expect(eur).toBeDefined();
    expect(eur!.uiAmount).toBe(1000);
    expect(eur!.decimals).toBe(2);
  });

  it('uses EUR decimals = 2', () => {
    const balances: BitvavoBalance[] = [
      { symbol: 'EUR', available: '100.50', inOrder: '0' },
    ];
    const holdings = parseBitvavoBalances(balances);
    const eur = holdings.tokens[0];
    expect(eur.decimals).toBe(2);
  });
});

describe('interpretedFlow', () => {
  it('trade transactions have interpretedFlow set', () => {
    const entry: BitvavoHistoryEntry = {
      transactionId: 'test-interpreted',
      executedAt: new Date(1700000000000).toISOString(),
      type: 'buy',
      priceCurrency: 'EUR',
      priceAmount: '30000',
      sentCurrency: 'EUR',
      sentAmount: '30000',
      receivedCurrency: 'BTC',
      receivedAmount: '1',
      feesCurrency: 'EUR',
      feesAmount: '10',
      address: '',
    };
    const tx = parseBitvavoTrade(entry);
    expect(tx.interpretedFlow).toBeDefined();
    expect(tx.interpretedFlow.netChanges.length).toBeGreaterThan(0);
  });
});
