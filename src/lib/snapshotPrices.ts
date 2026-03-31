import type { WalletType } from '../types/wallet';
import { SOL_MINT } from './constants';
import { fetchHistoricalPrices, fetchHistoricalPricesEur, fetchCoinGeckoHistoricalPricesForSymbols } from './prices';

/**
 * Fetch historical USD + EUR prices for a set of mints at a given unix timestamp.
 * Handles the Bitvavo (CoinGecko) vs Solana (DeFiLlama) branching.
 */
export async function fetchSnapshotTokenPrices(
  mints: string[],
  targetTs: number,
  walletType: WalletType,
): Promise<{ usd: Map<string, number>; eur: Map<string, number> }> {
  if (walletType === 'bitvavo') {
    const cgPrices = await fetchCoinGeckoHistoricalPricesForSymbols(mints, targetTs);
    const usd = new Map<string, number>();
    const eur = new Map<string, number>();
    for (const [sym, { usd: u, eur: e }] of cgPrices) {
      usd.set(sym, u);
      eur.set(sym, e);
    }
    return { usd, eur };
  }

  const [usd, eur] = await Promise.all([
    fetchHistoricalPrices(mints, targetTs),
    fetchHistoricalPricesEur(mints, targetTs),
  ]);
  return { usd, eur };
}

/**
 * Refresh the price of a single token. Returns null if the price couldn't be fetched.
 */
export async function refreshSingleTokenPrice(
  mint: string,
  targetTs: number,
  walletType: WalletType,
): Promise<{ usd: number | null; eur: number | null }> {
  if (walletType === 'bitvavo') {
    const symbol = mint === SOL_MINT ? 'SOL' : mint;
    const cgPrices = await fetchCoinGeckoHistoricalPricesForSymbols([symbol], targetTs);
    const entry = cgPrices.get(symbol);
    return { usd: entry?.usd ?? null, eur: entry?.eur ?? null };
  }

  const [usdMap, eurMap] = await Promise.all([
    fetchHistoricalPrices([mint], targetTs),
    fetchHistoricalPricesEur([mint], targetTs),
  ]);
  return { usd: usdMap.get(mint) ?? null, eur: eurMap.get(mint) ?? null };
}
