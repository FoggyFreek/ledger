import { useState, useCallback, useRef, useEffect } from 'react';
import type { ParsedTransaction } from '../types/transaction';
import type { TransactionHookResult } from '../types/transactionHook';
import { fetchBitvavoTransactionsSince, fetchBitvavoTransactionsForYear } from '../lib/bitvavoParser';
import { loadTransactions, saveTransactions, clearTransactions } from '../lib/storage';
import { BITVAVO_ADDRESS } from '../lib/walletType';

const BITVAVO_LAUNCH_YEAR = 2018;

export function useBitvavoTransactions(address: string | null): TransactionHookResult {
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const fetchingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const isBitvavo = address === BITVAVO_ADDRESS;

  useEffect(() => {
    if (!isBitvavo) return;
    loadTransactions(BITVAVO_ADDRESS).then(stored => {
      setTransactions(stored.data);
      setIsComplete(stored.complete);
    });
  }, [isBitvavo]);

  const fetchNew = useCallback(async () => {
    if (!isBitvavo || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const stored = await loadTransactions(BITVAVO_ADDRESS);
      const existingSigs = new Set(stored.data.map(tx => tx.signature));

      // Fetch from just after the newest stored transaction (or beginning of current year as fallback)
      const newestBlockTime = stored.data.length > 0
        ? Math.max(...stored.data.map(tx => tx.blockTime))
        : Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000);
      const fromDateMs = (newestBlockTime + 1) * 1000;

      const newTxns = await fetchBitvavoTransactionsSince(fromDateMs);
      const truly_new = newTxns.filter(tx => !existingSigs.has(tx.signature));

      if (truly_new.length === 0) return;

      const merged = [...truly_new, ...stored.data].sort((a, b) => b.blockTime - a.blockTime);
      await saveTransactions(BITVAVO_ADDRESS, {
        data: truly_new,
        newestSignature: merged[0]?.signature ?? null,
        oldestSignature: stored.oldestSignature ?? merged[merged.length - 1]?.signature ?? null,
        complete: stored.complete,
      });
      setTransactions(merged);
      setIsComplete(stored.complete);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [isBitvavo]);

  const fetchOlder = useCallback(async () => {
    if (!isBitvavo || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const stored = await loadTransactions(BITVAVO_ADDRESS);
      if (stored.complete) {
        setIsComplete(true);
        return;
      }

      // Determine the year before the oldest stored transaction
      const oldestBlockTime = stored.data.length > 0
        ? Math.min(...stored.data.map(tx => tx.blockTime))
        : Math.floor(Date.now() / 1000);
      const yearToFetch = new Date(oldestBlockTime * 1000).getFullYear() - 1;

      if (yearToFetch < BITVAVO_LAUNCH_YEAR) {
        await saveTransactions(BITVAVO_ADDRESS, {
          data: [],
          newestSignature: stored.newestSignature,
          oldestSignature: stored.oldestSignature,
          complete: true,
        });
        setIsComplete(true);
        return;
      }

      const existingSigs = new Set(stored.data.map(tx => tx.signature));
      const olderTxns = await fetchBitvavoTransactionsForYear(yearToFetch);
      const newOnly = olderTxns.filter(tx => !existingSigs.has(tx.signature));

      const merged = [...stored.data, ...newOnly].sort((a, b) => b.blockTime - a.blockTime);
      const complete = yearToFetch <= BITVAVO_LAUNCH_YEAR;
      await saveTransactions(BITVAVO_ADDRESS, {
        data: newOnly,
        newestSignature: stored.newestSignature ?? merged[0]?.signature ?? null,
        oldestSignature: merged[merged.length - 1]?.signature ?? null,
        complete,
      });
      setTransactions(merged);
      setIsComplete(complete);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [isBitvavo]);

  const fetchAllHistory = useCallback(async () => {
    if (!isBitvavo || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoadingAll(true);
    setError(null);
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const currentYear = new Date().getFullYear();
      const accumulated: ParsedTransaction[] = [];
      const seenSigs = new Set<string>();

      for (let year = BITVAVO_LAUNCH_YEAR; year <= currentYear; year++) {
        if (abort.signal.aborted) break;
        const yearTxns = await fetchBitvavoTransactionsForYear(year);
        let added = false;
        for (const tx of yearTxns) {
          if (!seenSigs.has(tx.signature)) {
            seenSigs.add(tx.signature);
            accumulated.push(tx);
            added = true;
          }
        }
        if (added) {
          accumulated.sort((a, b) => b.blockTime - a.blockTime);
          setTransactions([...accumulated]);
        }
      }

      if (!abort.signal.aborted) {
        accumulated.sort((a, b) => b.blockTime - a.blockTime);
        await saveTransactions(BITVAVO_ADDRESS, {
          data: accumulated,
          newestSignature: accumulated[0]?.signature ?? null,
          oldestSignature: accumulated[accumulated.length - 1]?.signature ?? null,
          complete: true,
        });
        setTransactions(accumulated);
        setIsComplete(true);
      }
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoadingAll(false);
      fetchingRef.current = false;
      abortRef.current = null;
    }
  }, [isBitvavo]);

  const cancelLoadAll = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resetAndReload = useCallback(async () => {
    if (!isBitvavo) return;
    await clearTransactions(BITVAVO_ADDRESS);
    setTransactions([]);
    setIsComplete(false);
    await fetchNew();
  }, [isBitvavo, fetchNew]);

  const loadFromStorage = useCallback(async () => {
    if (!isBitvavo) return;
    const stored = await loadTransactions(BITVAVO_ADDRESS);
    setTransactions(stored.data);
    setIsComplete(stored.complete);
  }, [isBitvavo]);

  return {
    transactions,
    loading,
    loadingAll,
    error,
    hasMore: !isComplete,
    isComplete,
    fetchNew,
    fetchOlder,
    fetchAllHistory,
    cancelLoadAll,
    loadFromStorage,
    resetAndReload,
  };
}
