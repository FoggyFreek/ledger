import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres({
  host: process.env.PGHOST ?? 'localhost',
  database: process.env.PGDATABASE ?? 'solwalletviewer',
  username: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  port: parseInt(process.env.PGPORT ?? '5432'),
  onnotice: () => {},
});

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS wallets (
      address        TEXT   PRIMARY KEY,
      label          TEXT   NOT NULL DEFAULT '',
      added_at       BIGINT NOT NULL,
      last_refreshed BIGINT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS holdings_cache (
      wallet_address TEXT   PRIMARY KEY REFERENCES wallets(address) ON DELETE CASCADE,
      data           JSONB  NOT NULL,
      fetched_at     BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      wallet_address  TEXT    NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
      signature       TEXT    NOT NULL,
      block_time      BIGINT  NOT NULL,
      slot            BIGINT  NOT NULL,
      fee             BIGINT  NOT NULL,
      tax_category    TEXT    NOT NULL,
      helius_type     TEXT,
      description     TEXT,
      err             TEXT,
      balance_changes JSONB   NOT NULL DEFAULT '[]',
      PRIMARY KEY (wallet_address, signature)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS transactions_wallet_block_time
      ON transactions (wallet_address, block_time DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS transactions_meta (
      wallet_address TEXT    PRIMARY KEY REFERENCES wallets(address) ON DELETE CASCADE,
      complete       BOOLEAN NOT NULL DEFAULT FALSE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS snapshots_cache (
      wallet_address TEXT  PRIMARY KEY REFERENCES wallets(address) ON DELETE CASCADE,
      data           JSONB NOT NULL DEFAULT '[]'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS stake_accounts (
      wallet_address     TEXT    NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
      pubkey             TEXT    NOT NULL,
      lamports           BIGINT  NOT NULL,
      voter              TEXT    NOT NULL,
      activation_epoch   INTEGER NOT NULL,
      deactivation_epoch INTEGER,
      status             TEXT    NOT NULL,
      PRIMARY KEY (wallet_address, pubkey)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS stake_accounts_meta (
      wallet_address TEXT   PRIMARY KEY REFERENCES wallets(address) ON DELETE CASCADE,
      fetched_at     BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS staking_rewards (
      wallet_address      TEXT    NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
      epoch               INTEGER NOT NULL,
      stake_account       TEXT    NOT NULL,
      amount              BIGINT  NOT NULL,
      post_balance        BIGINT  NOT NULL,
      commission          INTEGER,
      estimated_timestamp BIGINT  NOT NULL,
      PRIMARY KEY (wallet_address, epoch, stake_account)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS staking_rewards_wallet_epoch
      ON staking_rewards (wallet_address, epoch DESC)
  `;

  await sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS counterparty TEXT`;
  await sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS wallet_type TEXT NOT NULL DEFAULT 'solana'`;

  await sql`
    CREATE TABLE IF NOT EXISTS staking_rewards_meta (
      wallet_address TEXT     PRIMARY KEY REFERENCES wallets(address) ON DELETE CASCADE,
      epochs_fetched INTEGER[] NOT NULL DEFAULT '{}'
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS seeker_stake_accounts (
      wallet_address   TEXT    NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
      pubkey           TEXT    NOT NULL,
      lamports         BIGINT  NOT NULL,
      staked_raw       NUMERIC NOT NULL,
      unstaking_amount NUMERIC NOT NULL,
      PRIMARY KEY (wallet_address, pubkey)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS seeker_stake_meta (
      wallet_address TEXT   PRIMARY KEY REFERENCES wallets(address) ON DELETE CASCADE,
      fetched_at     BIGINT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS transaction_groups (
      id             SERIAL  PRIMARY KEY,
      wallet_address TEXT    NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
      name           TEXT    NOT NULL,
      created_at     BIGINT  NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS transaction_groups_wallet ON transaction_groups(wallet_address)`;

  await sql`
    CREATE TABLE IF NOT EXISTS transaction_group_members (
      group_id        INTEGER NOT NULL REFERENCES transaction_groups(id) ON DELETE CASCADE,
      wallet_address  TEXT    NOT NULL,
      signature       TEXT    NOT NULL,
      usd_inflow      NUMERIC,
      usd_outflow     NUMERIC,
      price_fetched   BOOLEAN NOT NULL DEFAULT FALSE,
      added_at        BIGINT  NOT NULL,
      PRIMARY KEY (group_id, wallet_address, signature),
      FOREIGN KEY (wallet_address, signature)
        REFERENCES transactions(wallet_address, signature) ON DELETE CASCADE
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS tgm_wallet_sig ON transaction_group_members(wallet_address, signature)`;

}

export default sql;
