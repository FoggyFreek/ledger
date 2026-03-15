# Solana Ledger

A personal portfolio tracker and tax assistant for Solana wallets and Bitvavo exchange accounts. Fetches live holdings and transaction history via Helius, stores everything locally in PostgreSQL, and generates tax-ready summaries.

## Features

- **Holdings overview** — SOL + all SPL tokens with live prices via Helius DAS; Bitvavo exchange balances with logo resolution via CoinGecko
- **Transaction history** — full paginated history with auto-categorization (trades, transfers, airdrops, staking rewards, NFT buys/sells, stake delegate/withdraw)
- **Transaction groups** — tag transactions into named groups for cost-basis tracking; per-group USD inflow/outflow computed from historical prices via DeFiLlama
- **Historical snapshots** — reconstruct portfolio value at any past date by replaying transactions; tuned for Dutch Box 3 (January 1 snapshot)
- **Tax summary** — taxable events by year with CSV export
- **Native staking** — stake accounts, delegation status, epoch-by-epoch inflation rewards with "fetch more epochs" support
- **Seeker (SKR) staking** — shares, staked amount, and unstaking cooldown for the SKR program
- **Bitvavo integration** — read-only exchange account with balance and transaction history; trades, deposits, withdrawals, staking rewards all categorized

## Stack

- **Frontend**: React 19, Vite 7, TypeScript, Tailwind CSS v4
- **Backend**: Hono + `@hono/node-server` (port 3001), `postgres` client
- **Database**: PostgreSQL (all state; no localStorage)
- **Blockchain data**: [Helius](https://helius.dev) (DAS + Enhanced Transactions + RPC), proxied server-side
- **Exchange data**: [Bitvavo](https://bitvavo.com) REST API, proxied server-side with HMAC auth
- **Prices**: [DeFiLlama](https://defillama.com) for historical USD prices; [CoinGecko](https://coingecko.com) for token logo URIs

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL running locally
- A Helius API key

### Setup

```bash
npm install
```

Create a `.env` file (or set environment variables):

```env
DATABASE_URL=postgres://user:password@localhost:5432/solana_ledger
SERVER_PORT=3001          # optional, defaults to 3001

# Optional — Bitvavo exchange integration
BITVAVO_KEY=your_api_key
BITVAVO_SECRET=your_api_secret

# Optional — CoinGecko demo key (higher rate limit)
COINGECKO_API_KEY=your_key
```

Start the API server (creates all tables on first run):

```bash
npm run server
```

Start the dev frontend:

```bash
npm run dev
```

Open `http://localhost:5173`, go to **Settings**, and enter your Helius API key. It is stored in the `settings` table and never leaves your machine.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Vite dev server with HMR on port 5173 |
| `npm run build` | Type-check + production build |
| `npm run lint` | ESLint |
| `npm run server` | Hono API server on port 3001 |
| `npm test` | Run Vitest test suite |

## Architecture

All Helius, Bitvavo, and CoinGecko API calls are proxied through the backend so credentials never reach the browser. App state — wallets, cached holdings, transactions, snapshots, staking — is persisted in PostgreSQL via the local REST API.

```
Browser (React)
  └── src/lib/helius.ts       ──► POST /api/v1/helius/rpc
  └── src/lib/helius.ts       ──► POST /api/v1/helius/enhanced-transactions
  └── src/lib/bitvavo.ts      ──► GET  /api/v1/bitvavo/...
  └── src/lib/prices.ts       ──► DeFiLlama (direct, historical prices)
  └── src/lib/storage.ts      ──► GET/PUT/DELETE /api/v1/...
                                          │
                                Hono server (server/)
                                  ├── injects Helius API key
                                  ├── signs Bitvavo requests (HMAC)
                                  └── proxies CoinGecko (rate-limited)
                                          │
                                     PostgreSQL
```

### Backend routes (`server/routes/`)

| Route file | Endpoints |
|---|---|
| `settings` | Helius API key storage |
| `wallets` | Wallet CRUD + group memberships |
| `holdings` | Holdings cache (JSONB) |
| `transactions` | Transaction storage + completeness flag |
| `snapshots` | Snapshot cache (JSONB) |
| `staking` | Native stake accounts, Seeker stake accounts, inflation rewards |
| `groups` | Transaction group CRUD + member management |
| `helius` | Proxy: `/rpc` (DAS + JSON-RPC), `/enhanced-transactions` |
| `bitvavo` | Proxy: balances, transaction history, transfer history |
| `coingecko` | Proxy: `/coins-markets` batch endpoint (rate-limited) |

### Key source files

| File | Purpose |
|---|---|
| `server/index.ts` | Hono app, mounts route modules |
| `server/db.ts` | Schema init (`initDb()`) |
| `src/context/AppContext.tsx` | Active wallet, wallet list, settings in React context |
| `src/lib/helius.ts` | Helius client with sliding-window rate limiter (5 req/s, 3 concurrent) |
| `src/lib/bitvavo.ts` | Bitvavo types and logo resolution via CoinGecko |
| `src/lib/bitvavoParser.ts` | Maps Bitvavo history entries to `ParsedTransaction` |
| `src/lib/prices.ts` | Historical USD price fetching via DeFiLlama |
| `src/lib/taxCategorizer.ts` | Heuristic transaction categorizer; Seeker staking detection |
| `src/lib/snapshotEngine.ts` | Historical portfolio reconstruction via tx replay |
| `src/lib/groups.ts` | `computeUsdValues()` — batch price fetch for group members |
| `src/lib/groupSummary.ts` | `aggregateBalances()` — per-mint inflow/outflow rollup for a group |
| `src/lib/txSummary.ts` | Display helpers: `summarizeTx`, `summarizeSwap`, `formatAmount` |
| `src/lib/csv.ts` | CSV export helpers |
| `src/hooks/useStaking.ts` | Native + Seeker staking data with 1-hour cache |
| `src/hooks/useBitvavoHoldings.ts` | Bitvavo balance fetching |

## Tax Categories

`TRADE`, `TRANSFER_IN`, `TRANSFER_OUT`, `STAKING_REWARD`, `NFT_SALE`, `NFT_BUY`, `AIRDROP`, `BURN`, `FEE`, `OTHER`, `STAKE_DELEGATE`, `STAKE_DEACTIVATE`, `STAKE_WITHDRAW`

Taxable events (for Dutch Box 3): `TRADE`, `STAKING_REWARD`, `NFT_SALE`, `AIRDROP`, `TRANSFER_IN`

## Dutch Tax Notes

Crypto is taxed under **Box 3** (wealth tax) based on the January 1 balance each year. Capital gains from trading are generally not taxable for individual investors. The snapshot feature is specifically designed around this: pick January 1 of any year to get your taxable balance. DAC8 reporting by exchanges begins January 1, 2026.
