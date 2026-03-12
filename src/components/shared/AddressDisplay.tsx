import { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface Props {
  address: string;
  short?: boolean;
  showExplorer?: boolean;
}

export function AddressDisplay({ address, short = true, showExplorer = false }: Props) {
  const [copied, setCopied] = useState(false);

  const display = short
    ? `${address.slice(0, 4)}…${address.slice(-4)}`
    : address;

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className="inline-flex items-center gap-1 font-mono text-sm">
      <span title={address}>{display}</span>
      <button
        onClick={copy}
        className="text-gray-400 hover:text-gray-200 transition-colors"
        title="Copy address"
      >
        {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
      </button>
      {showExplorer && (
        <a
          href={`https://solscan.io/account/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-blue-400 transition-colors"
          title="View on Solscan"
        >
          <ExternalLink size={13} />
        </a>
      )}
    </span>
  );
}
