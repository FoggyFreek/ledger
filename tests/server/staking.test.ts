import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/db.js', () => {
  const mockSql: any = vi.fn(() => Promise.resolve([]));
  mockSql.begin = vi.fn(async () => []);
  mockSql.array = vi.fn((arr: unknown[]) => arr);
  mockSql.json = vi.fn((data: unknown) => data);
  return { default: mockSql };
});

import app from '../../server/routes/staking.js';
import sql from '../../server/db.js';

const mockSql = sql as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
});

// ─── Stake accounts ──────────────────────────────────────────────────────────

describe('GET /wallets/:addr/stake-accounts', () => {
  it('returns null when no meta row exists', async () => {
    // Promise.all: [stakeRows=[], metaRows=[]]
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await app.request('/wallets/addr1/stake-accounts');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('returns stake accounts with correct field mapping', async () => {
    const rows = [
      { pubkey: 'pk1', lamports: 1000000000, voter: 'v1', activation_epoch: 100, deactivation_epoch: null, status: 'active' },
      { pubkey: 'pk2', lamports: 500000000, voter: 'v2', activation_epoch: 200, deactivation_epoch: 250, status: 'inactive' },
    ];
    const metaRows = [{ fetched_at: 9999 }];
    mockSql
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(metaRows);
    const res = await app.request('/wallets/addr1/stake-accounts');
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.fetchedAt).toBe(9999);
    expect(json.data).toHaveLength(2);
    expect(json.data[0]).toEqual({
      pubkey: 'pk1',
      lamports: 1000000000,
      voter: 'v1',
      activationEpoch: 100,
      deactivationEpoch: null,
      status: 'active',
    });
    expect(json.data[1].deactivationEpoch).toBe(250);
  });
});

describe('PUT /wallets/:addr/stake-accounts', () => {
  it('returns { ok: true } after saving stake accounts', async () => {
    const body = {
      fetchedAt: 9999,
      data: [
        { pubkey: 'pk1', lamports: 1e9, voter: 'v1', activationEpoch: 100, deactivationEpoch: null, status: 'active' },
      ],
    };
    const res = await app.request('/wallets/addr1/stake-accounts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSql.begin).toHaveBeenCalledOnce();
  });

  it('uses SELECT 1 no-op when data array is empty', async () => {
    const body = { fetchedAt: 9999, data: [] };
    await app.request('/wallets/addr1/stake-accounts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(mockSql.begin).toHaveBeenCalledOnce();
    // The route builds 3 queries: delete, SELECT 1 (no-op), meta — sql called 3 times
    expect(mockSql.mock.calls.length).toBe(3);
  });
});

// ─── Staking rewards ─────────────────────────────────────────────────────────

describe('GET /wallets/:addr/staking-rewards', () => {
  it('returns null when no stake_accounts_meta row exists', async () => {
    mockSql
      .mockResolvedValueOnce([])  // rewards
      .mockResolvedValueOnce([])  // stake_accounts_meta (null check)
      .mockResolvedValueOnce([]); // rewards_meta
    const res = await app.request('/wallets/addr1/staking-rewards');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('returns rewards with epochsFetched metadata', async () => {
    const rewardRows = [
      { epoch: 600, stake_account: 'pk1', amount: 100000, post_balance: 1100000, commission: 5, estimated_timestamp: 1700000 },
      { epoch: 599, stake_account: 'pk1', amount: 99000, post_balance: 1000000, commission: null, estimated_timestamp: 1690000 },
    ];
    const metaRows = [{ fetched_at: 12345 }];
    const rewardsMeta = [{ epochs_fetched: [598, 599, 600] }];
    mockSql
      .mockResolvedValueOnce(rewardRows)
      .mockResolvedValueOnce(metaRows)
      .mockResolvedValueOnce(rewardsMeta);
    const res = await app.request('/wallets/addr1/staking-rewards');
    const json = await res.json() as any;
    expect(json.epochsFetched).toEqual([598, 599, 600]);
    expect(json.data).toHaveLength(2);
    expect(json.data[0]).toEqual({
      epoch: 600,
      stakeAccount: 'pk1',
      amount: 100000,
      postBalance: 1100000,
      commission: 5,
      estimatedTimestamp: 1700000,
    });
    expect(json.data[1].commission).toBeNull();
  });

  it('returns empty epochsFetched when no rewards_meta row', async () => {
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ fetched_at: 1 }])
      .mockResolvedValueOnce([]);
    const json = await (await app.request('/wallets/addr1/staking-rewards')).json() as any;
    expect(json.epochsFetched).toEqual([]);
  });
});

describe('PUT /wallets/:addr/staking-rewards', () => {
  it('returns { ok: true } after saving rewards', async () => {
    const body = {
      epochsFetched: [598, 599, 600],
      data: [
        { epoch: 600, stakeAccount: 'pk1', amount: 100000, postBalance: 1100000, commission: 5, estimatedTimestamp: 1700000 },
      ],
    };
    const res = await app.request('/wallets/addr1/staking-rewards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSql.begin).toHaveBeenCalledOnce();
  });

  it('uses SELECT 1 no-op when data is empty', async () => {
    const body = { epochsFetched: [600], data: [] };
    await app.request('/wallets/addr1/staking-rewards', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(mockSql.begin).toHaveBeenCalledOnce();
    // SELECT 1 + meta query = 2 sql calls
    expect(mockSql.mock.calls.length).toBe(2);
  });
});

// ─── Seeker stake accounts ────────────────────────────────────────────────────

describe('GET /wallets/:addr/seeker-stake', () => {
  it('returns null when no seeker_stake_meta row exists', async () => {
    mockSql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const res = await app.request('/wallets/addr1/seeker-stake');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('returns seeker stake data with stakedRaw and unstakingAmount as strings', async () => {
    const rows = [
      { pubkey: 'sk1', lamports: 2039280, staked_raw: '1234567890000000', unstaking_amount: '0' },
    ];
    const metaRows = [{ fetched_at: 8888 }];
    mockSql
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce(metaRows);
    const res = await app.request('/wallets/addr1/seeker-stake');
    const json = await res.json() as any;
    expect(json.fetchedAt).toBe(8888);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]).toEqual({
      pubkey: 'sk1',
      lamports: 2039280,
      stakedRaw: '1234567890000000',
      unstakingAmount: '0',
    });
    // Confirm they are strings, not numbers (bigint safety)
    expect(typeof json.data[0].stakedRaw).toBe('string');
    expect(typeof json.data[0].unstakingAmount).toBe('string');
  });
});

describe('PUT /wallets/:addr/seeker-stake', () => {
  it('returns { ok: true } after saving seeker stake accounts', async () => {
    const body = {
      fetchedAt: 8888,
      data: [
        { pubkey: 'sk1', lamports: 2039280, stakedRaw: '1234567890000000', unstakingAmount: '0' },
      ],
    };
    const res = await app.request('/wallets/addr1/seeker-stake', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSql.begin).toHaveBeenCalledOnce();
  });

  it('uses SELECT 1 no-op when data array is empty', async () => {
    const body = { fetchedAt: 8888, data: [] };
    await app.request('/wallets/addr1/seeker-stake', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(mockSql.begin).toHaveBeenCalledOnce();
    expect(mockSql.mock.calls.length).toBe(3); // delete, SELECT 1, meta
  });
});

// ─── Clear all staking ────────────────────────────────────────────────────────

describe('DELETE /wallets/:addr/staking', () => {
  it('returns { ok: true } after clearing all staking data', async () => {
    const res = await app.request('/wallets/addr1/staking', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('deletes from all 6 staking tables via Promise.all', async () => {
    await app.request('/wallets/addr1/staking', { method: 'DELETE' });
    expect(mockSql.mock.calls.length).toBe(6);
  });
});
