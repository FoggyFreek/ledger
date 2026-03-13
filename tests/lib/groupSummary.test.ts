/**
 * Tests for aggregateBalances() in src/lib/groupSummary.ts
 *
 * Regression test for: token flow in the group summary not showing incoming
 * or outgoing tokens (only SOL appeared). The bug was caused by using raw
 * balanceChanges directly instead of interpretTransaction().netChanges, which
 * can contain multiple entries per mint (e.g. native SOL + WSOL from DEX
 * routing) that partially cancel when summed naively.
 *
 * Scenario from screenshot (2026-03-13):
 *   • Trade 1:       304.9075 STAR → 0.397848 SOL
 *   • Trade 2:       914.7225 STAR → 1.262012 SOL
 *   • Transfer In:   +5 STAR
 *
 *   Expected token flow:
 *     SOL:  +1.659860  (sum of received SOL across trades)
 *     STAR: −1214.63   (net of sold STAR minus received STAR)
 */

import { describe, it, expect } from 'vitest';
import { aggregateBalances } from '../../src/lib/groupSummary';
import type { GroupMember } from '../../src/types/groups';

const STAR = 'STARskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ';
const WSOL = 'So11111111111111111111111111111111111111112';

// Minimal GroupMember factory — only balanceChanges matters for aggregateBalances
function member(balanceChanges: GroupMember['balanceChanges']): GroupMember {
  return {
    signature: Math.random().toString(36).slice(2),
    blockTime: 1_741_870_000,
    slot: 406_138_000,
    fee: 5000,
    taxCategory: 'TRADE',
    balanceChanges,
    err: null,
    counterparty: null,
    usdInflow: null,
    usdOutflow: null,
    priceFetched: false,
    addedAt: Date.now(),
  };
}

describe('aggregateBalances', () => {
  it('screenshot scenario: shows both SOL and STAR in token flow', () => {
    // For a DEX trade STAR→SOL the wallet's accountData may contain both
    // a native-SOL entry AND a WSOL token-account entry. interpretTransaction
    // unifies them under 'SOL'; the old raw-sum code produced two separate SOL
    // rows, one of which could mask the STAR entry in the display.
    const trade1 = member([
      { mint: 'SOL',  amount:  0.397848,  decimals: 9, userAccount: 'wallet' },
      { mint: WSOL,   amount:  0,         decimals: 9, userAccount: 'wallet' }, // WSOL dust
      { mint: STAR,   amount: -304.9075,  decimals: 6, userAccount: 'wallet' },
    ]);

    const trade2 = member([
      { mint: 'SOL',  amount:  1.262012,  decimals: 9, userAccount: 'wallet' },
      { mint: WSOL,   amount:  0,         decimals: 9, userAccount: 'wallet' },
      { mint: STAR,   amount: -914.7225,  decimals: 6, userAccount: 'wallet' },
    ]);

    const transferIn = member([
      { mint: STAR,   amount:  5,         decimals: 6, userAccount: 'wallet' },
    ]);

    const totals = aggregateBalances([trade1, trade2, transferIn]);
    const byMint = Object.fromEntries(totals.map(e => [e.mint, e.netTotal]));

    // SOL must appear and be positive
    expect(byMint['SOL']).toBeCloseTo(1.659860, 4);

    // STAR must appear — both outflows from trades and inflow from transfer-in
    expect(byMint[STAR]).toBeCloseTo(-1214.63, 1);

    // Nothing else (WSOL dust collapses into SOL or is zeroed out)
    expect(totals.length).toBe(2);
  });

  it('TRANSFER_IN only: incoming token is visible', () => {
    const transferIn = member([
      { mint: STAR, amount: 5, decimals: 6, userAccount: 'wallet' },
    ]);

    const totals = aggregateBalances([transferIn]);
    const byMint = Object.fromEntries(totals.map(e => [e.mint, e.netTotal]));

    expect(byMint[STAR]).toBeCloseTo(5, 6);
    expect(byMint[STAR]).toBeGreaterThan(0);
  });

  it('TRADE only: outgoing token appears as negative', () => {
    const trade = member([
      { mint: 'SOL', amount:  0.397848, decimals: 9, userAccount: 'wallet' },
      { mint: STAR,  amount: -304.9075, decimals: 6, userAccount: 'wallet' },
    ]);

    const totals = aggregateBalances([trade]);
    const byMint = Object.fromEntries(totals.map(e => [e.mint, e.netTotal]));

    expect(byMint[STAR]).toBeCloseTo(-304.9075, 4);
    expect(byMint['SOL']).toBeCloseTo(0.397848, 6);
  });

  it('SOL and WSOL entries are unified under SOL', () => {
    const trade = member([
      { mint: 'SOL', amount:  0.2, decimals: 9 },
      { mint: WSOL,  amount:  0.3, decimals: 9 },
      { mint: STAR,  amount: -100, decimals: 6 },
    ]);

    const totals = aggregateBalances([trade]);
    const byMint = Object.fromEntries(totals.map(e => [e.mint, e.netTotal]));

    // Both native SOL and WSOL collapse into a single 'SOL' entry
    expect(byMint['SOL']).toBeCloseTo(0.5, 6);
    expect(byMint[WSOL]).toBeUndefined();
  });

  it('near-zero net totals: inTotal and outTotal are tracked separately', () => {
    // Two members that perfectly cancel for STAR — netTotal is 0 but both flows visible
    const buy  = member([{ mint: STAR, amount:  100, decimals: 6 }]);
    const sell = member([{ mint: STAR, amount: -100, decimals: 6 }]);

    const totals = aggregateBalances([buy, sell]);
    const star = totals.find(e => e.mint === STAR);

    expect(star).toBeDefined();
    expect(star!.inTotal).toBeCloseTo(100, 6);
    expect(star!.outTotal).toBeCloseTo(-100, 6);
    expect(star!.netTotal).toBeCloseTo(0, 6);
  });

  it('returns results sorted by absolute total descending', () => {
    // SOL must be >= 0.005 to survive as a netChange (smaller amounts become rent items)
    const m = member([
      { mint: 'SOL', amount:  0.01,  decimals: 9 },
      { mint: STAR,  amount: -500,   decimals: 6 },
    ]);

    const totals = aggregateBalances([m]);

    // Sorted by |inTotal - outTotal| descending: STAR=500 > SOL=0.01
    expect(totals[0].mint).toBe(STAR);
    expect(totals[1].mint).toBe('SOL');
  });

  it('returns empty array for empty member list', () => {
    expect(aggregateBalances([])).toEqual([]);
  });
});
