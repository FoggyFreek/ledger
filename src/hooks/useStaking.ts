import { useState, useCallback, useEffect, useMemo } from 'react';
import type { StakeAccount, StakingReward, SeekerStakeAccount } from '../types/wallet';

export interface ValidationResult {
  accountsChecked: number;
  epochsChecked: number;  // total epoch-account pairs examined
  missingEpochs: number;  // (epoch, account) pairs that had no stored record
  newRewards: number;     // new reward rows added after fetching
}
import { getStakeAccounts, getInflationRewards, fetchCurrentEpoch, getSeekerStakeAccounts } from '../lib/helius';
import {
  loadStakeAccounts,
  saveStakeAccounts,
  loadStakingRewards,
  saveStakingRewards,
  loadSeekerStakeAccounts,
  saveSeekerStakeAccounts,
} from '../lib/storage';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function useStaking(address: string | null) {
  const [stakeAccounts, setStakeAccounts] = useState<StakeAccount[]>([]);
  const [stakingRewards, setStakingRewards] = useState<StakingReward[]>([]);
  const [seekerAccounts, setSeekerAccounts] = useState<SeekerStakeAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seekerError, setSeekerError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    loadStakeAccounts(address).then(c => c && setStakeAccounts(c.data));
    loadStakingRewards(address).then(c => c && setStakingRewards(c.data));
    loadSeekerStakeAccounts(address).then(c => c && setSeekerAccounts(c.data));
  }, [address]);

  // Full refresh: native stake accounts + SKR + rewards (used for initial/forced reload)
  const refresh = useCallback(async (_force = false) => {
    if (!address) return;

    // Check stored data first and use if recent enough to avoid unnecessary RPC calls
    // const cached = await loadStakeAccounts(address);
    // if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    //   setStakeAccounts(cached.data);
    //   const cachedRewards = await loadStakingRewards(address);
    //   if (cachedRewards) setStakingRewards(cachedRewards.data);
    //   const cachedSeeker = await loadSeekerStakeAccounts(address);
    //   if (cachedSeeker) setSeekerAccounts(cachedSeeker.data);
    //   return;
    // }

    // No recent stored data, fetch fresh data
    setLoading(true);
    setError(null);
    setSeekerError(null);
    try {
      const seekerPromise = getSeekerStakeAccounts(address)
        .then(accts => { saveSeekerStakeAccounts(address, accts); setSeekerAccounts(accts); })
        .catch(e => { setSeekerError(e instanceof Error ? e.message : String(e)); });

      const accounts = await getStakeAccounts(address);
      saveStakeAccounts(address, accounts);
      setStakeAccounts(accounts);
      await seekerPromise;

      const pubkeys = accounts.map(a => a.pubkey);
      if (pubkeys.length > 0) {
        let currentEpoch = 700;
        try { currentEpoch = await fetchCurrentEpoch(); } catch { /* use fallback */ }

        const rewardsCache = await loadStakingRewards(address);
        const existingRewards = rewardsCache?.data ?? [];
        const epochsFetchedSet = new Set(rewardsCache?.epochsFetched ?? []);

        const from = Math.min(...accounts.map(a => a.activationEpoch));
        const to = currentEpoch - 1;

        // Only fetch epochs not already recorded (rewards or zero)
        const epochsToFetch: number[] = [];
        for (let e = from; e <= to; e++) {
          if (!epochsFetchedSet.has(e)) epochsToFetch.push(e);
        }

        if (epochsToFetch.length > 0) {
          const allNew: StakingReward[] = [];
          for (const { from: rf, to: rt } of toRanges(epochsToFetch)) {
            const rewards = await getInflationRewards(pubkeys, { from: rf, to: rt });
            allNew.push(...rewards);
          }
          const merged = mergeRewards(existingRewards, allNew);
          const newEpochsFetched = [...epochsFetchedSet, ...epochsToFetch];
          saveStakingRewards(address, merged, newEpochsFetched);
          setStakingRewards(merged);
        } else {
          setStakingRewards(existingRewards);
        }
      } else {
        setStakingRewards([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Refresh SKR staking only — used by the top Refresh button
  const refreshSkrOnly = useCallback(async (force = false) => {
    if (!address) return;
    const cached = await loadSeekerStakeAccounts(address);
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setSeekerAccounts(cached.data);
      return;
    }
    setLoading(true);
    setSeekerError(null);
    try {
      const seekerAccts = await getSeekerStakeAccounts(address);
      saveSeekerStakeAccounts(address, seekerAccts);
      setSeekerAccounts(seekerAccts);
    } catch (e) {
      setSeekerError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Fetch epochs newer than the latest stored epoch, skipping any already in epochsFetched.
  const updateRewards = useCallback(async () => {
    if (!address) return;
    const accounts = (await loadStakeAccounts(address))?.data ?? stakeAccounts;
    if (accounts.length === 0) return;

    const rewardsCache = await loadStakingRewards(address);
    const existing = rewardsCache?.data ?? stakingRewards;
    const epochsFetchedSet = new Set(rewardsCache?.epochsFetched ?? []);

    setLoadingRewards(true);
    setError(null);
    try {
      let currentEpoch = 700;
      try { currentEpoch = await fetchCurrentEpoch(); } catch { /* use fallback */ }
      const to = currentEpoch - 1;

      const pubkeys = accounts.map(a => a.pubkey);
      // Start from the epoch after the highest already-fetched epoch
      const maxFetched = epochsFetchedSet.size > 0 ? Math.max(...epochsFetchedSet) : -1;
      const from = maxFetched >= 0 ? maxFetched + 1 : Math.min(...accounts.map(a => a.activationEpoch));

      const epochsToFetch: number[] = [];
      for (let e = from; e <= to; e++) {
        if (!epochsFetchedSet.has(e)) epochsToFetch.push(e);
      }

      if (epochsToFetch.length === 0) return;

      const allNew: StakingReward[] = [];
      for (const { from: rf, to: rt } of toRanges(epochsToFetch)) {
        const rewards = await getInflationRewards(pubkeys, { from: rf, to: rt });
        allNew.push(...rewards);
      }

      const merged = mergeRewards(existing, allNew);
      const newEpochsFetched = [...epochsFetchedSet, ...epochsToFetch];
      saveStakingRewards(address, merged, newEpochsFetched);
      setStakingRewards(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingRewards(false);
    }
  }, [address, stakeAccounts, stakingRewards]);

  // Validate: loop every epoch from activationEpoch to currentEpoch-1 for each account.
  // Collect missing (epoch, account) pairs, group consecutive missing epochs into ranges,
  // fetch each range, merge results. Returns a ValidationResult for the caller to display.
  const validateRewards = useCallback(async (): Promise<ValidationResult> => {
    const EMPTY: ValidationResult = { accountsChecked: 0, epochsChecked: 0, missingEpochs: 0, newRewards: 0 };
    if (!address) return EMPTY;
    const accounts = (await loadStakeAccounts(address))?.data ?? stakeAccounts;
    if (accounts.length === 0) return EMPTY;

    const rewardsCache = await loadStakingRewards(address);
    const existing = rewardsCache?.data ?? stakingRewards;
    const epochsFetchedSet = new Set(rewardsCache?.epochsFetched ?? []);

    setLoadingRewards(true);
    setError(null);
    try {
      let currentEpoch = 700;
      try { currentEpoch = await fetchCurrentEpoch(); } catch { /* use fallback */ }

      // Build per-account stored epoch sets
      const storedByAccount = new Map<string, Set<number>>();
      for (const acct of accounts) storedByAccount.set(acct.pubkey, new Set());
      for (const r of existing) storedByAccount.get(r.stakeAccount)?.add(r.epoch);

      // Loop every expected (epoch, account) pair — skip epochs already in epochsFetched
      let epochsChecked = 0;
      let missingEpochs = 0;
      const missingEpochSet = new Set<number>();

      for (const acct of accounts) {
        const stored = storedByAccount.get(acct.pubkey)!;
        for (let e = acct.activationEpoch; e < currentEpoch; e++) {
          epochsChecked++;
          if (!stored.has(e) && !epochsFetchedSet.has(e)) {
            missingEpochs++;
            missingEpochSet.add(e);
          }
        }
      }

      if (missingEpochSet.size === 0) {
        return { accountsChecked: accounts.length, epochsChecked, missingEpochs: 0, newRewards: 0 };
      }

      // Fetch all ranges for all pubkeys
      const pubkeys = accounts.map(a => a.pubkey);
      const allNew: StakingReward[] = [];
      for (const { from, to } of toRanges([...missingEpochSet].sort((a, b) => a - b))) {
        const rewards = await getInflationRewards(pubkeys, { from, to });
        allNew.push(...rewards);
      }

      const merged = mergeRewards(existing, allNew);
      const newRewards = merged.length - existing.length;
      // Mark all checked-but-missing epochs as fetched (includes zero-reward epochs)
      const newEpochsFetched = [...epochsFetchedSet, ...[...missingEpochSet].filter(e => !epochsFetchedSet.has(e))];
      saveStakingRewards(address, merged, newEpochsFetched);
      setStakingRewards(merged);

      return { accountsChecked: accounts.length, epochsChecked, missingEpochs, newRewards };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return EMPTY;
    } finally {
      setLoadingRewards(false);
    }
  }, [address, stakeAccounts, stakingRewards]);

  // Derived from rewards data — epochs that had actual rewards
  const epochsFetched = useMemo(
    () => [...new Set(stakingRewards.map(r => r.epoch))].sort((a, b) => a - b),
    [stakingRewards],
  );

  // All epochs fetched when min fetched epoch covers the earliest activation
  const allEpochsFetched =
    epochsFetched.length > 0 &&
    stakeAccounts.length > 0 &&
    epochsFetched[0] <= Math.min(...stakeAccounts.map(a => a.activationEpoch));

  return {
    stakeAccounts, stakingRewards, epochsFetched, allEpochsFetched,
    seekerAccounts, loading, loadingRewards, error, seekerError,
    refresh, refreshSkrOnly, updateRewards, validateRewards,
  };
}

function mergeRewards(existing: StakingReward[], incoming: StakingReward[]): StakingReward[] {
  const map = new Map<string, StakingReward>();
  for (const r of existing) map.set(`${r.epoch}:${r.stakeAccount}`, r);
  for (const r of incoming) map.set(`${r.epoch}:${r.stakeAccount}`, r);
  return Array.from(map.values());
}

function toRanges(sortedEpochs: number[]): Array<{ from: number; to: number }> {
  if (sortedEpochs.length === 0) return [];
  const ranges: Array<{ from: number; to: number }> = [];
  let start = sortedEpochs[0];
  let prev = sortedEpochs[0];
  for (let i = 1; i < sortedEpochs.length; i++) {
    if (sortedEpochs[i] !== prev + 1) {
      ranges.push({ from: start, to: prev });
      start = sortedEpochs[i];
    }
    prev = sortedEpochs[i];
  }
  ranges.push({ from: start, to: prev });
  return ranges;
}
