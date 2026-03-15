export interface BitvavoBalance {
  symbol: string;
  available: string;
  inOrder: string;
}

export interface BitvavoError {
  error: string;
}

export interface BitvavoHistoryResult {
  items: BitvavoHistoryEntry[];
  currentPage: number;
  totalPages: number;
  maxItems: number;
}

export interface BitvavoHistoryEntry {
  transactionId: string;
  executedAt: string; //Unix timestamp YYYY-MM-DDTHH:mm:ss.sssZ
  type: string; // [sell, buy, staking, fixed_staking, deposit, withdrawal, affiliate, distribution, internal_transfer, withdrawal_cancelled, rebate, loan, external_transferred_funds, manually_assigned, manually_assigned_bitvavo]
  priceCurrency: string; // EUR
  priceAmount: string; 
  sentCurrency: string;
  sentAmount: string;
  receivedCurrency: string; // SOL, BTC, etc.
  receivedAmount: string;
  feesCurrency: string;
  feesAmount: string;
  address: string;
}

export interface BitvavoTransferEntry {
  timestamp: number;
  symbol: string;
  amount: string;
  address: string;
  paymentId?: string;
  txId?: string;
  fee: string;
  status: string;
}

export interface AccountHistoryParams {
  fromDate?: number;
  toDate?: number;
  page?: number;
  maxItems?: number;
  type?: string;
}

export interface TransferHistoryParams {
  symbol?: string;
  limit?: number;
  start?: number;
  end?: number;
}

async function fetchProxy<T>(endpoint: string, params?: object): Promise<T> {
  const url = new URL(`/api/v1${endpoint}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params) as [string, string | number | boolean | undefined][]) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const error = (await res.json()) as BitvavoError;
    throw new Error(`Bitvavo request failed: ${error.error}`);
  }
  return res.json() as Promise<T>;
}

export async function getAccountBalance(): Promise<BitvavoBalance[]> {
  return fetchProxy<BitvavoBalance[]>('/bitvavo/balance');
}

export async function getAssetBalance(symbol: string): Promise<BitvavoBalance | null> {
  const balances = await getAccountBalance();
  return balances.find((b) => b.symbol.toUpperCase() === symbol.toUpperCase()) || null;
}

export async function getAccountHistory(params?: AccountHistoryParams): Promise<BitvavoHistoryResult> {
  return fetchProxy<BitvavoHistoryResult>('/bitvavo/account/history', params);
}

export async function getWithdrawalHistory(params?: TransferHistoryParams): Promise<BitvavoTransferEntry[]> {
  return fetchProxy<BitvavoTransferEntry[]>('/bitvavo/withdrawalHistory', params);
}

export async function getDepositHistory(params?: TransferHistoryParams): Promise<BitvavoTransferEntry[]> {
  return fetchProxy<BitvavoTransferEntry[]>('/bitvavo/depositHistory', params);
}

export async function getBitvavoStatus(): Promise<{ configured: boolean }> {
  return fetchProxy<{ configured: boolean }>('/bitvavo/status');
}
