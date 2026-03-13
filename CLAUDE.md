# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server (HMR, port 5173)
npm run build     # Type-check + production build
npm run lint      # ESLint
npm run server    # Start Hono API server (port 3001)
npm test          # Run Vitest test suite
```

## Architecture

**React frontend + Hono/PostgreSQL backend.** The browser fetches Helius directly for blockchain data; all app state (wallets, cached holdings, transactions, snapshots, staking) is persisted in PostgreSQL via a local REST API. The API key is stored in the `settings` table and injected at runtime via `setApiKey()` in `src/lib/helius.ts`.

### Backend (`server/`)

- **`server/index.ts`** — Hono app served by `@hono/node-server` on port 3001 (env `SERVER_PORT`). Mounts all route modules under `/api/v1`.
- **`server/db.ts`** — `postgres` client + `initDb()` which creates all tables on startup.
- **`server/routes/`** — one file per resource: `settings`, `wallets`, `holdings`, `transactions`, `snapshots`, `staking`, `groups`.

#### PostgreSQL schema

| Table | Key | Contents |
|---|---|---|
| `settings` | single row | `api_key`, `rpc_url` |
| `wallets` | `address` (PK) | `label`, `added_at`, `last_refreshed` |
| `holdings_cache` | `wallet_address` (FK) | `data` JSONB, `fetched_at` |
| `transactions` | `(wallet_address, signature)` PK | one row per transaction; `block_time`, `slot`, `fee`, `tax_category`, `helius_type`, `description`, `err`, `balance_changes` JSONB; indexed by `(wallet_address, block_time DESC)` |
| `transactions_meta` | `wallet_address` (PK/FK) | `complete` BOOLEAN |
| `snapshots_cache` | `wallet_address` (FK) | `data` JSONB (WalletSnapshot[]) |
| `stake_accounts` | `(wallet_address, pubkey)` PK | `lamports`, `voter`, `activation_epoch`, `deactivation_epoch`, `status` |
| `stake_accounts_meta` | `wallet_address` (PK/FK) | `fetched_at` |
| `staking_rewards` | `(wallet_address, epoch, stake_account)` PK | `amount`, `post_balance`, `commission`, `estimated_timestamp`; indexed by `(wallet_address, epoch DESC)` |
| `staking_rewards_meta` | `wallet_address` (PK/FK) | `epochs_fetched INTEGER[]` — tracks queried epochs including those with zero rewards |
| `seeker_stake_accounts` | `(wallet_address, pubkey)` PK | `lamports`, `staked_raw NUMERIC`, `unstaking_amount NUMERIC` |
| `seeker_stake_meta` | `wallet_address` (PK/FK) | `fetched_at` |
| `transaction_groups` | `id` SERIAL PK | `wallet_address` (FK), `name`, `created_at` BIGINT |
| `transaction_group_members` | `(group_id, wallet_address, signature)` PK | `usd_inflow`, `usd_outflow` NUMERIC, `price_fetched` BOOLEAN, `added_at` BIGINT; FK to both `transaction_groups` and `transactions` |

### State layers

1. **PostgreSQL** (via `src/lib/storage.ts`) — async fetch wrappers that call `GET`/`PUT`/`DELETE /api/v1/...`. No localStorage; no schema versioning needed.
2. **React Context** (`src/context/AppContext.tsx`) — holds the active wallet address, wallet list, and settings in memory. All hooks read/write through this.
3. **Custom hooks** (`src/hooks/`) — `useHoldings`, `useTransactions`, `useSnapshots`, `useStaking` each manage their own loading/error state and call into `storage.ts` for caching.

### Page routing

No router library. `App.tsx` holds a `page` string in `useState` and renders the active page component. `Sidebar.tsx` calls `onPageChange`.

### API integration (`src/lib/helius.ts`)

Helius endpoints used:
- **DAS `getAssetsByOwner`** — fetches all SOL + SPL token holdings with metadata and prices in one call (`showFungible: true`, `showNativeBalance: true`). Results are automatically registered in the token registry.
- **DAS `getAssetBatch`** — batch-fetches token metadata (symbol, name, logo) for up to 1 000 mints per call. Called via `prefetchTokenMeta(mints[])` for mints seen in transactions but not in holdings.
- **Enhanced Transactions `/v1/wallet/{addr}/history`** — returns parsed transactions with `type`, `tokenTransfers`, `nativeTransfers`, and `accountData`.
- **RPC `getProgramAccounts`** (Stake program) — fetches all stake accounts owned/authorized by the wallet via two parallel memcmp filters (staker offset 12, withdrawer offset 44). Used by `getStakeAccounts()`. **memcmp format:** `{ offset, bytes: "<base58 pubkey>" }` — no `encoding` field inside memcmp, no `dataSize` filter (stake accounts vary in size: ~188–196 bytes depending on program version). `encoding: "jsonParsed"` is the outer param for structured account data.
- **RPC `getProgramAccounts`** (Seeker program) — fetches user staking accounts for the Seeker (SKR) program (`SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ`). Filter: `encoding: "base64"`, `memcmp offset 41` for wallet pubkey (layout: 8 discriminator + 1 bump + 32 stake_config = 41). Used by `getSeekerStakeAccounts()`.
- **RPC `getAccountInfo`** (Seeker global config) — fetches the global staking config account (`4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw`) to read `share_price` (u128 at byte offset 137). Used by `getSeekerSharePrice()`.
- **RPC `getInflationReward`** — fetches epoch-by-epoch staking rewards for a list of stake account pubkeys. Called per epoch in parallel by `getInflationRewards()`.
- **RPC `getEpochInfo` / `getEpochSchedule`** — used to classify stake account status and estimate reward timestamps.

A module-level `enqueue` function rate-limits outgoing requests using a **sliding window** (max 10 req/s) plus a concurrency cap of 5 in-flight requests. All API methods throw typed `Error` objects on failure.

#### Token registry (`_tokenRegistry`)

An in-memory `Map<mint, TokenMeta>` (`{ symbol, name, logoUri }`) populated from `getAssetsByOwner` results (free) and `prefetchTokenMeta` calls (lazy, on-demand). Use `getCachedTokenInfo(mint)` to look up metadata anywhere in the app without an extra fetch.

### Transaction storage model

Transactions are stored append-only. `useTransactions` has two fetch directions:
- `fetchNew` — fetches with `until: newestSignature` to get recent txns
- `fetchOlder` — fetches with `before: oldestSignature` to paginate backward

`complete: true` is set when a page returns fewer than 100 results (end of history reached).

### Transaction display (`src/lib/txSummary.ts`)

Display helpers used by `TransactionsPage` and `GroupsPage`:
- `resolveSymbol(mint, tokenMetas)` — SOL for any SOL-like mint, else looks up token registry, falls back to truncated mint
- `formatAmount(bc, tokenMetas)` — formats a single `BalanceChange` as `"+1,234.56 SOL"`
- `summarizeChanges(changes, tokenMetas)` — joins multiple changes comma-separated
- `summarizeSwap(changes, tokenMetas)` — `"X TOKEN → Y TOKEN"` for TRADE transactions
- `summarizeTx(tx, tokenMetas, walletAddress, walletOnly)` — main entry point; dispatches to `summarizeSwap` or `summarizeChanges`, appends counterparty label for transfers

### Transaction groups (`src/pages/GroupsPage.tsx`)

Users can tag transactions into named groups for cost-basis tracking. Each group member stores `usdInflow`/`usdOutflow` computed via `computeUsdValues()` in `src/lib/groups.ts` (fetches historical prices from an external price API at transaction `blockTime`).

- **`src/lib/groups.ts`** — `computeUsdValues(transactions[])` — batches price fetches by timestamp, returns `GroupMemberInput[]` with USD values
- **`src/lib/groupSummary.ts`** — `aggregateBalances(members[])` — runs `interpretTransaction` on each member's `balanceChanges`, accumulates per-mint `inTotal`/`outTotal`/`netTotal`; sorted by `|inTotal - outTotal|` descending
- **`src/types/groups.ts`** — `TransactionGroup`, `GroupMember`, `GroupMemberInput`, `GroupMemberships` types
- **`src/components/groups/`** — `GroupBadges`, `AddToGroupModal` components
- Group memberships for the active wallet are loaded in a single call (`GET /api/v1/wallets/:addr/group-memberships`) and passed down as `GroupMemberships` (a `Record<signature, {id, name}[]>`)

### Tax categorization (`src/lib/taxCategorizer.ts`)

**Detailed transaction system knowledge** (Helius API schema, parsing pipeline, balance change interpretation, categorization heuristics, common pitfalls) is in the `.claude/skills/solana-transactions/` skill.

`parseWalletHistoryTx(tx, walletAddress?)` maps each `HeliusWalletHistoryTx` → `ParsedTransaction`. Before the generic `categorize()` heuristic runs, it checks `tx.tokenTransfers` for SKR (`SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`) transfers involving the Seeker staking config (`4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw`): `toUserAccount === config` → `STAKE_DELEGATE`; `fromUserAccount === config` → `STAKE_WITHDRAW`. Falls through to `categorize()` if no Seeker transfer is detected. Category is determined by `categorize()` using heuristics on transfer direction and mint count. The `TRANSFER` type is split into `TRANSFER_IN` / `TRANSFER_OUT` based on net SOL/token flow direction.

`stakingRewardsToTransactions(rewards[])` converts `StakingReward[]` into synthetic `ParsedTransaction[]` with stable IDs (`epoch-{N}-{pubkey}`), `slot: 0`, `fee: 0`, and `taxCategory: 'STAKING_REWARD'`. These are merged into the transaction list in `TransactionsPage` and `TaxSummaryPage`. Synthetic transactions are identified by `slot === 0` and have no solscan link.

### Snapshot engine (`src/lib/snapshotEngine.ts`)

Historical snapshots reconstruct holdings by replaying all loaded transactions up to the target date:
1. `findSlotForTimestamp` binary-searches ~25 Helius RPC calls to find the slot nearest the target timestamp.
2. Transactions are filtered by `blockTime ≤ targetTs` and `err === null`, then sorted oldest-first.
3. `accountData.tokenBalanceChanges` deltas are accumulated using `BigInt` to avoid floating-point errors.
4. SOL balance is derived from `nativeBalanceChange` on the wallet's `accountData` entry.

**Accuracy depends on having full transaction history loaded.** The UI warns when `isComplete === false`.

### Staking (`src/hooks/useStaking.ts`)

`useStaking(address)` mirrors the `useHoldings` pattern:
- `refresh(force?)` — calls `getStakeAccounts()` and `getSeekerStakeAccounts()` in parallel, then `getInflationRewards()` for the last 12 epochs. Caches to Postgres (1-hour TTL on stake accounts and seeker stake; rewards stored without TTL).
- `fetchMoreEpochs(n)` — fetches `n` additional epochs before the earliest already fetched and merges them into the cache.

Exposes `seekerAccounts: SeekerStakeAccount[]` alongside `stakeAccounts` and `stakingRewards`.

Stake account status is derived from `activationEpoch` / `deactivationEpoch` vs current epoch: `active`, `activating`, `deactivating`, or `inactive`. `deactivationEpoch === max_u64` means the account is still delegated.

Reward timestamps are estimated by anchoring to `Date.now()` + `getEpochInfo().absoluteSlot`, then projecting backward at 400ms/slot. This avoids the ~1-year systematic error that accumulates when projecting from genesis (actual avg slot time is ~460ms, not 400ms).

### Seeker (SKR) staking

- **Program**: `SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ`
- **Global staking config**: `4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw` — holds `share_price` (u128 at byte 137, precision 10⁹) and `stake_vault` token account address
- **SKR mint**: `SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`, decimals 6
- **User stake account layout** (after 8-byte discriminator): `bump(1) | stake_config(32) | user(32) | guardian_pool(32) | shares(u128,16) | cost_basis(u128,16) | cumulative_commission(u128,16) | unstaking_amount(u64,8) | unstake_timestamp(i64,8)`
- **Staked amount formula**: `stakedRaw = (shares × share_price) / 1_000_000_000n` (BigInt); UI amount = `stakedRaw / 1e6`
- **`unstaking_amount`** — SKR currently in cooldown (172 800 s = 48 h), displayed separately in yellow
- **Storage**: `seeker_stake_accounts` table — `staked_raw` and `unstaking_amount` stored as `NUMERIC`; returned as strings by postgres.js, converted via `BigInt()` in `storage.ts`

### Tailwind

Uses Tailwind v4 with the `@tailwindcss/vite` plugin (configured in `vite.config.ts`). Import is `@import "tailwindcss"` in `src/index.css` — not the v3 `@tailwind` directives.
