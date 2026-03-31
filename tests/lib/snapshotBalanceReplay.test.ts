/**
 * Tests that the snapshot balance replay correctly separates liquid SOL from staking.
 *
 * Staking rewards accumulate in stake accounts, NOT the wallet's liquid SOL balance.
 * They must only appear in the stakingInfo section of the snapshot, not in holdings.solBalance.
 *
 * The final snapshot value should be:
 *   SOL (liquid) + token amounts + staked SOL + accumulated staking rewards
 * where staking rewards are NOT double-counted in the liquid SOL balance.
 */

import { describe, it, expect } from 'vitest';
import { computeSnapshotBalances, computeStakingInfo } from '../../src/lib/snapshotEngine';
import type { ParsedTransaction, TaxCategory } from '../../src/types/transaction';
import { interpretTransaction } from '../../src/lib/taxCategorizer';

const WALLET = '5UcncQ7oQm6HNsm5UhWDuufF8q3vvPKM35fgnRYf1rmv';
const SNAPSHOT_TS = Math.floor(new Date('2025-12-31T23:59:00Z').getTime() / 1000);
const ts = (d: string) => Math.floor(new Date(d).getTime() / 1000);

const TOKEN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC-like
const SKR_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
const FARTCOIN_MINT = '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump';

function makeTx(
  signature: string,
  blockTime: number,
  taxCategory: TaxCategory,
  balanceChanges: { mint: string; amount: number; decimals: number; isStakingReward?: boolean }[],
): ParsedTransaction {
  return {
    signature,
    blockTime,
    slot: taxCategory === 'STAKING_REWARD' ? 0 : 100,
    fee: 0,
    taxCategory,
    heliusType: null,
    description: null,
    balanceChanges,
    err: null,
    counterparty: null,
    interpretedFlow: interpretTransaction(balanceChanges),
  };
}

describe('snapshot balance replay — staking reward exclusion', () => {
  // Scenario: wallet receives 10 SOL, delegates 2 SOL, earns 0.05 SOL in rewards
  const transactions: ParsedTransaction[] = [
    // Receive 10 SOL
    makeTx('receive-1', ts('2025-01-15T00:00:00Z'), 'TRANSFER_IN', [
      { mint: 'SOL', amount: 10.0, decimals: 9 },
    ]),
    // Delegate 2 SOL to staking
    makeTx('delegate-1', ts('2025-03-15T00:00:00Z'), 'STAKE_DELEGATE', [
      { mint: 'SOL', amount: -2.0, decimals: 9 },
    ]),
    // Staking reward: 0.02 SOL (accumulates in stake account, not wallet)
    makeTx('reward-1', ts('2025-06-15T00:00:00Z'), 'STAKING_REWARD', [
      { mint: 'SOL', amount: 0.02, decimals: 9, isStakingReward: true },
    ]),
    // Staking reward: 0.03 SOL
    makeTx('reward-2', ts('2025-09-15T00:00:00Z'), 'STAKING_REWARD', [
      { mint: 'SOL', amount: 0.03, decimals: 9, isStakingReward: true },
    ]),
    // Receive 100 USDC
    makeTx('receive-usdc', ts('2025-02-01T00:00:00Z'), 'TRANSFER_IN', [
      { mint: TOKEN_MINT, amount: 100.0, decimals: 6 },
    ]),
  ];

  it('should NOT include staking rewards in liquid SOL balance', () => {
    const { solLamports } = computeSnapshotBalances(SNAPSHOT_TS, transactions);
    const solBalance = Number(solLamports) / 1e9;
    // 10 SOL received - 2 SOL delegated = 8 SOL liquid
    // Staking rewards (0.02 + 0.03 = 0.05) must NOT be added
    expect(solBalance).toBeCloseTo(8.0, 6);
  });

  it('should include staking rewards in stakingInfo only', () => {
    const info = computeStakingInfo(SNAPSHOT_TS, transactions, WALLET)!;
    // Staked: 2 SOL delegated + 0.05 rewards = 2.05
    expect(info.totalStakedSol).toBeCloseTo(2.05, 6);
    expect(info.totalRewardsEarnedSol).toBeCloseTo(0.05, 9);
    expect(info.rewardCount).toBe(2);
  });

  it('should correctly track token balances alongside staking exclusion', () => {
    const { tokenMap } = computeSnapshotBalances(SNAPSHOT_TS, transactions);
    const usdcRaw = tokenMap.get(TOKEN_MINT) ?? BigInt(0);
    const usdcUi = Number(usdcRaw) / 1e6;
    expect(usdcUi).toBeCloseTo(100.0, 6);
  });

  it('total snapshot value = liquid SOL + tokens + staked SOL (including rewards)', () => {
    const { solLamports } = computeSnapshotBalances(SNAPSHOT_TS, transactions);
    const liquidSol = Number(solLamports) / 1e9;
    const info = computeStakingInfo(SNAPSHOT_TS, transactions, WALLET)!;

    // Liquid: 8 SOL, Staked: 2.05 SOL (2 delegated + 0.05 rewards)
    // Total SOL exposure: 8 + 2.05 = 10.05
    const totalSolExposure = liquidSol + info.totalStakedSol;
    expect(totalSolExposure).toBeCloseTo(10.05, 6);
    // No double-counting: should NOT be 10.10 (which would happen if rewards were in both)
    expect(totalSolExposure).not.toBeCloseTo(10.10, 2);
  });
});

describe('snapshot balance replay — stake withdraw returns SOL to liquid balance', () => {
  const transactions: ParsedTransaction[] = [
    makeTx('receive-1', ts('2025-01-15T00:00:00Z'), 'TRANSFER_IN', [
      { mint: 'SOL', amount: 10.0, decimals: 9 },
    ]),
    makeTx('delegate-1', ts('2025-03-15T00:00:00Z'), 'STAKE_DELEGATE', [
      { mint: 'SOL', amount: -3.0, decimals: 9 },
    ]),
    // Withdraw 1 SOL back to wallet
    makeTx('withdraw-1', ts('2025-06-15T00:00:00Z'), 'STAKE_WITHDRAW', [
      { mint: 'SOL', amount: 1.0, decimals: 9 },
    ]),
  ];

  it('delegate reduces and withdraw increases liquid SOL balance', () => {
    const { solLamports } = computeSnapshotBalances(SNAPSHOT_TS, transactions);
    const solBalance = Number(solLamports) / 1e9;
    // 10 - 3 + 1 = 8 SOL liquid
    expect(solBalance).toBeCloseTo(8.0, 6);
  });

  it('stakingInfo reflects net staked amount after withdrawal', () => {
    const info = computeStakingInfo(SNAPSHOT_TS, transactions, WALLET)!;
    // 3 delegated - 1 withdrawn = 2 SOL staked
    expect(info.totalStakedSol).toBeCloseTo(2.0, 6);
  });
});

describe('snapshot balance replay — no staking transactions', () => {
  const transactions: ParsedTransaction[] = [
    makeTx('receive-1', ts('2025-01-15T00:00:00Z'), 'TRANSFER_IN', [
      { mint: 'SOL', amount: 5.0, decimals: 9 },
    ]),
    makeTx('send-1', ts('2025-06-15T00:00:00Z'), 'TRANSFER_OUT', [
      { mint: 'SOL', amount: -1.0, decimals: 9 },
    ]),
  ];

  it('liquid SOL reflects all non-staking transactions', () => {
    const { solLamports } = computeSnapshotBalances(SNAPSHOT_TS, transactions);
    const solBalance = Number(solLamports) / 1e9;
    expect(solBalance).toBeCloseTo(4.0, 6);
  });
});

/**
 * Realistic multi-token scenario with SOL, SKR, Fartcoin, staking delegates,
 * a partial withdraw, and interleaved staking rewards.
 *
 * Timeline:
 *   Jan 10 — Receive 20 SOL
 *   Feb 01 — Buy 500,000 SKR (swap: -2 SOL, +500,000 SKR)
 *   Mar 01 — Buy 10,000,000 Fartcoin (swap: -1 SOL, +10,000,000 FARTCOIN)
 *   Mar 15 — Delegate 5 SOL to staking
 *   Apr 10 — Staking reward: 0.012 SOL
 *   May 05 — Delegate 3 SOL to staking
 *   May 20 — Staking reward: 0.018 SOL
 *   Jun 15 — Sell 200,000 SKR for SOL (swap: +0.8 SOL, -200,000 SKR)
 *   Jul 10 — Staking reward: 0.015 SOL
 *   Aug 01 — Withdraw 2 SOL from staking
 *   Sep 15 — Staking reward: 0.020 SOL
 *   Oct 01 — Send 1,000,000 Fartcoin to another wallet
 *   Nov 10 — Staking reward: 0.022 SOL
 *   Dec 01 — Receive 5 SOL
 *
 * Expected at snapshot (Dec 31 2025):
 *   Liquid SOL:  20 - 2 - 1 - 5 - 3 + 0.8 + 2 + 5 = 16.8 SOL
 *   SKR:         500,000 - 200,000 = 300,000 SKR
 *   Fartcoin:    10,000,000 - 1,000,000 = 9,000,000 FARTCOIN
 *   Staked SOL:  5 + 3 - 2 + rewards(0.087) = 6.087 SOL
 *   Rewards:     0.012 + 0.018 + 0.015 + 0.020 + 0.022 = 0.087 SOL
 */
describe('snapshot balance replay — multi-token with SOL, SKR, Fartcoin and staking', () => {
  const transactions: ParsedTransaction[] = [
    // Jan 10: receive 20 SOL
    makeTx('receive-sol', ts('2025-01-10T00:00:00Z'), 'TRANSFER_IN', [
      { mint: 'SOL', amount: 20.0, decimals: 9 },
    ]),
    // Feb 01: swap 2 SOL → 500,000 SKR
    makeTx('buy-skr', ts('2025-02-01T00:00:00Z'), 'TRADE', [
      { mint: 'SOL', amount: -2.0, decimals: 9 },
      { mint: SKR_MINT, amount: 500_000.0, decimals: 6 },
    ]),
    // Mar 01: swap 1 SOL → 10,000,000 Fartcoin
    makeTx('buy-fartcoin', ts('2025-03-01T00:00:00Z'), 'TRADE', [
      { mint: 'SOL', amount: -1.0, decimals: 9 },
      { mint: FARTCOIN_MINT, amount: 10_000_000.0, decimals: 6 },
    ]),
    // Mar 15: delegate 5 SOL
    makeTx('delegate-1', ts('2025-03-15T00:00:00Z'), 'STAKE_DELEGATE', [
      { mint: 'SOL', amount: -5.0, decimals: 9 },
    ]),
    // Apr 10: staking reward 0.012 SOL
    makeTx('reward-1', ts('2025-04-10T00:00:00Z'), 'STAKING_REWARD', [
      { mint: 'SOL', amount: 0.012, decimals: 9, isStakingReward: true },
    ]),
    // May 05: delegate 3 SOL
    makeTx('delegate-2', ts('2025-05-05T00:00:00Z'), 'STAKE_DELEGATE', [
      { mint: 'SOL', amount: -3.0, decimals: 9 },
    ]),
    // May 20: staking reward 0.018 SOL
    makeTx('reward-2', ts('2025-05-20T00:00:00Z'), 'STAKING_REWARD', [
      { mint: 'SOL', amount: 0.018, decimals: 9, isStakingReward: true },
    ]),
    // Jun 15: sell 200,000 SKR → 0.8 SOL
    makeTx('sell-skr', ts('2025-06-15T00:00:00Z'), 'TRADE', [
      { mint: SKR_MINT, amount: -200_000.0, decimals: 6 },
      { mint: 'SOL', amount: 0.8, decimals: 9 },
    ]),
    // Jul 10: staking reward 0.015 SOL
    makeTx('reward-3', ts('2025-07-10T00:00:00Z'), 'STAKING_REWARD', [
      { mint: 'SOL', amount: 0.015, decimals: 9, isStakingReward: true },
    ]),
    // Aug 01: withdraw 2 SOL from staking
    makeTx('withdraw-1', ts('2025-08-01T00:00:00Z'), 'STAKE_WITHDRAW', [
      { mint: 'SOL', amount: 2.0, decimals: 9 },
    ]),
    // Sep 15: staking reward 0.020 SOL
    makeTx('reward-4', ts('2025-09-15T00:00:00Z'), 'STAKING_REWARD', [
      { mint: 'SOL', amount: 0.020, decimals: 9, isStakingReward: true },
    ]),
    // Oct 01: send 1,000,000 Fartcoin
    makeTx('send-fartcoin', ts('2025-10-01T00:00:00Z'), 'TRANSFER_OUT', [
      { mint: FARTCOIN_MINT, amount: -1_000_000.0, decimals: 6 },
    ]),
    // Nov 10: staking reward 0.022 SOL
    makeTx('reward-5', ts('2025-11-10T00:00:00Z'), 'STAKING_REWARD', [
      { mint: 'SOL', amount: 0.022, decimals: 9, isStakingReward: true },
    ]),
    // Dec 01: receive 5 SOL
    makeTx('receive-sol-2', ts('2025-12-01T00:00:00Z'), 'TRANSFER_IN', [
      { mint: 'SOL', amount: 5.0, decimals: 9 },
    ]),
  ];

  it('liquid SOL = 16.8 (excludes all staking rewards)', () => {
    const { solLamports } = computeSnapshotBalances(SNAPSHOT_TS, transactions);
    const solBalance = Number(solLamports) / 1e9;
    // 20 - 2 - 1 - 5 - 3 + 0.8 + 2 + 5 = 16.8
    expect(solBalance).toBeCloseTo(16.8, 6);
  });

  it('SKR balance = 300,000 (bought 500k, sold 200k)', () => {
    const { tokenMap } = computeSnapshotBalances(SNAPSHOT_TS, transactions);
    const skrRaw = tokenMap.get(SKR_MINT) ?? BigInt(0);
    const skrUi = Number(skrRaw) / 1e6;
    expect(skrUi).toBeCloseTo(300_000.0, 6);
  });

  it('Fartcoin balance = 9,000,000 (bought 10M, sent 1M)', () => {
    const { tokenMap } = computeSnapshotBalances(SNAPSHOT_TS, transactions);
    const fartRaw = tokenMap.get(FARTCOIN_MINT) ?? BigInt(0);
    const fartUi = Number(fartRaw) / 1e6;
    expect(fartUi).toBeCloseTo(9_000_000.0, 6);
  });

  it('staked SOL = 6.087 (delegated 8, withdrawn 2, rewards 0.087)', () => {
    const info = computeStakingInfo(SNAPSHOT_TS, transactions, WALLET)!;
    // 5 + 3 - 2 + 0.087 = 6.087
    expect(info.totalStakedSol).toBeCloseTo(6.087, 6);
  });

  it('total rewards = 0.087 SOL across 5 reward events', () => {
    const info = computeStakingInfo(SNAPSHOT_TS, transactions, WALLET)!;
    expect(info.totalRewardsEarnedSol).toBeCloseTo(0.087, 9);
    expect(info.rewardCount).toBe(5);
  });

  it('total SOL exposure = liquid + staked (no double-counting rewards)', () => {
    const { solLamports } = computeSnapshotBalances(SNAPSHOT_TS, transactions);
    const liquidSol = Number(solLamports) / 1e9;
    const info = computeStakingInfo(SNAPSHOT_TS, transactions, WALLET)!;

    // liquid 16.8 + staked 6.087 = 22.887
    const totalSol = liquidSol + info.totalStakedSol;
    expect(totalSol).toBeCloseTo(22.887, 6);

    // If rewards were double-counted it would be 22.887 + 0.087 = 22.974
    expect(totalSol).not.toBeCloseTo(22.974, 2);
  });

  it('snapshot sum = liquid SOL + token values + staked SOL (with rewards)', () => {
    const { solLamports, tokenMap } = computeSnapshotBalances(SNAPSHOT_TS, transactions);
    const liquidSol = Number(solLamports) / 1e9;
    const info = computeStakingInfo(SNAPSHOT_TS, transactions, WALLET)!;

    const skrUi = Number(tokenMap.get(SKR_MINT) ?? BigInt(0)) / 1e6;
    const fartUi = Number(tokenMap.get(FARTCOIN_MINT) ?? BigInt(0)) / 1e6;

    // Use hypothetical prices to compute total snapshot value
    const solPrice = 150;    // $150/SOL
    const skrPrice = 0.01;   // $0.01/SKR
    const fartPrice = 0.0001; // $0.0001/FARTCOIN

    const liquidSolValue = liquidSol * solPrice;              // 16.8 * 150 = 2520
    const stakedSolValue = info.totalStakedSol * solPrice;    // 6.087 * 150 = 913.05
    const skrValue = skrUi * skrPrice;                        // 300,000 * 0.01 = 3000
    const fartValue = fartUi * fartPrice;                     // 9,000,000 * 0.0001 = 900

    const totalSnapshotValue = liquidSolValue + stakedSolValue + skrValue + fartValue;
    // 2520 + 913.05 + 3000 + 900 = 7333.05
    expect(totalSnapshotValue).toBeCloseTo(7333.05, 1);

    // Verify rewards are only in staked portion, not liquid
    const rewardsValue = info.totalRewardsEarnedSol * solPrice; // 0.087 * 150 = 13.05
    expect(stakedSolValue).toBeCloseTo(913.05, 1);
    // stakedSolValue includes rewards value (6 base + 0.087 rewards) * 150
    expect(rewardsValue).toBeCloseTo(13.05, 1);
  });
});
