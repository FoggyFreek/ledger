import { Hono } from 'hono';
import { writeLog } from '../lib/logger.js';

const app = new Hono();

// CoinGecko free-tier: ~30 req/min. Serialise all requests through a promise
// chain with a 2-second minimum interval to stay well below the limit.
const MIN_INTERVAL_MS = 2000;
let queue = Promise.resolve();
let lastCallAt = 0;

function enqueue(fn: () => Promise<Response>): Promise<Response> {
  const slot = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  // Detach errors so a failed request doesn't stall the queue for next callers
  queue = slot.then(() => undefined, () => undefined);
  return slot;
}

async function enqueueLogged(url: string, headers: Record<string, string>): Promise<Response> {
  const start = Date.now();
  const res = await enqueue(() => fetch(url, { headers }));
  setImmediate(() => writeLog({
    timestamp: new Date().toISOString(),
    level: res.ok ? 'INFO' : res.status >= 500 ? 'ERROR' : 'WARN',
    type: 'external',
    target: 'coingecko',
    method: 'GET',
    path: new URL(url).pathname,
    status_code: res.status,
    duration_ms: Date.now() - start,
  }));
  return res;
}

// Proxy CoinGecko /coins/markets batch requests.
// POST body: { ids: string; vsCurrency?: string }
app.post('/coingecko/coins-markets', async (c) => {
  const { ids, vsCurrency = 'usd' } = await c.req.json<{ ids: string; vsCurrency?: string }>();

  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${encodeURIComponent(vsCurrency)}&ids=${encodeURIComponent(ids)}&per_page=250`;
  const apiKey = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

  let upstream: Response;
  try {
    upstream = await enqueueLogged(url, headers);
  } catch {
    return c.json({ error: 'CoinGecko request failed' }, 500);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
  });
});

// Proxy CoinGecko market_chart/range requests to avoid CORS and enforce rate limits.
// POST body: { coinId: string; vsCurrency: 'usd' | 'eur'; from: number; to: number }
app.post('/coingecko/market-chart-range', async (c) => {
  const { coinId, vsCurrency, from, to } = await c.req.json<{
    coinId: string;
    vsCurrency: 'usd' | 'eur';
    from: number;
    to: number;
  }>();

  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart/range?vs_currency=${vsCurrency}&from=${from}&to=${to}`;
  const apiKey = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

  let upstream: Response;
  try {
    upstream = await enqueueLogged(url, headers);
  } catch {
    return c.json({ error: 'CoinGecko request failed' }, 500);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
  });
});

// Proxy CoinGecko contract-based market_chart/range.
// Fetches historical prices for a token by its on-chain contract address.
// POST body: { platform: string; contractAddress: string; vsCurrency: 'usd' | 'eur'; from: number; to: number }
app.post('/coingecko/contract-market-chart-range', async (c) => {
  const { platform, contractAddress, vsCurrency, from, to } = await c.req.json<{
    platform: string;
    contractAddress: string;
    vsCurrency: 'usd' | 'eur';
    from: number;
    to: number;
  }>();

  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(platform)}/contract/${encodeURIComponent(contractAddress)}/market_chart/range?vs_currency=${vsCurrency}&from=${from}&to=${to}`;
  const apiKey = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = apiKey ? { 'x-cg-demo-api-key': apiKey } : {};

  let upstream: Response;
  try {
    upstream = await enqueueLogged(url, headers);
  } catch {
    return c.json({ error: 'CoinGecko request failed' }, 500);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
  });
});

export default app;
