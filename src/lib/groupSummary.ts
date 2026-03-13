import { interpretTransaction } from './taxCategorizer';
import type { BalanceChange } from '../types/transaction';
import type { GroupMember } from '../types/groups';

export interface TokenTotals {
  mint: string;
  inTotal: number;
  outTotal: number;
  netTotal: number;
}

export function aggregateBalances(members: GroupMember[]): TokenTotals[] {
  const inMap = new Map<string, number>();
  const outMap = new Map<string, number>();
  for (const m of members) {
    const { netChanges } = interpretTransaction(m.balanceChanges as BalanceChange[]);
    for (const bc of netChanges) {
      if (bc.amount > 0) {
        inMap.set(bc.mint, (inMap.get(bc.mint) ?? 0) + bc.amount);
      } else if (bc.amount < 0) {
        outMap.set(bc.mint, (outMap.get(bc.mint) ?? 0) + bc.amount);
      }
    }
  }
  const mints = new Set([...inMap.keys(), ...outMap.keys()]);
  return [...mints]
    .map(mint => ({
      mint,
      inTotal: inMap.get(mint) ?? 0,
      outTotal: outMap.get(mint) ?? 0,
      netTotal: (inMap.get(mint) ?? 0) + (outMap.get(mint) ?? 0),
    }))
    .sort((a, b) => Math.abs(b.inTotal - b.outTotal) - Math.abs(a.inTotal - a.outTotal));
}
