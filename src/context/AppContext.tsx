import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { WalletEntry } from '../types/wallet';
import type { Settings } from '../lib/storage';
import {
  loadWallets, saveWallets,
  loadSettings, saveSettings,
} from '../lib/storage';
import { setApiKey } from '../lib/helius';

interface AppContextValue {
  wallets: WalletEntry[];
  addWallet: (address: string, label: string) => void;
  removeWallet: (address: string) => void;
  updateWalletLabel: (address: string, label: string) => void;
  settings: Settings;
  updateSettings: (s: Settings) => void;
  activeAddress: string | null;
  setActiveAddress: (addr: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [settings, setSettings] = useState<Settings>({ apiKey: '', rpcUrl: '' });
  const [activeAddress, setActiveAddress] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const w = await loadWallets();
      setWallets(w);
      if (w.length > 0) setActiveAddress(w[0].address);
      const s = await loadSettings();
      setSettings(s);
      setApiKey(s.apiKey);
    })();
  }, []);

  const addWallet = useCallback((address: string, label: string) => {
    setWallets(prev => {
      if (prev.find(w => w.address === address)) return prev;
      const next = [...prev, { address, label, addedAt: Date.now(), lastRefreshed: null }];
      saveWallets(next);
      return next;
    });
    setActiveAddress(address);
  }, []);

  const removeWallet = useCallback((address: string) => {
    setWallets(prev => {
      const next = prev.filter(w => w.address !== address);
      saveWallets(next);
      return next;
    });
    setActiveAddress(prev => (prev === address ? null : prev));
  }, []);

  const updateWalletLabel = useCallback((address: string, label: string) => {
    setWallets(prev => {
      const next = prev.map(w => w.address === address ? { ...w, label } : w);
      saveWallets(next);
      return next;
    });
  }, []);

  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
    setApiKey(s.apiKey);
  }, []);

  return (
    <AppContext.Provider value={{
      wallets, addWallet, removeWallet, updateWalletLabel,
      settings, updateSettings,
      activeAddress, setActiveAddress,
    }}>
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
