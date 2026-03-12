import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ChevronDown, ExternalLink, Filter, Trash2, ChevronsDown, X } from 'lucide-react';
import { format } from 'date-fns';
import { useApp } from '../context/AppContext';
import { useTransactions } from '../hooks/useTransactions';
import { useStaking } from '../hooks/useStaking';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { AddressDisplay } from '../components/shared/AddressDisplay';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import { CategoryBadge } from '../components/shared/CategoryBadge';
import { prefetchTokenMeta, getCachedTokenInfo } from '../lib/helius';
import type { TokenMeta } from '../lib/helius';
import { isSolMint, stakingRewardsToTransactions } from '../lib/taxCategorizer';
import { clearStakingData } from '../lib/storage';
import type { TaxCategory, ParsedTransaction, BalanceChange, RentItem } from '../types/transaction';

const ALL_CATEGORIES: TaxCategory[] = [
  'TRADE', 'TRANSFER_IN', 'TRANSFER_OUT', 'STAKING_REWARD',
  'NFT_SALE', 'NFT_BUY', 'AIRDROP', 'BURN', 'FEE', 'OTHER',
  'STAKE_DELEGATE', 'STAKE_DEACTIVATE', 'STAKE_WITHDRAW',
];

function resolveSymbol(mint: string, tokenMetas: Map<string, TokenMeta>): string {
  if (isSolMint(mint)) return 'SOL';
  return tokenMetas.get(mint)?.symbol ?? mint.slice(0, 6) + '…';
}

function formatAmount(bc: BalanceChange, tokenMetas: Map<string, TokenMeta>): string {
  const symbol = resolveSymbol(bc.mint, tokenMetas);
  const sign = bc.amount > 0 ? '+' : '-';
  const amount = Math.abs(bc.amount).toLocaleString(undefined, { maximumFractionDigits: 6 });
  return `${sign}${amount} ${symbol}`;
}

function summarizeChanges(changes: BalanceChange[], tokenMetas: Map<string, TokenMeta>): string {
  if (changes.length === 0) return '—';
  return changes.map(bc => formatAmount(bc, tokenMetas)).join(', ');
}

/** For TRADE txns: show "0.5 SOL, 10 USDC → 100 BONK" */
function summarizeSwap(changes: BalanceChange[], tokenMetas: Map<string, TokenMeta>): string {
  const sold = changes.filter(bc => bc.amount < 0);
  const bought = changes.filter(bc => bc.amount > 0);
  if (sold.length === 0 || bought.length === 0) return summarizeChanges(changes, tokenMetas);
  const sellStr = sold
    .map(bc => `${Math.abs(bc.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${resolveSymbol(bc.mint, tokenMetas)}`)
    .join(' + ');
  const buyStr = bought
    .map(bc => `${bc.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${resolveSymbol(bc.mint, tokenMetas)}`)
    .join(' + ');
  return `${sellStr} → ${buyStr}`;
}

function summarizeTx(tx: ParsedTransaction, tokenMetas: Map<string, TokenMeta>, walletAddress: string | null, walletOnly: boolean): React.ReactNode {
  const changes = walletOnly
    ? tx.interpretedFlow.netChanges.filter(bc => !bc.userAccount || bc.userAccount === walletAddress)
    : tx.interpretedFlow.netChanges;
  const summary = tx.taxCategory === 'TRADE' ? summarizeSwap(changes, tokenMetas) : summarizeChanges(changes, tokenMetas);
  if (tx.counterparty && (tx.taxCategory === 'TRANSFER_IN' || tx.taxCategory === 'TRANSFER_OUT')) {
    const label = tx.taxCategory === 'TRANSFER_IN' ? 'From' : 'To';
    const short = `${tx.counterparty.slice(0, 4)}…${tx.counterparty.slice(-4)}`;
    return (
      <span>
        {summary}
        <span className="ml-2 text-gray-500">{label}: {short}</span>
      </span>
    );
  }
  return summary;
}

function TokenLogo({ logoUri, symbol }: { logoUri: string | null; symbol: string }) {
  if (!logoUri) return null;
  return (
    <img
      src={logoUri}
      alt={symbol}
      className="w-4 h-4 rounded-full flex-shrink-0"
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

function ChangeRow({ bc, tokenMetas }: { bc: BalanceChange; tokenMetas: Map<string, TokenMeta> }) {
  const isSol = bc.mint === 'SOL';
  const meta = isSol ? null : tokenMetas.get(bc.mint) ?? null;
  const symbol = isSol ? 'SOL' : (meta?.symbol ?? bc.mint.slice(0, 8) + '…');
  const logoUri = meta?.logoUri ?? null;
  const name = isSol ? 'Solana' : (meta?.name ?? bc.mint);
  return (
    <div className="flex items-center gap-2 text-gray-400">
      <span className={bc.amount > 0 ? 'text-green-400' : 'text-red-400'}>
        {bc.amount > 0 ? '↓ IN' : '↑ OUT'}
      </span>
      <span className="font-mono">
        {Math.abs(bc.amount).toLocaleString(undefined, { maximumFractionDigits: 9 })}
      </span>
      <TokenLogo logoUri={logoUri} symbol={symbol} />
      <span className="text-gray-300 font-medium" title={isSol ? undefined : bc.mint}>
        {symbol}
      </span>
      {!isSol && meta?.name && meta.name !== symbol && (
        <span className="text-gray-600">{name}</span>
      )}
    </div>
  );
}

function RentRow({ item }: { item: RentItem }) {
  return (
    <div className="flex items-center gap-2 text-gray-500">
      <span className="text-yellow-600">{item.amount < 0 ? '↑ RENT' : '↓ REFUND'}</span>
      <span className="font-mono">{Math.abs(item.amount).toFixed(8)} SOL</span>
      <span>{item.label}</span>
      {item.refundable && <span className="text-gray-600">(refundable)</span>}
    </div>
  );
}

function TxDetail({
  tx, tokenMetas, walletAddress, walletOnly,
}: {
  tx: ParsedTransaction;
  tokenMetas: Map<string, TokenMeta>;
  walletAddress: string | null;
  walletOnly: boolean;
}) {
  const { netChanges, rentItems } = tx.interpretedFlow;
  const filteredChanges = walletOnly
    ? netChanges.filter(bc => !bc.userAccount || bc.userAccount === walletAddress)
    : netChanges;

  const footer = (
    <div className="flex items-center gap-4 text-gray-600 pt-1">
      {tx.slot > 0 && <span>Fee: {(tx.fee / 1e9).toFixed(6)} SOL</span>}
      {tx.slot > 0 && <span>Slot: {tx.slot}</span>}
      {tx.description && <span className="text-gray-500 italic">{tx.description}</span>}
      {tx.err && <span className="text-red-500">FAILED: {tx.err}</span>}
      {tx.slot > 0 && (
        <a
          href={`https://solscan.io/tx/${tx.signature}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-blue-500 hover:text-blue-400"
        >
          View <ExternalLink size={11} />
        </a>
      )}
    </div>
  );

  if (tx.taxCategory === 'TRADE') {
    return (
      <div className="bg-gray-950 border-t border-gray-800 px-4 py-3 text-xs space-y-2">
        {filteredChanges.length > 0 && (
          <div>
            <p className="text-gray-500 mb-1">Movements</p>
            {filteredChanges.map((bc, i) => <ChangeRow key={i} bc={bc} tokenMetas={tokenMetas} />)}
          </div>
        )}
        {(rentItems.length > 0 || tx.slot > 0) && (
          <div>
            <p className="text-gray-500 mb-1">Breakdown</p>
            {rentItems.map((item, i) => <RentRow key={i} item={item} />)}
            {tx.slot > 0 && (
              <div className="text-gray-600">Network fee: {(tx.fee / 1e9).toFixed(6)} SOL</div>
            )}
          </div>
        )}
        {footer}
      </div>
    );
  }

  return (
    <div className="bg-gray-950 border-t border-gray-800 px-4 py-3 text-xs space-y-2">
      {filteredChanges.length > 0 && (
        <div>
          <p className="text-gray-500 mb-1">Balance Changes</p>
          {filteredChanges.map((bc, i) => <ChangeRow key={i} bc={bc} tokenMetas={tokenMetas} />)}
        </div>
      )}
      {tx.counterparty && (
        <div>
          <p className="text-gray-500 mb-1">
            {tx.taxCategory === 'TRANSFER_IN' ? 'From' : 'To'}
          </p>
          <AddressDisplay address={tx.counterparty} short={true} showExplorer={true} />
        </div>
      )}
      {footer}
    </div>
  );
}

export function TransactionsPage() {
  const { activeAddress, settings } = useApp();
  const {
    transactions, loading, loadingAll, error, hasMore, isComplete,
    fetchNew, fetchOlder, fetchAllHistory, cancelLoadAll, loadFromStorage, resetAndReload,
  } = useTransactions(activeAddress);
  const { stakingRewards, refresh } = useStaking(activeAddress);

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

  useEffect(() => {
    loadFromStorage();
    setPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress]);

  useEffect(() => {
    if (!settings.apiKey || transactions.length === 0) return;
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
  }, [transactions, settings.apiKey]);

  const rewardTxns = useMemo(() => stakingRewardsToTransactions(stakingRewards), [stakingRewards]);

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
        if (isSolMint(bc.mint)) return 'sol'.includes(q) || 'solana'.includes(q);
        const meta = tokenMetas.get(bc.mint);
        return (meta?.symbol?.toLowerCase().includes(q) ?? false)
          || (meta?.name?.toLowerCase().includes(q) ?? false)
          || bc.mint.toLowerCase().startsWith(q);
      });
      if (!match) return false;
    }
    return true;
  }), [allTxns, hideDust, filterCategory, filterDateFrom, filterDateTo, filterToken, tokenMetas]);

  if (!activeAddress) {
    return <div className="text-gray-500 text-center py-20">Select a wallet first</div>;
  }

  if (!settings.apiKey) {
    return <div className="text-gray-500 text-center py-20">Add your Helius API key in Settings</div>;
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
            onClick={fetchNew}
            disabled={loading || loadingAll}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? <LoadingSpinner size={14} /> : <RefreshCw size={14} />}
            Sync New
          </button>
          <button
            onClick={() => {
            if (confirm('Clear all cached transactions and staking data, then reload from scratch?')) {
              if (activeAddress) clearStakingData(activeAddress);
              resetAndReload();
              refresh(true);
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
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={walletOnly}
                onChange={e => setWalletOnly(e.target.checked)}
                className="accent-purple-500"
              />
              <span className="text-xs text-gray-300">Wallet changes only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideDust}
                onChange={e => { setHideDust(e.target.checked); setPage(1); }}
                className="accent-purple-500"
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
            onClick={fetchOlder}
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm"
          >
            Load Transactions
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
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        <p>{format(new Date(tx.blockTime * 1000), 'MMM d, yyyy')}</p>
                        <p className="text-xs text-gray-600">{format(new Date(tx.blockTime * 1000), 'HH:mm:ss')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={tx.taxCategory} />
                        {tx.err && <span className="ml-1 text-xs text-red-500">Failed</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-300 max-w-xs truncate text-xs font-mono">
                        {summarizeTx(tx, tokenMetas, activeAddress, walletOnly)}
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
                        <td colSpan={5} className="p-0">
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

          {/* Load more */}
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
    </div>
  );
}
