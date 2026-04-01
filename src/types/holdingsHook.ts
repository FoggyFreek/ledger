import type { WalletHoldings } from './wallet';

export interface HoldingsHookResult {
  holdings: WalletHoldings | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
}
