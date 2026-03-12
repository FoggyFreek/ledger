import { Hono } from 'hono';
import sql from '../db.js';

const app = new Hono();

// Returns all snapshots across all wallets combined
app.get('/snapshots', async (c) => {
  const rows = await sql`SELECT data FROM snapshots_cache`;
  const all = rows.flatMap(r => r.data as unknown[]);
  return c.json(all);
});

// Replaces all snapshots — groups by walletAddress and upserts per wallet
app.put('/snapshots', async (c) => {
  const snapshots = await c.req.json<Array<{ walletAddress: string }>>();

  const byWallet = new Map<string, typeof snapshots>();
  for (const s of snapshots) {
    const existing = byWallet.get(s.walletAddress) ?? [];
    existing.push(s);
    byWallet.set(s.walletAddress, existing);
  }

  for (const [addr, walletSnapshots] of byWallet) {
    await sql`
      INSERT INTO snapshots_cache (wallet_address, data)
      VALUES (${addr}, ${sql.json(walletSnapshots)})
      ON CONFLICT (wallet_address) DO UPDATE SET data = EXCLUDED.data
    `;
  }

  // Clear wallets that no longer have any snapshots
  if (byWallet.size > 0) {
    const addresses = [...byWallet.keys()];
    await sql`
      UPDATE snapshots_cache SET data = '[]'
      WHERE wallet_address != ALL(${sql.array(addresses)})
    `;
  }

  return c.json({ ok: true });
});

export default app;
