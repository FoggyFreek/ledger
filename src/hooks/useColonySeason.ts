import { useState, useEffect, useCallback, useRef } from 'react';
import type { ColonySeasonData } from '../types/colony';
import { loadColonyData, saveColonyData, clearColonyData } from '../lib/storage';
import {
  fetchAllEnhancedTransactions,
  fetchNewEnhancedTransactions,
  fetchStarBalance,
  aggregateStakers,
  aggregateBuyers,
  mergeStakers,
  mergeBuyers,
  buildMintDistribution,
  COLONY_STAR_STAKE_ACCOUNT,
  COLONY_TREASURY,
} from '../lib/colonyData';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function useColonySeason(walletAddresses: string[]) {
  const [data, setData] = useState<ColonySeasonData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    loadColonyData().then(cached => {
      if (cached) setData(cached);
    });
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (fetchingRef.current) return;

    if (!force && data && Date.now() - data.fetchedAt < CACHE_TTL_MS) return;

    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    setProgress('Fetching STAR balance...');

    try {
      const starBalance = await fetchStarBalance();

      setProgress('Fetching STAR stake txns... page 1');
      const stakeTxns = await fetchAllEnhancedTransactions(
        COLONY_STAR_STAKE_ACCOUNT,
        (p) => setProgress(`Fetching STAR stake txns... page ${p}`),
      );

      setProgress('Fetching treasury txns... page 1');
      const treasuryTxns = await fetchAllEnhancedTransactions(
        COLONY_TREASURY,
        (p) => setProgress(`Fetching treasury txns... page ${p}`),
      );

      setProgress('Aggregating...');

      const topStakers = aggregateStakers(stakeTxns, COLONY_STAR_STAKE_ACCOUNT);
      const topBuyers = aggregateBuyers(treasuryTxns, COLONY_TREASURY);
      const mintDistribution = buildMintDistribution(topBuyers);

      const result: ColonySeasonData = {
        totalPlayers: topBuyers.length,
        totalPlanetsMinted: topBuyers.reduce((s, b) => s + b.planetCount, 0),
        totalStarStakedLive: starBalance,
        topStakers,
        topBuyers,
        mintDistribution,
        treasuryTxCount: treasuryTxns.length,
        stakeTxCount: stakeTxns.length,
        newestStakeSignature: stakeTxns[0]?.signature ?? null,
        newestTreasurySignature: treasuryTxns[0]?.signature ?? null,
        fetchedAt: Date.now(),
      };

      setData(result);
      await saveColonyData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setProgress(null);
      fetchingRef.current = false;
    }
  }, [data]);

  const update = useCallback(async () => {
    if (fetchingRef.current || !data) return;

    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    setProgress('Fetching STAR balance...');

    try {
      const starBalance = await fetchStarBalance();

      let newStakeTxns: Awaited<ReturnType<typeof fetchNewEnhancedTransactions>> = [];
      if (data.newestStakeSignature) {
        setProgress('Fetching new STAR stake txns...');
        newStakeTxns = await fetchNewEnhancedTransactions(
          COLONY_STAR_STAKE_ACCOUNT,
          data.newestStakeSignature,
          (p) => setProgress(`Fetching new STAR stake txns... page ${p}`),
        );
      }

      let newTreasuryTxns: Awaited<ReturnType<typeof fetchNewEnhancedTransactions>> = [];
      if (data.newestTreasurySignature) {
        setProgress('Fetching new treasury txns...');
        newTreasuryTxns = await fetchNewEnhancedTransactions(
          COLONY_TREASURY,
          data.newestTreasurySignature,
          (p) => setProgress(`Fetching new treasury txns... page ${p}`),
        );
      }

      setProgress('Aggregating...');

      const newStakers = aggregateStakers(newStakeTxns, COLONY_STAR_STAKE_ACCOUNT);
      const newBuyers = aggregateBuyers(newTreasuryTxns, COLONY_TREASURY);

      const topStakers = mergeStakers(data.topStakers, newStakers);
      const topBuyers = mergeBuyers(data.topBuyers, newBuyers);
      const mintDistribution = buildMintDistribution(topBuyers);

      const result: ColonySeasonData = {
        totalPlayers: topBuyers.length,
        totalPlanetsMinted: topBuyers.reduce((s, b) => s + b.planetCount, 0),
        totalStarStakedLive: starBalance,
        topStakers,
        topBuyers,
        mintDistribution,
        treasuryTxCount: data.treasuryTxCount + newTreasuryTxns.length,
        stakeTxCount: data.stakeTxCount + newStakeTxns.length,
        newestStakeSignature: newStakeTxns[0]?.signature ?? data.newestStakeSignature,
        newestTreasurySignature: newTreasuryTxns[0]?.signature ?? data.newestTreasurySignature,
        fetchedAt: Date.now(),
      };

      setData(result);
      await saveColonyData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setProgress(null);
      fetchingRef.current = false;
    }
  }, [data]);

  const clearCache = useCallback(async () => {
    await clearColonyData();
    setData(null);
    setError(null);
  }, []);

  // Derived user-specific metrics
  const addrSet = new Set(walletAddresses);
  const userStakers = data?.topStakers.filter(s => addrSet.has(s.address)) ?? [];
  const userBuyers = data?.topBuyers.filter(b => addrSet.has(b.address)) ?? [];
  const userStarStaked = userStakers.reduce((s, x) => s + x.totalStar, 0);
  const userPlanets = userBuyers.reduce((s, x) => s + x.planetCount, 0);

  return {
    data,
    loading,
    error,
    progress,
    refresh,
    update,
    clearCache,
    userStarStaked,
    userPlanets,
    userStakers,
    userBuyers,
  };
}
