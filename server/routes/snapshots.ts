import { Hono } from 'hono';
import sql from '../db.js';

const app = new Hono();

// --- Legacy endpoints (global) ---

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

// --- Wallet-scoped endpoints ---

// Get all snapshots for a single wallet
app.get('/wallets/:addr/snapshots', async (c) => {
  const addr = c.req.param('addr');
  const [row] = await sql`SELECT data FROM snapshots_cache WHERE wallet_address = ${addr}`;
  return c.json(row ? row.data : []);
});

// Add a single snapshot to a wallet
app.post('/wallets/:addr/snapshots', async (c) => {
  const addr = c.req.param('addr');
  const snapshot = await c.req.json();
  await sql`
    INSERT INTO snapshots_cache (wallet_address, data)
    VALUES (${addr}, ${sql.json([snapshot])})
    ON CONFLICT (wallet_address) DO UPDATE
    SET data = snapshots_cache.data || ${sql.json([snapshot])}::jsonb
  `;
  return c.json(snapshot, 201);
});

// Update a single snapshot by id
app.put('/wallets/:addr/snapshots/:id', async (c) => {
  const addr = c.req.param('addr');
  const id = c.req.param('id');
  const updated = await c.req.json();
  const [row] = await sql`SELECT data FROM snapshots_cache WHERE wallet_address = ${addr}`;
  if (!row) return c.json({ error: 'not found' }, 404);
  const arr = (row.data as any[]).map((s: any) => s.id === id ? updated : s);
  await sql`UPDATE snapshots_cache SET data = ${sql.json(arr)} WHERE wallet_address = ${addr}`;
  return c.json(updated);
});

// Delete a single snapshot by id
app.delete('/wallets/:addr/snapshots/:id', async (c) => {
  const addr = c.req.param('addr');
  const id = c.req.param('id');
  const [row] = await sql`SELECT data FROM snapshots_cache WHERE wallet_address = ${addr}`;
  if (!row) return c.json({ ok: true });
  const arr = (row.data as any[]).filter((s: any) => s.id !== id);
  if (arr.length === 0) {
    await sql`DELETE FROM snapshots_cache WHERE wallet_address = ${addr}`;
  } else {
    await sql`UPDATE snapshots_cache SET data = ${sql.json(arr)} WHERE wallet_address = ${addr}`;
  }
  return c.json({ ok: true });
});

export default app;
