import { Hono } from 'hono';
import sql from '../db.js';

const app = new Hono();

app.get('/wallets', async (c) => {
  const rows = await sql`SELECT address, label, added_at, last_refreshed FROM wallets ORDER BY added_at`;
  return c.json(rows.map(r => ({
    address: r.address,
    label: r.label,
    addedAt: Number(r.added_at),
    lastRefreshed: r.last_refreshed != null ? Number(r.last_refreshed) : null,
  })));
});

// Full sync — replaces the entire wallets list
app.put('/wallets', async (c) => {
  const { wallets } = await c.req.json<{ wallets: Array<{ address: string; label: string; addedAt: number; lastRefreshed: number | null }> }>();

  await sql.begin(async (tx) => {
    if (wallets.length > 0) {
      const addresses = wallets.map(w => w.address);
      await tx`DELETE FROM wallets WHERE address != ALL(${tx.array(addresses)})`;
    } else {
      await tx`DELETE FROM wallets`;
    }
    for (const w of wallets) {
      await tx`
        INSERT INTO wallets (address, label, added_at, last_refreshed)
        VALUES (${w.address}, ${w.label}, ${w.addedAt}, ${w.lastRefreshed ?? null})
        ON CONFLICT (address) DO UPDATE SET label = EXCLUDED.label, last_refreshed = EXCLUDED.last_refreshed
      `;
    }
  });

  return c.json({ ok: true });
});

export default app;
