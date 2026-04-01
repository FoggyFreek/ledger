import { Fragment, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { ErrorBanner } from '../shared/ErrorBanner';
import { CategoryBadge } from '../shared/CategoryBadge';
import { GroupBadges } from '../groups/GroupBadges';
import { AddToGroupModal } from '../groups/AddToGroupModal';
import { TxDetail } from './TxDetail';
import { PaginationBar } from './PaginationBar';
import { TransactionToolbar } from './TransactionToolbar';
import { TxSelectionBar } from './TxSelectionBar';
import { useTransactionFilters } from '../../hooks/useTransactionFilters';
import { summarizeTx } from '../../lib/txSummary';
import type { TransactionsViewProps } from './types';

const PAGE_SIZE = 50;

export function SolanaTransactionsView(props: TransactionsViewProps) {
  const {
    transactions, allTxns, rewardTxnCount,
    tokenMetas, memberships, hook, activeAddress,
    onReset, onGroupSaved,
  } = props;

  const {
    loading, loadingAll, error, hasMore, isComplete,
    fetchNew, fetchOlder, fetchAllHistory, cancelLoadAll,
    updateCategory,
  } = hook;

  const {
    filtered, paginated, page, setPage, totalPages,
    walletOnly, showFilters, setShowFilters, filterProps,
  } = useTransactionFilters(allTxns, tokenMetas, false);

  const [expandedSig, setExpandedSig] = useState<string | null>(null);
  const [selectedSigs, setSelectedSigs] = useState<Set<string>>(new Set());
  const [showAddToGroup, setShowAddToGroup] = useState(false);

  return (
    <>
      <TransactionToolbar
        txCount={transactions.length}
        filteredCount={filtered.length}
        allCount={allTxns.length}
        isComplete={isComplete}
        extraStatsText={rewardTxnCount > 0 ? ` + ${rewardTxnCount} staking rewards` : undefined}
        loading={loading}
        loadingAll={loadingAll}
        hasMore={hasMore}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(s => !s)}
        primaryLabel="Sync New"
        onPrimary={fetchNew}
        onLoadAll={fetchAllHistory}
        onCancelLoadAll={cancelLoadAll}
        onReset={onReset}
        filterProps={filterProps}
        showWalletOnlyFilter
      />

      {error && <ErrorBanner message={error} />}

      {transactions.length === 0 && !loading && (
        <div className="text-center py-8">
          <p className="text-gray-500 mb-3">No transactions loaded yet</p>
          <button
            onClick={fetchOlder}
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm"
          >
            Load Transactions
          </button>
        </div>
      )}

      <TxSelectionBar
        selectedCount={selectedSigs.size}
        onAddToGroup={() => setShowAddToGroup(true)}
        onClear={() => setSelectedSigs(new Set())}
      />

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
                      disabled={paginated.every(tx => tx.slot === 0)}
                      checked={paginated.filter(tx => tx.slot !== 0).length > 0 && paginated.filter(tx => tx.slot !== 0).every(tx => selectedSigs.has(tx.signature))}
                      onChange={e => {
                        const eligible = paginated.filter(tx => tx.slot !== 0).map(tx => tx.signature);
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
                  <th className="text-right px-4 py-2">Fee (SOL)</th>
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
                          disabled={tx.slot === 0}
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
                        <CategoryBadge
                          category={tx.taxCategory}
                          onChangeCategory={updateCategory ? (cat) => updateCategory(tx.signature, cat) : undefined}
                        />
                        {tx.err && <span className="ml-1 text-xs text-red-500">Failed</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-300 max-w-xs truncate text-xs font-mono">
                        {summarizeTx(tx, tokenMetas, activeAddress, walletOnly)}
                        <GroupBadges memberships={memberships[tx.signature] ?? []} />
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 font-mono text-xs">
                        {tx.slot > 0 ? (tx.fee / 1e9).toFixed(6) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronDown
                          size={14}
                          className={`text-gray-500 transition-transform ${expandedSig === tx.signature ? 'rotate-180' : ''}`}
                        />
                      </td>
                    </tr>
                    {expandedSig === tx.signature && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <TxDetail tx={tx} tokenMetas={tokenMetas} walletAddress={activeAddress} walletOnly={walletOnly} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationBar page={page} totalPages={totalPages} pageSize={PAGE_SIZE} totalItems={filtered.length} setPage={setPage} />

          {hasMore && (
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

      {showAddToGroup && (
        <AddToGroupModal
          transactions={transactions.filter(tx => selectedSigs.has(tx.signature))}
          walletAddress={activeAddress}
          onClose={() => setShowAddToGroup(false)}
          onSaved={(groupName, count) => {
            onGroupSaved(groupName, count);
            setShowAddToGroup(false);
            setSelectedSigs(new Set());
          }}
        />
      )}
    </>
  );
}
