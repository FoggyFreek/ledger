import { describe, it, expect, vi } from 'vitest';
import { parseBitvavoTrade, } from '../../src/lib/bitvavoParser';
import { interpretTransaction } from '../../src/lib/taxCategorizer';
import type { BitvavoHistoryEntry, BitvavoTransferEntry } from '../../src/lib/bitvavo';

describe('interpretTransaction compatibility', () => {
  it('buy trade produces correct netChanges', () => {
    const entry: BitvavoHistoryEntry = {
      transactionId: 'tx-buy-sol',
      executedAt: new Date(1700000000000).toISOString(),
      type: 'buy',
      priceCurrency: 'EUR',
      priceAmount: '50',
      sentCurrency: 'EUR',
      sentAmount: '500', // 10 * 50, fee folds in
      receivedCurrency: 'SOL',
      receivedAmount: '10',
      feesCurrency: 'EUR',
      feesAmount: '1',
      address: '',
    };
    const tx = parseBitvavoTrade(entry);
    const flow = interpretTransaction(tx.balanceChanges);
    // Should have SOL and EUR changes
    const sol = flow.netChanges.find(nc => nc.mint === 'SOL');
    const eur = flow.netChanges.find(nc => nc.mint === 'EUR');
    expect(sol).toBeDefined();
    expect(sol!.amount).toBe(10);
    expect(eur).toBeDefined();
    expect(eur!.amount).toBeCloseTo(-501, 2); // 10 * 50 + 1
  });

  it('sell trade produces correct netChanges', () => {
    const entry: BitvavoHistoryEntry = {
      transactionId: 'tx-sell-btc',
      executedAt: new Date(1700000000000).toISOString(),
      type: 'sell',
      priceCurrency: 'EUR',
      priceAmount: '50000',
      sentCurrency: 'BTC',
      sentAmount: '0.1',
      receivedCurrency: 'EUR',
      receivedAmount: '4995', // net: 0.1 * 50000 - 5
      feesCurrency: 'EUR',
      feesAmount: '0',
      address: '',
    };
    const tx = parseBitvavoTrade(entry);
    const flow = interpretTransaction(tx.balanceChanges);
    const btc = flow.netChanges.find(nc => nc.mint === 'BTC');
    const eur = flow.netChanges.find(nc => nc.mint === 'EUR');
    expect(btc!.amount).toBe(-0.1);
    expect(eur!.amount).toBeCloseTo(4995, 2); // 0.1 * 50000 - 5
  });
});

describe('snapshot replay', () => {
  it('sequence of trades produces expected final balances', () => {
    const trades: BitvavoHistoryEntry[] = [
      {
        transactionId: 'tx-1',
        executedAt: new Date(1700000000000).toISOString(),
        type: 'buy',
        priceCurrency: 'EUR',
        priceAmount: '30000',
        sentCurrency: 'EUR',
        sentAmount: '30000', // fee folds in
        receivedCurrency: 'BTC',
        receivedAmount: '1',
        feesCurrency: 'EUR',
        feesAmount: '30',
        address: '',
      },
      {
        transactionId: 'tx-2',
        executedAt: new Date(1700001000000).toISOString(),
        type: 'sell',
        priceCurrency: 'EUR',
        priceAmount: '35000',
        sentCurrency: 'BTC',
        sentAmount: '0.5',
        receivedCurrency: 'EUR',
        receivedAmount: '17482.5', // net: 0.5 * 35000 - 17.5
        feesCurrency: 'EUR',
        feesAmount: '0',
        address: '',
      },
      {
        transactionId: 'tx-3',
        executedAt: new Date(1700002000000).toISOString(),
        type: 'buy',
        priceCurrency: 'EUR',
        priceAmount: '2000',
        sentCurrency: 'EUR',
        sentAmount: '20000', // fee folds in
        receivedCurrency: 'ETH',
        receivedAmount: '10',
        feesCurrency: 'EUR',
        feesAmount: '20',
        address: '',
      },
    ];

    // Replay balance changes
    const balances = new Map<string, number>();
    for (const trade of trades) {
      const tx = parseBitvavoTrade(trade);
      for (const bc of tx.balanceChanges) {
        balances.set(bc.mint, (balances.get(bc.mint) ?? 0) + bc.amount);
      }
    }

    // BTC: +1 - 0.5 = 0.5
    expect(balances.get('BTC')).toBeCloseTo(0.5, 8);

    // ETH: +10
    expect(balances.get('ETH')).toBeCloseTo(10, 8);

    // EUR: -(30000+30) + (17500-17.5) + -(20000+20) = -30030 + 17482.5 - 20020 = -32567.5
    expect(balances.get('EUR')).toBeCloseTo(-32567.5, 2);
  });

  describe('categorize compatibility', () => {
    it('trade transactions are categorized as TRADE', () => {
      const entry: BitvavoHistoryEntry = {
        transactionId: 'tx-cat-trade',
        executedAt: new Date(1700000000000).toISOString(),
        type: 'buy',
        priceCurrency: 'EUR',
        priceAmount: '30000',
        sentCurrency: 'EUR',
        sentAmount: '30000',
        receivedCurrency: 'BTC',
        receivedAmount: '1',
        feesCurrency: 'EUR',
        feesAmount: '30',
        address: '',
      };
      const tx = parseBitvavoTrade(entry);
      expect(tx.taxCategory).toBe('TRADE');
    });

  });
})
