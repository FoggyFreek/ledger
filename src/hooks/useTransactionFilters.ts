import { useMemo, useState } from 'react';
import type { ParsedTransaction, TaxCategory } from '../types/transaction';
import type { TokenMeta } from '../lib/helius';
import { isSolMint } from '../lib/taxCategorizer';

const PAGE_SIZE = 50;

export function useTransactionFilters(allTxns: ParsedTransaction[], tokenMetas: Map<string, TokenMeta>, isBitvavo: boolean) {
  const [filterCategory, setFilterCategory] = useState<TaxCategory | 'ALL'>('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterToken, setFilterToken] = useState('');
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE'>('ALL');
  const [filterAmountFrom, setFilterAmountFrom] = useState('');
  const [filterAmountTo, setFilterAmountTo] = useState('');
  const [walletOnly, setWalletOnly] = useState(true);
  const [hideDust, setHideDust] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => allTxns.filter(tx => {
    if (hideDust && tx.balanceChanges.length > 0 && tx.balanceChanges.every(bc => Math.abs(bc.amount) <= 0.000000001)) return false;
    if (filterCategory !== 'ALL' && tx.taxCategory !== filterCategory) return false;
    if (filterDateFrom && tx.blockTime < new Date(filterDateFrom).getTime() / 1000) return false;
    if (filterDateTo && tx.blockTime > new Date(filterDateTo).getTime() / 1000 + 86400) return false;
    if (filterToken || filterDirection !== 'ALL' || filterAmountFrom !== '' || filterAmountTo !== '') {
      const q = filterToken.toLowerCase();
      const amtFrom = filterAmountFrom !== '' ? parseFloat(filterAmountFrom) : null;
      const amtTo = filterAmountTo !== '' ? parseFloat(filterAmountTo) : null;
      const matchesToken = (bc: { mint: string }) => {
        if (!filterToken) return true;
        if (isBitvavo) return bc.mint.toLowerCase().includes(q);
        if (isSolMint(bc.mint)) return 'sol'.includes(q) || 'solana'.includes(q);
        const meta = tokenMetas.get(bc.mint);
        return (meta?.symbol?.toLowerCase().includes(q) ?? false)
          || (meta?.name?.toLowerCase().includes(q) ?? false)
          || bc.mint.toLowerCase().startsWith(q);
      };
      const matchesDirection = (bc: { amount: number }) => {
        if (filterDirection === 'POSITIVE') return bc.amount > 0;
        if (filterDirection === 'NEGATIVE') return bc.amount < 0;
        return true;
      };
      const matchesAmount = (bc: { amount: number }) => {
        const abs = Math.abs(bc.amount);
        if (amtFrom !== null && abs < amtFrom) return false;
        if (amtTo !== null && abs > amtTo) return false;
        return true;
      };
      if (!tx.balanceChanges.some(bc => matchesToken(bc) && matchesDirection(bc) && matchesAmount(bc))) return false;
    }
    return true;
  }), [allTxns, hideDust, filterCategory, filterDateFrom, filterDateTo, filterToken, filterDirection, filterAmountFrom, filterAmountTo, tokenMetas, isBitvavo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return {
    filtered,
    paginated,
    page: safePage,
    setPage,
    totalPages,
    walletOnly,
    showFilters,
    setShowFilters,
    filterProps: {
      filterCategory, setFilterCategory,
      filterToken, setFilterToken,
      filterDirection, setFilterDirection,
      filterAmountFrom, setFilterAmountFrom,
      filterAmountTo, setFilterAmountTo,
      filterDateFrom, setFilterDateFrom,
      filterDateTo, setFilterDateTo,
      walletOnly, setWalletOnly,
      hideDust, setHideDust,
      setPage,
    },
  };
}
