import type { WalletType } from '../types/wallet';
import type { TransactionHookResult } from '../types/transactionHook';
import { useSolanaTransactions } from './useSolanaTransactions';
import { useBitvavoTransactions } from './useBitvavoTransactions';

export function useWalletTransactions(
  address: string | null,
  walletType: WalletType | undefined,
): TransactionHookResult {
  const solana = useSolanaTransactions(walletType === 'bitvavo' ? null : address);
  const bitvavo = useBitvavoTransactions(walletType === 'bitvavo' ? address : null);
  return walletType === 'bitvavo' ? bitvavo : solana;
}
