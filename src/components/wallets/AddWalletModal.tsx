import { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface Props {
  onClose: () => void;
}

function isValidSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

export function AddWalletModal({ onClose }: Props) {
  const { addWallet, wallets } = useApp();
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    const addr = address.trim();
    if (!isValidSolanaAddress(addr)) {
      setErr('Invalid Solana address');
      return;
    }
    if (wallets.find(w => w.address === addr)) {
      setErr('Wallet already added');
      return;
    }
    addWallet(addr, label.trim() || `Wallet ${wallets.length + 1}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Add Wallet</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Solana Address</label>
            <input
              type="text"
              value={address}
              onChange={e => { setAddress(e.target.value); setErr(''); }}
              placeholder="5UcncQ7oQm6HNs..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 font-mono focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Main wallet, Trading wallet"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={submit}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            >
              Add Wallet
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
