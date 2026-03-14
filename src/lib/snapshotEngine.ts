import type { ParsedTransaction } from '../types/transaction';
import type { WalletHoldings, WalletSnapshot, TokenHolding } from '../types/wallet';
import { findSlotForTimestamp } from './slotFinder';
import { getCachedTokenInfo, prefetchTokenMeta } from './helius';
import { isSolMint } from './taxCategorizer';
import { fetchHistoricalPrices } from './prices';
import { v4 as uuidv4 } from '../lib/uuid';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export async function createSnapshot(
  walletAddress: string,
  label: string,
  targetDate: Date,
  allTransactions: ParsedTransaction[],
  currentHoldings: WalletHoldings | null
): Promise<WalletSnapshot> {
  const targetTs = Math.floor(targetDate.getTime() / 1000);

  // Find approximate slot
  let slotApprox = 0;
  try {
    slotApprox = await findSlotForTimestamp(targetTs);
  } catch {
    // fallback: just use 0 — snapshot will still work via blockTime filter
  }

  // Filter transactions up to target date (successful only)
  const filtered = allTransactions
    .filter(tx => tx.blockTime <= targetTs && tx.err === null)
    .sort((a, b) => a.blockTime - b.blockTime);

  // Converts a float amount to raw bigint without losing precision for high-decimal tokens.
  // toFixed caps at the float's ~15 significant digits, then we parse as integer.
  function floatToRawBigInt(amount: number, decimals: number): bigint {
    const str = amount.toFixed(Math.min(decimals, 15));
    const [intStr, fracStr = ''] = str.split('.');
    const paddedFrac = fracStr.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(intStr + paddedFrac);
  }

  // Reconstruct token balances by replaying individual balance changes
  const tokenMap = new Map<string, bigint>(); // mint -> raw amount
  const tokenDecimals = new Map<string, number>();
  let solLamports = BigInt(0);

  for (const tx of filtered) {
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

  // Prefetch metadata for mints not already in current holdings or registry
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

  // Collect mints with positive balances for price fetching
  const positiveMints: string[] = [];
  for (const [mint, rawBig] of tokenMap.entries()) {
    if (rawBig > BigInt(0)) positiveMints.push(mint);
  }

  // Fetch historical prices for all tokens + SOL
  const prices = await fetchHistoricalPrices([SOL_MINT, ...positiveMints], targetTs);
  const solPrice = prices.get(SOL_MINT) ?? null;
  const solBalance = Number(solLamports) / 1e9;

  const tokens: TokenHolding[] = [];
  for (const [mint, rawBig] of tokenMap.entries()) {
    if (rawBig <= BigInt(0)) continue;
    const decimals = tokenDecimals.get(mint) ?? 0;
    const uiAmt = Number(rawBig) / Math.pow(10, decimals);
    // Resolve metadata: prefer current holdings > token registry > fallback
    const fromHoldings = currentHoldings?.tokens.find(t => t.mint === mint);
    const fromRegistry = getCachedTokenInfo(mint);
    const symbol = fromHoldings?.symbol ?? fromRegistry?.symbol ?? '?';
    const name = fromHoldings?.name ?? fromRegistry?.name ?? mint.slice(0, 8);
    const logoUri = fromHoldings?.logoUri ?? fromRegistry?.logoUri ?? null;
    const price = prices.get(mint);
    tokens.push({
      mint,
      symbol,
      name,
      decimals,
      rawAmount: rawBig.toString(),
      uiAmount: uiAmt,
      usdValue: price != null ? uiAmt * price : null,
      logoUri,
    });
  }

  const holdings: WalletHoldings = {
    walletAddress,
    slot: slotApprox,
    fetchedAt: Date.now(),
    solBalance,
    solPrice,
    tokens: tokens.sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };

  return {
    id: uuidv4(),
    walletAddress,
    label,
    targetDate: targetDate.getTime(),
    createdAt: Date.now(),
    slotApproximation: slotApprox,
    holdings,
    txCountIncluded: filtered.length,
  };
}
