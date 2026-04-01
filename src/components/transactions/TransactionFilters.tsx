import type { TaxCategory } from '../../types/transaction';

const ALL_CATEGORIES: TaxCategory[] = [
  'TRADE', 'TRANSFER_IN', 'TRANSFER_OUT', 'STAKING_REWARD',
  'NFT_SALE', 'NFT_BUY', 'AIRDROP', 'BURN', 'FEE', 'OTHER',
  'STAKE_DELEGATE', 'STAKE_DEACTIVATE', 'STAKE_WITHDRAW',
];

export interface TransactionFiltersProps {
  filterCategory: TaxCategory | 'ALL';
  setFilterCategory: (v: TaxCategory | 'ALL') => void;
  filterToken: string;
  setFilterToken: (v: string) => void;
  filterDirection: 'ALL' | 'POSITIVE' | 'NEGATIVE';
  setFilterDirection: (v: 'ALL' | 'POSITIVE' | 'NEGATIVE') => void;
  filterAmountFrom: string;
  setFilterAmountFrom: (v: string) => void;
  filterAmountTo: string;
  setFilterAmountTo: (v: string) => void;
  filterDateFrom: string;
  setFilterDateFrom: (v: string) => void;
  filterDateTo: string;
  setFilterDateTo: (v: string) => void;
  walletOnly: boolean;
  setWalletOnly: (v: boolean) => void;
  hideDust: boolean;
  setHideDust: (v: boolean) => void;
  setPage: (v: number) => void;
  showWalletOnlyFilter: boolean;
}

export function TransactionFilters(props: TransactionFiltersProps) {
  const {
    filterCategory, setFilterCategory, filterToken, setFilterToken,
    filterDirection, setFilterDirection, filterAmountFrom, setFilterAmountFrom,
    filterAmountTo, setFilterAmountTo, filterDateFrom, setFilterDateFrom,
    filterDateTo, setFilterDateTo, walletOnly, setWalletOnly,
    hideDust, setHideDust, setPage, showWalletOnlyFilter,
  } = props;

  return (
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
        <label className="text-xs text-gray-500 block mb-1">Direction</label>
        <select
          value={filterDirection}
          onChange={e => { setFilterDirection(e.target.value as 'ALL' | 'POSITIVE' | 'NEGATIVE'); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white"
        >
          <option value="ALL">All</option>
          <option value="POSITIVE">Positive (+)</option>
          <option value="NEGATIVE">Negative (−)</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Amount from</label>
        <input
          type="number"
          min="0"
          placeholder="0"
          value={filterAmountFrom}
          onChange={e => { setFilterAmountFrom(e.target.value); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-600 w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Amount to</label>
        <input
          type="number"
          min="0"
          placeholder="∞"
          value={filterAmountTo}
          onChange={e => { setFilterAmountTo(e.target.value); setPage(1); }}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-600 w-28 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
        {showWalletOnlyFilter && (
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
          onClick={() => { setFilterCategory('ALL'); setFilterDateFrom(''); setFilterDateTo(''); setFilterToken(''); setFilterDirection('ALL'); setFilterAmountFrom(''); setFilterAmountTo(''); setWalletOnly(true); setHideDust(true); setPage(1); }}
          className="text-xs text-gray-400 hover:text-white"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
