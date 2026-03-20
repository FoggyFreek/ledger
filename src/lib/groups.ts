import { fetchHistoricalPrices } from './prices';
import { isSolMint, interpretTransaction } from './taxCategorizer';
import type { ParsedTransaction, TaxCategory } from '../types/transaction';
import type { GroupMember, GroupMemberInput } from '../types/groups';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export async function computeUsdValues(transactions: ParsedTransaction[]): Promise<GroupMemberInput[]> {
  // Group transactions by blockTime to batch price fetches
  const byTimestamp = new Map<number, ParsedTransaction[]>();
  for (const tx of transactions) {
    const list = byTimestamp.get(tx.blockTime) ?? [];
    list.push(tx);
    byTimestamp.set(tx.blockTime, list);
  }

  // Fetch prices for each unique timestamp, max 5 concurrent to avoid hammering DeFiLlama
  const pricesByTimestamp = new Map<number, Map<string, number>>();
  const timestamps = [...byTimestamp.keys()];
  const CONCURRENCY = 5;
  for (let i = 0; i < timestamps.length; i += CONCURRENCY) {
    await Promise.all(
      timestamps.slice(i, i + CONCURRENCY).map(async (ts) => {
        const txsAtTs = byTimestamp.get(ts)!;
        const mints = [...new Set(
          txsAtTs.flatMap(tx =>
            tx.interpretedFlow.netChanges.map(bc =>
              isSolMint(bc.mint) ? SOL_MINT : bc.mint
            )
          )
        )];
        const prices = await fetchHistoricalPrices(mints, ts);
        pricesByTimestamp.set(ts, prices);
      })
    );
  }

  return transactions.map(tx => {
    const prices = pricesByTimestamp.get(tx.blockTime) ?? new Map<string, number>();
    let usdInflow = 0;
    let usdOutflow = 0;
    let anyPrice = false;

    for (const bc of tx.interpretedFlow.netChanges) {
      const lookupMint = isSolMint(bc.mint) ? SOL_MINT : bc.mint;
      const price = prices.get(lookupMint);
      if (price == null) continue;
      anyPrice = true;
      const usd = bc.amount * price;
      if (usd > 0) usdInflow += usd;
      else usdOutflow += Math.abs(usd);
    }

    return {
      signature: tx.signature,
      usdInflow: anyPrice ? usdInflow : null,
      usdOutflow: anyPrice ? usdOutflow : null,
      priceFetched: anyPrice,
    };
  });
}

export function groupMemberToTransaction(member: GroupMember): ParsedTransaction {
  return {
    signature: member.signature,
    blockTime: member.blockTime,
    slot: member.slot,
    fee: member.fee,
    taxCategory: member.taxCategory as TaxCategory,
    heliusType: null,
    description: null,
    balanceChanges: member.balanceChanges,
    err: member.err,
    counterparty: member.counterparty,
    interpretedFlow: interpretTransaction(member.balanceChanges),
  };
}
