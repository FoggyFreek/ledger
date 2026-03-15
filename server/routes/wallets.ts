import { Hono } from 'hono';
import sql from '../db.js';

const app = new Hono();

app.get('/wallets', async (c) => {
  const rows = await sql`SELECT address, label, wallet_type, added_at, last_refreshed FROM wallets ORDER BY added_at`;
  return c.json(rows.map(r => ({
    address: r.address,
    label: r.label,
    type: r.wallet_type ?? 'solana',
    addedAt: Number(r.added_at),
    lastRefreshed: r.last_refreshed != null ? Number(r.last_refreshed) : null,
  })));
});

// Full sync — replaces the entire wallets list
app.put('/wallets', async (c) => {
  const { wallets } = await c.req.json<{ wallets: Array<{ address: string; label: string; type?: string; addedAt: number; lastRefreshed: number | null }> }>();

  const deleteQuery = wallets.length > 0
    ? sql`DELETE FROM wallets WHERE address != ALL(${sql.array(wallets.map(w => w.address))})`
    : sql`DELETE FROM wallets`;
  const upsertQueries = wallets.map(w => sql`
    INSERT INTO wallets (address, label, wallet_type, added_at, last_refreshed)
    VALUES (${w.address}, ${w.label}, ${w.type ?? 'solana'}, ${w.addedAt}, ${w.lastRefreshed ?? null})
    ON CONFLICT (address) DO UPDATE SET label = EXCLUDED.label, wallet_type = EXCLUDED.wallet_type, last_refreshed = EXCLUDED.last_refreshed
  `);

  await sql.begin(() => [deleteQuery, ...upsertQueries]);

  return c.json({ ok: true });
});

export default app;
