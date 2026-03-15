import { X, CheckCircle, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

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
  const { settings } = useApp();

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

        <button
          onClick={onClose}
          className="mt-6 w-full bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
