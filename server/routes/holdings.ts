import { Hono } from 'hono';
import sql from '../db.js';

const app = new Hono();

app.get('/wallets/:addr/holdings', async (c) => {
  const addr = c.req.param('addr');
  const [row] = await sql`SELECT data FROM holdings_cache WHERE wallet_address = ${addr}`;
  if (!row) return c.json(null);
  return c.json(row.data);
});

app.put('/wallets/:addr/holdings', async (c) => {
  const addr = c.req.param('addr');
  const data = await c.req.json();
  const fetchedAt = data.fetchedAt ?? Date.now();
  await sql`
    INSERT INTO holdings_cache (wallet_address, data, fetched_at)
    VALUES (${addr}, ${sql.json(data)}, ${fetchedAt})
    ON CONFLICT (wallet_address) DO UPDATE SET data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at
  `;
  return c.json({ ok: true });
});

app.delete('/wallets/:addr/holdings', async (c) => {
  const addr = c.req.param('addr');
  await sql`DELETE FROM holdings_cache WHERE wallet_address = ${addr}`;
  return c.json({ ok: true });
});

export default app;
