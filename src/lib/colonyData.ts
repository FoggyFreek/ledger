import type { HeliusWalletHistoryTx } from '../types/api';
import type { ColonyStaker, ColonyBuyer } from '../types/colony';
import { getWalletHistory, rpc } from './helius';

export const COLONY_STAR_STAKE_ACCOUNT = 'Batdt9erjaDDn8AL3eNxTCYA9CokioNbAdL6kXSzwt5u';
export const COLONY_TREASURY = 'ELizoZA1ThMCMMhSw77qtF9L1yVMnuSgUd3z9u3QuWS4';
export const COLONY_PROGRAM = '2K2374VEqxbFJWycxoj8ub2wBk7KwwnNn7M5V7QsL9r2';
const PLANET_COST_SOL = 0.1;

const PAGE_DELAY_MS = 250;

export async function fetchAllEnhancedTransactions(
  address: string,
  onProgress?: (pageCount: number) => void,
): Promise<HeliusWalletHistoryTx[]> {
  const all: HeliusWalletHistoryTx[] = [];
  let before: string | undefined;
  let page = 0;

  while (true) {
    if (page > 0) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
    const result = await getWalletHistory(address, { before, limit: 100 });
    all.push(...result.data);
    page++;
    onProgress?.(page);

    if (!result.hasMore || result.data.length === 0) break;
    before = result.data[result.data.length - 1].signature;
  }

  return all;
}

export async function fetchStarBalance(): Promise<number> {
  const result = await rpc<{
    value: {
      data: { parsed: { info: { tokenAmount: { uiAmount: number } } } };
    } | null;
  }>('getAccountInfo', [COLONY_STAR_STAKE_ACCOUNT, { encoding: 'jsonParsed' }]);

  if (!result.value) return 0;
  return result.value.data.parsed.info.tokenAmount.uiAmount;
}

export function aggregateStakers(
  txns: HeliusWalletHistoryTx[],
  stakeAccount: string,
): ColonyStaker[] {
  const map = new Map<string, { totalStar: number; txCount: number }>();

  for (const tx of txns) {
    if (!tx.tokenTransfers) continue;
    for (const tt of tx.tokenTransfers) {
      if (tt.toUserAccount !== stakeAccount) continue;
      const amount = tt.tokenAmount;
      if (amount <= 0) continue;
      const from = tt.fromUserAccount;
      if (!from) continue;
      const entry = map.get(from) ?? { totalStar: 0, txCount: 0 };
      entry.totalStar += amount;
      entry.txCount++;
      map.set(from, entry);
    }
  }

  return [...map.entries()]
    .map(([address, v]) => ({ address, ...v }))
    .sort((a, b) => b.totalStar - a.totalStar);
}

export function aggregateBuyers(
  txns: HeliusWalletHistoryTx[],
  treasury: string,
): ColonyBuyer[] {
  const map = new Map<string, { solSpent: number; txCount: number }>();

  for (const tx of txns) {
    if (!tx.nativeTransfers) continue;
    for (const nt of tx.nativeTransfers) {
      if (nt.toUserAccount !== treasury) continue;
      const solAmount = nt.amount / 1e9;
      if (solAmount <= 0) continue;
      const from = nt.fromUserAccount;
      if (!from) continue;
      const entry = map.get(from) ?? { solSpent: 0, txCount: 0 };
      entry.solSpent += solAmount;
      entry.txCount++;
      map.set(from, entry);
    }
  }

  return [...map.entries()]
    .map(([address, v]) => ({
      address,
      solSpent: v.solSpent,
      planetCount: Math.round(v.solSpent / PLANET_COST_SOL),
      txCount: v.txCount,
    }))
    .sort((a, b) => b.planetCount - a.planetCount);
}

export async function fetchNewEnhancedTransactions(
  address: string,
  afterSignature: string,
  onProgress?: (pageCount: number) => void,
): Promise<HeliusWalletHistoryTx[]> {
  const all: HeliusWalletHistoryTx[] = [];
  let page = 0;

  // The `after` param returns txns newer than the given signature.
  // Helius returns newest-first, so we paginate with `before` across the
  // "newer than after" window until we run out of results.
  let before: string | undefined;

  while (true) {
    if (page > 0) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
    const result = await getWalletHistory(address, { before, after: afterSignature, limit: 100 });
    all.push(...result.data);
    page++;
    onProgress?.(page);

    if (!result.hasMore || result.data.length === 0) break;
    before = result.data[result.data.length - 1].signature;
  }

  return all;
}

export function mergeStakers(existing: ColonyStaker[], additions: ColonyStaker[]): ColonyStaker[] {
  const map = new Map<string, { totalStar: number; txCount: number }>();
  for (const s of existing) map.set(s.address, { totalStar: s.totalStar, txCount: s.txCount });
  for (const s of additions) {
    const e = map.get(s.address) ?? { totalStar: 0, txCount: 0 };
    e.totalStar += s.totalStar;
    e.txCount += s.txCount;
    map.set(s.address, e);
  }
  return [...map.entries()]
    .map(([address, v]) => ({ address, ...v }))
    .sort((a, b) => b.totalStar - a.totalStar);
}

export function mergeBuyers(existing: ColonyBuyer[], additions: ColonyBuyer[]): ColonyBuyer[] {
  const map = new Map<string, { solSpent: number; txCount: number }>();
  for (const b of existing) map.set(b.address, { solSpent: b.solSpent, txCount: b.txCount });
  for (const b of additions) {
    const e = map.get(b.address) ?? { solSpent: 0, txCount: 0 };
    e.solSpent += b.solSpent;
    e.txCount += b.txCount;
    map.set(b.address, e);
  }
  return [...map.entries()]
    .map(([address, v]) => ({
      address,
      solSpent: v.solSpent,
      planetCount: Math.round(v.solSpent / PLANET_COST_SOL),
      txCount: v.txCount,
    }))
    .sort((a, b) => b.planetCount - a.planetCount);
}

export function buildMintDistribution(buyers: ColonyBuyer[]): Record<string, number> {
  const buckets: Record<string, number> = {
    '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6-10': 0, '>10': 0,
  };

  for (const b of buyers) {
    const p = b.planetCount;
    if (p <= 0) continue;
    if (p <= 5) buckets[String(p)]++;
    else if (p <= 10) buckets['6-10']++;
    else buckets['>10']++;
  }

  return buckets;
}
