import { useState, useCallback, useEffect } from 'react';
import type { WalletHoldings } from '../types/wallet';
import type { HoldingsHookResult } from '../types/holdingsHook';
import { getAssetsByOwner } from '../lib/helius';
import { loadHoldings, saveHoldings } from '../lib/storage';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function useHoldings(address: string | null): HoldingsHookResult {
  const [holdings, setHoldings] = useState<WalletHoldings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    loadHoldings(address).then(h => h && setHoldings(h));
  }, [address]);

  const fetch = useCallback(async (force = false) => {
    if (!address) return;
    const cached = await loadHoldings(address);
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setHoldings(cached);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getAssetsByOwner(address);
      saveHoldings(data);
      setHoldings(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { holdings, loading, error, refresh: fetch };
}
