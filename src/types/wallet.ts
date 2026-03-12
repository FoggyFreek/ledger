export interface WalletEntry {
  address: string;
  label: string;
  addedAt: number;
  lastRefreshed: number | null;
}

export interface TokenHolding {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  rawAmount: string;
  uiAmount: number;
  usdValue: number | null;
  logoUri: string | null;
}

export interface WalletHoldings {
  walletAddress: string;
  slot: number;
  fetchedAt: number;
  solBalance: number;
  solPrice: number | null;
  tokens: TokenHolding[];
}

export interface WalletSnapshot {
  id: string;
  walletAddress: string;
  label: string;
  targetDate: number;
  createdAt: number;
  slotApproximation: number;
  holdings: WalletHoldings;
  txCountIncluded: number;
}

export interface StakeAccount {
  pubkey: string;
  lamports: number;
  voter: string;
  activationEpoch: number;
  deactivationEpoch: number | null;
  status: 'active' | 'activating' | 'deactivating' | 'inactive';
}

export interface SeekerStakeAccount {
  pubkey: string;
  lamports: number;
  stakedRaw: bigint;       // shares × share_price / 1e9, in raw token units (÷ 1e6 = SKR)
  unstakingAmount: bigint; // raw token units (÷ 1e6 = SKR)
}

export interface StakingReward {
  epoch: number;
  amount: number;
  stakeAccount: string;
  postBalance: number;
  commission: number | null;
  estimatedTimestamp: number;
}
