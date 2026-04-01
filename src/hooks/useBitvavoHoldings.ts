import { useState, useCallback, useEffect, useRef } from 'react';
import type { WalletHoldings } from '../types/wallet';
import type { HoldingsHookResult } from '../types/holdingsHook';
import { getAccountBalance } from '../lib/bitvavo';
import { parseBitvavoBalances } from '../lib/bitvavoParser';
import { fetchCurrentPricesForSymbols, fetchBitvavoLogoUris } from '../lib/prices';
import { loadHoldings, saveHoldings } from '../lib/storage';
import { BITVAVO_ADDRESS } from '../lib/walletType';

const CACHE_TTL_MS = 5 * 60 * 1000;

export function useBitvavoHoldings(address: string | null): HoldingsHookResult {
  const [holdings, setHoldings] = useState<WalletHoldings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holdingsRef = useRef<WalletHoldings | null>(null);

  const isBitvavo = address === BITVAVO_ADDRESS;

  useEffect(() => {
    if (!isBitvavo) return;
    loadHoldings(BITVAVO_ADDRESS).then(h => {
      if (h) { setHoldings(h); holdingsRef.current = h; }
    });
  }, [isBitvavo]);

  const refresh = useCallback(async (force = false) => {
    if (!isBitvavo) return;
    const cached = holdingsRef.current?.walletAddress === BITVAVO_ADDRESS
      ? holdingsRef.current
      : await loadHoldings(BITVAVO_ADDRESS);
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setHoldings(cached);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const balances = await getAccountBalance();
      const data = parseBitvavoBalances(balances);

      // Fetch current USD prices and CoinGecko logo URIs in parallel
      const symbols = data.tokens.map(t => t.symbol);
      const [prices, logos] = await Promise.all([
        fetchCurrentPricesForSymbols(symbols),
        fetchBitvavoLogoUris(symbols),
      ]);
      for (const token of data.tokens) {
        const price = prices.get(token.symbol);
        if (price != null) token.usdValue = token.uiAmount * price;
        const logo = logos.get(token.symbol);
        if (logo) token.logoUri = logo;
      }

      await saveHoldings(data);
      setHoldings(data);
      holdingsRef.current = data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [isBitvavo]);

  return { holdings, loading, error, refresh };
}
