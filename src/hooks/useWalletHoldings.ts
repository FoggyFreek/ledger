import type { WalletType } from '../types/wallet';
import type { HoldingsHookResult } from '../types/holdingsHook';
import { useHoldings } from './useHoldings';
import { useBitvavoHoldings } from './useBitvavoHoldings';

export function useWalletHoldings(
  address: string | null,
  walletType: WalletType | undefined,
): HoldingsHookResult {
  const solana = useHoldings(walletType === 'bitvavo' ? null : address);
  const bitvavo = useBitvavoHoldings(walletType === 'bitvavo' ? address : null);
  return walletType === 'bitvavo' ? bitvavo : solana;
}
