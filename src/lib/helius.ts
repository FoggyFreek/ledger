import type {
  HeliusDasResponse,
  HeliusWalletHistoryTx,
} from '../types/api';
import type { WalletHoldings, TokenHolding, StakeAccount, StakingReward, SeekerStakeAccount } from '../types/wallet';

const PROXY_RPC_URL = '/api/v1/helius/rpc';

// Rate limiter: max 6 req/s (sliding window) + max 3 concurrent
const MAX_RPS = 6;
const WINDOW_MS = 1000;
const MAX_CONCURRENT = 3;
let requestTimeStart = 0;
const requestTimes: number[] = [];
const queue: Array<() => Promise<void>> = [];
let running = 0;

async function acquireSlot(): Promise<void> {
  while (true) {
    const now = Date.now();
    while (requestTimeStart < requestTimes.length && requestTimes[requestTimeStart] <= now - WINDOW_MS) {
      requestTimeStart++;
    }
    if (requestTimeStart > 100) {
      requestTimes.splice(0, requestTimeStart);
      requestTimeStart = 0;
    }
    const activeCount = requestTimes.length - requestTimeStart;
    if (activeCount < MAX_RPS) {
      requestTimes.push(now);
      return;
    }
    await new Promise(r => setTimeout(r, requestTimes[requestTimeStart] + WINDOW_MS - now + 1));
  }
}

function runQueue() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const task = queue.shift()!;
    running++;
    task().finally(() => {
      running--;
      runQueue();
    });
  }
}

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 500;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(async () => {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          await acquireSlot();
          resolve(await fn());
          return;
        } catch (e) {
          if (attempt < MAX_RETRIES && e instanceof Error && e.message.includes('429')) {
            const delay = BASE_BACKOFF_MS * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          reject(e);
          return;
        }
      }
    });
    runQueue();
  });
}

export async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  return enqueue(async () => {
    const res = await fetch(PROXY_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`RPC error: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message ?? 'RPC error');
    return json.result as T;
  });
}

export async function getAssetsByOwner(owner: string): Promise<WalletHoldings> {
  let page = 1;
  const allTokens: TokenHolding[] = [];
  let solBalance = 0;
  let solPrice: number | null = null;
  let slot = 0;

  while (true) {
    const result = await enqueue(async () => {
      const res = await fetch(PROXY_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAssetsByOwner',
          params: {
            ownerAddress: owner,
            page,
            limit: 1000,
            displayOptions: {
              showFungible: true,
              showNativeBalance: true,
              showZeroBalance: false,
            },
          },
        }),
      });
      if (!res.ok) throw new Error(`DAS error: ${res.status} ${await res.text()}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message ?? 'DAS error');
      return json.result as HeliusDasResponse['result'];
    });

    if (page === 1 && result.nativeBalance) {
      solBalance = result.nativeBalance.lamports / 1e9;
      solPrice = result.nativeBalance.price_per_sol ?? null;
    }

    const items = result.items ?? [];

    for (const asset of items) {
      if (!asset.token_info) continue;
      const ti = asset.token_info;
      const raw = ti.balance ?? '0';
      const dec = ti.decimals ?? 0;
      const uiAmt = Number(raw) / Math.pow(10, dec);
      const usdVal = ti.price_info ? uiAmt * ti.price_info.price_per_token : null;

      const symbol = ti.symbol || asset.content?.metadata?.symbol || '?';
      const name = asset.content?.metadata?.name || ti.symbol || asset.id.slice(0, 8);
      const logoUri = asset.content?.links?.image ?? null;

      // Populate registry from holdings (free — data already present)
      registerToken(asset.id, { symbol, name, logoUri });

      allTokens.push({
        mint: asset.id,
        symbol,
        name,
        decimals: dec,
        rawAmount: raw,
        uiAmount: uiAmt,
        usdValue: usdVal,
        logoUri,
      });
    }

    if (items.length < 1000) break;
    page++;
  }

  // Also get SOL directly via RPC for accuracy
  try {
    const balRes = await rpc<{ value: number }>('getBalance', [owner, { commitment: 'confirmed' }]);
    solBalance = (balRes?.value ?? 0) / 1e9;
    // get slot
    const slotRes = await rpc<number>('getSlot', [{ commitment: 'confirmed' }]);
    slot = slotRes ?? 0;
  } catch {
    // use DAS native balance if RPC fails
  }

  return {
    walletAddress: owner,
    slot,
    fetchedAt: Date.now(),
    solBalance,
    solPrice,
    tokens: allTokens.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0)),
  };
}

export async function getWalletHistory(
  address: string,
  options: { before?: string; after?: string; limit?: number } = {}
): Promise<{ data: HeliusWalletHistoryTx[]; hasMore: boolean; nextCursor: string | null }> {
  return enqueue(async () => {
    const params: Record<string, string> = {
      limit: String(options.limit ?? 100),
      'token-accounts': 'balanceChanged',
    };
    if (options.before) params['before-signature'] = options.before;
    if (options.after) params['after-signature'] = options.after;

    const res = await fetch('/api/v1/helius/enhanced-transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, params }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Helius wallet history error: ${res.status} ${txt}`);
    }
    const data = await res.json() as HeliusWalletHistoryTx[];
    return {
      data,
      hasMore: data.length >= (options.limit ?? 100),
      nextCursor: null,
    };
  });
}

export async function getBlockTime(slot: number): Promise<number | null> {
  try {
    const result = await rpc<number | null>('getBlockTime', [slot]);
    return result;
  } catch {
    return null;
  }
}

export async function getCurrentSlot(): Promise<number> {
  return rpc<number>('getSlot', [{ commitment: 'finalized' }]);
}

// ─── Token registry ────────────────────────────────────────────────────────
// Populated from getAssetsByOwner and getAssetBatch results.
// Used by transaction views to resolve mint → {symbol, name, logoUri}.

export interface TokenMeta {
  symbol: string;
  name: string;
  logoUri: string | null;
}

const SOL_LOGO_URI = 'https://solscan.io/_next/static/media/solPriceLogo.76eeb122.png';

const _tokenRegistry = new Map<string, TokenMeta>([
  ['So11111111111111111111111111111111111111111', { symbol: 'SOL', name: 'Solana', logoUri: SOL_LOGO_URI }],
  ['So11111111111111111111111111111111111111112', { symbol: 'SOL', name: 'Wrapped SOL', logoUri: SOL_LOGO_URI }],
]);

export function getCachedTokenInfo(mint: string): TokenMeta | null {
  return _tokenRegistry.get(mint) ?? null;
}

export function getAllCachedTokenMetas(): Map<string, TokenMeta> {
  return new Map(_tokenRegistry);
}


const TOKEN_REGISTRY_MAX = 10_000;

function registerToken(mint: string, meta: TokenMeta) {
  if (_tokenRegistry.has(mint)) return;
  if (_tokenRegistry.size >= TOKEN_REGISTRY_MAX) {
    const firstKey = _tokenRegistry.keys().next().value;
    if (firstKey !== undefined) _tokenRegistry.delete(firstKey);
  }
  _tokenRegistry.set(mint, meta);
}

/**
 * Fetch metadata for mints not already in the registry via DAS getAssetBatch.
 * Silently ignores failures — the registry will simply stay incomplete.
 */
export async function prefetchTokenMeta(mints: string[]): Promise<void> {
  const unknown = [...new Set(mints)].filter(m => !_tokenRegistry.has(m));
  if (unknown.length === 0) return;

  // getAssetBatch limit is 1 000 ids per call
  for (let i = 0; i < unknown.length; i += 1000) {
    const chunk = unknown.slice(i, i + 1000);
    try {
      const result = await enqueue(async () => {
        const res = await fetch(PROXY_RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAssetBatch',
            params: { ids: chunk },
          }),
        });
        if (!res.ok) throw new Error(`getAssetBatch error: ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error.message ?? 'getAssetBatch error');
        return json.result as Array<{
          id: string;
          content?: { metadata?: { name?: string; symbol?: string }; links?: { image?: string } };
          token_info?: { symbol?: string };
        }>;
      });

      for (const asset of result ?? []) {
        if (!asset?.id) continue;
        registerToken(asset.id, {
          symbol: asset.token_info?.symbol || asset.content?.metadata?.symbol || '?',
          name: asset.content?.metadata?.name || asset.token_info?.symbol || asset.id.slice(0, 8),
          logoUri: asset.content?.links?.image ?? null,
        });
      }
    } catch {
      // leave unknown — callers fall back to mint address display
    }
  }
}

// ─── Staking ─────────────────────────────────────────────────────────────────

const STAKE_PROGRAM_ID = 'Stake11111111111111111111111111111111111111';
export const SEEKER_PROGRAM_ID = 'SKRskrmtL83pcL4YqLWt6iPefDqwXQWHSw9S9vz94BZ';
export const SEEKER_STAKING_CONFIG = '4HQy82s9CHTv1GsYKnANHMiHfhcqesYkK6sB3RDSYyqw';
export const SKR_MINT = 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3';
const SKR_DECIMALS = 6;
const MAX_U64 = BigInt('18446744073709551615');

interface EpochInfo {
  epoch: number;
  absoluteSlot: number;
  slotsPerEpoch?: number;
}

interface EpochSchedule {
  slotsPerEpoch: number;
  firstNormalEpoch: number;
  firstNormalSlot: number;
}

let _epochSchedule: EpochSchedule | null = null;

async function getEpochSchedule(): Promise<EpochSchedule> {
  if (_epochSchedule) return _epochSchedule;
  const s = await rpc<EpochSchedule>('getEpochSchedule', []);
  _epochSchedule = s;
  return s;
}

const EPOCH_INFO_CACHE_TTL_MS = 5 * 60 * 1000;
let _epochInfo: EpochInfo | null = null;
let _epochInfoFetchedAt = 0;

async function getEpochInfo(): Promise<EpochInfo> {
  if (_epochInfo && Date.now() - _epochInfoFetchedAt < EPOCH_INFO_CACHE_TTL_MS) {
    return _epochInfo;
  }
  _epochInfo = await rpc<EpochInfo>('getEpochInfo', [{ commitment: 'finalized' }]);
  _epochInfoFetchedAt = Date.now();
  return _epochInfo;
}

export async function fetchCurrentEpoch(): Promise<number> {
  const info = await getEpochInfo();
  return info.epoch;
}

// Solana genesis ~ Jan 16 2020 (Unix 1578950400); each slot ~400ms
const GENESIS_UNIX = 1578950400;
const SLOT_MS = 400;

function estimateEpochTimestamp(
  epoch: number,
  schedule: EpochSchedule,
  anchorSlot?: number,
  anchorTime?: number
): number {
  const startSlot = schedule.firstNormalSlot + (epoch - schedule.firstNormalEpoch) * schedule.slotsPerEpoch;
  if (anchorSlot !== undefined && anchorTime !== undefined) {
    return anchorTime + Math.floor(((startSlot - anchorSlot) * SLOT_MS) / 1000);
  }
  return GENESIS_UNIX + Math.floor((startSlot * SLOT_MS) / 1000);
}

interface RawStakeAccountInfo {
  stake?: {
    delegation?: {
      voter: string;
      activationEpoch: string;
      deactivationEpoch: string;
    };
  };
  meta?: {
    authorized?: { staker: string; withdrawer: string };
  };
}

export async function getStakeAccounts(walletAddress: string): Promise<StakeAccount[]> {
  const epochInfo = await getEpochInfo();
  const currentEpoch = epochInfo.epoch;

  const filters = (offset: number) => [
    { memcmp: { offset, bytes: walletAddress } },
  ];

  const fetchAccounts = (offset: number) =>
    rpc<Array<{ pubkey: string; account: { lamports: number; data: { parsed: { info: RawStakeAccountInfo } } } }>>(
      'getProgramAccounts',
      [
        STAKE_PROGRAM_ID,
        {
          encoding: 'jsonParsed',
          filters: filters(offset),
          commitment: 'finalized',
        },
      ]
    );

  const [stakerAccounts, withdrawerAccounts] = await Promise.all([
    fetchAccounts(12),
    fetchAccounts(44),
  ]);

  const seen = new Set<string>();
  const result: StakeAccount[] = [];

  for (const raw of [...stakerAccounts, ...withdrawerAccounts]) {
    if (seen.has(raw.pubkey)) continue;
    seen.add(raw.pubkey);

    const lamports = raw.account.lamports;
    const info = raw.account.data?.parsed?.info;
    const delegation = info?.stake?.delegation;
    if (!delegation) {
      // No delegation yet (just created, never delegated)
      result.push({
        pubkey: raw.pubkey,
        lamports,
        voter: '',
        activationEpoch: 0,
        deactivationEpoch: null,
        status: 'inactive',
      });
      continue;
    }

    const activationEpoch = Number(delegation.activationEpoch);
    const deactivationEpochRaw = BigInt(delegation.deactivationEpoch ?? '18446744073709551615');
    const deactivationEpoch = deactivationEpochRaw === MAX_U64 ? null : Number(deactivationEpochRaw);

    let status: StakeAccount['status'];
    if (deactivationEpoch !== null) {
      status = deactivationEpoch > currentEpoch ? 'deactivating' : 'inactive';
    } else if (activationEpoch >= currentEpoch) {
      status = 'activating';
    } else {
      status = 'active';
    }

    result.push({
      pubkey: raw.pubkey,
      lamports,
      voter: delegation.voter,
      activationEpoch,
      deactivationEpoch,
      status,
    });
  }

  return result;
}

interface InflationRewardResult {
  epoch: number;
  effectiveSlot: number;
  amount: number;
  postBalance: number;
  commission: number | null;
}

export async function getInflationRewards(
  pubkeys: string[],
  epochRange: { from: number; to: number }
): Promise<StakingReward[]> {
  if (pubkeys.length === 0) return [];
  const [schedule, epochInfo] = await Promise.all([getEpochSchedule(), getEpochInfo()]);
  // Anchor timestamp to current time + absoluteSlot to avoid the ~1-year error
  // that accumulates when projecting from genesis at 400ms/slot (actual avg ~460ms).
  const anchorSlot = epochInfo.absoluteSlot;
  const anchorTime = Math.floor(Date.now() / 1000);

  const epochs: number[] = [];
  for (let e = epochRange.from; e <= epochRange.to; e++) epochs.push(e);

  const allRewards: StakingReward[] = [];

  const epochResults = await Promise.all(
    epochs.map(epoch =>
      rpc<Array<InflationRewardResult | null>>('getInflationReward', [pubkeys, { epoch }]).catch(() => null)
    )
  );

  for (let i = 0; i < epochs.length; i++) {
    const epoch = epochs[i];
    const results = epochResults[i];
    if (!results) continue;
    const epochTs = estimateEpochTimestamp(epoch, schedule, anchorSlot, anchorTime);
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (!r || r.amount === 0) continue;
      const ts = r.effectiveSlot > 0
        ? anchorTime + Math.floor(((r.effectiveSlot - anchorSlot) * SLOT_MS) / 1000)
        : epochTs;
      allRewards.push({
        epoch,
        amount: r.amount,
        stakeAccount: pubkeys[j],
        postBalance: r.postBalance,
        commission: r.commission ?? null,
        estimatedTimestamp: ts,
      });
    }
  }

  return allRewards;
}

// User stake account layout (after 8-byte Anchor discriminator):
//   bump (u8, 1) | stake_config (pubkey, 32) | user (pubkey, 32) | guardian_pool (pubkey, 32)
//   shares (u128, 16) | cost_basis (u128, 16) | cumulative_commission (u128, 16)
//   unstaking_amount (u64, 8) | unstake_timestamp (i64, 8)
const SEEKER_USER_OFFSET = 41;       // user pubkey in stake account
const SEEKER_SHARES_OFFSET = 105;    // shares (u128 LE)
const SEEKER_UNSTAKING_OFFSET = 153; // unstaking_amount (u64 LE)

// Global staking config layout (after 8-byte Anchor discriminator):
//   bump (u8, 1) | authority (pubkey, 32) | mint (pubkey, 32) | stake_vault (pubkey, 32)
//   min_stake_amount (u64, 8) | cooldown_seconds (u64, 8)
//   total_shares (u128, 16) | share_price (u128, 16) | ...
const SEEKER_SHARE_PRICE_OFFSET = 137;           // share_price in global config (u128 LE)
const SEEKER_SHARE_PRICE_PRECISION = 1_000_000_000n; // share_price fixed-point denominator

async function getSeekerSharePrice(): Promise<bigint> {
  try {
    const result = await rpc<{ value: { data: [string, string] } | null }>(
      'getAccountInfo',
      [SEEKER_STAKING_CONFIG, { encoding: 'base64', commitment: 'finalized' }]
    );
    if (!result.value) return SEEKER_SHARE_PRICE_PRECISION;
    const bytes = Uint8Array.from(atob(result.value.data[0]), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    if (bytes.length >= SEEKER_SHARE_PRICE_OFFSET + 16) {
      const lo = view.getBigUint64(SEEKER_SHARE_PRICE_OFFSET, true);
      const hi = view.getBigUint64(SEEKER_SHARE_PRICE_OFFSET + 8, true);
      return lo + (hi << 64n);
    }
  } catch {
    // fall through to default
  }
  return SEEKER_SHARE_PRICE_PRECISION; // 1:1 fallback
}

export async function getSeekerStakeAccounts(walletAddress: string): Promise<SeekerStakeAccount[]> {
  const [raw, sharePrice] = await Promise.all([
    rpc<Array<{
      pubkey: string;
      account: { lamports: number; data: [string, string] };
    }>>('getProgramAccounts', [
      SEEKER_PROGRAM_ID,
      {
        encoding: 'base64',
        filters: [{ memcmp: { offset: SEEKER_USER_OFFSET, bytes: walletAddress } }],
        commitment: 'finalized',
      },
    ]),
    getSeekerSharePrice(),
  ]);

  return raw.map(r => {
    let stakedRaw = BigInt(0);
    let unstakingAmount = BigInt(0);
    try {
      const bytes = Uint8Array.from(atob(r.account.data[0]), c => c.charCodeAt(0));
      const view = new DataView(bytes.buffer);
      if (bytes.length >= SEEKER_SHARES_OFFSET + 16) {
        const sharesLo = view.getBigUint64(SEEKER_SHARES_OFFSET, true);
        const sharesHi = view.getBigUint64(SEEKER_SHARES_OFFSET + 8, true);
        const shares = sharesLo + (sharesHi << 64n);
        stakedRaw = (shares * sharePrice) / SEEKER_SHARE_PRICE_PRECISION;
      }
      if (bytes.length > SEEKER_UNSTAKING_OFFSET + 7) {
        unstakingAmount = view.getBigUint64(SEEKER_UNSTAKING_OFFSET, true);
      }
    } catch {
      // leave as zero if decoding fails
    }
    return { pubkey: r.pubkey, lamports: r.account.lamports, stakedRaw, unstakingAmount };
  });
}

export function SKR_RAW_TO_UI(raw: bigint): number {
  return Number(raw) / Math.pow(10, SKR_DECIMALS);
}
