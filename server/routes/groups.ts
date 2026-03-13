import { Hono } from 'hono';
import sql from '../db.js';

const app = new Hono();

// List groups with tx count
app.get('/wallets/:addr/groups', async (c) => {
  const addr = c.req.param('addr');
  const rows = await sql`
    SELECT tg.id, tg.name, tg.created_at,
           COUNT(tgm.signature)::int AS tx_count
    FROM transaction_groups tg
    LEFT JOIN transaction_group_members tgm
      ON tgm.group_id = tg.id AND tgm.wallet_address = ${addr}
    WHERE tg.wallet_address = ${addr}
    GROUP BY tg.id
    ORDER BY tg.created_at DESC
  `;
  return c.json(rows.map(r => ({
    id: r.id as number,
    name: r.name as string,
    createdAt: Number(r.created_at),
    txCount: r.tx_count as number,
  })));
});

// Create group
app.post('/wallets/:addr/groups', async (c) => {
  const addr = c.req.param('addr');
  const { name } = await c.req.json<{ name: string }>();
  const [row] = await sql`
    INSERT INTO transaction_groups (wallet_address, name, created_at)
    VALUES (${addr}, ${name}, ${Date.now()})
    RETURNING id, name, created_at
  `;
  return c.json({ id: row.id as number, name: row.name as string, createdAt: Number(row.created_at) });
});

// Rename group
app.patch('/wallets/:addr/groups/:id', async (c) => {
  const addr = c.req.param('addr');
  const id = parseInt(c.req.param('id'));
  const { name } = await c.req.json<{ name: string }>();
  await sql`
    UPDATE transaction_groups SET name = ${name}
    WHERE id = ${id} AND wallet_address = ${addr}
  `;
  return c.json({ ok: true });
});

// Delete group
app.delete('/wallets/:addr/groups/:id', async (c) => {
  const addr = c.req.param('addr');
  const id = parseInt(c.req.param('id'));
  await sql`DELETE FROM transaction_groups WHERE id = ${id} AND wallet_address = ${addr}`;
  return c.json({ ok: true });
});

// Get group members with full transaction data
app.get('/wallets/:addr/groups/:id/members', async (c) => {
  const addr = c.req.param('addr');
  const id = parseInt(c.req.param('id'));
  const rows = await sql`
    SELECT
      tgm.signature, tgm.usd_inflow, tgm.usd_outflow, tgm.price_fetched, tgm.added_at,
      t.block_time, t.slot, t.fee, t.tax_category, t.balance_changes, t.err, t.counterparty
    FROM transaction_group_members tgm
    JOIN transactions t ON t.wallet_address = tgm.wallet_address AND t.signature = tgm.signature
    WHERE tgm.group_id = ${id} AND tgm.wallet_address = ${addr}
    ORDER BY t.block_time DESC
  `;
  return c.json(rows.map(r => ({
    signature: r.signature as string,
    blockTime: Number(r.block_time),
    slot: Number(r.slot),
    fee: Number(r.fee),
    taxCategory: r.tax_category as string,
    balanceChanges: r.balance_changes as unknown[],
    err: r.err as string | null,
    counterparty: r.counterparty as string | null,
    usdInflow: r.usd_inflow != null ? Number(r.usd_inflow) : null,
    usdOutflow: r.usd_outflow != null ? Number(r.usd_outflow) : null,
    priceFetched: r.price_fetched as boolean,
    addedAt: Number(r.added_at),
  })));
});

// Add transactions to group
app.post('/wallets/:addr/groups/:id/members', async (c) => {
  const addr = c.req.param('addr');
  const id = parseInt(c.req.param('id'));
  const { members } = await c.req.json<{
    members: { signature: string; usdInflow: number | null; usdOutflow: number | null; priceFetched: boolean }[];
  }>();
  if (members.length === 0) return c.json({ ok: true });
  const now = Date.now();
  const rows = members.map(m => ({
    group_id: id,
    wallet_address: addr,
    signature: m.signature,
    usd_inflow: m.usdInflow ?? null,
    usd_outflow: m.usdOutflow ?? null,
    price_fetched: m.priceFetched,
    added_at: now,
  }));
  await sql`INSERT INTO transaction_group_members ${sql(rows)} ON CONFLICT DO NOTHING`;
  return c.json({ ok: true });
});

// Update USD values for existing members
app.patch('/wallets/:addr/groups/:id/members', async (c) => {
  const addr = c.req.param('addr');
  const id = parseInt(c.req.param('id'));
  const { updates } = await c.req.json<{
    updates: { signature: string; usdInflow: number | null; usdOutflow: number | null; priceFetched: boolean }[];
  }>();
  await Promise.all(updates.map(u => sql`
    UPDATE transaction_group_members
    SET usd_inflow = ${u.usdInflow ?? null},
        usd_outflow = ${u.usdOutflow ?? null},
        price_fetched = ${u.priceFetched}
    WHERE group_id = ${id} AND wallet_address = ${addr} AND signature = ${u.signature}
  `));
  return c.json({ ok: true });
});

// Remove one transaction from group
app.delete('/wallets/:addr/groups/:id/members/:sig', async (c) => {
  const addr = c.req.param('addr');
  const id = parseInt(c.req.param('id'));
  const sig = c.req.param('sig');
  await sql`
    DELETE FROM transaction_group_members
    WHERE group_id = ${id} AND wallet_address = ${addr} AND signature = ${sig}
  `;
  return c.json({ ok: true });
});

// All group memberships for wallet in one call
app.get('/wallets/:addr/group-memberships', async (c) => {
  const addr = c.req.param('addr');
  const rows = await sql`
    SELECT tgm.signature, tg.id, tg.name
    FROM transaction_group_members tgm
    JOIN transaction_groups tg ON tg.id = tgm.group_id
    WHERE tgm.wallet_address = ${addr}
  `;
  const result: Record<string, { id: number; name: string }[]> = {};
  for (const r of rows) {
    const sig = r.signature as string;
    if (!result[sig]) result[sig] = [];
    result[sig].push({ id: r.id as number, name: r.name as string });
  }
  return c.json(result);
});

export default app;
