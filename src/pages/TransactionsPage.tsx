import { Fragment, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ChevronDown, Filter, Trash2, ChevronsDown, X } from 'lucide-react';
import { format } from 'date-fns';
import { useApp } from '../context/AppContext';
import { useTransactions } from '../hooks/useTransactions';
import { useBitvavoTransactions } from '../hooks/useBitvavoTransactions';
import { useStaking } from '../hooks/useStaking';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import { CategoryBadge } from '../components/shared/CategoryBadge';
import { Toast } from '../components/shared/Toast';
import { GroupBadges } from '../components/groups/GroupBadges';
import { AddToGroupModal } from '../components/groups/AddToGroupModal';
import { TxDetail } from '../components/transactions/TxDetail';
import { useToast } from '../hooks/useToast';
import { prefetchTokenMeta, getCachedTokenInfo } from '../lib/helius';
import type { TokenMeta } from '../lib/helius';
import { isSolMint, stakingRewardsToTransactions } from '../lib/taxCategorizer';
import { summarizeTx } from '../lib/txSummary';
import { clearStakingData, loadGroupMemberships } from '../lib/storage';
import { isBitvavoWallet } from '../lib/walletType';
import { BITVAVO_TOKEN_META } from '../lib/bitvavoParser';
import type { TaxCategory } from '../types/transaction';
import type { GroupMemberships } from '../types/groups';

const ALL_CATEGORIES: TaxCategory[] = [
  'TRADE', 'TRANSFER_IN', 'TRANSFER_OUT', 'STAKING_REWARD',
  'NFT_SALE', 'NFT_BUY', 'AIRDROP', 'BURN', 'FEE', 'OTHER',
  'STAKE_DELEGATE', 'STAKE_DEACTIVATE', 'STAKE_WITHDRAW',
];

export function TransactionsPage() {
  const { wallets, activeAddress, settings } = useApp();
  const wallet = wallets.find(w => w.address === activeAddress);
  const isBitvavo = wallet?.type === 'bitvavo';

  const solanaTransactions = useTransactions(isBitvavo ? null : activeAddress);
  const bitvavoTransactions = useBitvavoTransactions(isBitvavo ? activeAddress : null);
  const {
    transactions, loading, loadingAll, error, hasMore, isComplete,
    fetchNew, fetchOlder, fetchAllHistory, cancelLoadAll, loadFromStorage, resetAndReload,
  } = isBitvavo ? bitvavoTransactions : solanaTransactions;

  const { stakingRewards, refresh } = useStaking(isBitvavo ? null : activeAddress);
  const { toast, showToast, dismissToast } = useToast();

  const PAGE_SIZE = 50;

  const [expandedSig, setExpandedSig] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<TaxCategory | 'ALL'>('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterToken, setFilterToken] = useState('');
  const [walletOnly, setWalletOnly] = useState(true);
  const [hideDust, setHideDust] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [tokenMetas, setTokenMetas] = useState<Map<string, TokenMeta>>(new Map());
  const [page, setPage] = useState(1);
  const [selectedSigs, setSelectedSigs] = useState<Set<string>>(new Set());
  const [memberships, setMemberships] = useState<GroupMemberships>({});
  const [showAddToGroup, setShowAddToGroup] = useState(false);

  const refreshMemberships = (addr: string) => {
    loadGroupMemberships(addr).then(m => m && setMemberships(m));
  };

  useEffect(() => {
    loadFromStorage();
    setPage(1);
    setSelectedSigs(new Set());
    if (activeAddress) refreshMemberships(activeAddress);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress]);

  useEffect(() => {
    if (isBitvavo || !settings.helius || transactions.length === 0) return;
    const mints = [...new Set(
      transactions.flatMap(tx => tx.balanceChanges.map(bc => bc.mint).filter(m => !isSolMint(m)))
    )];
    prefetchTokenMeta(mints).then(() => {
      const map = new Map<string, TokenMeta>();
      for (const mint of mints) {
        const meta = getCachedTokenInfo(mint);
        if (meta) map.set(mint, meta);
      }
      setTokenMetas(map);
    });
  }, [transactions, settings.helius, isBitvavo]);

  // Build token meta from Bitvavo static data
  useEffect(() => {
    if (!isBitvavo || transactions.length === 0) return;
    const map = new Map<string, TokenMeta>();
    const symbols = new Set(transactions.flatMap(tx => tx.balanceChanges.map(bc => bc.mint)));
    for (const symbol of symbols) {
      const meta = BITVAVO_TOKEN_META[symbol];
      map.set(symbol, {
        symbol,
        name: meta?.name ?? symbol,
        logoUri: null,
      });
    }
    setTokenMetas(map);
  }, [transactions, isBitvavo]);

  const rewardTxns = useMemo(() => isBitvavo ? [] : stakingRewardsToTransactions(stakingRewards), [stakingRewards, isBitvavo]);

  const allTxns = useMemo(() => {
    const merged = [...transactions, ...rewardTxns];
    merged.sort((a, b) => b.blockTime - a.blockTime);
    return merged;
  }, [transactions, rewardTxns]);

  const filtered = useMemo(() => allTxns.filter(tx => {
    if (hideDust && tx.balanceChanges.length > 0 && tx.balanceChanges.every(bc => Math.abs(bc.amount) <= 0.000000001)) return false;
    if (filterCategory !== 'ALL' && tx.taxCategory !== filterCategory) return false;
    if (filterDateFrom && tx.blockTime < new Date(filterDateFrom).getTime() / 1000) return false;
    if (filterDateTo && tx.blockTime > new Date(filterDateTo).getTime() / 1000 + 86400) return false;
    if (filterToken) {
      const q = filterToken.toLowerCase();
      const match = tx.balanceChanges.some(bc => {
        if (isBitvavo) {
          return bc.mint.toLowerCase().includes(q);
        }
        if (isSolMint(bc.mint)) return 'sol'.includes(q) || 'solana'.includes(q);
        const meta = tokenMetas.get(bc.mint);
        return (meta?.symbol?.toLowerCase().includes(q) ?? false)
          || (meta?.name?.toLowerCase().includes(q) ?? false)
          || bc.mint.toLowerCase().startsWith(q);
      });
      if (!match) return false;
    }
    return true;
  }), [allTxns, hideDust, filterCategory, filterDateFrom, filterDateTo, filterToken, tokenMetas, isBitvavo]);

  if (!activeAddress) {
    return <div className="text-gray-500 text-center py-20">Select a wallet first</div>;
  }

  if (!isBitvavo && !settings.helius) {
    return <div className="text-gray-500 text-center py-20">Set HELIUS_API_KEY in .env to get started</div>;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Transactions</h2>
          <p className="text-sm text-gray-500">
            {transactions.length} loaded{rewardTxns.length > 0 ? ` + ${rewardTxns.length} staking rewards` : ''}{isComplete ? ' (complete history)' : ''}
            {filtered.length !== allTxns.length ? ` · ${filtered.length} matching` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(s => !s)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${showFilters ? 'bg-purple-900 text-purple-200' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            <Filter size={14} />
            Filter
          </button>
          {hasMore && !isComplete && (
            <button
              onClick={loadingAll ? cancelLoadAll : fetchAllHistory}
              disabled={loading && !loadingAll}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 ${loadingAll ? 'bg-yellow-900 hover:bg-yellow-800 text-yellow-300' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
              title={loadingAll ? 'Cancel full history load' : 'Load complete transaction history'}
            >
              {loadingAll ? <><X size={14} /> Cancel ({transactions.length} loaded)</> : <><ChevronsDown size={14} /> Load All History</>}
            </button>
          )}
          <button
            onClick={isBitvavo ? (bitvavoTransactions as ReturnType<typeof useBitvavoTransactions>).refresh : fetchNew}
            disabled={loading || loadingAll}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? <LoadingSpinner size={14} /> : <RefreshCw size={14} />}
            {isBitvavo ? 'Refresh' : 'Sync New'}
          </button>
          <button
            onClick={() => {
            if (confirm(`Clear all cached transactions${isBitvavo ? '' : ' and staking data'}, then reload from scratch?`)) {
              if (!isBitvavo && activeAddress) clearStakingData(activeAddress);
              resetAndReload();
              if (!isBitvavo) refresh(true);
            }
          }}
            disabled={loading || loadingAll}
            className="flex items-center gap-2 bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
            title="Reset & Reload"
          >
            <Trash2 size={14} />
            Reset
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-wrap gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Category</label>
            <select
              value={filterCategory}
              onChange={e => { setFilterCategory(e.target.value as TaxCategory | 'ALL'); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
            >
              <option value="ALL">All</option>
              {ALL_CATEGORIES.map(c => (
                <option key={c} value={c}>{c.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Token</label>
            <input
              type="text"
              placeholder="Symbol or name…"
              value={filterToken}
              onChange={e => { setFilterToken(e.target.value); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-600 w-36"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">From Date</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">To Date</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => { setFilterDateTo(e.target.value); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
            />
          </div>
          <div className="flex items-center gap-4">
            {!isBitvavo && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={walletOnly}
                  onChange={e => setWalletOnly(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-xs text-gray-300">Wallet changes only</span>
              </label>
            )}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideDust}
                onChange={e => { setHideDust(e.target.checked); setPage(1); }}
                className="w-4 h-4"
              />
              <span className="text-xs text-gray-300">Hide dust (1 lamport)</span>
            </label>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setFilterCategory('ALL'); setFilterDateFrom(''); setFilterDateTo(''); setFilterToken(''); setWalletOnly(true); setHideDust(true); setPage(1); }}
              className="text-xs text-gray-400 hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {/* Load older button */}
      {transactions.length === 0 && !loading && (
        <div className="text-center py-8">
          <p className="text-gray-500 mb-3">No transactions loaded yet</p>
          <button
            onClick={isBitvavo ? (bitvavoTransactions as ReturnType<typeof useBitvavoTransactions>).refresh : fetchOlder}
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm"
          >
            Load Transactions
          </button>
        </div>
      )}

      {/* Selection action bar */}
      {selectedSigs.size > 0 && (
        <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2">
          <span className="text-sm text-gray-300">{selectedSigs.size} selected</span>
          <button
            onClick={() => setShowAddToGroup(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-3 py-1 rounded"
          >
            Add to Group
          </button>
          <button
            onClick={() => setSelectedSigs(new Set())}
            className="text-gray-400 hover:text-white text-sm"
          >
            Clear
          </button>
        </div>
      )}

      {/* Transaction list */}
      {filtered.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs text-gray-500">
                  <th className="px-4 py-2">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      disabled={paginated.every(tx => tx.slot === 0 && !isBitvavo)}
                      checked={paginated.filter(tx => isBitvavo || tx.slot !== 0).length > 0 && paginated.filter(tx => isBitvavo || tx.slot !== 0).every(tx => selectedSigs.has(tx.signature))}
                      onChange={e => {
                        const eligible = paginated.filter(tx => isBitvavo || tx.slot !== 0).map(tx => tx.signature);
                        setSelectedSigs(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) eligible.forEach(s => next.add(s));
                          else eligible.forEach(s => next.delete(s));
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Category</th>
                  <th className="text-left px-4 py-2">Summary</th>
                  {!isBitvavo && <th className="text-right px-4 py-2">Fee (SOL)</th>}
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(tx => (
                  <Fragment key={tx.signature}>
                    <tr
                      className={`border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer ${tx.err ? 'opacity-50' : ''}`}
                      onClick={() => setExpandedSig(expandedSig === tx.signature ? null : tx.signature)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="w-4 h-4"
                          disabled={!isBitvavo && tx.slot === 0}
                          checked={selectedSigs.has(tx.signature)}
                          onChange={e => {
                            setSelectedSigs(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(tx.signature);
                              else next.delete(tx.signature);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        <p>{format(new Date(tx.blockTime * 1000), 'MMM d, yyyy')}</p>
                        <p className="text-xs text-gray-600">{format(new Date(tx.blockTime * 1000), 'HH:mm:ss')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={tx.taxCategory} />
                        {tx.err && <span className="ml-1 text-xs text-red-500">Failed</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-300 max-w-xs truncate text-xs font-mono">
                        {isBitvavo ? tx.description : summarizeTx(tx, tokenMetas, activeAddress, walletOnly)}
                        <GroupBadges memberships={memberships[tx.signature] ?? []} />
                      </td>
                      {!isBitvavo && (
                        <td className="px-4 py-3 text-right text-gray-500 font-mono text-xs">
                          {tx.slot > 0 ? (tx.fee / 1e9).toFixed(6) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        <ChevronDown
                          size={14}
                          className={`text-gray-500 transition-transform ${expandedSig === tx.signature ? 'rotate-180' : ''}`}
                        />
                      </td>
                    </tr>
                    {expandedSig === tx.signature && (
                      <tr>
                        <td colSpan={isBitvavo ? 5 : 6} className="p-0">
                          <TxDetail tx={tx} tokenMetas={tokenMetas} walletAddress={activeAddress} walletOnly={walletOnly} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 text-sm">
              <span className="text-gray-500 text-xs">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 text-xs"
                >
                  Prev
                </button>
                <span className="text-gray-400 text-xs flex items-center gap-1">
                  Page
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={safePage}
                    onChange={e => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setPage(Math.min(totalPages, Math.max(1, v)));
                    }}
                    className="w-12 text-center bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 text-xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Load more — Solana only */}
          {!isBitvavo && hasMore && (
            <div className="p-4 border-t border-gray-800 text-center">
              <button
                onClick={fetchOlder}
                disabled={loading || loadingAll}
                className="flex items-center gap-2 mx-auto bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
              >
                {loading && !loadingAll ? <LoadingSpinner size={14} /> : <ChevronDown size={14} />}
                Load Older Transactions
              </button>
            </div>
          )}
          {isComplete && (
            <p className="text-center text-xs text-gray-600 py-3">Full history loaded</p>
          )}
        </div>
      )}

      {showAddToGroup && activeAddress && (
        <AddToGroupModal
          transactions={transactions.filter(tx => selectedSigs.has(tx.signature))}
          walletAddress={activeAddress}
          onClose={() => setShowAddToGroup(false)}
          onSaved={(groupName, count) => {
            showToast(`${count} transaction${count !== 1 ? 's' : ''} added to "${groupName}"`, 'success');
            refreshMemberships(activeAddress);
            setShowAddToGroup(false);
            setSelectedSigs(new Set());
          }}
        />
      )}

      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
    </div>
  );
}
