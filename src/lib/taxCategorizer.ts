import type { HeliusWalletHistoryTx } from '../types/api';
import type { TaxCategory, ParsedTransaction, BalanceChange, InterpretedFlow, RentItem } from '../types/transaction';
import type { StakingReward } from '../types/wallet';
import { SEEKER_STAKING_CONFIG, SKR_MINT } from './helius';

export type { InterpretedFlow, RentItem };

const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111111';
const WSOL_MINT       = 'So11111111111111111111111111111111111111112';

export function isSolMint(mint: string): boolean {
  return mint === 'SOL' || mint === NATIVE_SOL_MINT || mint === WSOL_MINT;
}

const MAGIC_RENT: Array<{ value: number; label: string; refundable: boolean }> = [
  { value: 0.00203928, label: 'Token Storage Deposit', refundable: true  },
  { value: 0.101844,   label: 'DEX Market Deposit',    refundable: true  },
  { value: 0.001002,   label: 'Account Setup',         refundable: false },
];
const MAGIC_TOLERANCE = 0.000001;

export function interpretTransaction(balanceChanges: BalanceChange[]): InterpretedFlow {
  // Step 1: Scan individual SOL entries BEFORE merging → collect rentItems
  const rentItems: RentItem[] = [];
  const smallFeeSet = new Set<BalanceChange>();
  for (const bc of balanceChanges) {
    if (!isSolMint(bc.mint)) continue;
    const absAmt = Math.abs(bc.amount);
    let isRent = false;
    for (const rent of MAGIC_RENT) {
      if (Math.abs(absAmt - rent.value) < MAGIC_TOLERANCE) {
        rentItems.push({ amount: bc.amount, label: rent.label, refundable: rent.refundable });
        isRent = true;
        break;
      }
    }
    // Small non-rent SOL values become a 'Fee' rent item instead of a balance change
    // Skip this heuristic for staking rewards — their small amounts are genuine income.
    if (!isRent && !bc.isStakingReward && bc.amount < 0 && absAmt > 0 && absAmt < 0.005) {
      smallFeeSet.add(bc);
      rentItems.push({ amount: bc.amount, label: 'Fee', refundable: false });
    }
  }

  // Step 2: Group by mint, sum amounts; unify SOL + WSOL → 'SOL'
  // Skip small fee entries — they are shown as rentItems instead.
  const grouped = new Map<string, { amount: number; decimals: number; userAccount?: string }>();
  for (const bc of balanceChanges) {
    if (smallFeeSet.has(bc)) continue;
    const key = isSolMint(bc.mint) ? 'SOL' : bc.mint;
    const existing = grouped.get(key);
    if (existing) {
      existing.amount += bc.amount;
      if (bc.userAccount && !existing.userAccount) existing.userAccount = bc.userAccount;
    } else {
      grouped.set(key, { amount: bc.amount, decimals: bc.decimals, userAccount: bc.userAccount });
    }
  }

  // Step 3: Drop sub-lamport dust / perfect zero-sums
  const netChanges: BalanceChange[] = [];
  for (const [mint, entry] of grouped) {
    if (Math.abs(entry.amount) < 1e-9) continue;
    netChanges.push({ mint, amount: entry.amount, decimals: entry.decimals, userAccount: entry.userAccount });
  }

  return { netChanges, rentItems };
}



export function categorize(changes: BalanceChange[]): TaxCategory {
  const tokens = changes.filter(c => !isSolMint(c.mint));
  const sol = changes.filter(c => isSolMint(c.mint));

  const inTokens = tokens.filter(c => c.amount > 0);
  const outTokens = tokens.filter(c => c.amount < 0);
  const uniqueMints = new Set(tokens.map(c => c.mint));

  // Both in and out across multiple mints → swap/trade
  if (uniqueMints.size >= 2 && inTokens.length > 0 && outTokens.length > 0) return 'TRADE';
  // SOL going out, token coming in (or vice versa) → also a trade
  if (sol.length > 0 && tokens.length > 0) {
    const solNet = sol.reduce((s, c) => s + c.amount, 0);
    const hasInToken = inTokens.length > 0;
    const hasOutToken = outTokens.length > 0;
    if ((solNet < 0 && hasInToken) || (solNet > 0 && hasOutToken)) return 'TRADE';
  }

  if (tokens.length > 0 && outTokens.length > 0 && inTokens.length === 0) return 'TRANSFER_OUT';
  if (tokens.length > 0 && inTokens.length > 0 && outTokens.length === 0) return 'TRANSFER_IN';

  if (tokens.length === 0 && sol.length > 0) {
    const net = sol.reduce((s, c) => s + c.amount, 0);
    return net > 0 ? 'TRANSFER_IN' : 'TRANSFER_OUT';
  }

  if (changes.length === 0) return 'FEE';

  return 'OTHER';
}

export function stakingRewardsToTransactions(rewards: StakingReward[]): ParsedTransaction[] {
  return rewards.map(reward => {
    const balanceChanges: BalanceChange[] = [{ mint: 'SOL', amount: reward.amount / 1e9, decimals: 9, isStakingReward: true }];
    return {
      signature: `epoch-${reward.epoch}-${reward.stakeAccount}`,
      blockTime: reward.estimatedTimestamp,
      slot: 0,
      fee: 0,
      taxCategory: 'STAKING_REWARD' as TaxCategory,
      heliusType: 'INFLATION_REWARD',
      description: `Staking reward epoch ${reward.epoch}`,
      balanceChanges,
      err: null,
      counterparty: null,
      interpretedFlow: interpretTransaction(balanceChanges),
    };
  });
}

export const HELIUS_TYPE_CATEGORY: Partial<Record<string, TaxCategory>> = {
  SWAP:                        'TRADE',
  TOKEN_MINT:                  'TRADE',
  BURN:                        'BURN',
  OPEN_POSITION:               'TRADE',
  WITHDRAW:                    'TRANSFER_IN',
  WITHDRAW_UNSTAKED_DEPOSITS:  'TRANSFER_IN',
  STAKE_SOL:                   'STAKE_DELEGATE',
  UNSTAKE_SOL:                 'STAKE_WITHDRAW',
  HARVEST_REWARD:              'STAKE_WITHDRAW',
  CONSUME_EVENTS:              'FEE',
};

export function parseWalletHistoryTx(tx: HeliusWalletHistoryTx, walletAddress?: string): ParsedTransaction {
  const balanceChanges: BalanceChange[] = [];
  for (const entry of tx.accountData) {
    // Only collect balance changes for the wallet's own accounts.
    // Including all accounts causes intermediary pool/routing changes to
    // cancel out, making swaps look like zero-sum fee-only transactions.
    if (walletAddress) {
      if (entry.account === walletAddress && entry.nativeBalanceChange !== 0) {
        balanceChanges.push({
          mint: 'SOL',
          amount: entry.nativeBalanceChange / 1e9,
          decimals: 9,
          userAccount: walletAddress,
        });
      }
      for (const tbc of entry.tokenBalanceChanges ?? []) {
        if (tbc.userAccount !== walletAddress) continue;
        const dec = tbc.rawTokenAmount.decimals;
        const amount = Number(tbc.rawTokenAmount.tokenAmount) / Math.pow(10, dec);
        if (Math.abs(amount) < 1e-12) continue;
        balanceChanges.push({
          mint: tbc.mint,
          amount,
          decimals: dec,
          userAccount: walletAddress,
        });
      }
    } else {
      // Fallback: no wallet address — collect everything (legacy behavior)
      if (entry.nativeBalanceChange !== 0) {
        balanceChanges.push({
          mint: 'SOL',
          amount: entry.nativeBalanceChange / 1e9,
          decimals: 9,
        });
      }
      for (const tbc of entry.tokenBalanceChanges ?? []) {
        const dec = tbc.rawTokenAmount.decimals;
        const amount = Number(tbc.rawTokenAmount.tokenAmount) / Math.pow(10, dec);
        if (Math.abs(amount) < 1e-12) continue;
        balanceChanges.push({
          mint: tbc.mint,
          amount,
          decimals: dec,
        });
      }
    }
  }

  const interpretedFlow = interpretTransaction(balanceChanges);

  // Run categorize on netChanges so wrap/unwrap noise doesn't cause mislabeling
  let taxCategory: TaxCategory = categorize(interpretedFlow.netChanges);

  // Override with helius_type mapping when available (TRANSFER excluded — needs direction check)
  const heliusMapped = tx.type ? HELIUS_TYPE_CATEGORY[tx.type] : undefined;
  if (heliusMapped !== undefined) taxCategory = heliusMapped;

  // Detect Seeker (SKR) staking via token transfer counterparty
  const seekerTransfer = tx.tokenTransfers?.find(t => t.mint === SKR_MINT && (
    t.toUserAccount === SEEKER_STAKING_CONFIG || t.fromUserAccount === SEEKER_STAKING_CONFIG
  ));
  if (seekerTransfer) {
    taxCategory = seekerTransfer.toUserAccount === SEEKER_STAKING_CONFIG
      ? 'STAKE_DELEGATE'
      : 'STAKE_WITHDRAW';
  }

  let counterparty: string | null = null;
  if ((taxCategory === 'TRANSFER_IN' || taxCategory === 'TRANSFER_OUT') && walletAddress) {
    const isIn = taxCategory === 'TRANSFER_IN';
    const tokenMatch = tx.tokenTransfers?.find(t =>
      isIn
        ? t.toUserAccount === walletAddress && t.fromUserAccount !== walletAddress && t.fromUserAccount !== SEEKER_STAKING_CONFIG
        : t.fromUserAccount === walletAddress && t.toUserAccount !== walletAddress && t.toUserAccount !== SEEKER_STAKING_CONFIG
    );
    if (tokenMatch) {
      counterparty = isIn ? tokenMatch.fromUserAccount : tokenMatch.toUserAccount;
    } else {
      const nativeMatch = tx.nativeTransfers?.find(t =>
        isIn
          ? t.toUserAccount === walletAddress && t.fromUserAccount !== walletAddress
          : t.fromUserAccount === walletAddress && t.toUserAccount !== walletAddress
      );
      if (nativeMatch) {
        counterparty = isIn ? nativeMatch.fromUserAccount : nativeMatch.toUserAccount;
      }
    }
  }

  return {
    signature: tx.signature,
    blockTime: tx.timestamp ?? 0,
    slot: tx.slot,
    fee: tx.fee,
    taxCategory,
    heliusType: tx.type ?? null,
    description: tx.description ?? null,
    balanceChanges,
    err: tx.transactionError ? JSON.stringify(tx.transactionError) : null,
    counterparty,
    interpretedFlow,
  };
}
