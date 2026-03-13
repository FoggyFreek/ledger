import { useState, useMemo, useEffect } from 'react';
import { Camera, Trash2, Download, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useApp } from '../context/AppContext';
import { useHoldings } from '../hooks/useHoldings';
import { useTransactions } from '../hooks/useTransactions';
import { useSnapshots } from '../hooks/useSnapshots';
import { useStaking } from '../hooks/useStaking';
import { stakingRewardsToTransactions } from '../lib/taxCategorizer';
import { getCachedTokenInfo, prefetchTokenMeta } from '../lib/helius';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import type { WalletSnapshot } from '../types/wallet';
import { objectsToCsv, downloadCsv } from '../lib/csv';

function CreateSnapshotModal({
  onClose,
  onCreate,
  creating,
  error,
  isComplete,
}: {
  onClose: () => void;
  onCreate: (label: string, date: Date) => void;
  creating: boolean;
  error: string | null;
  isComplete: boolean;
}) {
  const [label, setLabel] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('00:00');

  const submit = () => {
    if (!dateStr) return;
    const d = new Date(`${dateStr}T${timeStr}:00`);
    onCreate(label.trim() || `Snapshot ${format(d, 'yyyy-MM-dd HH:mm')}`, d);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold text-white mb-4">Create Snapshot</h2>

        {!isComplete && (
          <div className="flex items-start gap-2 bg-yellow-950/50 border border-yellow-800/50 rounded-lg p-3 mb-4 text-xs text-yellow-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Full transaction history is not loaded. Snapshot accuracy depends on having all transactions
              fetched. Go to Transactions tab and load all older transactions first for best results.
            </span>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm text-gray-300 block mb-1">Snapshot Date</label>
              <input
                type="date"
                value={dateStr}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={e => setDateStr(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="w-32">
              <label className="text-sm text-gray-300 block mb-1">Time</label>
              <input
                type="time"
                value={timeStr}
                onChange={e => setTimeStr(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-300 block mb-1">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. EOY 2024, Tax Year 2023"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          {error && <ErrorBanner message={error} />}
          <div className="flex gap-2 pt-1">
            <button
              onClick={submit}
              disabled={creating || !dateStr}
              className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            >
              {creating && <LoadingSpinner size={14} />}
              {creating ? 'Creating…' : 'Create Snapshot'}
            </button>
            <button
              onClick={onClose}
              disabled={creating}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function resolveTokenMeta(t: { mint: string; symbol: string; name: string; logoUri: string | null }) {
  const cached = getCachedTokenInfo(t.mint);
  return {
    symbol: (t.symbol === '?' && cached?.symbol) ? cached.symbol : t.symbol,
    name: (t.name === t.mint.slice(0, 8) && cached?.name) ? cached.name : t.name,
    logoUri: (!t.logoUri && cached?.logoUri) ? cached.logoUri : t.logoUri,
  };
}

function SnapshotCard({ snapshot, onDelete }: { snapshot: WalletSnapshot; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const exportCsv = () => {
    const rows = [
      { type: 'SOL', symbol: 'SOL', name: 'Solana', amount: snapshot.holdings.solBalance, usdValue: snapshot.holdings.solPrice != null ? (snapshot.holdings.solBalance * snapshot.holdings.solPrice).toFixed(2) : '', mint: 'native' },
      ...snapshot.holdings.tokens.map(t => {
        const meta = resolveTokenMeta(t);
        return {
          type: 'SPL',
          symbol: meta.symbol,
          name: meta.name,
          amount: t.uiAmount,
          usdValue: t.usdValue ?? '',
          mint: t.mint,
        };
      }),
    ];
    downloadCsv(
      `snapshot-${snapshot.label.replace(/\s+/g, '-')}-${format(snapshot.targetDate, 'yyyy-MM-dd')}.csv`,
      objectsToCsv(rows)
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-white">{snapshot.label}</h3>
            <p className="text-sm text-gray-400 mt-0.5">
              Date: {format(snapshot.targetDate, 'MMMM d, yyyy HH:mm')}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {snapshot.txCountIncluded} transactions replayed · Created {format(snapshot.createdAt, 'MMM d, yyyy HH:mm')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              className="text-gray-400 hover:text-green-400 transition-colors"
              title="Export CSV"
            >
              <Download size={16} />
            </button>
            <button
              onClick={onDelete}
              className="text-gray-400 hover:text-red-400 transition-colors"
              title="Delete snapshot"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="bg-gray-800 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">SOL</p>
            <p className="text-sm font-mono text-white">{snapshot.holdings.solBalance.toFixed(4)}</p>
          </div>
          <div className="bg-gray-800 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">Tokens</p>
            <p className="text-sm font-mono text-white">{snapshot.holdings.tokens.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">Total USD</p>
            <p className="text-sm font-mono text-white">
              {snapshot.holdings.solPrice != null || snapshot.holdings.tokens.some(t => t.usdValue != null)
                ? `$${((snapshot.holdings.solPrice ?? 0) * snapshot.holdings.solBalance + snapshot.holdings.tokens.reduce((s, t) => s + (t.usdValue ?? 0), 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '—'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 mt-3 text-xs text-gray-500 hover:text-gray-300"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? 'Hide' : 'Show'} token breakdown
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500">
                <th className="text-left px-4 py-2">Token</th>
                <th className="text-right px-4 py-2">Balance</th>
                <th className="text-right px-4 py-2">Price</th>
                <th className="text-right px-4 py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-800/50">
                <td className="px-4 py-2 text-white flex items-center gap-2">
                  <img src="https://solscan.io/_next/static/media/solPriceLogo.76eeb122.png" alt="SOL" className="w-5 h-5 rounded-full" onError={e => (e.currentTarget.style.display = 'none')} />
                  SOL
                </td>
                <td className="px-4 py-2 text-right font-mono text-white">{snapshot.holdings.solBalance.toFixed(6)}</td>
                <td className="px-4 py-2 text-right text-gray-400">
                  {snapshot.holdings.solPrice != null
                    ? `$${snapshot.holdings.solPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </td>
                <td className="px-4 py-2 text-right text-gray-400">
                  {snapshot.holdings.solPrice != null
                    ? `$${(snapshot.holdings.solBalance * snapshot.holdings.solPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </td>
              </tr>
              {snapshot.holdings.tokens.map(t => {
                const meta = resolveTokenMeta(t);
                return (
                  <tr key={t.mint} className="border-b border-gray-800/30">
                    <td className="px-4 py-2 text-white">
                      <span className="flex items-center gap-2">
                        {meta.logoUri
                          ? <img src={meta.logoUri} alt={meta.symbol} className="w-5 h-5 rounded-full" onError={e => (e.currentTarget.style.display = 'none')} />
                          : <span className="w-5 h-5 rounded-full bg-gray-700 inline-block" />
                        }
                        {meta.symbol} <span className="text-gray-600">{meta.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-white">
                      {t.uiAmount.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-400">
                      {t.usdValue != null && t.uiAmount > 0
                        ? `$${(t.usdValue / t.uiAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-400">
                      {t.usdValue != null ? `$${t.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SnapshotsPage() {
  const { activeAddress, settings } = useApp();
  const { holdings } = useHoldings(activeAddress);
  const { transactions, isComplete } = useTransactions(activeAddress);
  const { stakingRewards } = useStaking(activeAddress);
  const { snapshots, creating, error, create, remove } = useSnapshots(activeAddress);

  const rewardTxns = useMemo(() => stakingRewardsToTransactions(stakingRewards), [stakingRewards]);
  const allTransactions = useMemo(() => [...transactions, ...rewardTxns], [transactions, rewardTxns]);
  const [showCreate, setShowCreate] = useState(false);
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

  if (!settings.apiKey) {
    return <div className="text-gray-500 text-center py-20">Add your Helius API key in Settings</div>;
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
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Camera size={16} />
          New Snapshot
        </button>
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
          <SnapshotCard key={snap.id} snapshot={snap} onDelete={() => remove(snap.id)} />
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
