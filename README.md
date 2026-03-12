# Solana Ledger

A personal portfolio tracker and tax assistant for Solana wallets. Fetches live holdings and transaction history via Helius, stores everything locally in PostgreSQL, and generates tax-ready summaries.

## Features

- **Holdings overview** — SOL + all SPL tokens with live prices via Helius DAS
- **Transaction history** — full paginated history with auto-categorization (trades, transfers, airdrops, staking rewards, NFT buys/sells)
- **Historical snapshots** — reconstruct portfolio value at any past date by replaying transactions
- **Tax summary** — taxable events by year with CSV export; tuned for Dutch Box 3 (January 1 snapshot)
- **Native staking** — stake accounts, delegation status, epoch-by-epoch inflation rewards
- **Seeker (SKR) staking** — shares, staked amount, and unstaking cooldown for the SKR program

## Stack

- **Frontend**: React 19, Vite 7, TypeScript, Tailwind CSS v4
- **Backend**: Hono + `@hono/node-server` (port 3001), `postgres` client
- **Database**: PostgreSQL (all state; no localStorage)
- **Blockchain data**: [Helius](https://helius.dev) (DAS + Enhanced Transactions + RPC)

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
SERVER_PORT=3001        # optional, defaults to 3001
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

## Architecture

The browser fetches Helius directly for blockchain data. All app state — wallets, cached holdings, transactions, snapshots, staking — is persisted in PostgreSQL via the local REST API (`/api/v1/...`).

```
Browser (React)
  └── src/lib/helius.ts      ──► Helius API (DAS, Enhanced Tx, RPC)
  └── src/lib/storage.ts     ──► GET/PUT/DELETE /api/v1/...
                                        │
                              Hono server (server/)
                                        │
                                   PostgreSQL
```

Key source files:

| File | Purpose |
|---|---|
| `server/index.ts` | Hono app, mounts route modules |
| `server/db.ts` | Schema init (`initDb()`) |
| `server/routes/` | One file per resource: settings, wallets, holdings, transactions, snapshots, staking |
| `src/context/AppContext.tsx` | Active wallet, wallet list, settings in React context |
| `src/lib/helius.ts` | Helius client with sliding-window rate limiter (10 req/s, 5 concurrent) |
| `src/lib/taxCategorizer.ts` | Heuristic transaction categorizer |
| `src/lib/snapshotEngine.ts` | Historical portfolio reconstruction via tx replay |
| `src/hooks/useStaking.ts` | Native + Seeker staking data with 1-hour cache |

## Tax Categories

`TRADE`, `TRANSFER_IN`, `TRANSFER_OUT`, `STAKING_REWARD`, `NFT_SALE`, `NFT_BUY`, `AIRDROP`, `BURN`, `FEE`, `OTHER`, `STAKE_DELEGATE`, `STAKE_DEACTIVATE`, `STAKE_WITHDRAW`

Taxable events (for Dutch Box 3): `TRADE`, `STAKING_REWARD`, `NFT_SALE`, `AIRDROP`, `TRANSFER_IN`
