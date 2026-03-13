export type TaxCategory =
  | 'TRADE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'STAKING_REWARD'
  | 'NFT_SALE'
  | 'NFT_BUY'
  | 'AIRDROP'
  | 'BURN'
  | 'FEE'
  | 'OTHER'
  | 'STAKE_DELEGATE'
  | 'STAKE_DEACTIVATE'
  | 'STAKE_WITHDRAW';

export interface BalanceChange {
  mint: string;    // token mint address, or 'SOL' for native SOL
  amount: number;  // signed, decimal-adjusted (positive = received, negative = sent)
  decimals: number;
  userAccount?: string; // wallet address that owns this change (undefined = unknown/other account)
  isStakingReward?: boolean; // true for synthetic staking reward entries — skip fee heuristics
}

export interface RentItem {
  amount: number;      // signed — negative = paid, positive = refunded
  label: string;       // e.g. 'Token Storage Deposit'
  refundable: boolean;
}

export interface InterpretedFlow {
  /**
   * Net economic impact on the wallet.
   * - Same-mint entries are summed into one.
   * - Native SOL + WSOL are unified under the 'SOL' key.
   * - Zero-sum pairs (wrap/unwrap noise) are dropped (|amount| < 1e-9).
   */
  netChanges: BalanceChange[];

  /** SOL amounts matching known Solana system values, detected before merging. */
  rentItems: RentItem[];
}

export interface ParsedTransaction {
  signature: string;
  blockTime: number;
  slot: number;
  fee: number;           // in lamports
  taxCategory: TaxCategory;
  heliusType: string | null;   // always null with v1 API
  description: string | null;  // always null with v1 API
  balanceChanges: BalanceChange[];
  err: string | null;
  counterparty: string | null;
  interpretedFlow: InterpretedFlow; // derived — NOT stored in DB
}
