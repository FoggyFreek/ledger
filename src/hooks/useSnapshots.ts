import { useState, useCallback, useEffect } from 'react';
import type { WalletSnapshot } from '../types/wallet';
import type { ParsedTransaction } from '../types/transaction';
import type { WalletHoldings } from '../types/wallet';
import { createSnapshot } from '../lib/snapshotEngine';
import { loadSnapshotsForWallet, addSnapshot, updateSnapshotById, deleteSnapshotById } from '../lib/storage';

export function useSnapshots(address: string | null) {
  const [snapshots, setSnapshots] = useState<WalletSnapshot[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) { setSnapshots([]); return; }
    loadSnapshotsForWallet(address).then(setSnapshots);
  }, [address]);

  const create = useCallback(async (
    label: string,
    targetDate: Date,
    transactions: ParsedTransaction[],
    currentHoldings: WalletHoldings | null,
  ) => {
    if (!address) return;
    setCreating(true);
    setError(null);
    try {
      const snapshot = await createSnapshot(address, label, targetDate, transactions, currentHoldings);
      await addSnapshot(address, snapshot);
      setSnapshots(prev => [...prev, snapshot]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }, [address]);

  const remove = useCallback(async (id: string) => {
    if (!address) return;
    await deleteSnapshotById(address, id);
    setSnapshots(prev => prev.filter(s => s.id !== id));
  }, [address]);

  const updateSnapshot = useCallback(async (updated: WalletSnapshot) => {
    if (!address) return;
    await updateSnapshotById(address, updated.id, updated);
    setSnapshots(prev => prev.map(s => s.id === updated.id ? updated : s));
  }, [address]);

  return { snapshots, creating, error, create, remove, updateSnapshot };
}
