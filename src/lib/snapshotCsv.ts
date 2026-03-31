import type { WalletSnapshot } from '../types/wallet';

type TokenMeta = { symbol: string; name: string };

export function buildSnapshotCsvRows(
  snapshot: WalletSnapshot,
  resolveTokenMeta: (t: { mint: string; symbol: string; name: string; logoUri: string | null }) => TokenMeta,
): Record<string, string | number>[] {
  const { solPrice, solPriceEur, solBalance } = snapshot.holdings;
  const rows: Record<string, string | number>[] = [
    {
      type: 'SOL',
      symbol: 'SOL',
      name: 'Solana',
      amount: solBalance,
      usdValue: solPrice != null ? (solBalance * solPrice).toFixed(2) : '',
      eurValue: solPriceEur != null ? (solBalance * solPriceEur).toFixed(2) : '',
      mint: 'native',
    },
    ...snapshot.holdings.tokens.map(t => {
      const meta = resolveTokenMeta(t);
      return {
        type: 'SPL',
        symbol: meta.symbol,
        name: meta.name,
        amount: t.uiAmount,
        usdValue: t.usdValue ?? '',
        eurValue: t.eurValue ?? '',
        mint: t.mint,
      };
    }),
  ];

  if (snapshot.stakingInfo) {
    rows.push({
      type: 'STAKED',
      symbol: 'SOL',
      name: 'Total staked',
      amount: snapshot.stakingInfo.totalStakedSol,
      usdValue: solPrice != null ? (snapshot.stakingInfo.totalStakedSol * solPrice).toFixed(2) : '',
      eurValue: solPriceEur != null ? (snapshot.stakingInfo.totalStakedSol * solPriceEur).toFixed(2) : '',
      mint: '',
    });
    rows.push({
      type: 'STAKING_REWARDS',
      symbol: 'SOL',
      name: `Cumulative rewards (${snapshot.stakingInfo.rewardCount})`,
      amount: snapshot.stakingInfo.totalRewardsEarnedSol,
      usdValue: solPrice != null ? (snapshot.stakingInfo.totalRewardsEarnedSol * solPrice).toFixed(2) : '',
      eurValue: solPriceEur != null ? (snapshot.stakingInfo.totalRewardsEarnedSol * solPriceEur).toFixed(2) : '',
      mint: '',
    });
  }

  return rows;
}
