# Backend REST API Reference

All endpoints are mounted under `/api/v1` on the Hono server (port 3001, env `SERVER_PORT`). The Vite dev server proxies `/api` to the backend automatically.

## Conventions

- **Response format**: All endpoints return JSON. Success responses return the resource or `{ ok: true }`.
- **Error handling**: Routes rely on Hono's default error handling. No custom error middleware.
- **Database**: All routes import `sql` from `../db.js` (postgres.js client). Parameterized queries throughout — no raw string interpolation.
- **Timestamps**: Stored as `BIGINT` (Unix milliseconds), converted with `Number()` on read.
- **JSONB fields**: `holdings_cache.data`, `snapshots_cache.data`, `transactions.balance_changes` store structured data as JSONB.
- **Cascading deletes**: All wallet-scoped tables have `ON DELETE CASCADE` FK to `wallets(address)`.

## Settings

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `GET` | `/settings` | — | `{ apiKey, rpcUrl }` | Returns defaults if no row exists |
| `PUT` | `/settings` | `{ apiKey, rpcUrl }` | `{ ok: true }` | Upserts single-row table |

## Wallets

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `GET` | `/wallets` | — | `WalletEntry[]` | Ordered by `added_at` |
| `PUT` | `/wallets` | `{ wallets: WalletEntry[] }` | `{ ok: true }` | Full sync — replaces entire list. Deletes wallets not in the new list, upserts the rest. |

`WalletEntry`: `{ address, label, addedAt, lastRefreshed }`

## Holdings

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `GET` | `/wallets/:addr/holdings` | — | `WalletHoldings \| null` | Raw JSONB passthrough |
| `PUT` | `/wallets/:addr/holdings` | `WalletHoldings` | `{ ok: true }` | Upserts; uses `fetchedAt` from body |
| `DELETE` | `/wallets/:addr/holdings` | — | `{ ok: true }` | |

## Transactions

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `GET` | `/wallets/:addr/transactions` | — | `StoredTransactions \| null` | Returns `null` if no meta row exists (never fetched). Data ordered by `block_time DESC`. |
| `PUT` | `/wallets/:addr/transactions` | `StoredTransactions` | `{ ok: true }` | Bulk upserts transactions + updates meta. On conflict updates `tax_category`, `err`, `balance_changes`, `counterparty`. |
| `DELETE` | `/wallets/:addr/transactions` | — | `{ ok: true }` | Deletes transactions + meta |

`StoredTransactions`: `{ data: ParsedTransaction[], complete: boolean }`. The `newestSignature` and `oldestSignature` fields are derived from the ordered data on read, not stored separately.

### Transaction row shape (DB → JSON mapping)
```
wallet_address  → (path param)
signature       → signature
block_time      → blockTime (Number)
slot            → slot (Number)
fee             → fee (Number)
tax_category    → taxCategory
helius_type     → heliusType
description     → description
balance_changes → balanceChanges (JSONB)
err             → err
counterparty    → counterparty
```

## Snapshots

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `GET` | `/snapshots` | — | `WalletSnapshot[]` | Returns all snapshots across all wallets, flattened |
| `PUT` | `/snapshots` | `WalletSnapshot[]` | `{ ok: true }` | Groups by `walletAddress`, upserts per wallet. Clears wallets not in the new set. |

## Staking

### Native stake accounts

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `GET` | `/wallets/:addr/stake-accounts` | — | `{ fetchedAt, data: StakeAccount[] } \| null` | |
| `PUT` | `/wallets/:addr/stake-accounts` | `{ data, fetchedAt }` | `{ ok: true }` | Full replace (deletes all, re-inserts) |

### Staking rewards

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `GET` | `/wallets/:addr/staking-rewards` | — | `{ data: StakingReward[] } \| null` | Ordered by `epoch DESC` |
| `PUT` | `/wallets/:addr/staking-rewards` | `{ data }` | `{ ok: true }` | Full replace |

### Seeker (SKR) stake accounts

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `GET` | `/wallets/:addr/seeker-stake` | — | `{ fetchedAt, data[] } \| null` | `stakedRaw` and `unstakingAmount` returned as strings (NUMERIC) |
| `PUT` | `/wallets/:addr/seeker-stake` | `{ data, fetchedAt }` | `{ ok: true }` | BigInt fields sent as strings, stored as NUMERIC |

### Clear all staking

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `DELETE` | `/wallets/:addr/staking` | — | `{ ok: true }` | Deletes stake accounts, rewards, seeker stake, and all meta tables |

## Transaction Groups

### Groups

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `GET` | `/wallets/:addr/groups` | — | `TransactionGroup[]` | Includes `txCount` via JOIN. Ordered by `created_at DESC`. |
| `POST` | `/wallets/:addr/groups` | `{ name }` | `{ id, name, createdAt }` | |
| `PATCH` | `/wallets/:addr/groups/:id` | `{ name }` | `{ ok: true }` | Rename |
| `DELETE` | `/wallets/:addr/groups/:id` | — | `{ ok: true }` | Cascades to members |

### Group members

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `GET` | `/wallets/:addr/groups/:id/members` | — | `GroupMember[]` | JOINs with transactions for full tx data. Ordered by `block_time DESC`. |
| `POST` | `/wallets/:addr/groups/:id/members` | `{ members: GroupMemberInput[] }` | `{ ok: true }` | `ON CONFLICT DO NOTHING` |
| `PATCH` | `/wallets/:addr/groups/:id/members` | `{ updates: GroupMemberInput[] }` | `{ ok: true }` | Updates USD values only |
| `DELETE` | `/wallets/:addr/groups/:id/members/:sig` | — | `{ ok: true }` | Remove single member |

`GroupMemberInput`: `{ signature, usdInflow, usdOutflow, priceFetched }`

### Group memberships (bulk lookup)

| Method | Path | Body | Response | Notes |
|--------|------|------|----------|-------|
| `GET` | `/wallets/:addr/group-memberships` | — | `Record<signature, {id, name}[]>` | All memberships for a wallet in one call |

## Frontend Client (`src/lib/storage.ts`)

The frontend uses five helper functions that wrap `fetch()`:

| Helper | HTTP Method | Error handling |
|--------|-------------|----------------|
| `apiFetch<T>(url)` | GET | Returns `null` on 404 or network error |
| `apiPut(url, body)` | PUT | Logs and swallows errors |
| `apiPost<T>(url, body)` | POST | Returns `null` on failure |
| `apiPatch(url, body)` | PATCH | Logs and swallows errors |
| `apiDelete(url)` | DELETE | Logs and swallows errors |

### Key behaviors
- `loadTransactions()` rehydrates `interpretedFlow` on every load via `withInterpretedFlow()` — the flow is never stored, always recomputed from `balanceChanges`.
- `loadSeekerStakeAccounts()` converts `stakedRaw`/`unstakingAmount` from strings to `BigInt` on read; `saveSeekerStakeAccounts()` serializes them back to strings.
- All storage functions use relative URLs (`/api/v1/...`) — the Vite dev proxy handles routing to the backend.

## Adding a new endpoint

1. Create or edit a route file in `server/routes/`
2. If new file: create a Hono app, export default, import + mount in `server/index.ts` via `app.route('/api/v1', myRoutes)`
3. Add corresponding wrapper functions in `src/lib/storage.ts` using the `apiFetch`/`apiPut`/etc. helpers
4. If new table: add `CREATE TABLE IF NOT EXISTS` in `server/db.ts` `initDb()`
5. Update CLAUDE.md schema table if the table is new

## Common Pitfalls

### BIGINT → Number conversion
PostgreSQL BIGINT values arrive as strings in postgres.js. Always wrap with `Number()` when returning to the frontend (e.g., `Number(row.block_time)`).

### NUMERIC → string for BigInt fields
Fields like `staked_raw` and `unstaking_amount` use `NUMERIC` in PostgreSQL. postgres.js returns these as strings. The frontend converts via `BigInt()` in `storage.ts`.

### JSONB fields
Use `sql.json(data)` when inserting JSONB. Reading returns parsed objects automatically.

### Wallet FK constraint
All wallet-scoped tables reference `wallets(address)`. The wallet must exist before inserting related data. The `ON DELETE CASCADE` handles cleanup.

### Transaction upsert semantics
The PUT endpoint uses `ON CONFLICT ... DO UPDATE` to allow re-categorization of existing transactions without duplicating them. Only `tax_category`, `err`, `balance_changes`, and `counterparty` are updated on conflict — `block_time`, `slot`, `fee`, etc. are immutable.
