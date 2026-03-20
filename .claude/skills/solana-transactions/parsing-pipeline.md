# Transaction Parsing Pipeline

## Overview

Raw Helius API responses (`HeliusWalletHistoryTx`) are transformed into our internal `ParsedTransaction` type by `parseWalletHistoryTx()` in `src/lib/taxCategorizer.ts`. This document explains every step.

## Step 1: Extract Balance Changes

`parseWalletHistoryTx(tx, walletAddress?)` iterates over `tx.accountData[]`:

### SOL changes
For each `accountData` entry where `entry.account === walletAddress`:
- If `entry.nativeBalanceChange !== 0`, push a `BalanceChange` with `mint: 'SOL'`, amount in SOL (divided by 1e9)

### Token changes
For each `tokenBalanceChanges` entry where `tbc.userAccount === walletAddress`:
- Convert `rawTokenAmount.tokenAmount` (signed string) to a number, divide by `10^decimals`
- Skip dust amounts (`< 1e-12`)
- Push a `BalanceChange` with the token `mint`, converted amount, and decimals

### Without walletAddress (legacy fallback)
If no wallet address is provided, ALL accounts' changes are collected — this causes problems with swaps as intermediary pool changes get included.

## Step 2: Interpret Transaction (interpretTransaction)

Takes the raw `balanceChanges[]` and produces an `InterpretedFlow`:

### Rent detection
Before any merging, scans individual SOL entries against known rent amounts:
- **0.00203928 SOL** — Token Storage Deposit (refundable)
- **0.101844 SOL** — DEX Market Deposit (refundable)
- **0.001002 SOL** — Account Setup (non-refundable)

Tolerance: ±0.000001 SOL. Matched entries become `rentItems[]`.

### Mint merging
Groups by mint, summing amounts. All SOL-like mints are unified:
- `'SOL'` (our internal label)
- `So11111111111111111111111111111111111111111` (native SOL mint)
- `So11111111111111111111111111111111111111112` (WSOL mint)

All three merge under `'SOL'`.

### Dust filtering
Entries with `|amount| < 1e-9` are dropped (sub-lamport dust from floating-point accumulation).

### Result
`InterpretedFlow { netChanges: BalanceChange[], rentItems: RentItem[] }`

## Step 3: Tax Categorization (categorize)

Uses `interpretedFlow.netChanges` (NOT raw balance changes) to determine `TaxCategory`:

```
Inputs: netChanges after merging SOL/WSOL and dropping dust

1. Separate into `tokens` (non-SOL mints) and `sol` (SOL entries)
2. Check for TRADE:
   a. If ≥2 unique token mints AND both inflows and outflows → TRADE
   b. If SOL + tokens, and (SOL out + token in) or (SOL in + token out) → TRADE
3. If only token outflows → TRANSFER_OUT
4. If only token inflows → TRANSFER_IN
5. If only SOL changes: net > 0 → TRANSFER_IN, net < 0 → TRANSFER_OUT
6. If no changes at all → FEE (only the tx fee was paid)
7. Otherwise → OTHER
```

### Helius type override (HELIUS_TYPE_CATEGORY)
After `categorize()`, if `tx.type` maps to a known category in `HELIUS_TYPE_CATEGORY`, that category wins:

| Helius type | Mapped category |
|---|---|
| `SWAP` | `TRADE` |
| `TOKEN_MINT` | `TRADE` |
| `BURN` | `TRADE` |
| `OPEN_POSITION` | `TRADE` |
| `WITHDRAW` | `TRANSFER_IN` |
| `WITHDRAW_UNSTAKED_DEPOSITS` | `TRANSFER_IN` |
| `STAKE_SOL` | `STAKE_DELEGATE` |
| `UNSTAKE_SOL` | `STAKE_WITHDRAW` |
| `HARVEST_REWARD` | `STAKE_WITHDRAW` |
| `INITIALIZE_ACCOUNT` | `FEE` |
| `CONSUME_EVENTS` | `FEE` |

`TRANSFER` is intentionally absent from the map — its direction (IN vs OUT) must be resolved via balance changes, not from the Helius type alone.

### Seeker (SKR) staking override
After the Helius type override, checks `tx.tokenTransfers` for SKR token transfers involving the Seeker staking config (`4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw`):
- `toUserAccount === config` → override to `STAKE_DELEGATE`
- `fromUserAccount === config` → override to `STAKE_WITHDRAW`

## Step 4: Counterparty Detection

For `TRANSFER_IN` / `TRANSFER_OUT` transactions:

1. Check `tx.tokenTransfers` for a transfer where one side is the wallet — the other side is the counterparty
2. If no token transfer match, check `tx.nativeTransfers` similarly
3. Excludes the Seeker staking config as a counterparty

## Step 5: Build ParsedTransaction

```typescript
{
  signature: tx.signature,
  blockTime: tx.timestamp ?? 0,
  slot: tx.slot,
  fee: tx.fee,                    // lamports
  taxCategory,                    // from categorize() + overrides
  heliusType: tx.type ?? null,    // Helius's own classification (informational)
  description: tx.description ?? null,  // Helius's human-readable description
  balanceChanges,                 // raw (pre-interpretation) changes
  err: tx.transactionError ? JSON.stringify(...) : null,
  counterparty,
  interpretedFlow,                // derived, NOT stored in DB — recomputed on load
}
```

## Synthetic Transactions

### Staking rewards
`stakingRewardsToTransactions(rewards[])` creates synthetic `ParsedTransaction[]`:
- `signature`: `epoch-{N}-{pubkey}` (stable, deterministic)
- `slot: 0` — marker for synthetic transactions (no solscan link, no fee display)
- `fee: 0`
- `taxCategory: 'STAKING_REWARD'`
- `heliusType: 'INFLATION_REWARD'`
- `balanceChanges`: single SOL entry for the reward amount

## Display Helpers (`src/lib/txSummary.ts`)

The primary display layer used by TransactionsPage and GroupsPage.

### resolveSymbol(mint, tokenMetas)
Returns human-readable symbol: SOL for any SOL-like mint, otherwise looks up `tokenMetas` map, falls back to `mint.slice(0,6)…`.

### formatAmount(bc, tokenMetas)
Formats a single `BalanceChange` as `"+1,234.56 SOL"` or `"-0.5 USDC"`.

### summarizeChanges(changes, tokenMetas)
Joins multiple `BalanceChange[]` via `formatAmount`, comma-separated. Returns `"—"` for empty.

### summarizeSwap(changes, tokenMetas)
For TRADE transactions: `"1,234 SOL → 500 USDC"`. Falls back to `summarizeChanges` if no clear in/out split.

### summarizeTx(tx, tokenMetas, walletAddress, walletOnly)
Main entry point for transaction display. Uses `tx.interpretedFlow.netChanges`, calls `summarizeSwap` for TRADEs, `summarizeChanges` otherwise. Appends counterparty label (`From: xxxx…yyyy` / `To: xxxx…yyyy`) for transfers.

## Group Aggregation (`src/lib/groupSummary.ts`)

### aggregateBalances(members)
Takes `GroupMember[]`, runs `interpretTransaction` on each member's `balanceChanges`, accumulates per-mint inflow/outflow totals. Returns `TokenTotals[]` sorted by magnitude.

## USD Valuation (`src/lib/groups.ts`)

### computeUsdValues(transactions)
Fetches historical prices for all mints at each transaction's `blockTime`, computes USD inflow/outflow per transaction. Returns `GroupMemberInput[]` with `usdInflow`, `usdOutflow`, `priceFetched`.

## Common Pitfalls

### WSOL double-counting
DEX swaps wrap SOL → WSOL → swap → unwrap. Without merging SOL + WSOL, you see offsetting entries that confuse categorization. The `isSolMint()` check and merging under `'SOL'` handles this.

### Intermediary account pollution
If you don't filter `accountData` to wallet-owned accounts only, DEX pool balance changes appear in the result, often zeroing out the actual economic impact. Always filter by `walletAddress`.

### Fee included in nativeBalanceChange
The fee payer's `nativeBalanceChange` includes the transaction fee. For display purposes, this means the SOL change already accounts for the fee — don't subtract it again.

### Failed transactions
`tx.transactionError` is non-null for failed transactions. They still have a fee charged. The `err` field stores the stringified error. Failed transactions are stored but `snapshotEngine` excludes them (`err === null` filter).

### Zero-amount token changes
Helius sometimes returns token balance changes with `tokenAmount: "0"`. The parser skips these (`< 1e-12`).
