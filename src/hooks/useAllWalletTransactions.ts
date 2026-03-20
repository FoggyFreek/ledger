import { useState, useEffect } from 'react';
import type { WalletEntry } from '../types/wallet';
import type { ParsedTransaction } from '../types/transaction';
import { loadTransactions, loadStakingRewards } from '../lib/storage';
import { stakingRewardsToTransactions } from '../lib/taxCategorizer';
import { isBitvavoWallet } from '../lib/walletType';

export function useAllWalletTransactions(wallets: WalletEntry[]) {
  const [transactions, setTransactions] = useState<Record<string, ParsedTransaction[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wallets.length === 0) return;
    setLoading(true);
    Promise.all(
      wallets.map(async w => {
        const stored = await loadTransactions(w.address).catch(() => ({ data: [] as ParsedTransaction[] }));
        let txns = stored.data;
        if (!isBitvavoWallet(w.address)) {
          const rewards = await loadStakingRewards(w.address).catch(() => null);
          if (rewards?.data?.length) {
            txns = [...txns, ...stakingRewardsToTransactions(rewards.data)];
          }
        }
        return { address: w.address, txns };
      })
    ).then(results => {
      const map: Record<string, ParsedTransaction[]> = {};
      for (const { address, txns } of results) map[address] = txns;
      setTransactions(map);
      setLoading(false);
    });
  }, [wallets]);

  return { transactions, loading };
}
