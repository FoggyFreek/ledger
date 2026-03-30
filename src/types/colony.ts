export interface ColonyStaker {
  address: string;
  totalStar: number;    // UI amount (decimals applied)
  txCount: number;
}

export interface ColonyBuyer {
  address: string;
  solSpent: number;     // SOL (UI amount)
  planetCount: number;  // solSpent / 0.1
  txCount: number;
}

export interface ColonySeasonData {
  totalPlayers: number;
  totalPlanetsMinted: number;
  totalStarStakedLive: number;        // live token balance (UI amount)
  topStakers: ColonyStaker[];         // sorted desc by totalStar
  topBuyers: ColonyBuyer[];           // sorted desc by planetCount
  mintDistribution: Record<string, number>; // bucket label -> user count
  treasuryTxCount: number;
  stakeTxCount: number;
  newestStakeSignature: string | null;
  newestTreasurySignature: string | null;
  fetchedAt: number;
}
