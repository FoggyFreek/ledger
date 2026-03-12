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

  useEffect(() => {
    if (!address) return;
    loadStakeAccounts(address).then(c => c && setStakeAccounts(c.data));
    loadStakingRewards(address).then(c => c && setStakingRewards(c.data));
    loadSeekerStakeAccounts(address).then(c => c && setSeekerAccounts(c.data));
  }, [address]);

  // Full refresh: native stake accounts + SKR + rewards (used for initial/forced reload)
  const refresh = useCallback(async (force = false) => {
    if (!address) return;

    const cached = await loadStakeAccounts(address);
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setStakeAccounts(cached.data);
      const cachedRewards = await loadStakingRewards(address);
      if (cachedRewards) setStakingRewards(cachedRewards.data);
      const cachedSeeker = await loadSeekerStakeAccounts(address);
      if (cachedSeeker) setSeekerAccounts(cachedSeeker.data);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [accounts, seekerAccts] = await Promise.all([
        getStakeAccounts(address),
        getSeekerStakeAccounts(address).catch(() => [] as SeekerStakeAccount[]),
      ]);

      saveStakeAccounts(address, accounts);
      setStakeAccounts(accounts);
      saveSeekerStakeAccounts(address, seekerAccts);
      setSeekerAccounts(seekerAccts);

      const pubkeys = accounts.map(a => a.pubkey);
      if (pubkeys.length > 0) {
        let currentEpoch = 700;
        try { currentEpoch = await fetchCurrentEpoch(); } catch { /* use fallback */ }
        const from = Math.min(...accounts.map(a => a.activationEpoch));
        const to = currentEpoch - 1;
        const rewards = await getInflationRewards(pubkeys, { from, to });
        saveStakingRewards(address, rewards);
        setStakingRewards(rewards);
      } else {
        saveStakingRewards(address, []);
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
    setError(null);
    try {
      const seekerAccts = await getSeekerStakeAccounts(address).catch(() => [] as SeekerStakeAccount[]);
      saveSeekerStakeAccounts(address, seekerAccts);
      setSeekerAccounts(seekerAccts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Fetch only epochs newer than each account's own most recent stored epoch.
  // Accounts are grouped by their neededFrom to minimise RPC calls.
  const updateRewards = useCallback(async () => {
    if (!address) return;
    const accounts = (await loadStakeAccounts(address))?.data ?? stakeAccounts;
    if (accounts.length === 0) return;

    const existing = (await loadStakingRewards(address))?.data ?? stakingRewards;

    setLoadingRewards(true);
    setError(null);
    try {
      let currentEpoch = 700;
      try { currentEpoch = await fetchCurrentEpoch(); } catch { /* use fallback */ }
      const to = currentEpoch - 1;

      // Per-account: neededFrom = max(stored epoch for this account) + 1
      const groups = new Map<number, string[]>(); // neededFrom → pubkeys
      for (const acct of accounts) {
        const acctEpochs = existing
          .filter(r => r.stakeAccount === acct.pubkey)
          .map(r => r.epoch);
        const neededFrom = acctEpochs.length > 0
          ? Math.max(...acctEpochs) + 1
          : acct.activationEpoch;
        if (neededFrom > to) continue; // already up to date
        const group = groups.get(neededFrom) ?? [];
        group.push(acct.pubkey);
        groups.set(neededFrom, group);
      }

      if (groups.size === 0) return;

      const allNew: StakingReward[] = [];
      for (const [from, pubkeys] of groups) {
        const rewards = await getInflationRewards(pubkeys, { from, to });
        allNew.push(...rewards);
      }

      const merged = mergeRewards(existing, allNew);
      saveStakingRewards(address, merged);
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

    const existing = (await loadStakingRewards(address))?.data ?? stakingRewards;

    setLoadingRewards(true);
    setError(null);
    try {
      let currentEpoch = 700;
      try { currentEpoch = await fetchCurrentEpoch(); } catch { /* use fallback */ }

      // Build per-account stored epoch sets
      const storedByAccount = new Map<string, Set<number>>();
      for (const acct of accounts) storedByAccount.set(acct.pubkey, new Set());
      for (const r of existing) storedByAccount.get(r.stakeAccount)?.add(r.epoch);

      // Loop every expected epoch for every account and collect missing ones
      let epochsChecked = 0;
      let missingEpochs = 0;
      const missingEpochSet = new Set<number>();

      for (const acct of accounts) {
        const stored = storedByAccount.get(acct.pubkey)!;
        for (let e = acct.activationEpoch; e < currentEpoch; e++) {
          epochsChecked++;
          if (!stored.has(e)) {
            missingEpochs++;
            missingEpochSet.add(e);
          }
        }
      }

      if (missingEpochSet.size === 0) {
        return { accountsChecked: accounts.length, epochsChecked, missingEpochs: 0, newRewards: 0 };
      }

      // Group consecutive missing epochs into ranges to minimise RPC calls
      const sortedMissing = [...missingEpochSet].sort((a, b) => a - b);
      const ranges: Array<{ from: number; to: number }> = [];
      let rangeStart = sortedMissing[0];
      let prev = sortedMissing[0];
      for (let i = 1; i < sortedMissing.length; i++) {
        if (sortedMissing[i] !== prev + 1) {
          ranges.push({ from: rangeStart, to: prev });
          rangeStart = sortedMissing[i];
        }
        prev = sortedMissing[i];
      }
      ranges.push({ from: rangeStart, to: prev });

      // Fetch all ranges for all pubkeys
      const pubkeys = accounts.map(a => a.pubkey);
      const allNew: StakingReward[] = [];
      for (const { from, to } of ranges) {
        const rewards = await getInflationRewards(pubkeys, { from, to });
        allNew.push(...rewards);
      }

      const merged = mergeRewards(existing, allNew);
      const newRewards = merged.length - existing.length;
      saveStakingRewards(address, merged);
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
    seekerAccounts, loading, loadingRewards, error,
    refresh, refreshSkrOnly, updateRewards, validateRewards,
  };
}

function mergeRewards(existing: StakingReward[], incoming: StakingReward[]): StakingReward[] {
  const map = new Map<string, StakingReward>();
  for (const r of existing) map.set(`${r.epoch}:${r.stakeAccount}`, r);
  for (const r of incoming) map.set(`${r.epoch}:${r.stakeAccount}`, r);
  return Array.from(map.values());
}
