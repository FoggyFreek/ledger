import { RefreshCw, Filter, Trash2, ChevronsDown, X } from 'lucide-react';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { TransactionFilters } from './TransactionFilters';
import type { TransactionFiltersProps } from './TransactionFilters';

interface TransactionToolbarProps {
  txCount: number;
  filteredCount: number;
  allCount: number;
  isComplete: boolean;
  extraStatsText?: string;
  loading: boolean;
  loadingAll: boolean;
  hasMore: boolean;
  showFilters: boolean;
  onToggleFilters: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  onLoadAll: () => void;
  onCancelLoadAll: () => void;
  onReset: () => void;
  filterProps: Omit<TransactionFiltersProps, 'showWalletOnlyFilter'>;
  showWalletOnlyFilter: boolean;
}

export function TransactionToolbar({
  txCount, filteredCount, allCount, isComplete, extraStatsText,
  loading, loadingAll, hasMore,
  showFilters, onToggleFilters,
  primaryLabel, onPrimary, onLoadAll, onCancelLoadAll, onReset,
  filterProps, showWalletOnlyFilter,
}: TransactionToolbarProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Transactions</h2>
          <p className="text-sm text-gray-500">
            {txCount} loaded{extraStatsText}{isComplete ? ' (complete history)' : ''}
            {filteredCount !== allCount ? ` · ${filteredCount} matching` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleFilters}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${showFilters ? 'bg-purple-900 text-purple-200' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            <Filter size={14} />
            Filter
          </button>
          {hasMore && !isComplete && (
            <button
              onClick={loadingAll ? onCancelLoadAll : onLoadAll}
              disabled={loading && !loadingAll}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50 ${loadingAll ? 'bg-yellow-900 hover:bg-yellow-800 text-yellow-300' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
              title={loadingAll ? 'Cancel full history load' : 'Load complete transaction history'}
            >
              {loadingAll ? <><X size={14} /> Cancel ({txCount} loaded)</> : <><ChevronsDown size={14} /> Load All History</>}
            </button>
          )}
          <button
            onClick={onPrimary}
            disabled={loading || loadingAll}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? <LoadingSpinner size={14} /> : <RefreshCw size={14} />}
            {primaryLabel}
          </button>
          <button
            onClick={onReset}
            disabled={loading || loadingAll}
            className="flex items-center gap-2 bg-gray-800 hover:bg-red-900 text-gray-400 hover:text-red-300 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
            title="Reset & Reload"
          >
            <Trash2 size={14} />
            Reset
          </button>
        </div>
      </div>

      {showFilters && (
        <TransactionFilters
          {...filterProps}
          showWalletOnlyFilter={showWalletOnlyFilter}
        />
      )}
    </>
  );
}
