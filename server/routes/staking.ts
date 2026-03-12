import { Hono } from 'hono';
import sql from '../db.js';

const app = new Hono();

// Stake accounts
app.get('/wallets/:addr/stake-accounts', async (c) => {
  const addr = c.req.param('addr');
  const [rows, metaRows] = await Promise.all([
    sql`SELECT pubkey, lamports, voter, activation_epoch, deactivation_epoch, status
        FROM stake_accounts WHERE wallet_address = ${addr}`,
    sql`SELECT fetched_at FROM stake_accounts_meta WHERE wallet_address = ${addr}`,
  ]);
  if (metaRows.length === 0) return c.json(null);
  return c.json({
    fetchedAt: Number(metaRows[0].fetched_at),
    data: rows.map(r => ({
      pubkey: r.pubkey as string,
      lamports: Number(r.lamports),
      voter: r.voter as string,
      activationEpoch: r.activation_epoch as number,
      deactivationEpoch: r.deactivation_epoch as number | null,
      status: r.status as string,
    })),
  });
});

app.put('/wallets/:addr/stake-accounts', async (c) => {
  const addr = c.req.param('addr');
  const { data, fetchedAt } = await c.req.json<{
    data: { pubkey: string; lamports: number; voter: string; activationEpoch: number; deactivationEpoch: number | null; status: string }[];
    fetchedAt: number;
  }>();

  await sql.begin(async sql => {
    await sql`DELETE FROM stake_accounts WHERE wallet_address = ${addr}`;
    if (data.length > 0) {
      const rows = data.map(a => ({
        wallet_address: addr,
        pubkey: a.pubkey,
        lamports: a.lamports,
        voter: a.voter,
        activation_epoch: a.activationEpoch,
        deactivation_epoch: a.deactivationEpoch ?? null,
        status: a.status,
      }));
      await sql`INSERT INTO stake_accounts ${sql(rows)}`;
    }
    await sql`
      INSERT INTO stake_accounts_meta (wallet_address, fetched_at)
      VALUES (${addr}, ${fetchedAt})
      ON CONFLICT (wallet_address) DO UPDATE SET fetched_at = EXCLUDED.fetched_at
    `;
  });

  return c.json({ ok: true });
});

// Staking rewards
app.get('/wallets/:addr/staking-rewards', async (c) => {
  const addr = c.req.param('addr');
  const [rows, metaRows] = await Promise.all([
    sql`SELECT epoch, stake_account, amount, post_balance, commission, estimated_timestamp
        FROM staking_rewards WHERE wallet_address = ${addr} ORDER BY epoch DESC`,
    sql`SELECT 1 FROM stake_accounts_meta WHERE wallet_address = ${addr}`,
  ]);
  if (metaRows.length === 0) return c.json(null);
  return c.json({
    data: rows.map(r => ({
      epoch: r.epoch as number,
      stakeAccount: r.stake_account as string,
      amount: Number(r.amount),
      postBalance: Number(r.post_balance),
      commission: r.commission as number | null,
      estimatedTimestamp: Number(r.estimated_timestamp),
    })),
  });
});

app.put('/wallets/:addr/staking-rewards', async (c) => {
  const addr = c.req.param('addr');
  const { data } = await c.req.json<{
    data: { epoch: number; stakeAccount: string; amount: number; postBalance: number; commission: number | null; estimatedTimestamp: number }[];
  }>();

  await sql.begin(async sql => {
    await sql`DELETE FROM staking_rewards WHERE wallet_address = ${addr}`;
    if (data.length > 0) {
      const rows = data.map(r => ({
        wallet_address: addr,
        epoch: r.epoch,
        stake_account: r.stakeAccount,
        amount: r.amount,
        post_balance: r.postBalance,
        commission: r.commission ?? null,
        estimated_timestamp: r.estimatedTimestamp,
      }));
      await sql`INSERT INTO staking_rewards ${sql(rows)}`;
    }
  });

  return c.json({ ok: true });
});

// Seeker stake accounts
app.get('/wallets/:addr/seeker-stake', async (c) => {
  const addr = c.req.param('addr');
  const [rows, metaRows] = await Promise.all([
    sql`SELECT pubkey, lamports, staked_raw, unstaking_amount
        FROM seeker_stake_accounts WHERE wallet_address = ${addr}`,
    sql`SELECT fetched_at FROM seeker_stake_meta WHERE wallet_address = ${addr}`,
  ]);
  if (metaRows.length === 0) return c.json(null);
  return c.json({
    fetchedAt: Number(metaRows[0].fetched_at),
    data: rows.map(r => ({
      pubkey: r.pubkey as string,
      lamports: Number(r.lamports),
      stakedRaw: String(r.staked_raw),
      unstakingAmount: String(r.unstaking_amount),
    })),
  });
});

app.put('/wallets/:addr/seeker-stake', async (c) => {
  const addr = c.req.param('addr');
  const { data, fetchedAt } = await c.req.json<{
    data: { pubkey: string; lamports: number; stakedRaw: string; unstakingAmount: string }[];
    fetchedAt: number;
  }>();

  await sql.begin(async sql => {
    await sql`DELETE FROM seeker_stake_accounts WHERE wallet_address = ${addr}`;
    if (data.length > 0) {
      const rows = data.map(a => ({
        wallet_address: addr,
        pubkey: a.pubkey,
        lamports: a.lamports,
        staked_raw: a.stakedRaw,
        unstaking_amount: a.unstakingAmount,
      }));
      await sql`INSERT INTO seeker_stake_accounts ${sql(rows)}`;
    }
    await sql`
      INSERT INTO seeker_stake_meta (wallet_address, fetched_at)
      VALUES (${addr}, ${fetchedAt})
      ON CONFLICT (wallet_address) DO UPDATE SET fetched_at = EXCLUDED.fetched_at
    `;
  });

  return c.json({ ok: true });
});

// Clear all staking data for a wallet
app.delete('/wallets/:addr/staking', async (c) => {
  const addr = c.req.param('addr');
  await Promise.all([
    sql`DELETE FROM stake_accounts WHERE wallet_address = ${addr}`,
    sql`DELETE FROM staking_rewards WHERE wallet_address = ${addr}`,
    sql`DELETE FROM seeker_stake_accounts WHERE wallet_address = ${addr}`,
    // meta tables cascade-delete via FK, but be explicit
    sql`DELETE FROM stake_accounts_meta WHERE wallet_address = ${addr}`,
    sql`DELETE FROM seeker_stake_meta WHERE wallet_address = ${addr}`,
  ]);
  return c.json({ ok: true });
});

export default app;
