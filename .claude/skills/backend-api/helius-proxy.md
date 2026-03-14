# Helius API Proxy

All Helius API calls from the frontend are routed through the backend to keep the API key server-side. The frontend never sees or sends the API key.

## Architecture

```
Frontend (src/lib/helius.ts)
  → fetch('/api/v1/helius/rpc', { method: 'POST', body: JSON-RPC })
  → fetch('/api/v1/helius/enhanced-transactions', { method: 'POST', body: { address, params } })
      ↓
  Vite dev proxy (/api → localhost:3001)
      ↓
  Backend (server/routes/helius.ts)
  → reads api_key from settings table
  → forwards request to Helius with ?api-key=... injected
  → returns response as-is (status code + body passthrough)
```

## Proxy Endpoints

### `POST /api/v1/helius/rpc`

Proxies all JSON-RPC requests — both standard Solana RPC and Helius DAS API methods.

**Request**: Raw JSON-RPC body (forwarded as-is)
```json
{ "jsonrpc": "2.0", "id": 1, "method": "getAssetsByOwner", "params": { ... } }
```

**Upstream**: `https://mainnet.helius-rpc.com/?api-key={key}`

**Response**: Passthrough (status code + body from Helius). 429 responses are preserved so the frontend rate limiter can handle retries.

**Used by** (in `src/lib/helius.ts`):
- `rpc<T>(method, params)` — generic JSON-RPC helper (getSlot, getBlockTime, getBalance, getProgramAccounts, getInflationReward, getEpochInfo, getEpochSchedule, getAccountInfo)
- `getAssetsByOwner()` — DAS API, paginated
- `prefetchTokenMeta()` — DAS `getAssetBatch`

### `POST /api/v1/helius/enhanced-transactions`

Proxies Helius Enhanced Transaction History API.

**Request**:
```json
{
  "address": "5UcncQ7...",
  "params": {
    "limit": "100",
    "token-accounts": "balanceChanged",
    "before-signature": "...",
    "after-signature": "..."
  }
}
```

**Upstream**: `https://api-mainnet.helius-rpc.com/v0/addresses/{address}/transactions?api-key={key}&{params}`

**Response**: Passthrough — `HeliusWalletHistoryTx[]` JSON array.

**Used by**: `getWalletHistory()` in `src/lib/helius.ts`

## API Key Resolution

Both endpoints call `getApiKey()` which reads from the `settings` table:
```sql
SELECT api_key FROM settings LIMIT 1
```
Throws if no key is configured. The key is read on every request (no caching) to pick up changes immediately after the user updates settings.

## Frontend Constants

In `src/lib/helius.ts`:
```typescript
const PROXY_RPC_URL = '/api/v1/helius/rpc';
// Enhanced transactions uses '/api/v1/helius/enhanced-transactions' directly
```

The old `_apiKey`, `setApiKey()`, `getApiKey()`, and `dasUrl()` functions have been removed. `AppContext.tsx` no longer calls `setApiKey()` on load or settings change.

## Rate Limiting

Rate limiting remains entirely in the frontend (`src/lib/helius.ts`):
- Sliding window: max 5 requests per second
- Concurrency cap: 3 in-flight requests
- Retry: up to 4 retries with exponential backoff on 429 responses

The backend proxy preserves the upstream HTTP status code, so 429 responses flow through to the frontend retry logic unchanged.

## What Changed vs. Direct Helius Calls

| Before | After |
|--------|-------|
| `_apiKey` module variable, set via `setApiKey()` | No API key in frontend |
| `dasUrl()` → `https://mainnet.helius-rpc.com/?api-key=...` | `PROXY_RPC_URL` → `/api/v1/helius/rpc` |
| `getWalletHistory()` GET to `https://api-mainnet.helius-rpc.com/v0/...?api-key=...` | POST to `/api/v1/helius/enhanced-transactions` with `{ address, params }` body |
| `AppContext` calls `setApiKey(s.apiKey)` on load and settings update | No `setApiKey` calls needed |

## Adding New Helius Endpoints

If a new Helius API is needed that doesn't fit JSON-RPC or Enhanced Transactions:

1. Add a new `app.post('/helius/...')` handler in `server/routes/helius.ts`
2. Follow the same pattern: read API key from DB, forward request, passthrough response
3. Update the frontend to POST to the new proxy path
4. The route is automatically available under `/api/v1/helius/...` (already mounted)
