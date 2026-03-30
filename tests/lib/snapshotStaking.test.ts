/**
 * Tests for staking data in snapshot computation using transaction replay.
 *
 * Scenario: snapshot at Dec 31, 2025 23:59 with:
 *  - 2 stake delegate transactions of 1 SOL each in April and June 2025 (before snapshot)
 *  - 2 stake delegate transactions of 2 SOL each in January and March 2026 (after snapshot)
 *  - Staking rewards before and after the snapshot date
 *  - 1 stake withdraw of 0.5 SOL in October 2025 (before snapshot)
 *
 * Expected: snapshot shows staked SOL from pre-snapshot delegations + rewards − withdrawals,
 * and only rewards earned up to Dec 31, 2025.
 */

import { describe, it, expect } from 'vitest';
import { computeStakingInfo } from '../../src/lib/snapshotEngine';
import type { ParsedTransaction } from '../../src/types/transaction';
import type { TaxCategory } from '../../src/types/transaction';
import { interpretTransaction } from '../../src/lib/taxCategorizer';

// ─── Timestamps (Unix seconds) ──────────────────────────────────────────────

const SNAPSHOT_TS = Math.floor(new Date('2025-12-31T23:59:00Z').getTime() / 1000);
const WALLET_A = '5UcncQ7oQm6HNsm5UhWDuufF8q3vvPKM35fgnRYf1rmv';
const WALLET_B = '9XcncQ7oQm6HNsm5UhWDuufF8q3vvPKM35fgnRYf1xyz';

// ─── Helper to build a minimal ParsedTransaction ────────────────────────────

function makeTx(
  signature: string,
  blockTime: number,
  taxCategory: TaxCategory,
  solAmount: number,
  userAccount?: string,
): ParsedTransaction {
  const balanceChanges = [{ mint: 'SOL', amount: solAmount, decimals: 9, userAccount }];
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

// ─── Transactions ──────────────────────────────────────────────────────────

const ts = (d: string) => Math.floor(new Date(d).getTime() / 1000);

const transactions: ParsedTransaction[] = [
  // Pre-snapshot: delegate 1 SOL in April 2025 (wallet loses 1 SOL)
  makeTx('delegate-1', ts('2025-04-15T00:00:00Z'), 'STAKE_DELEGATE', -1.0, WALLET_A),
  // Pre-snapshot: delegate 1 SOL in June 2025 (wallet loses 1 SOL)
  makeTx('delegate-2', ts('2025-06-15T00:00:00Z'), 'STAKE_DELEGATE', -1.0, WALLET_A),
  // Pre-snapshot: staking reward 0.005 SOL in May 2025
  makeTx('reward-1', ts('2025-05-15T00:00:00Z'), 'STAKING_REWARD', 0.005),
  // Pre-snapshot: staking reward 0.005 SOL in August 2025
  makeTx('reward-2', ts('2025-08-15T00:00:00Z'), 'STAKING_REWARD', 0.005),
  // Pre-snapshot: staking reward 0.005 SOL in November 2025
  makeTx('reward-3', ts('2025-11-15T00:00:00Z'), 'STAKING_REWARD', 0.005),
  // Pre-snapshot: staking reward 0.003 SOL in July 2025
  makeTx('reward-4', ts('2025-07-15T00:00:00Z'), 'STAKING_REWARD', 0.003),
  // Pre-snapshot: staking reward 0.004 SOL in October 2025
  makeTx('reward-5', ts('2025-10-15T00:00:00Z'), 'STAKING_REWARD', 0.004),
  // Pre-snapshot: withdraw 0.5 SOL in October 2025 (wallet gains 0.5 SOL)
  makeTx('withdraw-1', ts('2025-10-20T00:00:00Z'), 'STAKE_WITHDRAW', 0.5, WALLET_A),

  // Post-snapshot: delegate 2 SOL in January 2026
  makeTx('delegate-3', ts('2026-01-15T00:00:00Z'), 'STAKE_DELEGATE', -2.0, WALLET_A),
  // Post-snapshot: delegate 2 SOL in March 2026
  makeTx('delegate-4', ts('2026-03-15T00:00:00Z'), 'STAKE_DELEGATE', -2.0, WALLET_A),
  // Post-snapshot: staking reward in February 2026
  makeTx('reward-6', ts('2026-02-15T00:00:00Z'), 'STAKING_REWARD', 0.005),
  // Post-snapshot: staking reward in March 2026
  makeTx('reward-7', ts('2026-03-10T00:00:00Z'), 'STAKING_REWARD', 0.004),

  // A non-staking transaction (should be ignored)
  makeTx('transfer-1', ts('2025-09-01T00:00:00Z'), 'TRANSFER_OUT', -0.1, WALLET_A),
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('computeStakingInfo — snapshot at Dec 31, 2025 23:59', () => {
  const info = computeStakingInfo(SNAPSHOT_TS, transactions, WALLET_A)!;

  it('should return staking info', () => {
    expect(info).toBeDefined();
  });

  it('should compute totalStakedSol from pre-snapshot delegations + rewards − withdrawals', () => {
    // Delegated: 1 + 1 = 2 SOL
    // Rewards: 0.005 + 0.005 + 0.005 + 0.003 + 0.004 = 0.022 SOL
    // Withdrawn: 0.5 SOL
    // Total: 2 + 0.022 - 0.5 = 1.522 SOL
    expect(info.totalStakedSol).toBeCloseTo(1.522, 6);
  });

  it('should only count rewards with timestamp <= snapshot date', () => {
    // 5 pre-snapshot rewards
    expect(info.rewardCount).toBe(5);
  });

  it('should compute totalRewardsEarnedSol from pre-snapshot rewards only', () => {
    // 0.005 + 0.005 + 0.005 + 0.003 + 0.004 = 0.022 SOL
    expect(info.totalRewardsEarnedSol).toBeCloseTo(0.022, 9);
  });

  it('should NOT include post-snapshot transactions in any totals', () => {
    // Post-snapshot would add 4 SOL delegated + 0.009 rewards
    expect(info.totalStakedSol).toBeLessThan(2.0);
    expect(info.totalRewardsEarnedSol).toBeLessThan(0.03);
  });

  it('should ignore non-staking transactions', () => {
    // The TRANSFER_OUT of 0.1 SOL should not affect staking totals
    expect(info.totalStakedSol).toBeCloseTo(1.522, 6);
  });
});

describe('computeStakingInfo — wallet filtering', () => {
  it('should only count balance changes belonging to the target wallet', () => {
    const txs = [
      makeTx('delegate-a', ts('2025-04-15T00:00:00Z'), 'STAKE_DELEGATE', -2.0, WALLET_A),
      makeTx('delegate-b', ts('2025-05-15T00:00:00Z'), 'STAKE_DELEGATE', -3.0, WALLET_B),
    ];
    const infoA = computeStakingInfo(SNAPSHOT_TS, txs, WALLET_A)!;
    expect(infoA.totalStakedSol).toBeCloseTo(2.0, 6);

    const infoB = computeStakingInfo(SNAPSHOT_TS, txs, WALLET_B)!;
    expect(infoB.totalStakedSol).toBeCloseTo(3.0, 6);
  });

  it('should include balance changes without userAccount (e.g. staking rewards)', () => {
    const txs = [
      makeTx('delegate-a', ts('2025-04-15T00:00:00Z'), 'STAKE_DELEGATE', -1.0, WALLET_A),
      // Staking rewards have no userAccount
      makeTx('reward-1', ts('2025-06-15T00:00:00Z'), 'STAKING_REWARD', 0.01),
    ];
    const info = computeStakingInfo(SNAPSHOT_TS, txs, WALLET_A)!;
    // 1.0 delegated + 0.01 reward = 1.01
    expect(info.totalStakedSol).toBeCloseTo(1.01, 6);
    expect(info.totalRewardsEarnedSol).toBeCloseTo(0.01, 9);
  });

  it('should exclude balance changes from a different wallet even in mixed transactions', () => {
    // A transaction with balance changes from two different wallets
    const mixedTx: ParsedTransaction = {
      signature: 'mixed-delegate',
      blockTime: ts('2025-04-15T00:00:00Z'),
      slot: 100,
      fee: 0,
      taxCategory: 'STAKE_DELEGATE',
      heliusType: null,
      description: null,
      balanceChanges: [
        { mint: 'SOL', amount: -1.5, decimals: 9, userAccount: WALLET_A },
        { mint: 'SOL', amount: -0.5, decimals: 9, userAccount: WALLET_B },
      ],
      err: null,
      counterparty: null,
      interpretedFlow: interpretTransaction([
        { mint: 'SOL', amount: -1.5, decimals: 9, userAccount: WALLET_A },
        { mint: 'SOL', amount: -0.5, decimals: 9, userAccount: WALLET_B },
      ]),
    };
    const infoA = computeStakingInfo(SNAPSHOT_TS, [mixedTx], WALLET_A)!;
    expect(infoA.totalStakedSol).toBeCloseTo(1.5, 6);

    const infoB = computeStakingInfo(SNAPSHOT_TS, [mixedTx], WALLET_B)!;
    expect(infoB.totalStakedSol).toBeCloseTo(0.5, 6);
  });
});

describe('computeStakingInfo — edge cases', () => {
  it('should return undefined when no staking transactions exist', () => {
    const nonStakingTxs = [
      makeTx('transfer-1', ts('2025-09-01T00:00:00Z'), 'TRANSFER_OUT', -0.1, WALLET_A),
    ];
    expect(computeStakingInfo(SNAPSHOT_TS, nonStakingTxs, WALLET_A)).toBeUndefined();
  });

  it('should return undefined for empty transaction list', () => {
    expect(computeStakingInfo(SNAPSHOT_TS, [], WALLET_A)).toBeUndefined();
  });

  it('should return undefined when all staking transactions are after the snapshot', () => {
    const earlyTs = Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000);
    expect(computeStakingInfo(earlyTs, transactions, WALLET_A)).toBeUndefined();
  });

  it('should clamp totalStakedSol to zero if withdrawals exceed delegations', () => {
    const txs = [
      makeTx('delegate-1', ts('2025-04-15T00:00:00Z'), 'STAKE_DELEGATE', -1.0, WALLET_A),
      makeTx('withdraw-1', ts('2025-06-15T00:00:00Z'), 'STAKE_WITHDRAW', 2.0, WALLET_A),
    ];
    const info = computeStakingInfo(SNAPSHOT_TS, txs, WALLET_A)!;
    expect(info.totalStakedSol).toBe(0);
  });

  it('should handle rewards-only scenario', () => {
    const txs = [
      makeTx('reward-1', ts('2025-05-15T00:00:00Z'), 'STAKING_REWARD', 0.01),
      makeTx('reward-2', ts('2025-08-15T00:00:00Z'), 'STAKING_REWARD', 0.02),
    ];
    const info = computeStakingInfo(SNAPSHOT_TS, txs, WALLET_A)!;
    expect(info.totalStakedSol).toBeCloseTo(0.03, 9);
    expect(info.totalRewardsEarnedSol).toBeCloseTo(0.03, 9);
    expect(info.rewardCount).toBe(2);
  });

  it('should skip failed transactions', () => {
    const txs: ParsedTransaction[] = [
      makeTx('delegate-1', ts('2025-04-15T00:00:00Z'), 'STAKE_DELEGATE', -1.0, WALLET_A),
      { ...makeTx('delegate-fail', ts('2025-05-15T00:00:00Z'), 'STAKE_DELEGATE', -1.0, WALLET_A), err: 'InstructionError' },
    ];
    const info = computeStakingInfo(SNAPSHOT_TS, txs, WALLET_A)!;
    expect(info.totalStakedSol).toBeCloseTo(1.0, 6);
  });
});
