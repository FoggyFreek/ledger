---
name: backend-api
description: Knowledge base for the Hono backend REST API and Helius proxy. Use when working with server routes, the database schema, storage.ts client wrappers, or the Helius proxy layer — adding endpoints, debugging API issues, or understanding the request/response flow between frontend and backend.
user-invocable: false
---

# Backend API Knowledge

This skill provides context for working with the Hono REST API backend and its Helius proxy layer. See [routes.md](routes.md) for the full endpoint reference and [helius-proxy.md](helius-proxy.md) for how Helius API calls are proxied through the backend.

## Quick Reference

### Request flow
```
React hook (useHoldings, useTransactions, etc.)
  → storage.ts wrapper (apiFetch / apiPut / apiPost / apiPatch / apiDelete)
    → Vite dev proxy (/api → localhost:3001)
      → Hono route handler (server/routes/*.ts)
        → PostgreSQL (via postgres.js)
```

### Helius proxy flow
```
src/lib/helius.ts (fetch to /api/v1/helius/*)
  → Vite dev proxy
    → server/routes/helius.ts
      → reads API key from settings table
        → forwards to Helius API with key injected
```

### Key files
- `server/index.ts` — Hono app entry point, mounts all route modules under `/api/v1`
- `server/db.ts` — postgres client + `initDb()` schema creation
- `server/routes/settings.ts` — API key and RPC URL management
- `server/routes/wallets.ts` — wallet CRUD
- `server/routes/holdings.ts` — holdings cache (JSONB)
- `server/routes/transactions.ts` — transaction storage with metadata
- `server/routes/snapshots.ts` — snapshot cache (JSONB)
- `server/routes/staking.ts` — native stake accounts, staking rewards, Seeker stake accounts
- `server/routes/groups.ts` — transaction groups and group members
- `server/routes/helius.ts` — Helius API proxy (RPC + Enhanced Transactions)
- `src/lib/storage.ts` — frontend HTTP client wrappers for all backend endpoints
