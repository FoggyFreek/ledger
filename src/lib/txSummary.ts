import React from 'react';
import { isSolMint } from './taxCategorizer';
import type { TokenMeta } from './helius';
import type { BalanceChange, ParsedTransaction } from '../types/transaction';

export function resolveSymbol(mint: string, tokenMetas: Map<string, TokenMeta>): string {
  if (isSolMint(mint)) return 'SOL';
  return tokenMetas.get(mint)?.symbol ?? mint.slice(0, 6) + '…';
}

export function formatAmount(bc: BalanceChange, tokenMetas: Map<string, TokenMeta>): string {
  const symbol = resolveSymbol(bc.mint, tokenMetas);
  const sign = bc.amount > 0 ? '+' : '-';
  const amount = Math.abs(bc.amount).toLocaleString(undefined, { maximumFractionDigits: 6 });
  return `${sign}${amount} ${symbol}`;
}

export function summarizeChanges(changes: BalanceChange[], tokenMetas: Map<string, TokenMeta>): string {
  if (changes.length === 0) return '—';
  return changes.map(bc => formatAmount(bc, tokenMetas)).join(', ');
}

export function summarizeSwap(changes: BalanceChange[], tokenMetas: Map<string, TokenMeta>): string {
  const sold = changes.filter(bc => bc.amount < 0);
  const bought = changes.filter(bc => bc.amount > 0);
  if (sold.length === 0 || bought.length === 0) return summarizeChanges(changes, tokenMetas);
  const sellStr = sold
    .map(bc => `${Math.abs(bc.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${resolveSymbol(bc.mint, tokenMetas)}`)
    .join(' + ');
  const buyStr = bought
    .map(bc => `${bc.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${resolveSymbol(bc.mint, tokenMetas)}`)
    .join(' + ');
  return `${sellStr} → ${buyStr}`;
}

export function summarizeTx(
  tx: ParsedTransaction,
  tokenMetas: Map<string, TokenMeta>,
  walletAddress: string | null,
  walletOnly: boolean,
): React.ReactNode {
  const changes = walletOnly
    ? tx.interpretedFlow.netChanges.filter(bc => !bc.userAccount || bc.userAccount === walletAddress)
    : tx.interpretedFlow.netChanges;
  const summary = tx.taxCategory === 'TRADE'
    ? summarizeSwap(changes, tokenMetas)
    : summarizeChanges(changes, tokenMetas);
  if (tx.counterparty && (tx.taxCategory === 'TRANSFER_IN' || tx.taxCategory === 'TRANSFER_OUT')) {
    const label = tx.taxCategory === 'TRANSFER_IN' ? 'From' : 'To';
    const short = `${tx.counterparty.slice(0, 4)}…${tx.counterparty.slice(-4)}`;
    return React.createElement(
      'span',
      null,
      summary,
      React.createElement('span', { className: 'ml-2 text-gray-500' }, `${label}: ${short}`),
    );
  }
  return summary;
}
