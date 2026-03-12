import { useState, useCallback, useEffect } from 'react';
import type { WalletSnapshot } from '../types/wallet';
import type { ParsedTransaction } from '../types/transaction';
import type { WalletHoldings } from '../types/wallet';
import { createSnapshot } from '../lib/snapshotEngine';
import { loadSnapshots, saveSnapshots } from '../lib/storage';

export function useSnapshots(address: string | null) {
  const [snapshots, setSnapshots] = useState<WalletSnapshot[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSnapshots().then(all => setSnapshots(all.filter(s => s.walletAddress === address)));
  }, [address]);

  const create = useCallback(async (
    label: string,
    targetDate: Date,
    transactions: ParsedTransaction[],
    currentHoldings: WalletHoldings | null
  ) => {
    if (!address) return;
    setCreating(true);
    setError(null);
    try {
      const snapshot = await createSnapshot(address, label, targetDate, transactions, currentHoldings);
      const allSnapshots = await loadSnapshots();
      const updated = [...allSnapshots, snapshot];
      await saveSnapshots(updated);
      setSnapshots(updated.filter(s => s.walletAddress === address));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }, [address]);

  const remove = useCallback(async (id: string) => {
    const all = (await loadSnapshots()).filter(s => s.id !== id);
    await saveSnapshots(all);
    setSnapshots(all.filter(s => s.walletAddress === address));
  }, [address]);

  const reload = useCallback(async () => {
    const all = await loadSnapshots();
    setSnapshots(all.filter(s => s.walletAddress === address));
  }, [address]);

  return { snapshots, creating, error, create, remove, reload };
}
