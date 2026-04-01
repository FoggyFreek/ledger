import { useCallback, useEffect, useMemo } from 'react';
import { RefreshCw, ExternalLink, TrendingUp, Layers, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useWalletHoldings } from '../hooks/useWalletHoldings';
import { useStaking } from '../hooks/useStaking';
import { useToast } from '../hooks/useToast';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import { AddressDisplay } from '../components/shared/AddressDisplay';
import { Toast } from '../components/shared/Toast';
import { SKR_RAW_TO_UI } from '../lib/helius';

import type { StakeAccount, SeekerStakeAccount, WalletHoldings } from '../types/wallet';

const SKR_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';

const STATUS_CLASSES: Record<StakeAccount['status'], string> = {
  active: 'bg-green-900 text-green-300',
  activating: 'bg-yellow-900 text-yellow-300',
  deactivating: 'bg-yellow-900 text-yellow-300',
  inactive: 'bg-gray-800 text-gray-400',
};

function StatusBadge({ status }: { status: StakeAccount['status'] }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASSES[status]}`}>
      {status}
    </span>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

interface SummaryCardsProps {
  usdTotal: number;
  tokenCount: number;
  totalStakedSol: number;
  fetchedAt: number;
  isBitvavo?: boolean;
}

function SummaryCards({ usdTotal, tokenCount, totalStakedSol, fetchedAt, isBitvavo }: SummaryCardsProps) {
  const fetchedDate = new Date(fetchedAt);
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 mb-1">Total Value</p>
        <p className="text-2xl font-bold text-white">
          {usdTotal > 0
            ? `$${usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '—'}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {tokenCount} tokens{!isBitvavo && ' + SOL'}{totalStakedSol > 0 ? ` + ${totalStakedSol.toFixed(2)} staked` : ''}
        </p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 mb-1">Last Updated</p>
        <p className="text-sm font-medium text-white">{fetchedDate.toLocaleTimeString()}</p>
        <p className="text-xs text-gray-500 mt-1">{fetchedDate.toLocaleDateString()}</p>
      </div>
    </div>
  );
}

// ─── Token Holdings ───────────────────────────────────────────────────────────

interface TokenHoldingsSectionProps {
  holdings: WalletHoldings;
  activeAddress: string;
  solUsdValue: number | null;
  isBitvavo?: boolean;
}

function TokenHoldingsSection({ holdings, activeAddress, solUsdValue, isBitvavo }: TokenHoldingsSectionProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
        <TrendingUp size={16} className="text-purple-400" />
        <h3 className="text-sm font-semibold text-white">Token Holdings</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500">
              <th className="text-left px-4 py-2">Token</th>
              <th className="text-right px-4 py-2">Balance</th>
              <th className="text-right px-4 py-2">USD Value</th>
              <th className="text-right px-4 py-2">Price</th>
              {!isBitvavo && <th className="px-4 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {/* SOL row — only for Solana wallets */}
            {!isBitvavo && (
              <tr className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <img
                      src="https://solscan.io/_next/static/media/solPriceLogo.76eeb122.png"
                      alt="SOL"
                      className="w-7 h-7 rounded-full"
                      onError={e => (e.currentTarget.style.display = 'none')}
                    />
                    <div>
                      <p className="font-medium text-white">SOL</p>
                      <p className="text-xs text-gray-500">Solana</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-white font-mono">
                  {holdings.solBalance.toFixed(6)}
                </td>
                <td className="px-4 py-3 text-right text-white">
                  {solUsdValue != null
                    ? `$${solUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right text-gray-400 text-xs font-mono">
                  {holdings.solPrice != null
                    ? `$${holdings.solPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={`https://solscan.io/account/${activeAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-600 hover:text-blue-400"
                  >
                    <ExternalLink size={12} />
                  </a>
                </td>
              </tr>
            )}

            {/* SPL token rows */}
            {holdings.tokens.map(token => {
              const price =
                token.usdValue != null && token.uiAmount > 0
                  ? token.usdValue / token.uiAmount
                  : null;
              return (
                <tr key={token.mint} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {token.logoUri ? (
                        <img
                          src={token.logoUri}
                          alt={token.symbol}
                          className="w-7 h-7 rounded-full"
                          onError={e => (e.currentTarget.style.display = 'none')}
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">
                          {token.symbol.slice(0, 2)}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-white">{token.symbol}</p>
                        <p className="text-xs text-gray-500 truncate max-w-32">{token.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono">
                    {token.uiAmount.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                  </td>
                  <td className="px-4 py-3 text-right text-white">
                    {token.usdValue != null
                      ? `$${token.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs font-mono">
                    {price != null ? `$${price.toFixed(3)}` : '—'}
                  </td>
                  {!isBitvavo && (
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`https://solscan.io/token/${token.mint}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-600 hover:text-blue-400"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {holdings.tokens.length === 0 && (
          <p className="text-center text-gray-500 py-8 text-sm">No tokens found</p>
        )}
      </div>
    </div>
  );
}

// ─── Seeker Staking ───────────────────────────────────────────────────────────

interface SeekerStakingSectionProps {
  seekerAccounts: SeekerStakeAccount[];
  loading: boolean;
  totalStaked: number;
  totalUnstaking: number;
  stakedUsdValue: number | null;
}

function SeekerStakingSection({
  seekerAccounts,
  loading,
  totalStaked,
  totalUnstaking,
  stakedUsdValue,
}: SeekerStakingSectionProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-cyan-400" />
          <h3 className="text-sm font-semibold text-white">Seeker Staking</h3>
          <span className="text-xs text-gray-500">(SKR)</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {totalStaked > 0 && (
            <span className="font-mono text-white">
              {totalStaked.toLocaleString('en-US', { maximumFractionDigits: 6 })} SKR staked
              {stakedUsdValue != null && (
                <span className="text-gray-400 ml-1">
                  (${stakedUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </span>
              )}
            </span>
          )}
          {totalUnstaking > 0 && (
            <span className="text-yellow-400">
              {totalUnstaking.toLocaleString('en-US', { maximumFractionDigits: 6 })} SKR unstaking
            </span>
          )}
        </div>
      </div>

      {loading && seekerAccounts.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size={24} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500">
                <th className="text-left px-4 py-2">Account</th>
                <th className="text-right px-4 py-2">Staked (SKR)</th>
                <th className="text-right px-4 py-2">Unstaking (SKR)</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {seekerAccounts.map(acct => (
                <tr key={acct.pubkey} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">
                    {acct.pubkey.slice(0, 8)}…{acct.pubkey.slice(-6)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    {SKR_RAW_TO_UI(acct.stakedRaw).toLocaleString('en-US', { maximumFractionDigits: 6 })}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-yellow-400">
                    {acct.unstakingAmount > 0n
                      ? SKR_RAW_TO_UI(acct.unstakingAmount).toLocaleString('en-US', { maximumFractionDigits: 6 })
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`https://solscan.io/account/${acct.pubkey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-600 hover:text-blue-400"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Native Staking ───────────────────────────────────────────────────────────

interface LastReward {
  epoch: number;
  sol: number;
}

interface NativeStakingSectionProps {
  stakeAccounts: StakeAccount[];
  loading: boolean;
  loadingRewards: boolean;
  totalStakedSol: number;
  stakedUsdValue: number | null;
  solPrice: number | null;
  lastEpochRewards: number | null;
  maxEpoch: number | null;
  epochsFetched: number[];
  allEpochsFetched: boolean;
  lastRewardByAccount: Record<string, LastReward>;
  totalRewardsByAccount: Record<string, number>;
  epochsActiveByAccount: Record<string, number | null>;
  onUpdateRewards: () => void;
  onValidate: () => void;
}

function NativeStakingSection({
  stakeAccounts,
  loading,
  loadingRewards,
  totalStakedSol,
  stakedUsdValue,
  solPrice,
  lastEpochRewards,
  maxEpoch,
  epochsFetched,
  allEpochsFetched,
  lastRewardByAccount,
  totalRewardsByAccount,
  epochsActiveByAccount,
  onUpdateRewards,
  onValidate,
}: NativeStakingSectionProps) {
  const rewardButtonsDisabled = loadingRewards || stakeAccounts.length === 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-green-400" />
          <h3 className="text-sm font-semibold text-white">Native Staking</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {totalStakedSol > 0 && (
            <span className="font-mono text-white">
              {totalStakedSol.toFixed(4)} SOL staked
              {stakedUsdValue != null && (
                <span className="text-gray-400 ml-1">
                  (${stakedUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </span>
              )}
            </span>
          )}
          {lastEpochRewards !== null && maxEpoch !== null && (
            <span className="text-green-400">
              Last reward (epoch {maxEpoch}): +{lastEpochRewards.toFixed(6)} SOL
            </span>
          )}
          {epochsFetched.length > 0 && (
            <span className="text-gray-600">
              {allEpochsFetched
                ? `All epochs loaded (${epochsFetched[0]}–${epochsFetched[epochsFetched.length - 1]})`
                : `Epochs ${epochsFetched[0]}–${epochsFetched[epochsFetched.length - 1]} loaded`}
            </span>
          )}
          <button
            onClick={onUpdateRewards}
            disabled={rewardButtonsDisabled}
            className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded px-2 py-1 transition-colors disabled:opacity-50"
            title="Fetch reward epochs since the most recent stored epoch"
          >
            {loadingRewards ? <LoadingSpinner size={11} /> : <RefreshCcw size={11} />}
            Update
          </button>
          <button
            onClick={onValidate}
            disabled={rewardButtonsDisabled}
            className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded px-2 py-1 transition-colors disabled:opacity-50"
            title="Check each account for missing epochs since activation and fetch them"
          >
            {loadingRewards ? <LoadingSpinner size={11} /> : <ShieldCheck size={11} />}
            Validate Data
          </button>
        </div>
      </div>

      {loading && stakeAccounts.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size={24} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-xs text-gray-500">
                <th className="text-left px-4 py-2">Account</th>
                <th className="text-left px-4 py-2">Validator</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Epochs</th>
                <th className="text-right px-4 py-2">Amount (SOL)</th>
                <th className="text-right px-4 py-2">Last Reward</th>
                <th className="text-right px-4 py-2">Total Rewards</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {stakeAccounts.map(acct => {
                const lastReward = lastRewardByAccount[acct.pubkey];
                const totalReward = totalRewardsByAccount[acct.pubkey];
                const epochsActive = epochsActiveByAccount[acct.pubkey];
                return (
                  <tr key={acct.pubkey} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-mono text-xs text-gray-300">
                      {acct.pubkey.slice(0, 8)}…{acct.pubkey.slice(-6)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">
                      {acct.voter ? `${acct.voter.slice(0, 8)}…` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={acct.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400 text-xs">
                      {epochsActive != null ? epochsActive : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-white">
                      {(acct.lamports / 1e9).toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {lastReward != null ? (
                        <span className="text-green-400">
                          +{lastReward.sol.toFixed(6)}
                          {solPrice != null && (
                            <span className="text-gray-500 ml-1 text-xs">
                              (${(lastReward.sol * solPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {totalReward > 0 ? (
                        <span className="text-green-400">
                          {totalReward.toFixed(4)}
                          {solPrice != null && (
                            <span className="text-gray-500 ml-1 text-xs">
                              (${(totalReward * solPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`https://solscan.io/account/${acct.pubkey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-600 hover:text-blue-400"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OverviewPage() {
  const { wallets, activeAddress, settings, setWalletTotal } = useApp();
  const wallet = wallets.find(w => w.address === activeAddress);
  const isBitvavo = wallet?.type === 'bitvavo';

  const { holdings, loading, error, refresh } = useWalletHoldings(activeAddress, wallet?.type);

  const {
    stakeAccounts,
    stakingRewards,
    epochsFetched,
    allEpochsFetched,
    seekerAccounts,
    loading: stakingLoading,
    loadingRewards,
    error: stakingError,
    seekerError,
    refresh: refreshStaking,
    updateRewards,
    validateRewards,
  } = useStaking(isBitvavo ? null : activeAddress);

  const { toast, showToast, dismissToast } = useToast();

  useEffect(() => {
    if (!activeAddress) return;
    if (isBitvavo) {
      refresh(false);
    } else if (settings.helius) {
      Promise.all([refresh(false), refreshStaking(false)]);
    }
  }, [activeAddress, settings.helius, isBitvavo, refresh, refreshStaking]);

  const handleRefresh = useCallback(async () => {
    if (isBitvavo) {
      await refresh(true);
    } else {
      await Promise.all([refresh(true), refreshStaking(true)]);
    }
  }, [refresh, refreshStaking, isBitvavo]);

  const handleValidate = useCallback(async () => {
    const result = await validateRewards();
    if (result.missingEpochs === 0) {
      showToast(
        `Validation complete — all ${result.epochsChecked} epoch-slots accounted for across ${result.accountsChecked} account(s).`,
        'success',
      );
    } else if (result.newRewards === 0) {
      showToast(
        `Validation complete — ${result.missingEpochs} missing epoch-slot(s) found (zero-reward epochs confirmed). No new rewards added.`,
        'info',
      );
    } else {
      showToast(
        `Validation complete — ${result.missingEpochs} missing epoch-slot(s) found, ${result.newRewards} new reward(s) added.`,
        'success',
      );
    }
  }, [validateRewards, showToast]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const solUsdValue = useMemo(
    () => (holdings?.solPrice != null ? holdings.solBalance * holdings.solPrice : null),
    [holdings],
  );

  const tokenTotal = useMemo(
    () => holdings?.tokens.reduce((s, t) => s + (t.usdValue ?? 0), 0) ?? 0,
    [holdings],
  );

  const totalStakedSol = useMemo(
    () => stakeAccounts.reduce((s, a) => s + a.lamports, 0) / 1e9,
    [stakeAccounts],
  );

  const stakedUsdValue = useMemo(
    () => (holdings?.solPrice != null ? totalStakedSol * holdings.solPrice : null),
    [holdings, totalStakedSol],
  );

  const { totalSeekerStaked, totalSeekerUnstaking } = useMemo(() => ({
    totalSeekerStaked: seekerAccounts.reduce((s, a) => s + SKR_RAW_TO_UI(a.stakedRaw), 0),
    totalSeekerUnstaking: seekerAccounts.reduce((s, a) => s + SKR_RAW_TO_UI(a.unstakingAmount), 0),
  }), [seekerAccounts]);

  const seekerStakedUsdValue = useMemo(() => {
    const skrToken = holdings?.tokens.find(t => t.mint === SKR_MINT);
    const skrPrice =
      skrToken && skrToken.uiAmount > 0 && skrToken.usdValue != null
        ? skrToken.usdValue / skrToken.uiAmount
        : null;
    return skrPrice != null ? totalSeekerStaked * skrPrice : null;
  }, [holdings, totalSeekerStaked]);

  const usdTotal = useMemo(
    () => tokenTotal + (solUsdValue ?? 0) + (stakedUsdValue ?? 0) + (seekerStakedUsdValue ?? 0),
    [tokenTotal, solUsdValue, stakedUsdValue, seekerStakedUsdValue],
  );

  useEffect(() => {
    if (activeAddress && usdTotal > 0) setWalletTotal(activeAddress, usdTotal);
  }, [activeAddress, usdTotal, setWalletTotal]);

  const { maxEpoch, lastEpochRewards } = useMemo(() => {
    if (stakingRewards.length === 0) return { maxEpoch: null, lastEpochRewards: null };
    const max = Math.max(...stakingRewards.map(r => r.epoch));
    const rewards = stakingRewards.filter(r => r.epoch === max).reduce((s, r) => s + r.amount, 0) / 1e9;
    return { maxEpoch: max, lastEpochRewards: rewards };
  }, [stakingRewards]);

  const lastRewardByAccount = useMemo(
    () =>
      stakingRewards.reduce<Record<string, LastReward>>((acc, r) => {
        if (acc[r.stakeAccount] == null || r.epoch > acc[r.stakeAccount].epoch) {
          acc[r.stakeAccount] = { epoch: r.epoch, sol: r.amount / 1e9 };
        }
        return acc;
      }, {}),
    [stakingRewards],
  );

  const totalRewardsByAccount = useMemo(
    () =>
      Object.fromEntries(
        stakeAccounts.map(acct => [
          acct.pubkey,
          stakingRewards
            .filter(r => r.stakeAccount === acct.pubkey)
            .reduce((s, r) => s + r.amount / 1e9, 0),
        ]),
      ),
    [stakeAccounts, stakingRewards],
  );

  const epochsActiveByAccount = useMemo(() => {
    const currentEpoch = maxEpoch != null ? maxEpoch + 1 : null;
    return Object.fromEntries(
      stakeAccounts.map(acct => {
        if (currentEpoch == null) return [acct.pubkey, null];
        const endEpoch = acct.deactivationEpoch ?? currentEpoch;
        return [acct.pubkey, Math.max(0, endEpoch - acct.activationEpoch)];
      }),
    ) as Record<string, number | null>;
  }, [stakeAccounts, maxEpoch]);

  // ── Early returns ───────────────────────────────────────────────────────────

  if (!activeAddress) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <p className="text-lg">Add a wallet to get started</p>
        <p className="text-sm mt-1">Click + in the sidebar to add a Solana address</p>
      </div>
    );
  }

  if (!isBitvavo && !settings.helius) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <p className="text-lg">API key required</p>
        <p className="text-sm mt-1">Set HELIUS_API_KEY in .env to get started</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{wallet?.label ?? 'Wallet'}</h2>
          {isBitvavo
            ? <p className="text-sm text-gray-500 font-mono">Bitvavo Exchange</p>
            : <AddressDisplay address={activeAddress} short={false} showExplorer />
          }
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading || stakingLoading}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
        >
          {(loading || stakingLoading) ? <LoadingSpinner size={14} /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {error && <ErrorBanner message={error} />}
      {!isBitvavo && stakingError && <ErrorBanner message={`Staking: ${stakingError}`} />}
      {!isBitvavo && seekerError && <ErrorBanner message="Failed to load Seeker (SKR) staking data" details={seekerError} />}

      {/* Summary cards */}
      {holdings && (
        <SummaryCards
          usdTotal={usdTotal}
          tokenCount={holdings.tokens.length}
          totalStakedSol={totalStakedSol}
          fetchedAt={holdings.fetchedAt}
          isBitvavo={isBitvavo}
        />
      )}

      {/* Holdings table */}
      {loading && !holdings && (
        <div className="flex items-center justify-center h-40">
          <LoadingSpinner size={32} />
        </div>
      )}

      {holdings && (
        <TokenHoldingsSection
          holdings={holdings}
          activeAddress={activeAddress}
          solUsdValue={solUsdValue}
          isBitvavo={isBitvavo}
        />
      )}

      {/* Seeker (SKR) Staking — Solana only */}
      {!isBitvavo && (seekerAccounts.length > 0 || stakingLoading) && (
        <SeekerStakingSection
          seekerAccounts={seekerAccounts}
          loading={stakingLoading}
          totalStaked={totalSeekerStaked}
          totalUnstaking={totalSeekerUnstaking}
          stakedUsdValue={seekerStakedUsdValue}
        />
      )}

      {/* Native Staking — Solana only */}
      {!isBitvavo && (stakeAccounts.length > 0 || stakingLoading) && (
        <NativeStakingSection
          stakeAccounts={stakeAccounts}
          loading={stakingLoading}
          loadingRewards={loadingRewards}
          totalStakedSol={totalStakedSol}
          stakedUsdValue={stakedUsdValue}
          solPrice={holdings?.solPrice ?? null}
          lastEpochRewards={lastEpochRewards}
          maxEpoch={maxEpoch}
          epochsFetched={epochsFetched}
          allEpochsFetched={allEpochsFetched}
          lastRewardByAccount={lastRewardByAccount}
          totalRewardsByAccount={totalRewardsByAccount}
          epochsActiveByAccount={epochsActiveByAccount}
          onUpdateRewards={updateRewards}
          onValidate={handleValidate}
        />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
