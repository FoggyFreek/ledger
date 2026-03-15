import { useState, useCallback, useRef, useEffect } from 'react';
import type { ParsedTransaction } from '../types/transaction';
import { fetchCurrentYearBitvavoTransactions, fetchBitvavoTransactionsForYear } from '../lib/bitvavoParser';
import { loadTransactions, saveTransactions, clearTransactions } from '../lib/storage';
import { BITVAVO_ADDRESS } from '../lib/walletType';

const BITVAVO_LAUNCH_YEAR = 2018;

export function useBitvavoTransactions(address: string | null) {
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

  const refresh = useCallback(async () => {
    if (!isBitvavo || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const txns = await fetchCurrentYearBitvavoTransactions();
      const stored = {
        data: txns,
        newestSignature: txns[0]?.signature ?? null,
        oldestSignature: txns[txns.length - 1]?.signature ?? null,
        complete: false,
      };
      await saveTransactions(BITVAVO_ADDRESS, stored);
      setTransactions(txns);
      setIsComplete(false);
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
    await refresh();
  }, [isBitvavo, refresh]);

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
    fetchNew: refresh,
    fetchOlder: refresh,
    fetchAllHistory,
    cancelLoadAll,
    loadFromStorage,
    resetAndReload,
    refresh,
  };
}
