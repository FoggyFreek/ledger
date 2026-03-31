import { useState, useMemo, useEffect } from 'react';
import { Camera, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useHoldings } from '../hooks/useHoldings';
import { useBitvavoHoldings } from '../hooks/useBitvavoHoldings';
import { useTransactions } from '../hooks/useTransactions';
import { useBitvavoTransactions } from '../hooks/useBitvavoTransactions';
import { useSnapshots } from '../hooks/useSnapshots';
import { useStaking } from '../hooks/useStaking';
import { stakingRewardsToTransactions } from '../lib/taxCategorizer';
import { getCachedTokenInfo, prefetchTokenMeta } from '../lib/helius';
import { CreateSnapshotModal } from '../components/snapshots/CreateSnapshotModal';
import { SnapshotCard } from '../components/snapshots/SnapshotCard';
import type { DisplayCurrency } from '../components/snapshots/SnapshotCard';

export function SnapshotsPage() {
  const { wallets, activeAddress, settings } = useApp();
  const wallet = wallets.find(w => w.address === activeAddress);
  const isBitvavo = wallet?.type === 'bitvavo';

  const solanaHoldings = useHoldings(isBitvavo ? null : activeAddress);
  const bitvavoHoldings = useBitvavoHoldings(isBitvavo ? activeAddress : null);
  const { holdings } = isBitvavo ? bitvavoHoldings : solanaHoldings;

  const solanaTransactions = useTransactions(isBitvavo ? null : activeAddress);
  const bitvavoTxns = useBitvavoTransactions(isBitvavo ? activeAddress : null);
  const { transactions, isComplete } = isBitvavo ? bitvavoTxns : solanaTransactions;

  const { stakingRewards } = useStaking(isBitvavo ? null : activeAddress);
  const { snapshots, creating, error, create, remove, updateSnapshot } = useSnapshots(activeAddress);

  const rewardTxns = useMemo(() => isBitvavo ? [] : stakingRewardsToTransactions(stakingRewards), [stakingRewards, isBitvavo]);
  const allTransactions = useMemo(() => [...transactions, ...rewardTxns], [transactions, rewardTxns]);
  const [showCreate, setShowCreate] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('USD');
  const [, setMetaReady] = useState(0);

  // Prefetch metadata for unknown tokens in existing snapshots
  useEffect(() => {
    const unknownMints = new Set<string>();
    for (const s of snapshots) {
      for (const t of s.holdings.tokens) {
        if (t.symbol === '?' && !getCachedTokenInfo(t.mint)) {
          unknownMints.add(t.mint);
        }
      }
    }
    if (unknownMints.size > 0) {
      prefetchTokenMeta([...unknownMints]).then(() => setMetaReady(n => n + 1));
    }
  }, [snapshots]);

  if (!activeAddress) {
    return <div className="text-gray-500 text-center py-20">Select a wallet first</div>;
  }

  if (!isBitvavo && !settings.helius) {
    return <div className="text-gray-500 text-center py-20">Set HELIUS_API_KEY in .env to get started</div>;
  }

  const handleCreate = async (label: string, date: Date) => {
    await create(label, date, allTransactions, holdings);
    if (!error) setShowCreate(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Historical Snapshots</h2>
          <p className="text-sm text-gray-500">
            Capture wallet state at a specific date — useful for tax reporting
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            {(['USD', 'EUR'] as const).map(cur => (
              <button
                key={cur}
                onClick={() => setDisplayCurrency(cur)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  displayCurrency === cur
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {cur === 'USD' ? '$' : '\u20AC'} {cur}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <Camera size={16} />
            New Snapshot
          </button>
        </div>
      </div>

      {!isComplete && (
        <div className="flex items-start gap-2 bg-yellow-950/30 border border-yellow-900/50 rounded-lg p-3 text-xs text-yellow-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            Transaction history is incomplete. For accurate snapshots, go to Transactions and load all older transactions.
            Currently {transactions.length} transactions loaded.
          </span>
        </div>
      )}

      {snapshots.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Camera size={32} className="mx-auto mb-3 opacity-30" />
          <p>No snapshots yet</p>
          <p className="text-sm mt-1">Create a snapshot to capture holdings at a specific historical date</p>
        </div>
      )}

      <div className="space-y-4">
        {snapshots.map(snap => (
          <SnapshotCard
            key={snap.id}
            snapshot={snap}
            walletType={wallet?.type ?? 'solana'}
            onDelete={() => remove(snap.id)}
            onUpdate={updateSnapshot}
            displayCurrency={displayCurrency}
            allTransactions={allTransactions}
          />
        ))}
      </div>

      {showCreate && (
        <CreateSnapshotModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          creating={creating}
          error={error}
          isComplete={isComplete}
        />
      )}
    </div>
  );
}
