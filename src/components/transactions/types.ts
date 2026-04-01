import type { ParsedTransaction } from '../../types/transaction';
import type { TransactionHookResult } from '../../types/transactionHook';
import type { TokenMeta } from '../../lib/helius';
import type { GroupMemberships } from '../../types/groups';

export interface TransactionsViewProps {
  transactions: ParsedTransaction[];
  allTxns: ParsedTransaction[];
  rewardTxnCount: number;
  tokenMetas: Map<string, TokenMeta>;
  memberships: GroupMemberships;
  hook: TransactionHookResult;
  activeAddress: string;
  onReset: () => void;
  onGroupSaved: (groupName: string, count: number) => void;
}
