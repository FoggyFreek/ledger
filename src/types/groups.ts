import type { BalanceChange, ParsedTransaction } from './transaction';

export interface TransactionGroup {
  id: number;
  name: string;
  createdAt: number;
  txCount: number;
}

export interface GroupMember {
  signature: string;
  blockTime: number;
  slot: number;
  fee: number;
  taxCategory: string;
  balanceChanges: BalanceChange[];
  err: string | null;
  counterparty: string | null;
  usdInflow: number | null;
  usdOutflow: number | null;
  priceFetched: boolean;
  addedAt: number;
}

export interface GroupMemberInput {
  signature: string;
  usdInflow: number | null;
  usdOutflow: number | null;
  priceFetched: boolean;
}

export type GroupMemberships = Record<string, { id: number; name: string }[]>;

export interface TimelineGroup {
  id: number;
  name: string;
  walletAddress: string;
  walletLabel: string;
  transactions: ParsedTransaction[];
}
