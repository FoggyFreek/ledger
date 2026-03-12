import { useState, useEffect } from 'react';
import { Plus, Wallet, Trash2, Settings } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AddWalletModal } from '../wallets/AddWalletModal';
import { SettingsModal } from '../settings/SettingsModal';
import { fetchCurrentEpoch } from '../../lib/helius';
import { loadHoldings, loadStakeAccounts, loadSeekerStakeAccounts } from '../../lib/storage';
import { SKR_RAW_TO_UI } from '../../lib/helius';
import type { WalletHoldings } from '../../types/wallet';

interface Props {
  activePage: string;
  onPageChange: (page: string) => void;
}

export function Sidebar({ activePage, onPageChange }: Props) {
  const { wallets, activeAddress, setActiveAddress, removeWallet, settings } = useApp();
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentEpoch, setCurrentEpoch] = useState<number | null>(null);
  const [walletTotals, setWalletTotals] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!settings.apiKey) return;
    fetchCurrentEpoch().then(setCurrentEpoch).catch(() => {});
  }, [settings.apiKey]);

  useEffect(() => {
    const totals: Record<string, number> = {};
    Promise.all(
      wallets.map(async w => {
        const [h, stakeResult, seekerResult] = await Promise.all([
          loadHoldings(w.address).catch(() => null),
          loadStakeAccounts(w.address).catch(() => null),
          loadSeekerStakeAccounts(w.address).catch(() => null),
        ]);
        if (!h) return;
        const solUsd = h.solPrice != null ? h.solBalance * h.solPrice : 0;
        const tokenUsd = h.tokens.reduce((s, t) => s + (t.usdValue ?? 0), 0);
        const stakedSol = (stakeResult?.data ?? []).reduce((s, a) => s + a.lamports / 1e9, 0);
        const stakedSolUsd = h.solPrice != null ? stakedSol * h.solPrice : 0;
        const skrToken = h.tokens.find(t => t.mint === 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3');
        const skrPrice = skrToken && skrToken.uiAmount > 0 && skrToken.usdValue != null
          ? skrToken.usdValue / skrToken.uiAmount : null;
        const seekerAccounts = seekerResult?.data ?? [];
        const stakedSkr = seekerAccounts.reduce((s, a) => s + SKR_RAW_TO_UI(a.stakedRaw) + SKR_RAW_TO_UI(a.unstakingAmount), 0);
        const stakedSkrUsd = skrPrice != null ? stakedSkr * skrPrice : 0;
        totals[w.address] = solUsd + tokenUsd + stakedSolUsd + stakedSkrUsd;
      })
    ).then(() => setWalletTotals({ ...totals }));
  }, [wallets]);

  const navItems = [
    { id: 'overview', label: 'Holdings' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'snapshots', label: 'Snapshots' },
  ];

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-screen fixed left-0 top-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
            <Wallet size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">Solana Ledger</h1>
            <p className="text-xs text-gray-500">Portfolio Tracker</p>
            {currentEpoch !== null && (
              <p className="text-xs text-gray-600">Epoch {currentEpoch}</p>
            )}
          </div>
        </div>
      </div>

      {/* Wallet list */}
      <div className="p-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Wallets</span>
          <button
            onClick={() => setShowAddWallet(true)}
            className="text-gray-400 hover:text-purple-400 transition-colors"
            title="Add wallet"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {wallets.length === 0 && (
            <p className="text-xs text-gray-600 py-2">No wallets added yet</p>
          )}
          {wallets.map(w => (
            <div
              key={w.address}
              className={`group flex items-center justify-between rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                activeAddress === w.address
                  ? 'bg-purple-900/50 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
              onClick={() => setActiveAddress(w.address)}
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-1">
                  <p className="text-xs font-medium truncate">{w.label}</p>
                  {walletTotals[w.address] != null && (
                    <span className="text-xs text-gray-500 shrink-0">
                      (${walletTotals[w.address].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 font-mono">
                  {w.address.slice(0, 6)}…{w.address.slice(-4)}
                </p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); removeWallet(w.address); }}
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all ml-1 shrink-0"
                title="Remove wallet"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        {Object.keys(walletTotals).length > 0 && (
          <p className="text-xs text-gray-500 text-right mt-1 px-1">
            Total: ${Object.values(walletTotals).reduce((s, v) => s + v, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        )}
      </div>

      {/* Navigation */}
      <nav className="p-3 flex-1">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Navigation</span>
        <div className="mt-2 space-y-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                activePage === item.id
                  ? 'bg-purple-900/50 text-purple-200'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Settings */}
      <div className="p-3 border-t border-gray-800">
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
        >
          <Settings size={16} />
          Settings / API Key
        </button>
      </div>

      {showAddWallet && <AddWalletModal onClose={() => setShowAddWallet(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </aside>
  );
}
