import type { WalletEntry, WalletHoldings, WalletSnapshot, StakeAccount, StakingReward, SeekerStakeAccount } from '../types/wallet';
import type { ParsedTransaction } from '../types/transaction';
import type { TransactionGroup, GroupMember, GroupMemberInput, GroupMemberships } from '../types/groups';
import { interpretTransaction } from './taxCategorizer';

function withInterpretedFlow(tx: ParsedTransaction): ParsedTransaction {
  return { ...tx, interpretedFlow: interpretTransaction(tx.balanceChanges) };
}

export interface Settings {
  apiKey: string;
  rpcUrl: string;
}

export interface StoredTransactions {
  data: ParsedTransaction[];
  oldestSignature: string | null;
  newestSignature: string | null;
  complete: boolean;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function apiPut(url: string, body: unknown): Promise<void> {
  try {
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('API write failed', url, e);
  }
}

async function apiDelete(url: string): Promise<void> {
  try {
    await fetch(url, { method: 'DELETE' });
  } catch (e) {
    console.error('API delete failed', url, e);
  }
}

async function apiPost<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch (e) {
    console.error('API post failed', url, e);
    return null;
  }
}

async function apiPatch(url: string, body: unknown): Promise<void> {
  try {
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error('API patch failed', url, e);
  }
}


// Wallets
export async function loadWallets(): Promise<WalletEntry[]> {
  return (await apiFetch<WalletEntry[]>('/api/v1/wallets')) ?? [];
}

export async function saveWallets(wallets: WalletEntry[]): Promise<void> {
  await apiPut('/api/v1/wallets', { wallets });
}

// Settings
export async function loadSettings(): Promise<Settings> {
  return (await apiFetch<Settings>('/api/v1/settings')) ?? { apiKey: '', rpcUrl: '' };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await apiPut('/api/v1/settings', settings);
}

// Holdings cache
export async function loadHoldings(address: string): Promise<WalletHoldings | null> {
  return apiFetch<WalletHoldings>(`/api/v1/wallets/${address}/holdings`);
}

export async function saveHoldings(holdings: WalletHoldings): Promise<void> {
  await apiPut(`/api/v1/wallets/${holdings.walletAddress}/holdings`, holdings);
}

export async function clearHoldings(address: string): Promise<void> {
  await apiDelete(`/api/v1/wallets/${address}/holdings`);
}

// Transactions
const EMPTY_STORED: StoredTransactions = {
  data: [],
  oldestSignature: null,
  newestSignature: null,
  complete: false,
};

export async function loadTransactions(address: string): Promise<StoredTransactions> {
  const result = (await apiFetch<StoredTransactions>(`/api/v1/wallets/${address}/transactions`)) ?? EMPTY_STORED;
  return { ...result, data: result.data.map(withInterpretedFlow) };
}

export async function saveTransactions(address: string, stored: StoredTransactions): Promise<void> {
  await apiPut(`/api/v1/wallets/${address}/transactions`, stored);
}

export async function clearTransactions(address: string): Promise<void> {
  await apiDelete(`/api/v1/wallets/${address}/transactions`);
}

// Snapshots
export async function loadSnapshots(): Promise<WalletSnapshot[]> {
  return (await apiFetch<WalletSnapshot[]>('/api/v1/snapshots')) ?? [];
}

export async function saveSnapshots(snapshots: WalletSnapshot[]): Promise<void> {
  await apiPut('/api/v1/snapshots', snapshots);
}

// Staking
export async function loadStakeAccounts(address: string): Promise<{ data: StakeAccount[]; fetchedAt: number } | null> {
  return apiFetch(`/api/v1/wallets/${address}/stake-accounts`);
}

export async function saveStakeAccounts(address: string, data: StakeAccount[]): Promise<void> {
  await apiPut(`/api/v1/wallets/${address}/stake-accounts`, { data, fetchedAt: Date.now() });
}

export async function loadStakingRewards(address: string): Promise<{ data: StakingReward[] } | null> {
  return apiFetch(`/api/v1/wallets/${address}/staking-rewards`);
}

export async function saveStakingRewards(address: string, rewards: StakingReward[]): Promise<void> {
  await apiPut(`/api/v1/wallets/${address}/staking-rewards`, { data: rewards });
}

export async function clearStakingData(address: string): Promise<void> {
  await apiDelete(`/api/v1/wallets/${address}/staking`);
}

// Seeker (SKR) staking — bigint fields are serialised as strings
interface StoredSeekerStakeAccount {
  pubkey: string;
  lamports: number;
  stakedRaw: string;
  unstakingAmount: string;
}

export async function loadSeekerStakeAccounts(address: string): Promise<{ data: SeekerStakeAccount[]; fetchedAt: number } | null> {
  const raw = await apiFetch<{ data: StoredSeekerStakeAccount[]; fetchedAt: number }>(`/api/v1/wallets/${address}/seeker-stake`);
  if (!raw) return null;
  return {
    fetchedAt: raw.fetchedAt,
    data: raw.data.map(a => ({
      ...a,
      stakedRaw: BigInt(a.stakedRaw),
      unstakingAmount: BigInt(a.unstakingAmount),
    })),
  };
}

export async function saveSeekerStakeAccounts(address: string, data: SeekerStakeAccount[]): Promise<void> {
  const serialisable = data.map(a => ({
    ...a,
    stakedRaw: a.stakedRaw.toString(),
    unstakingAmount: a.unstakingAmount.toString(),
  }));
  await apiPut(`/api/v1/wallets/${address}/seeker-stake`, { data: serialisable, fetchedAt: Date.now() });
}

// Transaction Groups
export async function loadGroups(address: string): Promise<TransactionGroup[]> {
  return (await apiFetch<TransactionGroup[]>(`/api/v1/wallets/${address}/groups`)) ?? [];
}

export async function createGroup(address: string, name: string): Promise<{ id: number; name: string; createdAt: number } | null> {
  return apiPost(`/api/v1/wallets/${address}/groups`, { name });
}

export async function renameGroup(address: string, id: number, name: string): Promise<void> {
  await apiPatch(`/api/v1/wallets/${address}/groups/${id}`, { name });
}

export async function deleteGroup(address: string, id: number): Promise<void> {
  await apiDelete(`/api/v1/wallets/${address}/groups/${id}`);
}

export async function loadGroupMembers(address: string, groupId: number): Promise<GroupMember[]> {
  return (await apiFetch<GroupMember[]>(`/api/v1/wallets/${address}/groups/${groupId}/members`)) ?? [];
}

export async function addGroupMembers(address: string, groupId: number, members: GroupMemberInput[]): Promise<void> {
  await apiPost(`/api/v1/wallets/${address}/groups/${groupId}/members`, { members });
}

export async function updateGroupMemberPrices(address: string, groupId: number, updates: GroupMemberInput[]): Promise<void> {
  await apiPatch(`/api/v1/wallets/${address}/groups/${groupId}/members`, { updates });
}

export async function removeGroupMember(address: string, groupId: number, signature: string): Promise<void> {
  await apiDelete(`/api/v1/wallets/${address}/groups/${groupId}/members/${signature}`);
}

export async function loadGroupMemberships(address: string): Promise<GroupMemberships | null> {
  return apiFetch<GroupMemberships>(`/api/v1/wallets/${address}/group-memberships`);
}
