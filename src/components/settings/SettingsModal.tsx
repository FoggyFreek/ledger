import { useState } from 'react';
import { X, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { loadTransactions, saveTransactions } from '../../lib/storage';
import { categorize, HELIUS_TYPE_CATEGORY } from '../../lib/taxCategorizer';

interface Props {
  onClose: () => void;
}

function KeyRow({ label, configured, envVar }: { label: string; configured: boolean; envVar: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
      <div>
        <p className="text-sm text-white">{label}</p>
        <p className="text-xs text-gray-500 font-mono">{envVar}</p>
      </div>
      {configured
        ? <CheckCircle size={18} className="text-green-400 shrink-0" />
        : <XCircle size={18} className="text-gray-600 shrink-0" />}
    </div>
  );
}

export function SettingsModal({ onClose }: Props) {
  const { settings, wallets } = useApp();
  const [remapState, setRemapState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [remapResult, setRemapResult] = useState<{ updated: number; total: number } | null>(null);

  async function handleRemap() {
    setRemapState('running');
    setRemapResult(null);
    try {
      let total = 0;
      let updated = 0;
      for (const wallet of wallets) {
        const stored = await loadTransactions(wallet.address);
        let changed = false;
        const remapped = stored.data.map(tx => {
          total++;
          // Preserve categories set by Seeker detection — that data isn't stored and can't be re-derived
          if (tx.taxCategory === 'STAKE_DELEGATE' || tx.taxCategory === 'STAKE_WITHDRAW') return tx;
          // Apply helius_type map first (TRANSFER excluded — needs direction check)
          const heliusMapped = tx.heliusType && tx.heliusType !== 'TRANSFER'
            ? HELIUS_TYPE_CATEGORY[tx.heliusType]
            : undefined;
          const newCategory = heliusMapped ?? categorize(tx.interpretedFlow.netChanges);
          if (newCategory === tx.taxCategory) return tx;
          updated++;
          changed = true;
          return { ...tx, taxCategory: newCategory };
        });
        if (changed) {
          await saveTransactions(wallet.address, { ...stored, data: remapped });
        }
      }
      setRemapResult({ updated, total });
      setRemapState('done');
    } catch (e) {
      console.error('Remap failed', e);
      setRemapState('error');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          API keys are configured via environment variables in <span className="font-mono text-gray-400">.env</span>.
        </p>

        <div>
          <KeyRow label="Helius" configured={settings.helius} envVar="HELIUS_API_KEY" />
          <KeyRow label="CoinGecko" configured={settings.coingecko} envVar="COINGECKO_API_KEY" />
          <KeyRow label="Bitvavo" configured={settings.bitvavo} envVar="BITVAVO_KEY + BITVAVO_SECRET" />
        </div>

        <div className="mt-6 pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 mb-2">Maintenance</p>
          <button
            onClick={handleRemap}
            disabled={remapState === 'running'}
            className="flex items-center gap-2 w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-sm transition-colors"
          >
            <RefreshCw size={14} className={remapState === 'running' ? 'animate-spin' : ''} />
            Remap transaction categories
          </button>
          {remapState === 'done' && remapResult && (
            <p className="mt-2 text-xs text-green-400">
              Done — {remapResult.updated} of {remapResult.total} transactions updated.
            </p>
          )}
          {remapState === 'error' && (
            <p className="mt-2 text-xs text-red-400">Remap failed — check console.</p>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
