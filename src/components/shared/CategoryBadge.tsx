import type { TaxCategory } from '../../types/transaction';

const STYLES: Record<TaxCategory, string> = {
  TRADE: 'bg-blue-900 text-blue-200',
  TRANSFER_IN: 'bg-green-900 text-green-200',
  TRANSFER_OUT: 'bg-orange-900 text-orange-200',
  STAKING_REWARD: 'bg-purple-900 text-purple-200',
  NFT_SALE: 'bg-pink-900 text-pink-200',
  NFT_BUY: 'bg-fuchsia-900 text-fuchsia-200',
  AIRDROP: 'bg-yellow-900 text-yellow-200',
  BURN: 'bg-red-900 text-red-200',
  FEE: 'bg-gray-800 text-gray-400',
  OTHER: 'bg-gray-800 text-gray-400',
  STAKE_DELEGATE: 'bg-indigo-900 text-indigo-200',
  STAKE_DEACTIVATE: 'bg-slate-800 text-slate-300',
  STAKE_WITHDRAW: 'bg-teal-900 text-teal-200',
};

const LABELS: Record<TaxCategory, string> = {
  TRADE: 'Trade',
  TRANSFER_IN: 'Transfer In',
  TRANSFER_OUT: 'Transfer Out',
  STAKING_REWARD: 'Staking',
  NFT_SALE: 'NFT Sale',
  NFT_BUY: 'NFT Buy',
  AIRDROP: 'Airdrop',
  BURN: 'Burn',
  FEE: 'Fee',
  OTHER: 'Other',
  STAKE_DELEGATE: 'Stake',
  STAKE_DEACTIVATE: 'Unstake',
  STAKE_WITHDRAW: 'Withdraw',
};

export function CategoryBadge({ category }: { category: TaxCategory }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STYLES[category]}`}>
      {LABELS[category]}
    </span>
  );
}

export { LABELS as CATEGORY_LABELS };
