---
name: solana-transactions
description: Knowledge base for Solana transaction interpretation. Use when working with the transaction system — parsing Helius Enhanced Transactions, understanding balance changes, tax categorization, the parseWalletHistoryTx pipeline, or debugging transaction display issues.
user-invocable: false
---

# Solana Transaction System Knowledge

This skill provides context for working with the transaction parsing and display pipeline in this project. See [helius-enhanced-tx-api.md](helius-enhanced-tx-api.md) for the full Helius API reference and [parsing-pipeline.md](parsing-pipeline.md) for how raw API data is transformed into our internal types.

## Quick Reference

### Data flow
```
Helius Enhanced Tx API (v0)
  → HeliusWalletHistoryTx (src/types/api.ts)
    → parseWalletHistoryTx() (src/lib/taxCategorizer.ts)
      → ParsedTransaction (src/types/transaction.ts)
        → stored in PostgreSQL `transactions` table
          → displayed in TransactionsPage / TaxSummaryPage
```

### Key files
- `src/types/api.ts` — Helius API response types (`HeliusWalletHistoryTx`, `HeliusAccountData`, etc.)
- `src/types/transaction.ts` — Internal types (`ParsedTransaction`, `BalanceChange`, `InterpretedFlow`, `TaxCategory`)
- `src/types/groups.ts` — Group types (`TransactionGroup`, `GroupMember`, `GroupMemberInput`, `GroupMemberships`)
- `src/lib/taxCategorizer.ts` — `parseWalletHistoryTx()`, `categorize()`, `interpretTransaction()`, `isSolMint()`, `stakingRewardsToTransactions()`
- `src/lib/txSummary.ts` — Display helpers: `resolveSymbol()`, `formatAmount()`, `summarizeChanges()`, `summarizeSwap()`, `summarizeTx()` — used by TransactionsPage and GroupsPage for rendering transaction summaries
- `src/lib/groupSummary.ts` — `aggregateBalances()` — aggregates balance changes across group members
- `src/lib/groups.ts` — `computeUsdValues()` — fetches historical prices and computes USD inflow/outflow per transaction
- `src/lib/helius.ts` — API client, fetches raw transactions from Helius
- `src/hooks/useTransactions.ts` — React hook managing fetch/cache lifecycle
- `src/lib/storage.ts` — PostgreSQL CRUD for transactions and groups
- `server/routes/transactions.ts` — Backend API routes for transactions
- `server/routes/groups.ts` — Backend API routes for transaction groups

### Tax categories (TaxCategory type)
`TRADE`, `TRANSFER_IN`, `TRANSFER_OUT`, `STAKING_REWARD`, `NFT_SALE`, `NFT_BUY`, `AIRDROP`, `BURN`, `FEE`, `OTHER`, `STAKE_DELEGATE`, `STAKE_DEACTIVATE`, `STAKE_WITHDRAW`
