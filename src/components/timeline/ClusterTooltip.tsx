import type { TaxCategory } from '../../types/transaction';
import type { TokenMeta } from '../../lib/helius';
import { CATEGORY_COLOR, CATEGORY_SHORT_LABEL } from '../../lib/categoryMeta';
import { summarizeTx } from '../../lib/txSummary';
import type { Cluster } from './timelineDrawing';

interface Props {
  cluster: Cluster;
  walletAddress: string;
  tokenMetas: Map<string, TokenMeta>;
}

export function ClusterTooltip({ cluster, walletAddress, tokenMetas }: Props) {
  const sorted = [...cluster.events].sort((a, b) => a.tx.blockTime - b.tx.blockTime);
  const shown = sorted.slice(0, 10);
  const remaining = sorted.length - shown.length;

  return (
    <>
      <div className="px-3 py-1.5 border-b border-gray-800 text-xs text-gray-500">
        {cluster.events.length} transactions · click to expand
      </div>
      <ul className="divide-y divide-gray-800">
        {shown.map(({ tx }) => {
          const color = CATEGORY_COLOR[tx.taxCategory] ?? '#4b5563';
          const label = CATEGORY_SHORT_LABEL[tx.taxCategory as TaxCategory] ?? tx.taxCategory;
          const summary = summarizeTx(tx, tokenMetas, walletAddress, true);
          return (
            <li key={tx.signature} className="flex items-start gap-2 px-3 py-1.5">
              <span className="shrink-0 text-[10px] text-gray-500 mt-0.5 w-[72px]">
                {new Date(tx.blockTime * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span
                className="shrink-0 text-[10px] rounded px-1 py-0.5 mt-0.5 font-medium"
                style={{ color, backgroundColor: color + '22' }}
              >
                {label}
              </span>
              <span className="text-xs text-gray-300 break-all leading-snug">{summary}</span>
            </li>
          );
        })}
      </ul>
      {remaining > 0 && (
        <div className="px-3 py-1.5 border-t border-gray-800 text-xs text-gray-500">
          …{remaining} more
        </div>
      )}
    </>
  );
}
