import { ExternalLink } from 'lucide-react';
import { AddressDisplay } from '../shared/AddressDisplay';
import { resolveSymbol } from '../../lib/txSummary';
import { getCachedTokenInfo } from '../../lib/helius';
import type { TokenMeta } from '../../lib/helius';
import type { ParsedTransaction, BalanceChange, RentItem } from '../../types/transaction';

export function TokenLogo({ logoUri, symbol }: { logoUri: string | null; symbol: string }) {
  if (!logoUri) return null;
  return (
    <img
      src={logoUri}
      alt={symbol}
      className="w-4 h-4 rounded-full flex-shrink-0"
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

function ChangeRow({ bc, tokenMetas }: { bc: BalanceChange; tokenMetas: Map<string, TokenMeta> }) {
  const isSol = bc.mint === 'SOL';
  const meta = isSol ? getCachedTokenInfo('So11111111111111111111111111111111111111112') : (tokenMetas.get(bc.mint) ?? null);
  const symbol = isSol ? 'SOL' : (meta?.symbol ?? bc.mint.slice(0, 8) + '…');
  const logoUri = meta?.logoUri ?? null;
  const name = isSol ? 'Solana' : (meta?.name ?? bc.mint);
  return (
    <div className="flex items-center gap-2 text-gray-400">
      <span className={bc.amount > 0 ? 'text-green-400' : 'text-red-400'}>
        {bc.amount > 0 ? '↓ IN' : '↑ OUT'}
      </span>
      <span className="font-mono">
        {Math.abs(bc.amount).toLocaleString(undefined, { maximumFractionDigits: 9 })}
      </span>
      <TokenLogo logoUri={logoUri} symbol={symbol} />
      <span className="text-gray-300 font-medium" title={isSol ? undefined : bc.mint}>
        {symbol}
      </span>
      {!isSol && meta?.name && meta.name !== symbol && (
        <span className="text-gray-600">{name}</span>
      )}
    </div>
  );
}

function RentRow({ item }: { item: RentItem }) {
  return (
    <div className="flex items-center gap-2 text-gray-500">
      <span className="text-yellow-600">{item.amount < 0 ? '↑' : '↓'}</span>
      <span className="font-mono">{Math.abs(item.amount).toFixed(8)} SOL</span>
      <span>{item.label}</span>
      {item.refundable && <span className="text-gray-600">(refundable)</span>}
    </div>
  );
}

interface Props {
  tx: ParsedTransaction;
  tokenMetas: Map<string, TokenMeta>;
  walletAddress: string | null;
  walletOnly: boolean;
}

export function TxDetail({ tx, tokenMetas, walletAddress, walletOnly }: Props) {
  const { netChanges, rentItems } = tx.interpretedFlow;
  const filteredChanges = walletOnly
    ? netChanges.filter(bc => !bc.userAccount || bc.userAccount === walletAddress)
    : netChanges;

  // suppress unused-import warning
  void resolveSymbol;

  const footer = (
    <div className="flex items-center gap-4 text-gray-600 pt-1">
      {tx.slot > 0 && <span>Fee: {(tx.fee / 1e9).toFixed(6)} SOL</span>}
      {tx.slot > 0 && <span>Slot: {tx.slot}</span>}
      {tx.description && <span className="text-gray-500 italic">{tx.description}</span>}
      {tx.err && <span className="text-red-500">FAILED: {tx.err}</span>}
      {tx.slot > 0 && (
        <a
          href={`https://solscan.io/tx/${tx.signature}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-blue-500 hover:text-blue-400"
        >
          View <ExternalLink size={11} />
        </a>
      )}
    </div>
  );

  if (tx.taxCategory === 'TRADE') {
    return (
      <div className="bg-gray-950 border-t border-gray-800 px-4 py-3 text-xs space-y-2">
        {filteredChanges.length > 0 && (
          <div>
            <p className="text-gray-500 mb-1">Movements</p>
            {filteredChanges.map((bc, i) => <ChangeRow key={i} bc={bc} tokenMetas={tokenMetas} />)}
          </div>
        )}
        {(rentItems.length > 0) && (
          <div>
            <p className="text-gray-500 mb-1">Breakdown</p>
            {rentItems.map((item, i) => <RentRow key={i} item={item} />)}
          </div>
        )}
        {footer}
      </div>
    );
  }

  return (
    <div className="bg-gray-950 border-t border-gray-800 px-4 py-3 text-xs space-y-2">
      {filteredChanges.length > 0 && (
        <div>
          <p className="text-gray-500 mb-1">Balance Changes</p>
          {filteredChanges.map((bc, i) => <ChangeRow key={i} bc={bc} tokenMetas={tokenMetas} />)}
        </div>
      )}
      {tx.counterparty && (
        <div>
          <p className="text-gray-500 mb-1">
            {tx.taxCategory === 'TRANSFER_IN' ? 'From' : 'To'}
          </p>
          <AddressDisplay address={tx.counterparty} short={true} showExplorer={true} />
        </div>
      )}
      {footer}
    </div>
  );
}
