import { useState, useCallback, useRef, useEffect } from 'react';
import type { ParsedTransaction } from '../types/transaction';
import { getWalletHistory } from '../lib/helius';
import { parseWalletHistoryTx } from '../lib/taxCategorizer';
import { loadTransactions, saveTransactions, clearTransactions } from '../lib/storage';



function sortDesc(txns: ParsedTransaction[]): ParsedTransaction[] {
  return txns.slice().sort((a, b) => b.blockTime - a.blockTime);
}

export function useTransactions(address: string | null) {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const fetchingRef = useRef(false);
  const cancelAllRef = useRef(false);

  useEffect(() => {
    if (!address) return;
    loadTransactions(address).then(stored => {
      setTransactions(sortDesc(stored.data));
      setIsComplete(stored.complete);
      setHasMore(!stored.complete);
    });
  }, [address]);

  const fetchNew = useCallback(async () => {
    if (!address || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const stored = await loadTransactions(address);
      const { data: raw } = await getWalletHistory(address, {
        after: stored.newestSignature ?? undefined,
        limit: 100,
      });
      if (raw.length === 0) return;
      const parsed = raw.map(tx => parseWalletHistoryTx(tx, address));
      // Deduplicate by signature in case the `after` cursor is inclusive
      const existingSigs = new Set(stored.data.map(tx => tx.signature));
      const newOnly = parsed.filter(tx => !existingSigs.has(tx.signature));
      const merged = sortDesc([...newOnly, ...stored.data]);
      const next = {
        data: newOnly,
        newestSignature: merged[0]?.signature ?? null,
        oldestSignature: stored.oldestSignature ?? merged[merged.length - 1]?.signature ?? null,
        complete: stored.complete,
      };
      await saveTransactions(address, next);
      setTransactions(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [address]);

  const fetchOlder = useCallback(async () => {
    if (!address || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const stored = await loadTransactions(address);
      if (stored.complete) {
        setIsComplete(true);
        setHasMore(false);
        return;
      }
      const { data: raw, hasMore: apiHasMore } = await getWalletHistory(address, {
        before: stored.oldestSignature ?? undefined,
        limit: 100,
      });
      const parsed = raw.map(tx => parseWalletHistoryTx(tx, address));
      const merged = sortDesc([...stored.data, ...parsed]);
      const complete = !apiHasMore;
      const next = {
        data: parsed,
        newestSignature: merged[0]?.signature ?? null,
        oldestSignature: merged[merged.length - 1]?.signature ?? null,
        complete,
      };
      await saveTransactions(address, next);
      setTransactions(merged);
      setHasMore(!complete);
      if (complete) setIsComplete(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [address]);

  const loadFromStorage = useCallback(async () => {
    if (!address) return;
    const stored = await loadTransactions(address);
    setTransactions(sortDesc(stored.data));
    setIsComplete(stored.complete);
    setHasMore(!stored.complete);
  }, [address]);

  const resetAndReload = useCallback(async () => {
    if (!address) return;
    await clearTransactions(address);
    setTransactions([]);
    setIsComplete(false);
    setHasMore(true);
    fetchingRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const { data: raw, hasMore: apiHasMore } = await getWalletHistory(address, { limit: 100 });
      const parsed = sortDesc(raw.map(tx => parseWalletHistoryTx(tx, address)));
      const complete = !apiHasMore;
      const next = {
        data: parsed,
        newestSignature: parsed[0]?.signature ?? null,
        oldestSignature: parsed[parsed.length - 1]?.signature ?? null,
        complete,
      };
      await saveTransactions(address, next);
      setTransactions(parsed);
      setHasMore(!complete);
      if (complete) setIsComplete(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  const fetchAllHistory = useCallback(async () => {
    if (!address || fetchingRef.current) return;
    cancelAllRef.current = false;
    fetchingRef.current = true;
    setLoadingAll(true);
    setError(null);
    try {
      const initial = await loadTransactions(address);
      if (initial.complete) {
        setIsComplete(true);
        setHasMore(false);
        return;
      }
      let currentData = initial.data;
      let currentNewest = initial.newestSignature;
      let currentOldest = initial.oldestSignature;
      while (!cancelAllRef.current) {
        const { data: raw, hasMore: apiHasMore } = await getWalletHistory(address, {
          before: currentOldest ?? undefined,
          limit: 100,
        });
        const parsed = raw.map(tx => parseWalletHistoryTx(tx, address));
        const merged = sortDesc([...currentData, ...parsed]);
        const complete = !apiHasMore;
        currentData = merged;
        currentNewest = merged[0]?.signature ?? null;
        currentOldest = merged[merged.length - 1]?.signature ?? null;
        await saveTransactions(address, { data: parsed, newestSignature: currentNewest, oldestSignature: currentOldest, complete });
        setTransactions(merged);
        setHasMore(!complete);
        if (complete) {
          setIsComplete(true);
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingAll(false);
      fetchingRef.current = false;
    }
  }, [address]);

  const cancelLoadAll = useCallback(() => {
    cancelAllRef.current = true;
  }, []);

  return {
    transactions,
    loading,
    loadingAll,
    error,
    hasMore,
    isComplete,
    fetchNew,
    fetchOlder,
    fetchAllHistory,
    cancelLoadAll,
    loadFromStorage,
    resetAndReload,
  };
}
