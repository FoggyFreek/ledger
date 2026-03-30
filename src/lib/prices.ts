const SOL_MINT = 'So11111111111111111111111111111111111111112';
const BATCH_SIZE = 25;

// Maps Bitvavo ticker symbols to CoinGecko IDs for DeFiLlama price lookups
export const BITVAVO_COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  EUR: 'euro-coin',
  LINK: 'chainlink',
  ETH: 'ethereum',
  JUP: 'jupiter-exchange-solana',
  SOL: 'solana',
  FARTCOIN: 'fartcoin',
  SUI: 'sui',
  HYPE: 'hyperliquid',
  WAL: 'walrus-2',
  TIA: 'celestia',
};

/**
 * Fetch token logo URIs for Bitvavo symbols from CoinGecko.
 * Uses the /coins/markets batch endpoint (single request for all coins) to
 * avoid hitting the CoinGecko free-tier rate limit with per-coin /coins/{id}
 * calls. Returns a Map of symbol → logo URL. Unknown symbols are omitted.
 */
export async function fetchBitvavoLogoUris(
  symbols: string[]
): Promise<Map<string, string>> {
  const logos = new Map<string, string>();
  const symbolsWithId = symbols.filter(s => BITVAVO_COINGECKO_IDS[s]);
  if (symbolsWithId.length === 0) return logos;

  const ids = symbolsWithId.map(s => BITVAVO_COINGECKO_IDS[s]).join(',');

  try {
    const res = await fetch('/api/v1/coingecko/coins-markets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, vsCurrency: 'usd' }),
    });
    if (!res.ok) return logos;
    const data = await res.json() as Array<{ id: string; image: string }>;
    const idToSymbol = new Map(symbolsWithId.map(s => [BITVAVO_COINGECKO_IDS[s], s]));
    for (const coin of data) {
      const sym = idToSymbol.get(coin.id);
      if (sym && coin.image) logos.set(sym, coin.image);
    }
  } catch {
    // Return partial/empty results on failure
  }

  return logos;
}

/**
 * Fetch current USD prices for Bitvavo ticker symbols via DeFiLlama CoinGecko
 * price feed. Returns a Map of symbol → USD price. Unknown symbols are omitted.
 */
export async function fetchCurrentPricesForSymbols(
  symbols: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const symbolsWithId = symbols.filter(s => BITVAVO_COINGECKO_IDS[s]);
  if (symbolsWithId.length === 0) return prices;

  const coins = symbolsWithId.map(s => `coingecko:${BITVAVO_COINGECKO_IDS[s]}`).join(',');
  const url = `https://coins.llama.fi/prices/current/${coins}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return prices;
    const data = await res.json() as { coins: Record<string, { price: number }> };
    for (const sym of symbolsWithId) {
      const key = `coingecko:${BITVAVO_COINGECKO_IDS[sym]}`;
      const entry = data.coins[key];
      if (entry?.price != null) prices.set(sym, entry.price);
    }
  } catch {
    // Return partial/empty results on failure
  }

  return prices;
}

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

/**
 * Pick the data point closest to `targetMs` from a CoinGecko prices array.
 * Each element is [timestamp_ms, price].
 */
function pickClosestPrice(dataPoints: [number, number][], targetMs: number): number | null {
  if (dataPoints.length === 0) return null;
  let best = dataPoints[0];
  let bestDiff = Math.abs(dataPoints[0][0] - targetMs);
  for (const point of dataPoints) {
    const diff = Math.abs(point[0] - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = point;
    }
  }
  return best[1];
}

async function fetchCoinGeckoRange(
  coinId: string,
  vsCurrency: 'usd' | 'eur',
  from: number,
  to: number
): Promise<{ prices: [number, number][] }> {
  const res = await fetch('/api/v1/coingecko/market-chart-range', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ coinId, vsCurrency, from, to }),
  });
  if (!res.ok) throw new Error(`CoinGecko proxy error: ${res.status}`);
  return res.json() as Promise<{ prices: [number, number][] }>;
}

async function fetchCoinGeckoContractRange(
  platform: string,
  contractAddress: string,
  vsCurrency: 'usd' | 'eur',
  from: number,
  to: number
): Promise<{ prices: [number, number][] }> {
  const res = await fetch('/api/v1/coingecko/contract-market-chart-range', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, contractAddress, vsCurrency, from, to }),
  });
  if (!res.ok) throw new Error(`CoinGecko contract proxy error: ${res.status}`);
  return res.json() as Promise<{ prices: [number, number][] }>;
}

/**
 * Fetch historical EUR prices for Solana tokens at a given unix timestamp
 * directly from CoinGecko. SOL uses the "solana" coin ID; SPL tokens use the
 * contract address lookup on the "solana" platform.
 *
 * Returns a Map of mint → EUR price. Mints without data are omitted.
 */
export async function fetchHistoricalPricesEur(
  mints: string[],
  targetTs: number
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (mints.length === 0) return prices;

  const from = targetTs - 1800;
  const to = targetTs + 1800;
  const targetMs = targetTs * 1000;

  for (const mint of [...new Set(mints)]) {
    try {
      const data = mint === SOL_MINT
        ? await fetchCoinGeckoRange('solana', 'eur', from, to)
        : await fetchCoinGeckoContractRange('solana', mint, 'eur', from, to);
      const price = pickClosestPrice(data.prices, targetMs);
      if (price != null) prices.set(mint, price);
    } catch {
      // Skip — CoinGecko may not recognise every SPL mint
    }
  }

  return prices;
}

/**
 * Fetch historical USD and EUR prices for ticker symbols at a given unix timestamp
 * via the backend CoinGecko proxy (which handles CORS and rate limiting).
 *
 * Uses a ±30-minute window around `targetTs` and picks the data point closest
 * to the target time. Coin IDs are resolved via BITVAVO_COINGECKO_IDS.
 *
 * Returns a Map of symbol → { usd, eur }. Symbols without a known coin ID or
 * with no data in the window are omitted.
 */
export async function fetchCoinGeckoHistoricalPricesForSymbols(
  symbols: string[],
  targetTs: number
): Promise<Map<string, { usd: number; eur: number }>> {
  const prices = new Map<string, { usd: number; eur: number }>();
  const symbolsWithId = symbols.filter(s => BITVAVO_COINGECKO_IDS[s]);
  if (symbolsWithId.length === 0) return prices;

  const from = targetTs - 1800; // 30 min before
  const to = targetTs + 1800;   // 30 min after
  const targetMs = targetTs * 1000;

  for (const sym of symbolsWithId) {
    const id = BITVAVO_COINGECKO_IDS[sym];
    try {
      // Backend queue serialises these; fire both currencies in parallel per coin.
      const [usdData, eurData] = await Promise.all([
        fetchCoinGeckoRange(id, 'usd', from, to),
        fetchCoinGeckoRange(id, 'eur', from, to),
      ]);
      const usd = pickClosestPrice(usdData.prices, targetMs);
      const eur = pickClosestPrice(eurData.prices, targetMs);
      if (usd != null && eur != null) {
        prices.set(sym, { usd, eur });
      }
    } catch {
      // Skip on error
    }
  }

  return prices;
}
