import type { ParsedTransaction, TaxCategory } from './transaction';

export interface TransactionHookResult {
  transactions: ParsedTransaction[];
  loading: boolean;
  loadingAll: boolean;
  error: string | null;
  hasMore: boolean;
  isComplete: boolean;
  fetchNew: () => Promise<void>;
  fetchOlder: () => Promise<void>;
  fetchAllHistory: () => Promise<void>;
  cancelLoadAll: () => void;
  loadFromStorage: () => Promise<void>;
  resetAndReload: () => Promise<void>;
  updateCategory?: (signature: string, category: TaxCategory) => Promise<void>;
}
