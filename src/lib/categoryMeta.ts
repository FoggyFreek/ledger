import type { TaxCategory } from '../types/transaction';

export const ALL_CATEGORIES: TaxCategory[] = [
  'TRADE', 'TRANSFER_IN', 'TRANSFER_OUT', 'STAKING_REWARD',
  'NFT_SALE', 'NFT_BUY', 'AIRDROP', 'BURN', 'FEE', 'OTHER',
  'STAKE_DELEGATE', 'STAKE_DEACTIVATE', 'STAKE_WITHDRAW',
];

export const CATEGORY_LABEL: Record<TaxCategory, string> = {
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

/** Short labels for compact UI (timeline chips, etc.) */
export const CATEGORY_SHORT_LABEL: Record<TaxCategory, string> = {
  TRADE: 'Trade',
  TRANSFER_IN: 'In',
  TRANSFER_OUT: 'Out',
  STAKING_REWARD: 'Staking',
  NFT_SALE: 'NFT Sale',
  NFT_BUY: 'NFT Buy',
  AIRDROP: 'Airdrop',
  BURN: 'Burn',
  FEE: 'Fee',
  OTHER: 'Other',
  STAKE_DELEGATE: 'Delegate',
  STAKE_DEACTIVATE: 'Deactivate',
  STAKE_WITHDRAW: 'Withdraw',
};

/** Hex colours per category — used for canvas rendering and inline styles */
export const CATEGORY_COLOR: Record<TaxCategory, string> = {
  TRADE: '#3b82f6',
  TRANSFER_IN: '#22c55e',
  TRANSFER_OUT: '#f97316',
  STAKING_REWARD: '#a855f7',
  NFT_SALE: '#ec4899',
  NFT_BUY: '#d946ef',
  AIRDROP: '#eab308',
  BURN: '#ef4444',
  FEE: '#4b5563',
  OTHER: '#4b5563',
  STAKE_DELEGATE: '#6366f1',
  STAKE_DEACTIVATE: '#94a3b8',
  STAKE_WITHDRAW: '#14b8a6',
};

/** Tailwind class pairs for CategoryBadge */
export const CATEGORY_BADGE_STYLE: Record<TaxCategory, string> = {
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
