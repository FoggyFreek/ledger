import type { ParsedTransaction, BalanceChange, TaxCategory } from '../types/transaction';
import type { WalletHoldings, TokenHolding } from '../types/wallet';
import type { BitvavoBalance, BitvavoHistoryEntry } from './bitvavo';
import { getAccountHistory } from './bitvavo';
import { interpretTransaction } from './taxCategorizer';
import { BITVAVO_ADDRESS } from './walletType';

export const BITVAVO_TOKEN_META: Record<string, { name: string; decimals: number }> = {
  EUR: { name: 'Euro', decimals: 2 },
  BTC: { name: 'Bitcoin', decimals: 8 },
  ETH: { name: 'Ethereum', decimals: 8 },
  SOL: { name: 'Solana', decimals: 9 },
  XRP: { name: 'XRP', decimals: 6 },
  ADA: { name: 'Cardano', decimals: 6 },
  DOT: { name: 'Polkadot', decimals: 10 },
  DOGE: { name: 'Dogecoin', decimals: 8 },
  AVAX: { name: 'Avalanche', decimals: 9 },
  LINK: { name: 'Chainlink', decimals: 8 },
  MATIC: { name: 'Polygon', decimals: 8 },
  UNI: { name: 'Uniswap', decimals: 8 },
  LTC: { name: 'Litecoin', decimals: 8 },
  ATOM: { name: 'Cosmos', decimals: 6 },
  ALGO: { name: 'Algorand', decimals: 6 },
  FTM: { name: 'Fantom', decimals: 8 },
  NEAR: { name: 'NEAR Protocol', decimals: 8 },
  APT: { name: 'Aptos', decimals: 8 },
  OP: { name: 'Optimism', decimals: 8 },
  ARB: { name: 'Arbitrum', decimals: 8 },
  SUI: { name: 'Sui', decimals: 8 },
};

function getTokenMeta(symbol: string): { name: string; decimals: number } {
  return BITVAVO_TOKEN_META[symbol] ?? { name: symbol, decimals: 8 };
}

function formatAmt(amount: number, symbol: string): string {
  return `${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}`;
}

function describeBitvavoEntry(type: string, taxCategory: TaxCategory, balanceChanges: BalanceChange[], address: string): string {
  if (taxCategory === 'TRADE') {
    const sold = balanceChanges.filter(bc => bc.amount < 0);
    const bought = balanceChanges.filter(bc => bc.amount > 0);
    const sellStr = sold.map(bc => formatAmt(bc.amount, bc.mint)).join(' + ');
    const buyStr = bought.map(bc => formatAmt(bc.amount, bc.mint)).join(' + ');
    return `${sellStr} → ${buyStr}`;
  }

  const changesStr = balanceChanges
    .map(bc => `${bc.amount > 0 ? '+' : '-'}${formatAmt(bc.amount, bc.mint)}`)
    .join(', ');

  if (address && (taxCategory === 'TRANSFER_IN' || taxCategory === 'TRANSFER_OUT')) {
    const label = taxCategory === 'TRANSFER_IN' ? 'From' : 'To';
    const short = address.length > 8 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
    return `${changesStr} ${label}: ${short}`;
  }

  return changesStr;
}

function bitvavoTaxCategory(type: string): TaxCategory {
  switch (type) {
    case 'buy':
    case 'sell':
      return 'TRADE';
    case 'staking':
    case 'fixed_staking':
      return 'STAKING_REWARD';
    case 'deposit':
    case 'external_transferred_funds':
      return 'TRANSFER_IN';
    case 'withdrawal':
      return 'TRANSFER_OUT';
    case 'affiliate':
    case 'distribution':
    case 'rebate':
      return 'AIRDROP';
    case 'internal_transfer':
    case 'withdrawal_cancelled':
    case 'loan':
    case 'manually_assigned':
    case 'manually_assigned_bitvavo':
    default:
      return 'OTHER';
  }
}

export function parseBitvavoTrade(entry: BitvavoHistoryEntry): ParsedTransaction {
  const blockTime = Math.floor(new Date(entry.executedAt).getTime() / 1000);
  const sentAmount = parseFloat(entry.sentAmount);
  const receivedAmount = parseFloat(entry.receivedAmount);
  const fee = parseFloat(entry.feesAmount);

  const balanceChanges: BalanceChange[] = [];

  if (entry.receivedCurrency && receivedAmount) {
    const receivedMeta = getTokenMeta(entry.receivedCurrency);
    balanceChanges.push({ mint: entry.receivedCurrency, amount: receivedAmount, decimals: receivedMeta.decimals });
  }

  const sentIdx = balanceChanges.length;
  if (entry.sentCurrency && sentAmount) {
    const sentMeta = getTokenMeta(entry.sentCurrency);
    balanceChanges.push({ mint: entry.sentCurrency, amount: -sentAmount, decimals: sentMeta.decimals });
  }

  if (fee > 0 && entry.feesCurrency) {
    if (entry.feesCurrency !== entry.sentCurrency) {
      // Fee in a different currency — separate balance change
      const feeMeta = getTokenMeta(entry.feesCurrency);
      balanceChanges.push({ mint: entry.feesCurrency, amount: -fee, decimals: feeMeta.decimals });
    } else if (entry.sentCurrency) {
      // Fee in same currency as sent — fold into the sent change
      balanceChanges[sentIdx].amount -= fee;
    }
  }

  const taxCategory = bitvavoTaxCategory(entry.type);
  const signature = `bitvavo-trade-${entry.transactionId}`;

  return {
    signature,
    blockTime,
    slot: 0,
    fee: 0,
    taxCategory,
    heliusType: null,
    description: describeBitvavoEntry(entry.type, taxCategory, balanceChanges, entry.address),
    balanceChanges,
    err: null,
    counterparty: null,
    interpretedFlow: interpretTransaction(balanceChanges),
  };
}

export function parseBitvavoBalances(balances: BitvavoBalance[]): WalletHoldings {
  const tokens: TokenHolding[] = [];

  for (const b of balances) {
    const uiAmount = parseFloat(b.available) + parseFloat(b.inOrder);
    if (uiAmount === 0) continue;
    const meta = getTokenMeta(b.symbol);
    tokens.push({
      mint: b.symbol,
      symbol: b.symbol,
      name: meta.name,
      decimals: meta.decimals,
      rawAmount: Math.round(uiAmount * Math.pow(10, meta.decimals)).toString(),
      uiAmount,
      usdValue: null,
      logoUri: null,
    });
  }

  return {
    walletAddress: BITVAVO_ADDRESS,
    slot: 0,
    fetchedAt: Date.now(),
    solBalance: 0,
    solPrice: null,
    tokens,
  };
}

export async function fetchBitvavoTransactionsForYear(year: number): Promise<ParsedTransaction[]> {
  const fromDate = new Date(year, 0, 1).getTime();
  const toDate = new Date(year + 1, 0, 1).getTime() - 1;

  const txns: ParsedTransaction[] = [];
  const seenSigs = new Set<string>();

  const first = await getAccountHistory({ fromDate, toDate, page: 1, maxItems: 100 });
  const pages = [first];
  for (let page = 2; page <= first.totalPages; page++) {
    pages.push(await getAccountHistory({ fromDate, toDate, page, maxItems: 100 }));
  }

  for (const history of pages) {
    for (const entry of history.items) {
      const tx = parseBitvavoTrade(entry);
      if (!seenSigs.has(tx.signature)) {
        seenSigs.add(tx.signature);
        txns.push(tx);
      }
    }
  }

  return txns;
}

export async function fetchCurrentYearBitvavoTransactions(): Promise<ParsedTransaction[]> {
  const txns = await fetchBitvavoTransactionsForYear(new Date().getFullYear());
  txns.sort((a, b) => b.blockTime - a.blockTime);
  return txns;
}

export async function fetchAllBitvavoTransactions(): Promise<ParsedTransaction[]> {
  const txns: ParsedTransaction[] = [];
  const seenSigs = new Set<string>();

  const first = await getAccountHistory({ page: 1, maxItems: 100 });
  const allPages = [first];

  for (let page = 2; page <= first.totalPages; page++) {
    allPages.push(await getAccountHistory({ page, maxItems: 100 }));
  }

  for (const history of allPages) {
    for (const entry of history.items) {
      const tx = parseBitvavoTrade(entry);
      if (!seenSigs.has(tx.signature)) {
        seenSigs.add(tx.signature);
        txns.push(tx);
      }
    }
  }

  txns.sort((a, b) => b.blockTime - a.blockTime);
  return txns;
}
