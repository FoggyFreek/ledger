export interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number; // lamports
}

export interface HeliusTokenTransfer {
  mint: string;
  tokenStandard: string;
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  tokenAmount: number;
}

// v0 Enhanced Transactions API
export interface HeliusTokenBalanceChange {
  userAccount: string;
  tokenAccount: string;
  mint: string;
  rawTokenAmount: {
    tokenAmount: string;  // signed, raw units (e.g. "-1000000")
    decimals: number;
  };
}

export interface HeliusAccountData {
  account: string;
  nativeBalanceChange: number;  // lamports, signed
  tokenBalanceChanges: HeliusTokenBalanceChange[];
}

export interface HeliusWalletHistoryTx {
  signature: string;
  timestamp: number | null;
  slot: number;
  fee: number;
  feePayer: string;
  type: string | null;
  description: string | null;
  transactionError: Record<string, unknown> | null;
  nativeTransfers: HeliusNativeTransfer[];
  tokenTransfers: HeliusTokenTransfer[];
  accountData: HeliusAccountData[];
}

export interface HeliusDasPriceInfo {
  price_per_token: number;
  currency: string;
}

export interface HeliusDasTokenInfo {
  balance: string;
  decimals: number;
  symbol: string;
  price_info?: HeliusDasPriceInfo;
}

export interface HeliusDasAsset {
  id: string;
  content: {
    metadata: { name: string; symbol: string };
    links?: { image?: string };
  };
  token_info?: HeliusDasTokenInfo;
  interface?: string;
}

export interface HeliusDasResponse {
  result: {
    items: HeliusDasAsset[];
    total: number;
    page: number;
    nativeBalance?: { lamports: number; price_per_sol?: number };
  };
}
