# Helius Enhanced Transactions API Reference

## Endpoint

**GET** `/v0/addresses/{address}/transactions?api-key={key}`

Returns enhanced (human-readable, decoded) transaction history for a Solana address.

## Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `before-signature` | string | — | Paginate backward from this signature |
| `after-signature` | string | — | Paginate forward from this signature |
| `commitment` | string | `finalized` | `finalized` or `confirmed` |
| `sort-order` | string | `desc` | `asc` or `desc` |
| `limit` | number | — | 1–100 transactions per page |
| `type` | string | — | Filter by `TransactionType` |
| `source` | string | — | Filter by `TransactionSource` |
| `gt-slot` / `gte-slot` / `lt-slot` / `lte-slot` | number | — | Slot range filters |
| `gt-time` / `gte-time` / `lt-time` / `lte-time` | number | — | Unix timestamp range filters |

## Response: EnhancedTransaction[]

Each element in the response array:

```typescript
{
  signature: string;           // transaction signature
  slot: number;
  timestamp: number;           // Unix seconds
  fee: number;                 // in lamports
  feePayer: string;            // address that paid the fee
  type: TransactionType;       // e.g. "SWAP", "TRANSFER", "UNKNOWN"
  source: TransactionSource;   // e.g. "JUPITER", "RAYDIUM", "SYSTEM_PROGRAM"
  description: string;         // human-readable summary (Helius-generated)
  transactionError: { error: string } | null;
  nativeTransfers: NativeTransfer[];
  tokenTransfers: TokenTransfer[];
  accountData: AccountData[];
  instructions: Instruction[];
  events: { nft?, swap?, compressed?, setAuthority? };
}
```

### NativeTransfer
```typescript
{
  fromUserAccount: string;   // sender address
  toUserAccount: string;     // receiver address
  amount: number;            // in lamports (1 SOL = 1e9 lamports)
}
```

### TokenTransfer
```typescript
{
  mint: string;              // token mint address
  tokenStandard: string;     // "NonFungible", "Fungible", etc.
  fromUserAccount: string;   // sender wallet address
  toUserAccount: string;     // receiver wallet address
  fromTokenAccount: string;  // sender's associated token account
  toTokenAccount: string;    // receiver's associated token account
  tokenAmount: number;       // decimal-adjusted amount (positive)
}
```

### AccountData
```typescript
{
  account: string;           // account address
  nativeBalanceChange: number;  // SOL change in lamports, SIGNED (negative = spent)
  tokenBalanceChanges: TokenBalanceChange[];
}
```

### TokenBalanceChange
```typescript
{
  userAccount: string;       // wallet that owns the token account
  tokenAccount: string;      // the token account address
  mint: string;              // token mint
  rawTokenAmount: {
    tokenAmount: string;     // SIGNED string in raw units (e.g. "-1000000")
    decimals: number;        // e.g. 6 for USDC, 9 for SOL
  };
}
```

## Important Nuances

### accountData vs tokenTransfers vs nativeTransfers
- **`accountData`** is the ground truth for balance changes. It shows the exact signed delta for every account touched by the transaction. This is what `parseWalletHistoryTx` uses for `balanceChanges`.
- **`tokenTransfers`** is a higher-level interpretation showing token movements between wallets. It includes `mint`, directional accounts, and decimal-adjusted amounts. Useful for identifying counterparties, but does NOT include intermediary routing hops.
- **`nativeTransfers`** is the SOL-specific equivalent of `tokenTransfers` — directional SOL movements. Amount in lamports.

### nativeBalanceChange includes fees
The `nativeBalanceChange` on the fee payer's `accountData` entry includes the transaction fee. For a swap where you spend 1 SOL + 0.000005 SOL fee, the native balance change is -1.000005 SOL worth of lamports.

### tokenAmount is SIGNED
`rawTokenAmount.tokenAmount` is a signed string: negative means tokens left, positive means tokens arrived. This is crucial for computing balance deltas.

### Multiple accountData entries per transaction
A transaction touches many accounts. The `accountData` array has one entry per account. To find the wallet's own changes, filter by `entry.account === walletAddress` for SOL and `tbc.userAccount === walletAddress` for tokens.

### WSOL wrapping noise
Swaps on DEXes involve wrapping SOL to WSOL and back. This creates offsetting balance changes:
- Native SOL goes down (sent to WSOL account)
- WSOL balance goes up (wrapped)
- WSOL balance goes down (sent to DEX)
- Native SOL goes up (unwrapped remainder)

The `interpretTransaction()` function handles this by merging all SOL-like mints (`SOL`, `So11...111`, `So11...112`) under a single `'SOL'` key and dropping zero-sum results.

### Intermediary accounts
DEX swaps route through pool accounts, creating balance changes on accounts the user doesn't own. `parseWalletHistoryTx` filters to `entry.account === walletAddress` / `tbc.userAccount === walletAddress` to avoid these polluting the result.

## TransactionType Values (common ones)

| Type | Meaning |
|------|---------|
| `UNKNOWN` | Could not be classified |
| `TRANSFER` | Simple SOL or token transfer |
| `SWAP` | Token swap (DEX) |
| `TOKEN_MINT` | New token minting |
| `BURN` | Token burn |
| `COMPRESSED_NFT_MINT` | cNFT minting |
| `COMPRESSED_NFT_TRANSFER` | cNFT transfer |
| `NFT_SALE` | NFT marketplace sale |
| `NFT_LISTING` | NFT listed for sale |
| `NFT_BID` | Bid placed on NFT |
| `STAKE_SOL` | Native staking |
| `UNSTAKE_SOL` | Native unstaking |

There are 598 possible values total. The `type` field from Helius is stored as `heliusType` in our `ParsedTransaction` but is **not** used for tax categorization — we compute `taxCategory` independently from balance changes.

## TransactionSource Values (common ones)

| Source | Meaning |
|--------|---------|
| `SYSTEM_PROGRAM` | Native SOL operations |
| `STAKE_PROGRAM` | Staking operations |
| `JUPITER` | Jupiter aggregator swaps |
| `RAYDIUM` | Raydium AMM |
| `ORCA` | Orca AMM |
| `MAGIC_EDEN` | Magic Eden marketplace |
| `TENSOR` | Tensor marketplace |
| `PHANTOM` | Phantom wallet operations |
| `UNKNOWN` | Unidentified source |

118 possible values total.

## Pagination

- Use `before-signature` to paginate backward (older transactions)
- Use `after-signature` to paginate forward (newer transactions)
- When a page returns fewer than `limit` results, you've reached the end of history
- Our app tracks this via `transactions_meta.complete = true`
