import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { WalletEntry, WalletType } from '../types/wallet';
import type { Settings } from '../lib/storage';
import {
  loadWallets, saveWallets,
  loadSettings,
} from '../lib/storage';
import { getBitvavoStatus } from '../lib/bitvavo';
import { BITVAVO_ADDRESS } from '../lib/walletType';

interface AppContextValue {
  wallets: WalletEntry[];
  addWallet: (address: string, label: string, type?: WalletType) => void;
  removeWallet: (address: string) => void;
  updateWalletLabel: (address: string, label: string) => void;
  settings: Settings;
  activeAddress: string | null;
  setActiveAddress: (addr: string | null) => void;
  walletTotals: Record<string, number>;
  setWalletTotal: (address: string, total: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [settings, setSettings] = useState<Settings>({ helius: false, coingecko: false, bitvavo: false });
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [walletTotals, setWalletTotalsState] = useState<Record<string, number>>({});
  const setWalletTotal = useCallback((address: string, total: number) => {
    setWalletTotalsState(prev => ({ ...prev, [address]: total }));
  }, []);

  useEffect(() => {
    (async () => {
      const w = await loadWallets();
      setWallets(w);
      if (w.length > 0) setActiveAddress(w[0].address);
      const s = await loadSettings();
      setSettings(s);

      // Auto-add/remove Bitvavo wallet based on server config
      try {
        const { configured } = await getBitvavoStatus();
        const hasBitvavo = w.some(wallet => wallet.address === BITVAVO_ADDRESS);
        if (configured && !hasBitvavo) {
          const entry: WalletEntry = {
            address: BITVAVO_ADDRESS,
            label: 'Bitvavo',
            type: 'bitvavo',
            addedAt: Date.now(),
            lastRefreshed: null,
          };
          const next = [...w, entry];
          saveWallets(next);
          setWallets(next);
        } else if (!configured && hasBitvavo) {
          const next = w.filter(wallet => wallet.address !== BITVAVO_ADDRESS);
          saveWallets(next);
          setWallets(next);
        }
      } catch {
        // Bitvavo status check failed — ignore
      }
    })();
  }, []);

  const addWallet = useCallback((address: string, label: string, type: WalletType = 'solana') => {
    setWallets(prev => {
      if (prev.find(w => w.address === address)) return prev;
      const next = [...prev, { address, label, type, addedAt: Date.now(), lastRefreshed: null }];
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

  return (
    <AppContext.Provider value={{
      wallets, addWallet, removeWallet, updateWalletLabel,
      settings,
      activeAddress, setActiveAddress,
      walletTotals, setWalletTotal,
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
