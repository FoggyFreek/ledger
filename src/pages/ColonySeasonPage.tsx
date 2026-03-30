import { useState, useRef, useEffect, useCallback } from 'react';
import { RefreshCw, Trash2, Copy, ExternalLink, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useColonySeason } from '../hooks/useColonySeason';
import { COLONY_STAR_STAKE_ACCOUNT, COLONY_TREASURY, COLONY_PROGRAM } from '../lib/colonyData';
import type { ColonyStaker, ColonyBuyer } from '../types/colony';

function truncateAddr(addr: string) {
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

function formatNumber(n: number, decimals = 0) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

interface AddressTooltipData {
  address: string;
  staker: ColonyStaker | undefined;
  buyer: ColonyBuyer | undefined;
  rect: DOMRect;
}

function AddressTooltip({ data, onClose }: { data: AddressTooltipData; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const top = data.rect.bottom + 4;
  const left = data.rect.left;

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl px-3 py-2 text-xs"
      style={{ top, left }}
    >
      <p className="font-mono text-gray-300 mb-1.5">{data.address}</p>
      <div className="space-y-0.5">
        <p className="text-gray-400">
          STAR Staked: <span className="text-white font-medium">{data.staker ? formatNumber(data.staker.totalStar, 2) : '0'}</span>
        </p>
        <p className="text-gray-400">
          Planets Minted: <span className="text-white font-medium">{data.buyer ? formatNumber(data.buyer.planetCount) : '0'}</span>
        </p>
      </div>
    </div>
  );
}

function HorizontalBar({
  label,
  value,
  maxValue,
  highlight,
  suffix,
  onAddressClick,
}: {
  label: string;
  value: number;
  maxValue: number;
  highlight: boolean;
  suffix?: string;
  onAddressClick: (address: string, rect: DOMRect) => void;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className={`group flex items-center gap-2 py-1 px-2 rounded ${highlight ? 'bg-purple-900/30' : ''}`}>
      <div className="flex items-center gap-1 w-36 shrink-0">
        <span
          className="text-xs text-gray-400 truncate font-mono cursor-pointer hover:text-purple-400 transition-colors"
          title={label}
          onClick={(e) => onAddressClick(label, e.currentTarget.getBoundingClientRect())}
        >
          {truncateAddr(label)}
        </span>
        <button
          className="text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Copy address"
          onClick={() => navigator.clipboard.writeText(label)}
        >
          <Copy size={11} />
        </button>
        <a
          href={`https://solscan.io/account/${label}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-600 hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
          title="View on Solscan"
        >
          <ExternalLink size={11} />
        </a>
      </div>
      <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
        <div className="bg-purple-600 rounded-full h-4 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-300 w-28 text-right whitespace-nowrap">
        {formatNumber(value)} {suffix}
      </span>
    </div>
  );
}

function DistributionBar({
  label,
  value,
  maxValue,
}: {
  label: string;
  value: number;
  maxValue: number;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-gray-400 w-12 text-right">{label}</span>
      <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
        <div className="bg-emerald-600 rounded-full h-4 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-300 w-16 text-right">{value} users</span>
    </div>
  );
}

export function ColonySeasonPage() {
  const { wallets } = useApp();
  const walletAddresses = wallets.map(w => w.address);
  const {
    data,
    loading,
    error,
    progress,
    refresh,
    update,
    clearCache,
    userStarStaked,
    userPlanets,
  } = useColonySeason(walletAddresses);

  const [tooltip, setTooltip] = useState<AddressTooltipData | null>(null);

  const stakerMap = new Map(data?.topStakers.map(s => [s.address, s]) ?? []);
  const buyerMap = new Map(data?.topBuyers.map(b => [b.address, b]) ?? []);

  const handleAddressClick = useCallback((address: string, rect: DOMRect) => {
    setTooltip({
      address,
      staker: stakerMap.get(address),
      buyer: buyerMap.get(address),
      rect,
    });
  }, [data]);

  const hasUserStats = userStarStaked > 0 || userPlanets > 0;

  return (
    <div className="space-y-6">
      {tooltip && <AddressTooltip data={tooltip} onClose={() => setTooltip(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Colony Season</h1>
          <div className="flex items-center gap-3 mt-1">
            <SolscanLink address={COLONY_STAR_STAKE_ACCOUNT} label="STAR Stake" />
            <SolscanLink address={COLONY_TREASURY} label="Treasury" />
            <SolscanLink address={COLONY_PROGRAM} label="Colony Program" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && !loading && (
            <>
              <button
                onClick={clearCache}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-red-400 rounded-lg text-sm"
              >
                <Trash2 size={14} />
                Clear Cache
              </button>
              <button
                onClick={update}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm"
              >
                <Download size={14} />
                Update
              </button>
            </>
          )}
          <button
            onClick={() => refresh(true)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? (progress ?? 'Loading...') : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Total Players" value={data ? formatNumber(data.totalPlayers) : '—'} />
        <SummaryCard label="Planets Minted" value={data ? formatNumber(data.totalPlanetsMinted) : '—'} />
        <SummaryCard label="STAR Staked" value={data ? formatNumber(data.totalStarStakedLive, 2) : '—'} />
        <SummaryCard
          label="Last Updated"
          value={data ? new Date(data.fetchedAt).toLocaleString() : '—'}
          small
        />
      </div>

      {/* Your Stats */}
      {data && hasUserStats && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Your Stats</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Your STAR Staked</p>
              <p className="text-lg text-white font-semibold">{formatNumber(userStarStaked, 2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Your Planets</p>
              <p className="text-lg text-white font-semibold">{formatNumber(userPlanets)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Top STAR Stakers */}
      {data && data.topStakers.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Top STAR Stakers
          </h2>
          <div className="space-y-0.5">
            {data.topStakers.slice(0, 10).map((s) => (
              <HorizontalBar
                key={s.address}
                label={s.address}
                value={s.totalStar}
                maxValue={data.topStakers[0].totalStar}
                highlight={walletAddresses.includes(s.address)}
                suffix="STAR"
                onAddressClick={handleAddressClick}
              />
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-2">{data.topStakers.length} unique stakers total</p>
        </div>
      )}

      {/* Top Planet Buyers */}
      {data && data.topBuyers.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Top Planet Buyers
          </h2>
          <div className="space-y-0.5">
            {data.topBuyers.slice(0, 10).map((b) => (
              <HorizontalBar
                key={b.address}
                label={b.address}
                value={b.planetCount}
                maxValue={data.topBuyers[0].planetCount}
                highlight={walletAddresses.includes(b.address)}
                suffix="planets"
                onAddressClick={handleAddressClick}
              />
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-2">{data.totalPlayers} unique buyers total</p>
        </div>
      )}

      {/* Mint Distribution */}
      {data && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Planet mint distribution
          </h2>
          <div className="space-y-0.5">
            {Object.entries(data.mintDistribution).map(([bucket, count]) => (
              <DistributionBar
                key={bucket}
                label={bucket}
                value={count}
                maxValue={Math.max(...Object.values(data.mintDistribution))}
              />
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-2">
            {data.stakeTxCount} stake txns, {data.treasuryTxCount} treasury txns fetched
          </p>
        </div>
      )}

      {!data && !loading && (
        <div className="text-center text-gray-500 py-16">
          Click Refresh to load Colony Season data
        </div>
      )}
    </div>
  );
}

function SolscanLink({ address, label }: { address: string; label: string }) {
  return (
    <a
      href={`https://solscan.io/account/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-purple-400 transition-colors"
    >
      {label}
      <ExternalLink size={10} />
    </a>
  );
}

function SummaryCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-white font-semibold ${small ? 'text-sm mt-1' : 'text-xl mt-0.5'}`}>{value}</p>
    </div>
  );
}
