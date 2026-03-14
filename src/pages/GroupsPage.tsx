import { Fragment, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Trash2, Check, X, ChevronDown, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CategoryBadge } from '../components/shared/CategoryBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { Toast } from '../components/shared/Toast';
import { TxDetail, TokenLogo } from '../components/transactions/TxDetail';
import { useToast } from '../hooks/useToast';
import { prefetchTokenMeta, getCachedTokenInfo } from '../lib/helius';
import type { TokenMeta } from '../lib/helius';
import { isSolMint, interpretTransaction } from '../lib/taxCategorizer';
import { aggregateBalances } from '../lib/groupSummary';
import { summarizeTx, resolveSymbol } from '../lib/txSummary';
import { computeUsdValues } from '../lib/groups';
import {
  loadGroups, loadGroupMembers, renameGroup, deleteGroup,
  removeGroupMember, updateGroupMemberPrices,
} from '../lib/storage';
import type { TransactionGroup, GroupMember } from '../types/groups';
import type { BalanceChange, ParsedTransaction, TaxCategory } from '../types/transaction';

// Convert a GroupMember to a minimal ParsedTransaction so we can reuse
// summarizeTx and TxDetail without duplication.
function memberToTx(m: GroupMember): ParsedTransaction {
  return {
    signature: m.signature,
    blockTime: m.blockTime,
    slot: m.slot,
    fee: m.fee,
    taxCategory: m.taxCategory as TaxCategory,
    heliusType: null,
    description: null,
    balanceChanges: m.balanceChanges,
    err: m.err,
    counterparty: m.counterparty,
    interpretedFlow: interpretTransaction(m.balanceChanges),
  };
}


/** Split a formatted number string at the decimal point for decimal-aligned rendering. */
function fmtSplit(abs: number): [string, string] {
  const s = abs.toLocaleString(undefined, { maximumFractionDigits: 6 });
  const dot = s.indexOf('.');
  return dot === -1 ? [s, ''] : [s.slice(0, dot), s.slice(dot)];
}

function UsdValueCell({ usdInflow, usdOutflow, taxCategory }: {
  usdInflow: number | null;
  usdOutflow: number | null;
  taxCategory: string;
}) {
  if (usdInflow == null && usdOutflow == null) {
    return <span className="text-gray-600">—</span>;
  }
  const inflow = usdInflow ?? 0;
  const outflow = usdOutflow ?? 0;
  const isTrade = taxCategory === 'TRADE';
  const isPositive = inflow >= outflow;
  const sign = isTrade ? '' : isPositive ? '+' : '−';
  const color = isTrade ? 'text-gray-300' : isPositive ? 'text-green-400' : 'text-red-400';
  return <span className={color}>{sign}${Math.max(inflow, outflow).toFixed(2)}</span>;
}

/**
 * Two <td> cells that together render a signed number aligned at the decimal point.
 * The integer part goes in the first cell (right-aligned) and the ".decimals" in the second (left-aligned).
 * groupPr adds right padding to the second cell to space column groups apart.
 */
function NumCells({ value, sign, groupPr }: { value: number; sign: '+' | '-' | 'net'; groupPr: string }) {
  const absent =
    (sign === '+' && value <= 1e-9) ||
    (sign === '-' && value >= -1e-9);

  if (absent) {
    return (
      <>
        <td className="text-right text-gray-600 py-0.5 pl-2">—</td>
        <td className={`py-0.5 ${groupPr}`} />
      </>
    );
  }

  const abs = Math.abs(value);
  const [intPart, decPart] = fmtSplit(abs);
  let prefix: string;
  let colorClass: string;
  if (sign === '+') {
    prefix = '+'; colorClass = 'text-green-400';
  } else if (sign === '-') {
    prefix = '−'; colorClass = 'text-red-400';
  } else {
    // net
    if (Math.abs(value) < 1e-9) { prefix = ''; colorClass = 'text-gray-500'; }
    else if (value > 0) { prefix = '+'; colorClass = 'text-green-400'; }
    else { prefix = '−'; colorClass = 'text-red-400'; }
  }

  return (
    <>
      <td className={`text-right py-0.5 pl-2 ${colorClass}`}>{prefix}{intPart}</td>
      <td className={`text-left py-0.5 ${groupPr} ${colorClass}`}>{decPart}</td>
    </>
  );
}

export function GroupsPage() {
  const { activeAddress } = useApp();
  const { toast, showToast, dismissToast } = useToast();

  const [groups, setGroups] = useState<TransactionGroup[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [expandedSig, setExpandedSig] = useState<string | null>(null);
  const [tokenMetas, setTokenMetas] = useState<Map<string, TokenMeta>>(new Map());

  const selectedGroup = groups.find(g => g.id === selectedId);

  useEffect(() => {
    if (!activeAddress) return;
    loadGroups(activeAddress).then(setGroups);
    setSelectedId(null);
    setMembers([]);
  }, [activeAddress]);

  useEffect(() => {
    if (!activeAddress || selectedId == null) return;
    setLoadingMembers(true);
    setExpandedSig(null);
    loadGroupMembers(activeAddress, selectedId)
      .then(setMembers)
      .finally(() => setLoadingMembers(false));
  }, [activeAddress, selectedId]);

  // Prefetch token metadata whenever the member list changes
  useEffect(() => {
    if (members.length === 0) return;
    const mints = [...new Set(
      members.flatMap(m => (m.balanceChanges as BalanceChange[]).map(bc => bc.mint).filter(mint => !isSolMint(mint)))
    )];
    prefetchTokenMeta(mints).then(() => {
      const map = new Map<string, TokenMeta>();
      for (const mint of mints) {
        const meta = getCachedTokenInfo(mint);
        if (meta) map.set(mint, meta);
      }
      setTokenMetas(map);
    });
  }, [members]);

  const handleDelete = async (id: number) => {
    if (!activeAddress) return;
    await deleteGroup(activeAddress, id);
    const name = groups.find(g => g.id === id)?.name ?? 'Group';
    setGroups(gs => gs.filter(g => g.id !== id));
    setConfirmDeleteId(null);
    if (selectedId === id) { setSelectedId(null); setMembers([]); }
    showToast(`"${name}" deleted`, 'info');
  };

  const startRename = (g: TransactionGroup) => {
    setEditingName(String(g.id));
    setNameInput(g.name);
  };

  const saveRename = async () => {
    if (!activeAddress || editingName == null || !nameInput.trim()) { setEditingName(null); return; }
    const id = parseInt(editingName);
    await renameGroup(activeAddress, id, nameInput.trim());
    setGroups(gs => gs.map(g => g.id === id ? { ...g, name: nameInput.trim() } : g));
    showToast('Group renamed', 'success');
    setEditingName(null);
  };

  const handleRemoveMember = async (sig: string) => {
    if (!activeAddress || selectedId == null) return;
    await removeGroupMember(activeAddress, selectedId, sig);
    setMembers(ms => ms.filter(m => m.signature !== sig));
    setGroups(gs => gs.map(g => g.id === selectedId ? { ...g, txCount: g.txCount - 1 } : g));
    if (expandedSig === sig) setExpandedSig(null);
  };

  const handleRefreshPrices = async () => {
    if (!activeAddress || selectedId == null || members.length === 0) return;
    setRefreshingPrices(true);
    try {
      const txs = members.map(memberToTx);
      const updates = await computeUsdValues(txs);
      await updateGroupMemberPrices(activeAddress, selectedId, updates);
      // Merge updated prices back into local state
      const bySignature = new Map(updates.map(u => [u.signature, u]));
      setMembers(ms => ms.map(m => {
        const u = bySignature.get(m.signature);
        if (!u) return m;
        return { ...m, usdInflow: u.usdInflow, usdOutflow: u.usdOutflow, priceFetched: u.priceFetched };
      }));
      const fetched = updates.filter(u => u.priceFetched).length;
      showToast(`Prices refreshed — ${fetched}/${updates.length} transactions priced`, 'success');
    } catch {
      showToast('Failed to refresh prices', 'warning');
    } finally {
      setRefreshingPrices(false);
    }
  };

  const usdInTotal = members.filter(m => m.priceFetched).reduce((s, m) => s + (m.usdInflow ?? 0), 0);
  const usdOutTotal = members.filter(m => m.priceFetched).reduce((s, m) => s + (m.usdOutflow ?? 0), 0);
  const hasMissingPrices = members.some(m => !m.priceFetched);
  const tokenTotals = aggregateBalances(members);

  if (!activeAddress) {
    return <div className="text-gray-500 text-center py-20">Select a wallet first</div>;
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Left panel */}
      <div className="w-72 flex-shrink-0">
        <h2 className="text-xl font-bold text-white mb-4">Groups</h2>
        {groups.length === 0 && (
          <p className="text-gray-500 text-sm">No groups yet. Select transactions in the Transactions page and add them to a group.</p>
        )}
        <div className="space-y-1">
          {groups.map(g => (
            <div
              key={g.id}
              className={`group flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                selectedId === g.id ? 'bg-purple-900/50 text-white' : 'bg-gray-900 border border-gray-800 text-gray-300 hover:bg-gray-800'
              }`}
              onClick={() => { setSelectedId(g.id); setEditingName(null); }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{g.name}</p>
                <p className="text-xs text-gray-500">{g.txCount} transactions</p>
              </div>
              {confirmDeleteId === g.id ? (
                <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => handleDelete(g.id)} className="text-red-400 hover:text-red-300" title="Confirm delete">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className="text-gray-400 hover:text-white" title="Cancel">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDeleteId(g.id); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all ml-2 shrink-0"
                  title="Delete group"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0">
        {selectedGroup == null ? (
          <div className="text-gray-500 text-center py-20">Select a group to view its transactions</div>
        ) : (
          <div className="space-y-4">
            {/* Header / rename */}
            <div className="flex items-center gap-3">
              {editingName === String(selectedGroup.id) ? (
                <>
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingName(null); }}
                    className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-lg font-bold focus:outline-none focus:border-purple-500"
                  />
                  <button onClick={saveRename} className="text-green-400 hover:text-green-300"><Check size={16} /></button>
                  <button onClick={() => setEditingName(null)} className="text-gray-400 hover:text-white"><X size={16} /></button>
                </>
              ) : (
                <h3
                  className="text-xl font-bold text-white cursor-pointer hover:text-purple-300"
                  title="Click to rename"
                  onClick={() => startRename(selectedGroup)}
                >
                  {selectedGroup.name}
                </h3>
              )}
              <div className="ml-auto">
                <button
                  onClick={handleRefreshPrices}
                  disabled={refreshingPrices || members.length === 0}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
                  title="Re-fetch historical USD prices for all transactions in this group"
                >
                  {refreshingPrices ? <LoadingSpinner size={12} /> : <RefreshCw size={12} />}
                  Refresh Prices
                </button>
              </div>
            </div>

            {/* Totals */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Totals</p>
              <div className="flex items-start justify-between gap-6">
                {/* Token flow: IN / OUT / Net per token */}
                <div className="flex-1 min-w-0">
                  {tokenTotals.length === 0 ? (
                    <p className="text-xs text-gray-600">—</p>
                  ) : (
                    <table className="text-xs font-mono">
                      <thead>
                        <tr className="text-gray-500">
                          <th className="text-left pr-6 pb-1 font-normal">Token</th>
                          <th colSpan={2} className="text-right pr-6 pb-1 font-normal">In</th>
                          <th colSpan={2} className="text-right pr-6 pb-1 font-normal">Out</th>
                          <th colSpan={2} className="text-right pb-1 font-normal">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokenTotals.map(({ mint, inTotal, outTotal, netTotal }) => {
                          const isSol = isSolMint(mint);
                          const meta = isSol ? getCachedTokenInfo('So11111111111111111111111111111111111111112') : (tokenMetas.get(mint) ?? null);
                          const symbol = resolveSymbol(mint, tokenMetas);
                          return (
                            <tr key={mint}>
                              <td className="text-left pr-6 py-0.5">
                                <span className="flex items-center gap-1.5 text-gray-300">
                                  <TokenLogo logoUri={meta?.logoUri ?? null} symbol={symbol} />
                                  {symbol}
                                </span>
                              </td>
                              <NumCells value={inTotal} sign="+" groupPr="pr-6" />
                              <NumCells value={outTotal} sign="-" groupPr="pr-6" />
                              <NumCells value={netTotal} sign="net" groupPr="" />
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                {/* USD totals */}
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500 mb-1">
                    USD {hasMissingPrices && <span className="text-yellow-600">(partial)</span>}
                  </p>
                  <p className="text-sm text-green-400">In: ${usdInTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-sm text-red-400">Out: ${usdOutTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  {hasMissingPrices && (
                    <p className="text-xs text-yellow-600 mt-0.5 max-w-40">
                      Some transactions have no price data — use Refresh Prices to retry
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Member table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              {loadingMembers ? (
                <p className="text-gray-500 text-sm p-4">Loading…</p>
              ) : members.length === 0 ? (
                <p className="text-gray-500 text-sm p-4">No transactions in this group</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-xs text-gray-500">
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-4 py-2">Category</th>
                        <th className="text-left px-4 py-2">Summary</th>
                        <th className="text-right px-4 py-2">USD Value</th>
                        <th className="px-2 py-2"></th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(m => {
                        const tx = memberToTx(m);
                        const isExpanded = expandedSig === m.signature;
                        return (
                          <Fragment key={m.signature}>
                            <tr
                              className={`border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer ${m.err ? 'opacity-50' : ''}`}
                              onClick={() => setExpandedSig(isExpanded ? null : m.signature)}
                            >
                              <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                                <p>{format(new Date(m.blockTime * 1000), 'MMM d, yyyy')}</p>
                                <p className="text-xs text-gray-600">{format(new Date(m.blockTime * 1000), 'HH:mm:ss')}</p>
                              </td>
                              <td className="px-4 py-3">
                                <CategoryBadge category={m.taxCategory as TaxCategory} />
                                {m.err && <span className="ml-1 text-xs text-red-500">Failed</span>}
                              </td>
                              <td className="px-4 py-3 text-gray-300 max-w-xs truncate text-xs font-mono">
                                {summarizeTx(tx, tokenMetas, activeAddress, true)}
                              </td>
                              <td className="px-4 py-3 text-right text-xs font-mono">
                                <UsdValueCell
                                  usdInflow={m.usdInflow ?? null}
                                  usdOutflow={m.usdOutflow ?? null}
                                  taxCategory={m.taxCategory}
                                />
                              </td>
                              <td className="px-2 py-3 text-right">
                                <ChevronDown
                                  size={14}
                                  className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                />
                              </td>
                              <td className="px-2 py-3 text-right" onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={() => handleRemoveMember(m.signature)}
                                  className="text-gray-600 hover:text-red-400 transition-colors"
                                  title="Remove from group"
                                >
                                  <X size={14} />
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} className="p-0">
                                  <TxDetail
                                    tx={tx}
                                    tokenMetas={tokenMetas}
                                    walletAddress={activeAddress}
                                    walletOnly={true}
                                  />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
    </div>
  );
}
