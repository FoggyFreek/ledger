import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useWalletTransactions } from '../hooks/useWalletTransactions';
import { useStaking } from '../hooks/useStaking';
import { Toast } from '../components/shared/Toast';
import { TransactionsView } from '../components/transactions/TransactionsView';
import { useToast } from '../hooks/useToast';
import { prefetchTokenMeta, getCachedTokenInfo } from '../lib/helius';
import type { TokenMeta } from '../lib/helius';
import { isSolMint, stakingRewardsToTransactions } from '../lib/taxCategorizer';
import { clearStakingData, loadGroupMemberships } from '../lib/storage';
import { BITVAVO_TOKEN_META } from '../lib/bitvavoParser';
import type { GroupMemberships } from '../types/groups';

export function TransactionsPage() {
  const { wallets, activeAddress, settings } = useApp();
  const wallet = wallets.find(w => w.address === activeAddress);
  const isBitvavo = wallet?.type === 'bitvavo';

  const hook = useWalletTransactions(activeAddress, wallet?.type);
  const { transactions, loadFromStorage, resetAndReload } = hook;

  const { stakingRewards, refresh: refreshStaking } = useStaking(isBitvavo ? null : activeAddress);
  const { toast, showToast, dismissToast } = useToast();

  const [tokenMetas, setTokenMetas] = useState<Map<string, TokenMeta>>(new Map());
  const [memberships, setMemberships] = useState<GroupMemberships>({});

  const refreshMemberships = (addr: string) => {
    loadGroupMemberships(addr).then(m => m && setMemberships(m));
  };

  useEffect(() => {
    loadFromStorage();
    if (activeAddress) refreshMemberships(activeAddress);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress]);

  // Solana token meta prefetch
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

  // Bitvavo token meta from static data
  useEffect(() => {
    if (!isBitvavo || transactions.length === 0) return;
    const map = new Map<string, TokenMeta>();
    const symbols = new Set(transactions.flatMap(tx => tx.balanceChanges.map(bc => bc.mint)));
    for (const symbol of symbols) {
      const meta = BITVAVO_TOKEN_META[symbol];
      map.set(symbol, { symbol, name: meta?.name ?? symbol, logoUri: null });
    }
    setTokenMetas(map);
  }, [transactions, isBitvavo]);

  // Merge staking rewards
  const rewardTxns = useMemo(() => isBitvavo ? [] : stakingRewardsToTransactions(stakingRewards), [stakingRewards, isBitvavo]);
  const allTxns = useMemo(() => {
    const merged = [...transactions, ...rewardTxns];
    merged.sort((a, b) => b.blockTime - a.blockTime);
    return merged;
  }, [transactions, rewardTxns]);

  if (!activeAddress) {
    return <div className="text-gray-500 text-center py-20">Select a wallet first</div>;
  }

  if (!isBitvavo && !settings.helius) {
    return <div className="text-gray-500 text-center py-20">Set HELIUS_API_KEY in .env to get started</div>;
  }

  const handleReset = () => {
    if (confirm(`Clear all cached transactions${isBitvavo ? '' : ' and staking data'}, then reload from scratch?`)) {
      if (!isBitvavo && activeAddress) clearStakingData(activeAddress);
      resetAndReload();
      if (!isBitvavo) refreshStaking(true);
    }
  };

  const handleGroupSaved = (groupName: string, count: number) => {
    showToast(`${count} transaction${count !== 1 ? 's' : ''} added to "${groupName}"`, 'success');
    refreshMemberships(activeAddress);
  };

  return (
    <div className="space-y-4">
      <TransactionsView
        key={activeAddress}
        transactions={transactions}
        allTxns={allTxns}
        rewardTxnCount={rewardTxns.length}
        tokenMetas={tokenMetas}
        memberships={memberships}
        hook={hook}
        activeAddress={activeAddress}
        walletType={wallet?.type ?? 'solana'}
        onReset={handleReset}
        onGroupSaved={handleGroupSaved}
      />

      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
    </div>
  );
}
