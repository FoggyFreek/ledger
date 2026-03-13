/**
 * Tests for src/lib/groups.ts — computeUsdValues()
 *
 * Covers:
 *  - SOL mint mapping: balance changes with 'SOL' key must be looked up via
 *    the canonical WSOL mint (So11...112) in the prices API, then mapped back
 *  - inflow / outflow splitting: positive amount → usdInflow, negative → usdOutflow
 *  - batching by blockTime: transactions sharing the same blockTime trigger only
 *    one fetchHistoricalPrices call for that timestamp
 *  - priceFetched flag: true when at least one price was available, false otherwise
 *  - null USD values when no prices returned for a transaction
 *  - mixed: some transactions with prices, some without
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeUsdValues } from '../../src/lib/groups';
import type { ParsedTransaction } from '../../src/types/transaction';

// ─── mock dependencies ────────────────────────────────────────────────────────

vi.mock('../../src/lib/prices', () => ({
  fetchHistoricalPrices: vi.fn(),
}));

// isSolMint from taxCategorizer recognises 'SOL' (native alias) and both
// So111...111 / So111...112 variants. In the groups module the 'SOL' string
// from interpretedFlow.netChanges is what we see in practice.
vi.mock('../../src/lib/taxCategorizer', () => ({
  isSolMint: (mint: string) =>
    mint === 'SOL' ||
    mint === 'So11111111111111111111111111111111111111111' ||
    mint === 'So11111111111111111111111111111111111111112',
}));

import { fetchHistoricalPrices } from '../../src/lib/prices';
const mockFetch = fetchHistoricalPrices as ReturnType<typeof vi.fn>;

// ─── helpers ──────────────────────────────────────────────────────────────────

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const SOL_WSOL = 'So11111111111111111111111111111111111111112';

function makeTx(
  overrides: Partial<ParsedTransaction> & { netChanges: ParsedTransaction['interpretedFlow']['netChanges'] }
): ParsedTransaction {
  const { netChanges, ...rest } = overrides;
  return {
    signature: 'sig1',
    blockTime: 1_700_000_000,
    slot: 123,
    fee: 5000,
    taxCategory: 'TRADE',
    heliusType: null,
    description: null,
    balanceChanges: [],
    err: null,
    counterparty: null,
    interpretedFlow: { netChanges, rentItems: [] },
    ...rest,
  };
}

// ─── tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeUsdValues', () => {
  it('returns usdInflow for positive balance change', async () => {
    mockFetch.mockResolvedValueOnce(new Map([[USDC, 1.0]]));

    const tx = makeTx({
      netChanges: [{ mint: USDC, amount: 50, decimals: 6 }],
    });

    const [result] = await computeUsdValues([tx]);

    expect(result.signature).toBe('sig1');
    expect(result.usdInflow).toBeCloseTo(50);
    expect(result.usdOutflow).toBeCloseTo(0);
    expect(result.priceFetched).toBe(true);
  });

  it('returns usdOutflow for negative balance change', async () => {
    mockFetch.mockResolvedValueOnce(new Map([[USDC, 1.0]]));

    const tx = makeTx({
      netChanges: [{ mint: USDC, amount: -30, decimals: 6 }],
    });

    const [result] = await computeUsdValues([tx]);

    expect(result.usdInflow).toBeCloseTo(0);
    expect(result.usdOutflow).toBeCloseTo(30);
  });

  it('maps SOL mint to WSOL address for price lookup', async () => {
    // fetchHistoricalPrices is called with the canonical WSOL mint
    mockFetch.mockResolvedValueOnce(new Map([[SOL_WSOL, 150]]));

    const tx = makeTx({
      netChanges: [{ mint: 'SOL', amount: 2, decimals: 9 }],
    });

    await computeUsdValues([tx]);

    const [mints] = mockFetch.mock.calls[0] as [string[], number];
    expect(mints).toContain(SOL_WSOL);
    expect(mints).not.toContain('SOL');
  });

  it('computes correct USD value for SOL change', async () => {
    mockFetch.mockResolvedValueOnce(new Map([[SOL_WSOL, 150]]));

    const tx = makeTx({
      netChanges: [{ mint: 'SOL', amount: 2, decimals: 9 }],
    });

    const [result] = await computeUsdValues([tx]);

    expect(result.usdInflow).toBeCloseTo(300); // 2 SOL × $150
    expect(result.usdOutflow).toBeCloseTo(0);
    expect(result.priceFetched).toBe(true);
  });

  it('aggregates inflow and outflow across multiple mints in one tx', async () => {
    mockFetch.mockResolvedValueOnce(new Map([
      [SOL_WSOL, 150],
      [USDC, 1],
    ]));

    const tx = makeTx({
      netChanges: [
        { mint: 'SOL', amount: -1, decimals: 9 },  // spend 1 SOL → $150 out
        { mint: USDC, amount: 100, decimals: 6 },   // receive 100 USDC → $100 in
      ],
    });

    const [result] = await computeUsdValues([tx]);

    expect(result.usdInflow).toBeCloseTo(100);
    expect(result.usdOutflow).toBeCloseTo(150);
    expect(result.priceFetched).toBe(true);
  });

  it('sets priceFetched=false and null USD when no prices returned', async () => {
    mockFetch.mockResolvedValueOnce(new Map()); // empty — no prices

    const tx = makeTx({
      netChanges: [{ mint: BONK, amount: 1000, decimals: 5 }],
    });

    const [result] = await computeUsdValues([tx]);

    expect(result.usdInflow).toBeNull();
    expect(result.usdOutflow).toBeNull();
    expect(result.priceFetched).toBe(false);
  });

  it('batches transactions with the same blockTime into one price fetch', async () => {
    const sharedTime = 1_700_000_000;
    mockFetch.mockResolvedValue(new Map([[USDC, 1.0]]));

    const txA = makeTx({ signature: 'sigA', blockTime: sharedTime, netChanges: [{ mint: USDC, amount: 10, decimals: 6 }] });
    const txB = makeTx({ signature: 'sigB', blockTime: sharedTime, netChanges: [{ mint: USDC, amount: 20, decimals: 6 }] });

    await computeUsdValues([txA, txB]);

    // Only one fetch call despite two transactions
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('makes separate price fetch calls for different blockTimes', async () => {
    mockFetch.mockResolvedValue(new Map([[USDC, 1.0]]));

    const txA = makeTx({ signature: 'sigA', blockTime: 1_700_000_000, netChanges: [{ mint: USDC, amount: 10, decimals: 6 }] });
    const txB = makeTx({ signature: 'sigB', blockTime: 1_700_001_000, netChanges: [{ mint: USDC, amount: 20, decimals: 6 }] });

    await computeUsdValues([txA, txB]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const calledTimestamps = mockFetch.mock.calls.map((c: unknown[]) => c[1]);
    expect(calledTimestamps).toContain(1_700_000_000);
    expect(calledTimestamps).toContain(1_700_001_000);
  });

  it('deduplicates mints in the price fetch call', async () => {
    mockFetch.mockResolvedValueOnce(new Map([[USDC, 1.0]]));

    const tx = makeTx({
      netChanges: [
        { mint: USDC, amount: 10, decimals: 6 },
        { mint: USDC, amount: -5, decimals: 6 },
      ],
    });

    await computeUsdValues([tx]);

    const [mints] = mockFetch.mock.calls[0] as [string[], number];
    const usdcCount = mints.filter((m: string) => m === USDC).length;
    expect(usdcCount).toBe(1);
  });

  it('handles empty transaction list', async () => {
    const result = await computeUsdValues([]);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles transaction with no balance changes', async () => {
    mockFetch.mockResolvedValueOnce(new Map());

    const tx = makeTx({ netChanges: [] });
    const [result] = await computeUsdValues([tx]);

    expect(result.usdInflow).toBeNull();
    expect(result.usdOutflow).toBeNull();
    expect(result.priceFetched).toBe(false);
  });

  it('preserves correct signature on each result', async () => {
    mockFetch.mockResolvedValue(new Map([[USDC, 1.0]]));

    const txA = makeTx({ signature: 'aaaaa', blockTime: 1_700_000_000, netChanges: [{ mint: USDC, amount: 5, decimals: 6 }] });
    const txB = makeTx({ signature: 'bbbbb', blockTime: 1_700_001_000, netChanges: [{ mint: USDC, amount: 10, decimals: 6 }] });

    const results = await computeUsdValues([txA, txB]);

    expect(results[0].signature).toBe('aaaaa');
    expect(results[1].signature).toBe('bbbbb');
  });

  it('partial prices: skips mints without price but counts others', async () => {
    // USDC has a price, BONK does not
    mockFetch.mockResolvedValueOnce(new Map([[USDC, 1.0]]));

    const tx = makeTx({
      netChanges: [
        { mint: USDC, amount: 50, decimals: 6 },
        { mint: BONK, amount: 1_000_000, decimals: 5 }, // no price
      ],
    });

    const [result] = await computeUsdValues([tx]);

    expect(result.priceFetched).toBe(true); // at least one price found
    expect(result.usdInflow).toBeCloseTo(50); // only USDC counted
  });
});
