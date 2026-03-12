import { Hono } from 'hono';
import sql from '../db.js';

const app = new Hono();

app.get('/settings', async (c) => {
  const [row] = await sql`SELECT api_key, rpc_url FROM settings LIMIT 1`;
  if (!row) return c.json({ apiKey: '', rpcUrl: '' });
  return c.json({ apiKey: row.api_key, rpcUrl: row.rpc_url });
});

app.put('/settings', async (c) => {
  const { apiKey, rpcUrl } = await c.req.json<{ apiKey: string; rpcUrl: string }>();
  await sql`
    INSERT INTO settings (id, api_key, rpc_url)
    VALUES (TRUE, ${apiKey}, ${rpcUrl})
    ON CONFLICT (id) DO UPDATE SET api_key = EXCLUDED.api_key, rpc_url = EXCLUDED.rpc_url
  `;
  return c.json({ ok: true });
});

export default app;
