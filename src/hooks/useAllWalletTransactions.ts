import { useState, useEffect } from 'react';
import type { WalletEntry } from '../types/wallet';
import type { ParsedTransaction } from '../types/transaction';
import { loadTransactions } from '../lib/storage';

export function useAllWalletTransactions(wallets: WalletEntry[]) {
  const [transactions, setTransactions] = useState<Record<string, ParsedTransaction[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wallets.length === 0) return;
    setLoading(true);
    Promise.all(
      wallets.map(w =>
        loadTransactions(w.address)
          .then(stored => ({ address: w.address, txns: stored.data }))
          .catch(() => ({ address: w.address, txns: [] as ParsedTransaction[] }))
      )
    ).then(results => {
      const map: Record<string, ParsedTransaction[]> = {};
      for (const { address, txns } of results) map[address] = txns;
      setTransactions(map);
      setLoading(false);
    });
  }, [wallets]);

  return { transactions, loading };
}
