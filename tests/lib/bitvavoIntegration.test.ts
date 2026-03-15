import { describe, it, expect, vi } from 'vitest';
import {
  parseBitvavoTrade,
  parseBitvavoDeposit,
  parseBitvavoWithdrawal,
} from '../../src/lib/bitvavoParser';
import { interpretTransaction } from '../../src/lib/taxCategorizer';
import type { BitvavoHistoryEntry, BitvavoTransferEntry } from '../../src/lib/bitvavo';

describe('interpretTransaction compatibility', () => {
  it('buy trade produces correct netChanges', () => {
    const entry: BitvavoHistoryEntry = {
      timestamp: 1700000000000,
      symbol: 'SOL',
      amount: '10',
      side: 'buy',
      price: '50',
      taker: true,
      fee: '1',
      feeCurrency: 'EUR',
      settled: true,
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
      timestamp: 1700000000000,
      symbol: 'BTC',
      amount: '0.1',
      side: 'sell',
      price: '50000',
      taker: true,
      fee: '5',
      feeCurrency: 'EUR',
      settled: true,
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
        timestamp: 1700000000000,
        symbol: 'BTC',
        amount: '1',
        side: 'buy',
        price: '30000',
        taker: true,
        fee: '30',
        feeCurrency: 'EUR',
        settled: true,
      },
      {
        timestamp: 1700001000000,
        symbol: 'BTC',
        amount: '0.5',
        side: 'sell',
        price: '35000',
        taker: true,
        fee: '17.5',
        feeCurrency: 'EUR',
        settled: true,
      },
      {
        timestamp: 1700002000000,
        symbol: 'ETH',
        amount: '10',
        side: 'buy',
        price: '2000',
        taker: true,
        fee: '20',
        feeCurrency: 'EUR',
        settled: true,
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

  it('deposits and withdrawals replay correctly', () => {
    const deposit: BitvavoTransferEntry = {
      timestamp: 1700000000000,
      symbol: 'EUR',
      amount: '5000',
      address: '',
      fee: '0',
      status: 'completed',
    };
    const withdrawal: BitvavoTransferEntry = {
      timestamp: 1700001000000,
      symbol: 'EUR',
      amount: '1000',
      address: 'NL00BANK0123456789',
      fee: '0',
      status: 'completed',
    };

    const balances = new Map<string, number>();
    const dtx = parseBitvavoDeposit(deposit);
    const wtx = parseBitvavoWithdrawal(withdrawal);
    for (const bc of [...dtx.balanceChanges, ...wtx.balanceChanges]) {
      balances.set(bc.mint, (balances.get(bc.mint) ?? 0) + bc.amount);
    }

    // 5000 - 1000 = 4000
    expect(balances.get('EUR')).toBeCloseTo(4000, 2);
  });
});

describe('categorize compatibility', () => {
  it('trade transactions are categorized as TRADE', () => {
    const entry: BitvavoHistoryEntry = {
      timestamp: 1700000000000,
      symbol: 'BTC',
      amount: '1',
      side: 'buy',
      price: '30000',
      taker: true,
      fee: '30',
      feeCurrency: 'EUR',
      settled: true,
    };
    const tx = parseBitvavoTrade(entry);
    expect(tx.taxCategory).toBe('TRADE');
  });

  it('deposits are categorized as TRANSFER_IN', () => {
    const entry: BitvavoTransferEntry = {
      timestamp: 1700000000000,
      symbol: 'EUR',
      amount: '1000',
      address: '',
      fee: '0',
      status: 'completed',
    };
    const tx = parseBitvavoDeposit(entry);
    expect(tx.taxCategory).toBe('TRANSFER_IN');
  });

  it('withdrawals are categorized as TRANSFER_OUT', () => {
    const entry: BitvavoTransferEntry = {
      timestamp: 1700000000000,
      symbol: 'BTC',
      amount: '0.5',
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      fee: '0.0005',
      status: 'completed',
    };
    const tx = parseBitvavoWithdrawal(entry);
    expect(tx.taxCategory).toBe('TRANSFER_OUT');
  });
});
