import { useEffect } from 'react';
import { RefreshCw, ExternalLink, TrendingUp, Layers, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useHoldings } from '../hooks/useHoldings';
import { useStaking } from '../hooks/useStaking';
import { useToast } from '../hooks/useToast';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import { AddressDisplay } from '../components/shared/AddressDisplay';
import { Toast } from '../components/shared/Toast';
import { SKR_RAW_TO_UI } from '../lib/helius';
import type { StakeAccount } from '../types/wallet';

function statusBadge(status: StakeAccount['status']) {
  const map: Record<StakeAccount['status'], string> = {
    active: 'bg-green-900 text-green-300',
    activating: 'bg-yellow-900 text-yellow-300',
    deactivating: 'bg-yellow-900 text-yellow-300',
    inactive: 'bg-gray-800 text-gray-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

export function OverviewPage() {
  const { wallets, activeAddress, settings } = useApp();
  const { holdings, loading, error, refresh } = useHoldings(activeAddress);
  const { stakeAccounts, stakingRewards, epochsFetched, allEpochsFetched, seekerAccounts, loading: stakingLoading, loadingRewards, error: stakingError, refresh: refreshStaking, refreshSkrOnly, updateRewards, validateRewards } = useStaking(activeAddress);

  const { toast, showToast, dismissToast } = useToast();
  const wallet = wallets.find(w => w.address === activeAddress);

  useEffect(() => {
    if (activeAddress && settings.apiKey) {
      refresh(false);
      refreshStaking(false); // loads cache; no forced re-fetch of staking on mount
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress, settings.apiKey]);

  async function handleValidate() {
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
  }

  if (!activeAddress) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <p className="text-lg">Add a wallet to get started</p>
        <p className="text-sm mt-1">Click + in the sidebar to add a Solana address</p>
      </div>
    );
  }

  if (!settings.apiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <p className="text-lg">API key required</p>
        <p className="text-sm mt-1">Go to Settings to add your Helius API key</p>
      </div>
    );
  }

  const solUsdValue = holdings && holdings.solPrice != null ? holdings.solBalance * holdings.solPrice : null;
  const tokenTotal = holdings?.tokens.reduce((s, t) => s + (t.usdValue ?? 0), 0) ?? 0;
  const totalStakedLamports = stakeAccounts.reduce((s, a) => s + a.lamports, 0);
  const totalStakedSol = totalStakedLamports / 1e9;
  const stakedUsdValue = holdings?.solPrice != null ? totalStakedSol * holdings.solPrice : null;

  // Seeker (SKR) staking
  const totalSeekerStaked = seekerAccounts.reduce((s, a) => s + SKR_RAW_TO_UI(a.stakedRaw), 0);
  const totalSeekerUnstaking = seekerAccounts.reduce((s, a) => s + SKR_RAW_TO_UI(a.unstakingAmount), 0);
  const skrToken = holdings?.tokens.find(t => t.mint === 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3');
  const skrPrice = skrToken && skrToken.uiAmount > 0 && skrToken.usdValue != null
    ? skrToken.usdValue / skrToken.uiAmount : null;
  const seekerStakedUsdValue = skrPrice != null ? totalSeekerStaked * skrPrice : null;

  const usdTotal = tokenTotal + (solUsdValue ?? 0) + (stakedUsdValue ?? 0) + (seekerStakedUsdValue ?? 0);

  // Most recent epoch rewards
  const maxEpoch = stakingRewards.length > 0 ? Math.max(...stakingRewards.map(r => r.epoch)) : null;
  const lastEpochRewards = maxEpoch !== null
    ? stakingRewards.filter(r => r.epoch === maxEpoch).reduce((s, r) => s + r.amount, 0) / 1e9
    : null;

  // Last epoch reward per stake account (in SOL)
  const lastRewardByAccount = stakingRewards.reduce<Record<string, { epoch: number; sol: number }>>((acc, r) => {
    if (acc[r.stakeAccount] == null || r.epoch > acc[r.stakeAccount].epoch) {
      acc[r.stakeAccount] = { epoch: r.epoch, sol: r.amount / 1e9 };
    }
    return acc;
  }, {});

  const currentEpoch = maxEpoch != null ? maxEpoch + 1 : null;

  // Actual total rewards per stake account (sum of all fetched rewards)
  const totalRewardsByAccount: Record<string, number> = {};
  for (const acct of stakeAccounts) {
    totalRewardsByAccount[acct.pubkey] = stakingRewards
      .filter(r => r.stakeAccount === acct.pubkey)
      .reduce((s, r) => s + r.amount / 1e9, 0);
  }

  // Epochs active per stake account
  const epochsActiveByAccount: Record<string, number | null> = {};
  for (const acct of stakeAccounts) {
    if (currentEpoch == null) { epochsActiveByAccount[acct.pubkey] = null; continue; }
    const endEpoch = acct.deactivationEpoch ?? currentEpoch;
    epochsActiveByAccount[acct.pubkey] = Math.max(0, endEpoch - acct.activationEpoch);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{wallet?.label ?? 'Wallet'}</h2>
          <AddressDisplay address={activeAddress} short={false} showExplorer />
        </div>
        <button
          onClick={() => { refresh(true); refreshSkrOnly(true); }}
          disabled={loading || stakingLoading}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-50"
        >
          {(loading || stakingLoading) ? <LoadingSpinner size={14} /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {error && <ErrorBanner message={error} />}
      {stakingError && <ErrorBanner message={`Staking: ${stakingError}`} />}

      {/* Summary cards */}
      {holdings && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">SOL Balance</p>
            <p className="text-2xl font-bold text-white">{holdings.solBalance.toFixed(4)}</p>
            <p className="text-xs text-gray-500 mt-1">SOL</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Total Value</p>
            <p className="text-2xl font-bold text-white">
              {usdTotal > 0 ? `$${usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {holdings.tokens.length} tokens + SOL{totalStakedSol > 0 ? ` + ${totalStakedSol.toFixed(2)} staked` : ''}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Last Updated</p>
            <p className="text-sm font-medium text-white">
              {new Date(holdings.fetchedAt).toLocaleTimeString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {new Date(holdings.fetchedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}

      {/* Holdings table */}
      {loading && !holdings && (
        <div className="flex items-center justify-center h-40">
          <LoadingSpinner size={32} />
        </div>
      )}

      {holdings && (
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
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {/* SOL row */}
                <tr className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-green-400 flex items-center justify-center text-xs font-bold text-white">◎</div>
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
                {holdings.tokens.map(token => (
                  <tr key={token.mint} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {token.logoUri ? (
                          <img src={token.logoUri} alt={token.symbol} className="w-7 h-7 rounded-full" onError={e => (e.currentTarget.style.display = 'none')} />
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
                      {token.usdValue != null && token.uiAmount > 0
                        ? `$${(token.usdValue / token.uiAmount).toFixed(6)}`
                        : '—'}
                    </td>
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
                  </tr>
                ))}
              </tbody>
            </table>
            {holdings.tokens.length === 0 && (
              <p className="text-center text-gray-500 py-8 text-sm">No SPL tokens found</p>
            )}
          </div>
        </div>
      )}

      {/* Seeker (SKR) Staking section */}
      {(seekerAccounts.length > 0 || stakingLoading) && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">Seeker Staking</h3>
              <span className="text-xs text-gray-500">(SKR)</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              {totalSeekerStaked > 0 && (
                <span className="font-mono text-white">
                  {totalSeekerStaked.toLocaleString('en-US', { maximumFractionDigits: 6 })} SKR staked
                  {seekerStakedUsdValue != null && (
                    <span className="text-gray-400 ml-1">
                      (${seekerStakedUsdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                    </span>
                  )}
                </span>
              )}
              {totalSeekerUnstaking > 0 && (
                <span className="text-yellow-400">
                  {totalSeekerUnstaking.toLocaleString('en-US', { maximumFractionDigits: 6 })} SKR unstaking
                </span>
              )}
            </div>
          </div>
          {stakingLoading && seekerAccounts.length === 0 ? (
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
      )}

      {/* Native Staking section */}
      {(stakeAccounts.length > 0 || stakingLoading) && (
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
                <span className="text-green-400">Last reward (epoch {maxEpoch}): +{lastEpochRewards.toFixed(6)} SOL</span>
              )}
              {epochsFetched.length > 0 && (
                <span className="text-gray-600">
                  {allEpochsFetched
                    ? `All epochs loaded (${epochsFetched[0]}–${epochsFetched[epochsFetched.length - 1]})`
                    : `Epochs ${epochsFetched[0]}–${epochsFetched[epochsFetched.length - 1]} loaded`}
                </span>
              )}
              <button
                onClick={updateRewards}
                disabled={loadingRewards || stakeAccounts.length === 0}
                className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded px-2 py-1 transition-colors disabled:opacity-50"
                title="Fetch reward epochs since the most recent stored epoch"
              >
                {loadingRewards ? <LoadingSpinner size={11} /> : <RefreshCcw size={11} />}
                Update
              </button>
              <button
                onClick={handleValidate}
                disabled={loadingRewards || stakeAccounts.length === 0}
                className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded px-2 py-1 transition-colors disabled:opacity-50"
                title="Check each account for missing epochs since activation and fetch them"
              >
                {loadingRewards ? <LoadingSpinner size={11} /> : <ShieldCheck size={11} />}
                Validate Data
              </button>
            </div>
          </div>
          {stakingLoading && stakeAccounts.length === 0 ? (
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
                  {stakeAccounts.map(acct => (
                    <tr key={acct.pubkey} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="px-4 py-3 font-mono text-xs text-gray-300">
                        {acct.pubkey.slice(0, 8)}…{acct.pubkey.slice(-6)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">
                        {acct.voter ? `${acct.voter.slice(0, 8)}…` : '—'}
                      </td>
                      <td className="px-4 py-3">{statusBadge(acct.status)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-400 text-xs">
                        {epochsActiveByAccount[acct.pubkey] != null ? epochsActiveByAccount[acct.pubkey] : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-white">
                        {(acct.lamports / 1e9).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {lastRewardByAccount[acct.pubkey] != null ? (
                          <span className="text-green-400">
                            +{lastRewardByAccount[acct.pubkey].sol.toFixed(6)}
                            {holdings?.solPrice != null && (
                              <span className="text-gray-500 ml-1 text-xs">
                                (${(lastRewardByAccount[acct.pubkey].sol * holdings.solPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                              </span>
                            )}
                          </span>
                        ) : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {totalRewardsByAccount[acct.pubkey] > 0 ? (
                          <span className="text-green-400">
                            {totalRewardsByAccount[acct.pubkey].toFixed(4)}
                            {holdings?.solPrice != null && (
                              <span className="text-gray-500 ml-1 text-xs">
                                (${(totalRewardsByAccount[acct.pubkey] * holdings.solPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                              </span>
                            )}
                          </span>
                        ) : <span className="text-gray-600">—</span>}
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
      )}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
