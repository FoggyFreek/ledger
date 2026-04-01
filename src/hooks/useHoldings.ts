import { useState, useCallback, useEffect, useRef } from 'react';
import type { WalletHoldings } from '../types/wallet';
import type { HoldingsHookResult } from '../types/holdingsHook';
import { getAssetsByOwner } from '../lib/helius';
import { loadHoldings, saveHoldings } from '../lib/storage';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function useHoldings(address: string | null): HoldingsHookResult {
  const [holdings, setHoldings] = useState<WalletHoldings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holdingsRef = useRef<WalletHoldings | null>(null);

  // Clear stale in-memory ref when address changes
  useEffect(() => {
    if (holdingsRef.current?.walletAddress !== address) {
      holdingsRef.current = null;
    }
  }, [address]);

  const refresh = useCallback(async (force = false) => {
    if (!address) return;
    // Use in-memory data if fresh, avoiding a redundant DB read
    const cached = holdingsRef.current?.walletAddress === address
      ? holdingsRef.current
      : await loadHoldings(address);
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setHoldings(cached);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getAssetsByOwner(address);
      await saveHoldings(data);
      setHoldings(data);
      holdingsRef.current = data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  return { holdings, loading, error, refresh };
}
