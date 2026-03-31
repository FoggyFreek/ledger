import type { ParsedTransaction } from '../types/transaction';
import type { WalletHoldings, WalletSnapshot, TokenHolding } from '../types/wallet';
import { findSlotForTimestamp } from './slotFinder';
import { getCachedTokenInfo, prefetchTokenMeta } from './helius';
import { isSolMint } from './taxCategorizer';
import { v4 as uuidv4 } from '../lib/uuid';
import { isBitvavoWallet } from './walletType';
import { BITVAVO_TOKEN_META } from './bitvavoParser';
import { SOL_MINT } from './constants';
import { fetchSnapshotTokenPrices } from './snapshotPrices';

// Converts a float amount to raw bigint without losing precision for high-decimal tokens.
// toFixed caps at the float's ~15 significant digits, then we parse as integer.
function floatToRawBigInt(amount: number, decimals: number): bigint {
  const str = amount.toFixed(Math.min(decimals, 15));
  const [intStr, fracStr = ''] = str.split('.');
  const paddedFrac = fracStr.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(intStr + paddedFrac);
}

/**
 * Replay balance changes from transactions up to targetTs.
 * Staking rewards are excluded — they accumulate in stake accounts, not the wallet's liquid balance.
 */
export function computeSnapshotBalances(
  targetTs: number,
  allTransactions: ParsedTransaction[],
): { solLamports: bigint; tokenMap: Map<string, bigint>; tokenDecimals: Map<string, number>; txCount: number } {
  const filtered = allTransactions
    .filter(tx => tx.blockTime <= targetTs && tx.err === null)
    .sort((a, b) => a.blockTime - b.blockTime);

  const tokenMap = new Map<string, bigint>();
  const tokenDecimals = new Map<string, number>();
  let solLamports = BigInt(0);

  for (const tx of filtered) {
    // Skip staking reward balance changes — they accumulate in stake accounts,
    // not the wallet's liquid SOL balance. They are tracked separately in stakingInfo.
    if (tx.taxCategory === 'STAKING_REWARD') continue;

    for (const bc of tx.balanceChanges) {
      if (isSolMint(bc.mint)) {
        solLamports += floatToRawBigInt(bc.amount, 9);
      } else {
        const rawDelta = floatToRawBigInt(bc.amount, bc.decimals);
        const current = tokenMap.get(bc.mint) ?? BigInt(0);
        tokenMap.set(bc.mint, current + rawDelta);
        if (!tokenDecimals.has(bc.mint)) {
          tokenDecimals.set(bc.mint, bc.decimals);
        }
      }
    }
  }

  return { solLamports, tokenMap, tokenDecimals, txCount: filtered.length };
}

export async function createSnapshot(
  walletAddress: string,
  label: string,
  targetDate: Date,
  allTransactions: ParsedTransaction[],
  currentHoldings: WalletHoldings | null,
): Promise<WalletSnapshot> {
  const targetTs = Math.floor(targetDate.getTime() / 1000);
  const isBitvavo = isBitvavoWallet(walletAddress);

  // Find approximate slot — skip for Bitvavo
  let slotApprox = 0;
  if (!isBitvavo) {
    try {
      slotApprox = await findSlotForTimestamp(targetTs);
    } catch {
      // fallback: just use 0 — snapshot will still work via blockTime filter
    }
  }

  // Replay balance changes (excludes staking rewards from liquid balance)
  const { solLamports, tokenMap, tokenDecimals, txCount: filteredCount } =
    computeSnapshotBalances(targetTs, allTransactions);

  // Prefetch metadata for mints not already in current holdings or registry — skip for Bitvavo
  if (!isBitvavo) {
    const unknownMints: string[] = [];
    for (const [mint, rawBig] of tokenMap.entries()) {
      if (rawBig <= BigInt(0)) continue;
      const fromHoldings = currentHoldings?.tokens.find(t => t.mint === mint);
      if (!fromHoldings && !getCachedTokenInfo(mint)) {
        unknownMints.push(mint);
      }
    }
    if (unknownMints.length > 0) {
      await prefetchTokenMeta(unknownMints);
    }
  }

  // Collect mints with positive balances for price fetching
  const positiveMints: string[] = [];
  for (const [mint, rawBig] of tokenMap.entries()) {
    if (rawBig > BigInt(0)) positiveMints.push(mint);
  }

  // Fetch historical prices for all tokens + SOL (USD + EUR)
  const walletType = isBitvavo ? 'bitvavo' as const : 'solana' as const;
  const allMints = isBitvavo ? [...positiveMints] : [SOL_MINT, ...positiveMints];
  const { usd: prices, eur: eurPrices } = await fetchSnapshotTokenPrices(allMints, targetTs, walletType);
  const solPrice = prices.get(SOL_MINT) ?? null;
  const solPriceEur = eurPrices.get(SOL_MINT) ?? null;
  const solBalance = Number(solLamports) / 1e9;

  const tokens: TokenHolding[] = [];
  for (const [mint, rawBig] of tokenMap.entries()) {
    if (rawBig <= BigInt(0)) continue;
    const decimals = tokenDecimals.get(mint) ?? 0;
    const uiAmt = Number(rawBig) / Math.pow(10, decimals);
    // Resolve metadata: prefer current holdings > Bitvavo meta > token registry > fallback
    const fromHoldings = currentHoldings?.tokens.find(t => t.mint === mint);
    const fromBitvavo = isBitvavo ? BITVAVO_TOKEN_META[mint] : undefined;
    const fromRegistry = !isBitvavo ? getCachedTokenInfo(mint) : undefined;
    const resolvedSymbol = isBitvavo ? mint : (fromHoldings?.symbol ?? fromRegistry?.symbol ?? '?');
    const name = fromHoldings?.name ?? fromBitvavo?.name ?? fromRegistry?.name ?? mint.slice(0, 8);
    const logoUri = fromHoldings?.logoUri ?? fromRegistry?.logoUri ?? null;
    const price = prices.get(mint);
    const usdValue = price != null ? uiAmt * price : null;
    const eurPrice = eurPrices.get(mint);
    const eurValue = eurPrice != null ? uiAmt * eurPrice : null;
    tokens.push({
      mint,
      symbol: resolvedSymbol,
      name,
      decimals,
      rawAmount: rawBig.toString(),
      uiAmount: uiAmt,
      usdValue,
      eurValue,
      logoUri,
    });
  }

  const holdings: WalletHoldings = {
    walletAddress,
    slot: slotApprox,
    fetchedAt: Date.now(),
    solBalance,
    solPrice,
    solPriceEur,
    tokens: tokens.sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };

  // Compute staking state at target date (Solana wallets only)
  const stakingInfo = !isBitvavo
    ? computeStakingInfo(targetTs, allTransactions, walletAddress)
    : undefined;

  return {
    id: uuidv4(),
    walletAddress,
    label,
    targetDate: targetDate.getTime(),
    createdAt: Date.now(),
    slotApproximation: slotApprox,
    holdings,
    txCountIncluded: filteredCount,
    stakingInfo,
  };
}

const STAKING_CATEGORIES = new Set(['STAKE_DELEGATE', 'STAKING_REWARD', 'STAKE_WITHDRAW']);

export function computeStakingInfo(
  targetTs: number,
  allTransactions: ParsedTransaction[],
  walletAddress: string,
): WalletSnapshot['stakingInfo'] {
  const stakingTxs = allTransactions.filter(tx =>
    tx.blockTime <= targetTs &&
    tx.err === null &&
    STAKING_CATEGORIES.has(tx.taxCategory)
  );

  if (stakingTxs.length === 0) return undefined;

  let totalStakedLamports = 0;
  let totalRewardsLamports = 0;
  let rewardCount = 0;

  for (const tx of stakingTxs) {
    // Only count SOL balance changes owned by the target wallet
    const solChange = tx.balanceChanges
      .filter(bc => isSolMint(bc.mint) && (!bc.userAccount || bc.userAccount === walletAddress))
      .reduce((sum, bc) => sum + bc.amount, 0);

    if (tx.taxCategory === 'STAKING_REWARD') {
      // Reward SOL is added to staking balance
      totalStakedLamports += Math.round(solChange * 1e9);
      totalRewardsLamports += Math.round(solChange * 1e9);
      rewardCount++;
    } else {
      // STAKE_DELEGATE: solChange is negative (outflow) → staking increases
      // STAKE_WITHDRAW: solChange is positive (inflow) → staking decreases
      totalStakedLamports -= Math.round(solChange * 1e9);
    }
  }

  // Clamp to zero in case withdrawals exceed tracked delegations
  if (totalStakedLamports < 0) totalStakedLamports = 0;

  return {
    totalStakedSol: totalStakedLamports / 1e9,
    totalRewardsEarnedSol: totalRewardsLamports / 1e9,
    rewardCount,
  };
}
