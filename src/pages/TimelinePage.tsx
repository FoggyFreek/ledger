import { useState, useMemo, useEffect } from 'react';
import type { TaxCategory, ParsedTransaction } from '../types/transaction';
import type { TimelineGroup, TransactionGroup } from '../types/groups';
import { useApp } from '../context/AppContext';
import { useAllWalletTransactions } from '../hooks/useAllWalletTransactions';
import { TimelineCanvas } from '../components/timeline/TimelineCanvas';
import { getAllCachedTokenMetas, getCachedTokenInfo } from '../lib/helius';
import { ALL_CATEGORIES, CATEGORY_SHORT_LABEL, CATEGORY_COLOR } from '../lib/categoryMeta';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { loadGroups, loadGroupMembers } from '../lib/storage';
import { groupMemberToTransaction } from '../lib/groups';

interface AvailableGroup {
  walletAddress: string;
  walletLabel: string;
  group: TransactionGroup;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function TimelinePage() {
  const { wallets } = useApp();
  const { transactions, loading } = useAllWalletTransactions(wallets);

  // Track which wallets are hidden (empty = all visible)
  const [hiddenWallets, setHiddenWallets] = useState<Set<string>>(new Set());
  const visibleWallets = useMemo(
    () => new Set(wallets.map(w => w.address).filter(a => !hiddenWallets.has(a))),
    [wallets, hiddenWallets],
  );

  const toggleWallet = (address: string) => {
    setHiddenWallets(prev => {
      const next = new Set(prev);
      if (next.has(address)) next.delete(address);
      else next.add(address);
      return next;
    });
  };

  // Category filter (hidden = filtered out)
  const [hiddenCategories, setHiddenCategories] = useState<Set<TaxCategory>>(new Set());
  const toggleCategory = (cat: TaxCategory) => {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Token / mint filter
  const [mintFilter, setMintFilter] = useState('');

  const tokenMetas = useMemo(() => getAllCachedTokenMetas(), []);

  // ── Groups ──────────────────────────────────────────────────────────────────
  const [allGroups, setAllGroups] = useState<AvailableGroup[]>([]);
  const [timelineGroups, setTimelineGroups] = useState<TimelineGroup[]>([]);
  const [hiddenGroups, setHiddenGroups] = useState<Set<number>>(new Set());

  // Load all groups from all wallets on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results: AvailableGroup[] = [];
      for (const w of wallets) {
        const groups = await loadGroups(w.address);
        for (const g of groups) {
          results.push({ walletAddress: w.address, walletLabel: w.label || w.address.slice(0, 8), group: g });
        }
      }
      if (!cancelled) setAllGroups(results);
    })();
    return () => { cancelled = true; };
  }, [wallets]);

  const addedGroupIds = useMemo(() => new Set(timelineGroups.map(g => g.id)), [timelineGroups]);

  const handleAddGroup = async (ag: AvailableGroup) => {
    const members = await loadGroupMembers(ag.walletAddress, ag.group.id);
    const txns = members.map(groupMemberToTransaction);
    setTimelineGroups(prev => [...prev, {
      id: ag.group.id,
      name: ag.group.name,
      walletAddress: ag.walletAddress,
      walletLabel: ag.walletLabel,
      transactions: txns,
    }]);
  };

  const handleRemoveGroup = (groupId: number) => {
    setTimelineGroups(prev => prev.filter(g => g.id !== groupId));
    setHiddenGroups(prev => { const next = new Set(prev); next.delete(groupId); return next; });
  };

  const toggleGroup = (groupId: number) => {
    setHiddenGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const visibleGroups = useMemo(
    () => new Set(timelineGroups.map(g => g.id).filter(id => !hiddenGroups.has(id))),
    [timelineGroups, hiddenGroups],
  );

  // Apply filters
  const filteredTransactions = useMemo(() => {
    const mintQ = mintFilter.trim().toLowerCase();
    const filteringCategories = hiddenCategories.size > 0;
    const filteringMint = mintQ.length > 0;

    if (!filteringCategories && !filteringMint) return transactions;

    const result: Record<string, ParsedTransaction[]> = {};
    for (const [addr, txns] of Object.entries(transactions)) {
      result[addr] = txns.filter(tx => {
        if (filteringCategories && hiddenCategories.has(tx.taxCategory)) return false;

        if (filteringMint) {
          const matches = tx.balanceChanges.some(bc => {
            if (bc.mint.toLowerCase().includes(mintQ)) return true;
            const meta = getCachedTokenInfo(bc.mint);
            return (meta?.symbol.toLowerCase().includes(mintQ) ||
                    meta?.name.toLowerCase().includes(mintQ)) ?? false;
          });
          if (!matches) return false;
        }

        return true;
      });
    }
    return result;
  }, [transactions, hiddenCategories, mintFilter]);

  // Apply same filters to group transactions
  const filteredGroups = useMemo((): TimelineGroup[] => {
    const mintQ = mintFilter.trim().toLowerCase();
    const filteringCategories = hiddenCategories.size > 0;
    const filteringMint = mintQ.length > 0;

    if (!filteringCategories && !filteringMint) return timelineGroups;

    return timelineGroups.map(g => ({
      ...g,
      transactions: g.transactions.filter(tx => {
        if (filteringCategories && hiddenCategories.has(tx.taxCategory)) return false;
        if (filteringMint) {
          const matches = tx.balanceChanges.some(bc => {
            if (bc.mint.toLowerCase().includes(mintQ)) return true;
            const meta = getCachedTokenInfo(bc.mint);
            return (meta?.symbol.toLowerCase().includes(mintQ) ||
                    meta?.name.toLowerCase().includes(mintQ)) ?? false;
          });
          if (!matches) return false;
        }
        return true;
      }),
    }));
  }, [timelineGroups, hiddenCategories, mintFilter]);

  return (
    <div className="flex flex-col h-full">

      {/* Filters: type / token / groups */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-gray-950 shrink-0 flex-wrap">

        {/* Category chips */}
        <span className="text-xs text-gray-500 uppercase tracking-wider">Types</span>
        {hiddenCategories.size > 0 && (
          <button
            onClick={() => setHiddenCategories(new Set())}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-1.5 py-0.5 transition-colors"
          >
            reset
          </button>
        )}
        {ALL_CATEGORIES.map(cat => {
          const active = !hiddenCategories.has(cat);
          const color = CATEGORY_COLOR[cat];
          return (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              style={active ? { borderColor: color, color, backgroundColor: color + '22' } : undefined}
              className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                active ? '' : 'border-gray-700 text-gray-600'
              }`}
            >
              {CATEGORY_SHORT_LABEL[cat]}
            </button>
          );
        })}

        <div className="w-px h-4 bg-gray-700 mx-1 shrink-0" />

        {/* Token / mint filter */}
        <span className="text-xs text-gray-500 uppercase tracking-wider shrink-0">Token</span>
        <div className="relative">
          <input
            type="text"
            value={mintFilter}
            onChange={e => setMintFilter(e.target.value)}
            placeholder="symbol or mint…"
            className="bg-gray-800 border border-gray-700 text-xs text-gray-200 placeholder-gray-600 rounded px-2 py-0.5 w-36 focus:outline-none focus:border-gray-500"
          />
          {mintFilter && (
            <button
              onClick={() => setMintFilter('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs leading-none"
            >
              ×
            </button>
          )}
        </div>

        <div className="w-px h-4 bg-gray-700 mx-1 shrink-0" />

        {/* Group picker */}
        <span className="text-xs text-gray-500 uppercase tracking-wider shrink-0">Group</span>
        <select
          className="bg-gray-800 border border-gray-700 text-xs text-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-gray-500"
          value=""
          onChange={e => {
            const idx = parseInt(e.target.value);
            if (!isNaN(idx)) handleAddGroup(allGroups[idx]);
          }}
        >
          <option value="">+ Add group…</option>
          {allGroups.map((ag, i) =>
            addedGroupIds.has(ag.group.id) ? null : (
              <option key={ag.group.id} value={i}>
                {ag.walletLabel} — {ag.group.name} ({ag.group.txCount} txns)
              </option>
            ),
          )}
        </select>

        {loading && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
            <LoadingSpinner size={14} /> Loading…
          </span>
        )}
        {!loading && (
          <span className="ml-auto text-xs text-gray-600">
            Scroll to zoom · Drag to pan · Hover for detail
          </span>
        )}

      </div>

      {/* Canvas */}
      {wallets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          Add wallets to see the timeline
        </div>
      ) : (
        <TimelineCanvas
          wallets={wallets}
          transactions={filteredTransactions}
          tokenMetas={tokenMetas}
          visibleWallets={visibleWallets}
          onToggleWallet={toggleWallet}
          groups={filteredGroups}
          visibleGroups={visibleGroups}
          onToggleGroup={toggleGroup}
          onRemoveGroup={handleRemoveGroup}
        />
      )}
    </div>
  );
}
