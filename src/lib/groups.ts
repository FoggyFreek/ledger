import { fetchHistoricalPrices } from './prices';
import { isSolMint } from './taxCategorizer';
import type { ParsedTransaction } from '../types/transaction';
import type { GroupMemberInput } from '../types/groups';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export async function computeUsdValues(transactions: ParsedTransaction[]): Promise<GroupMemberInput[]> {
  // Group transactions by blockTime to batch price fetches
  const byTimestamp = new Map<number, ParsedTransaction[]>();
  for (const tx of transactions) {
    const list = byTimestamp.get(tx.blockTime) ?? [];
    list.push(tx);
    byTimestamp.set(tx.blockTime, list);
  }

  // Fetch prices for each unique timestamp
  const pricesByTimestamp = new Map<number, Map<string, number>>();
  await Promise.all(
    [...byTimestamp.keys()].map(async (ts) => {
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
