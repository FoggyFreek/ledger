import { Hono } from 'hono';
import sql from '../db.js';

const app = new Hono();

app.get('/wallets/:addr/transactions', async (c) => {
  const addr = c.req.param('addr');
  const [rows, metaRows] = await Promise.all([
    sql`SELECT * FROM transactions WHERE wallet_address = ${addr} ORDER BY block_time DESC`,
    sql`SELECT complete FROM transactions_meta WHERE wallet_address = ${addr}`,
  ]);

  if (metaRows.length === 0) return c.json(null);

  const data = rows.map(row => ({
    signature: row.signature as string,
    blockTime: Number(row.block_time),
    slot: Number(row.slot),
    fee: Number(row.fee),
    taxCategory: row.tax_category as string,
    heliusType: (row.helius_type as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    balanceChanges: row.balance_changes,
    err: (row.err as string | null) ?? null,
    counterparty: (row.counterparty as string | null) ?? null,
  }));

  return c.json({
    data,
    newestSignature: (rows[0]?.signature as string) ?? null,
    oldestSignature: (rows[rows.length - 1]?.signature as string) ?? null,
    complete: (metaRows[0].complete as boolean) ?? false,
  });
});

app.put('/wallets/:addr/transactions', async (c) => {
  const addr = c.req.param('addr');
  const stored = await c.req.json();

  if (stored.data.length > 0) {
    const rows = stored.data.map((tx: {
      signature: string; blockTime: number; slot: number; fee: number;
      taxCategory: string; heliusType: string | null; description: string | null;
      err: string | null; balanceChanges: unknown[]; counterparty: string | null;
    }) => ({
      wallet_address: addr,
      signature: tx.signature,
      block_time: tx.blockTime,
      slot: tx.slot,
      fee: tx.fee,
      tax_category: tx.taxCategory,
      helius_type: tx.heliusType ?? null,
      description: tx.description ?? null,
      err: tx.err ?? null,
      balance_changes: tx.balanceChanges,
      counterparty: tx.counterparty ?? null,
    }));

    await sql`
      INSERT INTO transactions ${sql(rows, 'wallet_address', 'signature', 'block_time', 'slot', 'fee', 'tax_category', 'helius_type', 'description', 'err', 'balance_changes', 'counterparty')}
      ON CONFLICT (wallet_address, signature) DO UPDATE SET
        tax_category    = EXCLUDED.tax_category,
        err             = EXCLUDED.err,
        balance_changes = EXCLUDED.balance_changes,
        counterparty    = EXCLUDED.counterparty
    `;
  }

  await sql`
    INSERT INTO transactions_meta (wallet_address, complete)
    VALUES (${addr}, ${stored.complete})
    ON CONFLICT (wallet_address) DO UPDATE SET complete = EXCLUDED.complete
  `;

  return c.json({ ok: true });
});

app.patch('/wallets/:addr/transactions/:sig', async (c) => {
  const addr = c.req.param('addr');
  const sig = c.req.param('sig');
  const { taxCategory } = await c.req.json<{ taxCategory: string }>();
  await sql`
    UPDATE transactions SET tax_category = ${taxCategory}
    WHERE wallet_address = ${addr} AND signature = ${sig}
  `;
  return c.json({ ok: true });
});

app.delete('/wallets/:addr/transactions', async (c) => {
  const addr = c.req.param('addr');
  await Promise.all([
    sql`DELETE FROM transactions WHERE wallet_address = ${addr}`,
    sql`DELETE FROM transactions_meta WHERE wallet_address = ${addr}`,
  ]);
  return c.json({ ok: true });
});

export default app;
