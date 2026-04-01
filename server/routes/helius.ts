import { Hono } from 'hono';
import { writeLog } from '../lib/logger.js';

const app = new Hono();

function getApiKey(): string {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('HELIUS_API_KEY is not set in environment variables.');
  return key;
}

// Proxy JSON-RPC requests (RPC + DAS API)
app.post('/helius/rpc', async (c) => {
  const apiKey = getApiKey();
  const body = await c.req.text();
  const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  setImmediate(() => writeLog({
    timestamp: new Date().toISOString(),
    level: res.ok ? 'INFO' : res.status >= 500 ? 'ERROR' : 'WARN',
    type: 'external',
    target: 'helius',
    method: 'POST',
    path: '/rpc',
    status_code: res.status,
    duration_ms: Date.now() - start,
  }));
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
  });
});

// Proxy Enhanced Transaction API
app.post('/helius/enhanced-transactions', async (c) => {
  const apiKey = getApiKey();
  const { address, params } = await c.req.json<{ address: string; params: Record<string, string> }>();
  const qs = new URLSearchParams(params);
  const url = `https://api-mainnet.helius-rpc.com/v0/addresses/${encodeURIComponent(address)}/transactions?api-key=${apiKey}&${qs}`;
  const start = Date.now();
  const res = await fetch(url);
  setImmediate(() => writeLog({
    timestamp: new Date().toISOString(),
    level: res.ok ? 'INFO' : res.status >= 500 ? 'ERROR' : 'WARN',
    type: 'external',
    target: 'helius',
    method: 'GET',
    path: `/v0/addresses/${address.slice(0, 8)}…/transactions`,
    status_code: res.status,
    duration_ms: Date.now() - start,
  }));
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
  });
});

export default app;
