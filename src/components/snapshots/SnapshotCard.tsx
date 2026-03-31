import { useState } from 'react';
import { Trash2, Download, ChevronDown, ChevronRight, RefreshCw, Layers, Eye, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { getCachedTokenInfo } from '../../lib/helius';
import { computeStakingInfo } from '../../lib/snapshotEngine';
import { refreshSingleTokenPrice } from '../../lib/snapshotPrices';
import { buildSnapshotCsvRows } from '../../lib/snapshotCsv';
import { objectsToCsv, downloadCsv } from '../../lib/csv';
import { SOL_MINT } from '../../lib/constants';
import type { WalletSnapshot } from '../../types/wallet';
import type { WalletType } from '../../types/wallet';
import type { ParsedTransaction } from '../../types/transaction';

export type DisplayCurrency = 'USD' | 'EUR';

function resolveTokenMeta(t: { mint: string; symbol: string; name: string; logoUri: string | null }) {
  const cached = getCachedTokenInfo(t.mint);
  return {
    symbol: (t.symbol === '?' && cached?.symbol) ? cached.symbol : t.symbol,
    name: (t.name === t.mint.slice(0, 8) && cached?.name) ? cached.name : t.name,
    logoUri: (!t.logoUri && cached?.logoUri) ? cached.logoUri : t.logoUri,
  };
}

export function SnapshotCard({
  snapshot,
  walletType,
  onDelete,
  onUpdate,
  displayCurrency,
  allTransactions,
}: {
  snapshot: WalletSnapshot;
  walletType: WalletType;
  onDelete: () => void;
  onUpdate: (updated: WalletSnapshot) => Promise<void>;
  displayCurrency: DisplayCurrency;
  allTransactions: ParsedTransaction[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [stakingExpanded, setStakingExpanded] = useState(false);
  const [hideZeroValue, setHideZeroValue] = useState(false);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [addingStaking, setAddingStaking] = useState(false);

  const hasStakingTxs = allTransactions.some(tx =>
    tx.taxCategory === 'STAKE_DELEGATE' || tx.taxCategory === 'STAKING_REWARD' || tx.taxCategory === 'STAKE_WITHDRAW'
  );

  const addStakingData = async () => {
    setAddingStaking(true);
    try {
      const targetTs = Math.floor(snapshot.targetDate / 1000);
      const stakingInfo = computeStakingInfo(targetTs, allTransactions, snapshot.walletAddress);
      await onUpdate({ ...snapshot, stakingInfo });
    } finally {
      setAddingStaking(false);
    }
  };

  const refreshPrice = async (mint: string) => {
    setRefreshing(prev => new Set(prev).add(mint));
    try {
      const targetTs = Math.floor(snapshot.targetDate / 1000);
      const { usd: price, eur: eurPrice } = await refreshSingleTokenPrice(mint, targetTs, walletType);

      if (price == null) return;

      let updatedHoldings = snapshot.holdings;
      if (mint === SOL_MINT) {
        updatedHoldings = { ...snapshot.holdings, solPrice: price, solPriceEur: eurPrice };
      } else {
        updatedHoldings = {
          ...snapshot.holdings,
          tokens: snapshot.holdings.tokens.map(t =>
            t.mint === mint ? { ...t, usdValue: t.uiAmount * price, eurValue: eurPrice != null ? t.uiAmount * eurPrice : null } : t
          ),
        };
      }
      await onUpdate({ ...snapshot, holdings: updatedHoldings });
    } finally {
      setRefreshing(prev => { const s = new Set(prev); s.delete(mint); return s; });
    }
  };

  const exportCsv = () => {
    const rows = buildSnapshotCsvRows(snapshot, resolveTokenMeta);
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
              onClick={() => setHideZeroValue(h => !h)}
              className={`transition-colors ${hideZeroValue ? 'text-purple-400 hover:text-purple-300' : 'text-gray-400 hover:text-purple-400'}`}
              title={hideZeroValue ? 'Show zero-value tokens' : 'Hide zero-value tokens'}
            >
              {hideZeroValue ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            {!snapshot.stakingInfo && walletType === 'solana' && hasStakingTxs && (
              <button
                onClick={addStakingData}
                disabled={addingStaking}
                className="text-gray-400 hover:text-purple-400 disabled:opacity-40 transition-colors"
                title="Add staking data"
              >
                <Layers size={16} className={addingStaking ? 'animate-pulse' : ''} />
              </button>
            )}
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
        <div className={`grid gap-3 mt-3 ${snapshot.stakingInfo ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <div className="bg-gray-800 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">SOL</p>
            <p className="text-sm font-mono text-white">{snapshot.holdings.solBalance.toFixed(4)}</p>
          </div>
          {snapshot.stakingInfo && (
            <div className="bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-500">Staked SOL</p>
              <p className="text-sm font-mono text-white">{snapshot.stakingInfo.totalStakedSol.toFixed(4)}</p>
            </div>
          )}
          <div className="bg-gray-800 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">Tokens</p>
            <p className="text-sm font-mono text-white">{snapshot.holdings.tokens.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">Total {displayCurrency}</p>
            <p className="text-sm font-mono text-white">
              {(() => {
                const isEur = displayCurrency === 'EUR';
                const sp = isEur ? (snapshot.holdings.solPriceEur ?? null) : snapshot.holdings.solPrice;
                const tokenSum = snapshot.holdings.tokens.reduce((s, t) => s + ((isEur ? (t.eurValue ?? null) : t.usdValue) ?? 0), 0);
                const stakedValue = snapshot.stakingInfo && sp != null ? snapshot.stakingInfo.totalStakedSol * sp : 0;
                const hasAny = sp != null || snapshot.holdings.tokens.some(t => (isEur ? t.eurValue : t.usdValue) != null);
                if (!hasAny) return '\u2014';
                const total = (sp ?? 0) * snapshot.holdings.solBalance + tokenSum + stakedValue;
                const sym = isEur ? '\u20AC' : '$';
                return `${sym}${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              })()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? 'Hide' : 'Show'} token breakdown
          </button>
          {snapshot.stakingInfo && (
            <button
              onClick={() => setStakingExpanded(e => !e)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
            >
              {stakingExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {stakingExpanded ? 'Hide' : 'Show'} staking details
            </button>
          )}
        </div>
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
                <th className="px-4 py-2" />
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
                    {(() => {
                      const p = displayCurrency === 'EUR' ? (snapshot.holdings.solPriceEur ?? null) : snapshot.holdings.solPrice;
                      const sym = displayCurrency === 'EUR' ? '\u20AC' : '$';
                      return p != null ? `${sym}${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '\u2014';
                    })()}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-400">
                    {(() => {
                      const p = displayCurrency === 'EUR' ? (snapshot.holdings.solPriceEur ?? null) : snapshot.holdings.solPrice;
                      const sym = displayCurrency === 'EUR' ? '\u20AC' : '$';
                      return p != null ? `${sym}${(snapshot.holdings.solBalance * p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '\u2014';
                    })()}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => refreshPrice(SOL_MINT)}
                      disabled={refreshing.has(SOL_MINT)}
                      className="text-gray-600 hover:text-purple-400 disabled:opacity-40 transition-colors"
                      title="Refresh SOL price"
                    >
                      <RefreshCw size={12} className={refreshing.has(SOL_MINT) ? 'animate-spin' : ''} />
                    </button>
                  </td>
                </tr>

              {snapshot.holdings.tokens.filter(t => {
                if (!hideZeroValue) return true;
                return (t.usdValue != null && t.usdValue !== 0) || (t.eurValue != null && t.eurValue !== 0);
              }).map(t => {
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
                      {(() => {
                        const val = displayCurrency === 'EUR' ? (t.eurValue ?? null) : t.usdValue;
                        const sym = displayCurrency === 'EUR' ? '\u20AC' : '$';
                        return val != null && t.uiAmount > 0
                          ? `${sym}${(val / t.uiAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
                          : '\u2014';
                      })()}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-400">
                      {(() => {
                        const val = displayCurrency === 'EUR' ? (t.eurValue ?? null) : t.usdValue;
                        const sym = displayCurrency === 'EUR' ? '\u20AC' : '$';
                        return val != null ? `${sym}${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '\u2014';
                      })()}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => refreshPrice(t.mint)}
                        disabled={refreshing.has(t.mint)}
                        className="text-gray-600 hover:text-purple-400 disabled:opacity-40 transition-colors"
                        title={`Refresh ${meta.symbol} price`}
                      >
                        <RefreshCw size={12} className={refreshing.has(t.mint) ? 'animate-spin' : ''} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {stakingExpanded && snapshot.stakingInfo && (() => {
        const solPrice = snapshot.holdings.solPrice;
        const solPriceEur = snapshot.holdings.solPriceEur ?? null;
        const staked = snapshot.stakingInfo!;
        const stakedUsd = solPrice != null ? staked.totalStakedSol * solPrice : null;
        const stakedEur = solPriceEur != null ? staked.totalStakedSol * solPriceEur : null;
        const rewardsUsd = solPrice != null ? staked.totalRewardsEarnedSol * solPrice : null;
        const rewardsEur = solPriceEur != null ? staked.totalRewardsEarnedSol * solPriceEur : null;
        const fmt = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (
          <div className="border-t border-gray-800 p-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="text-left px-4 py-2">Staking</th>
                  <th className="text-right px-4 py-2">SOL</th>
                  <th className="text-right px-4 py-2">USD</th>
                  <th className="text-right px-4 py-2">EUR</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-800/30">
                  <td className="px-4 py-2 text-white">Total staked</td>
                  <td className="px-4 py-2 text-right font-mono text-white">{staked.totalStakedSol.toFixed(6)}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-400">{stakedUsd != null ? `$${fmt(stakedUsd)}` : '\u2014'}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-400">{stakedEur != null ? `\u20AC${fmt(stakedEur)}` : '\u2014'}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-white">
                    Cumulative rewards
                    <span className="text-gray-600 ml-1">({staked.rewardCount} reward{staked.rewardCount !== 1 ? 's' : ''})</span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-white">{staked.totalRewardsEarnedSol.toFixed(6)}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-400">{rewardsUsd != null ? `$${fmt(rewardsUsd)}` : '\u2014'}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-400">{rewardsEur != null ? `\u20AC${fmt(rewardsEur)}` : '\u2014'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
