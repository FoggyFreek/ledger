import { Hono } from 'hono';
import sql from '../db.js';

const app = new Hono();

async function getApiKey(): Promise<string> {
  const [row] = await sql`SELECT api_key FROM settings LIMIT 1`;
  if (!row?.api_key) throw new Error('Helius API key not configured');
  return row.api_key;
}

// Proxy JSON-RPC requests (RPC + DAS API)
app.post('/helius/rpc', async (c) => {
  const apiKey = await getApiKey();
  const body = await c.req.text();
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
  });
});

// Proxy Enhanced Transaction API
app.post('/helius/enhanced-transactions', async (c) => {
  const apiKey = await getApiKey();
  const { address, params } = await c.req.json<{ address: string; params: Record<string, string> }>();
  const qs = new URLSearchParams(params);
  const url = `https://api-mainnet.helius-rpc.com/v0/addresses/${encodeURIComponent(address)}/transactions?api-key=${apiKey}&${qs}`;
  const res = await fetch(url);
  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
  });
});

export default app;
