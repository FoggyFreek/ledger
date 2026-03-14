const SOL_MINT = 'So11111111111111111111111111111111111111112';
const BATCH_SIZE = 25;

// DeFiLlama public API has an undocumented rate limit. Without a delay between
// sequential batch requests we reliably hit 429s when fetching prices for many
// mints. 200 ms gives ~5 req/s which stays well under the observed threshold.
// DO NOT remove this delay or collapse the batched loop into Promise.all.
const DEFI_LLAMA_INTER_BATCH_DELAY_MS = 200;

/**
 * Fetch historical USD prices for Solana tokens at a given unix timestamp.
 * Uses the DeFiLlama public API (no key required).
 *
 * Returns a Map of mint → USD price. Mints without price data are omitted.
 */
export async function fetchHistoricalPrices(
  mints: string[],
  unixTimestamp: number
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (mints.length === 0) return prices;

  // Deduplicate
  const unique = [...new Set(mints)];

  // Batched sequentially (not Promise.all) to respect DeFiLlama rate limits.
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise(r => setTimeout(r, DEFI_LLAMA_INTER_BATCH_DELAY_MS));
    const batch = unique.slice(i, i + BATCH_SIZE);
    const coins = batch.map(m => `solana:${m}`).join(',');
    const url = `https://coins.llama.fi/prices/historical/${unixTimestamp}/${coins}`;

    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json() as { coins: Record<string, { price: number }> };
      for (const [key, val] of Object.entries(data.coins)) {
        const mint = key.replace('solana:', '');
        if (val.price != null) {
          prices.set(mint, val.price);
        }
      }
    } catch {
      // Skip failed batches — partial results are fine
    }
  }

  return prices;
}

/**
 * Fetch the historical USD price for SOL at a given unix timestamp.
 * Convenience wrapper around fetchHistoricalPrices.
 */
export async function fetchHistoricalSolPrice(unixTimestamp: number): Promise<number | null> {
  const prices = await fetchHistoricalPrices([SOL_MINT], unixTimestamp);
  return prices.get(SOL_MINT) ?? null;
}
