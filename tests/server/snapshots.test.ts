import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/db.js', () => {
  const mockSql: any = vi.fn(() => Promise.resolve([]));
  mockSql.begin = vi.fn(async () => []);
  mockSql.array = vi.fn((arr: unknown[]) => arr);
  mockSql.json = vi.fn((data: unknown) => data);
  return { default: mockSql };
});

import app from '../../server/routes/snapshots.js';
import sql from '../../server/db.js';

const mockSql = sql as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
});

// --- Legacy endpoints ---

describe('GET /snapshots', () => {
  it('returns an empty array when no snapshots exist', async () => {
    mockSql.mockResolvedValue([]);
    const res = await app.request('/snapshots');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('flattens snapshot data across all wallets', async () => {
    const snap1 = { walletAddress: 'addr1', date: '2025-01-01', holdings: [] };
    const snap2 = { walletAddress: 'addr1', date: '2024-01-01', holdings: [] };
    const snap3 = { walletAddress: 'addr2', date: '2025-01-01', holdings: [] };
    mockSql.mockResolvedValue([
      { data: [snap1, snap2] },
      { data: [snap3] },
    ]);
    const res = await app.request('/snapshots');
    expect(res.status).toBe(200);
    const json = await res.json() as unknown[];
    expect(json).toHaveLength(3);
    expect(json).toContainEqual(snap1);
    expect(json).toContainEqual(snap2);
    expect(json).toContainEqual(snap3);
  });
});

describe('PUT /snapshots', () => {
  it('returns { ok: true } after saving snapshots', async () => {
    const snapshots = [
      { walletAddress: 'addr1', date: '2025-01-01' },
      { walletAddress: 'addr1', date: '2024-01-01' },
    ];
    const res = await app.request('/snapshots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshots),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('groups snapshots by walletAddress and upserts per wallet', async () => {
    const snapshots = [
      { walletAddress: 'addr1', date: '2025-01-01' },
      { walletAddress: 'addr2', date: '2025-01-01' },
      { walletAddress: 'addr1', date: '2024-01-01' },
    ];
    await app.request('/snapshots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshots),
    });
    // One upsert per wallet (2) + one UPDATE to clear others
    expect(mockSql.mock.calls.length).toBe(3);
    // sql.json called once per unique wallet address (2 wallets)
    expect(mockSql.json.mock.calls.length).toBe(2);
  });

  it('uses sql.array to clear snapshots for unmentioned wallets', async () => {
    const snapshots = [{ walletAddress: 'addr1', date: '2025-01-01' }];
    await app.request('/snapshots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshots),
    });
    expect(mockSql.array).toHaveBeenCalledWith(['addr1']);
  });

  it('does not call sql.array when snapshot list is empty', async () => {
    await app.request('/snapshots', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    });
    expect(mockSql.array).not.toHaveBeenCalled();
  });
});

// --- Wallet-scoped endpoints ---

describe('GET /wallets/:addr/snapshots', () => {
  it('returns empty array when wallet has no snapshots', async () => {
    mockSql.mockResolvedValue([]);
    const res = await app.request('/wallets/addr1/snapshots');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns snapshots for the specified wallet', async () => {
    const snaps = [{ id: '1', label: 'Jan 1' }, { id: '2', label: 'Jul 1' }];
    mockSql.mockResolvedValue([{ data: snaps }]);
    const res = await app.request('/wallets/addr1/snapshots');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(snaps);
  });
});

describe('POST /wallets/:addr/snapshots', () => {
  it('creates a snapshot and returns 201', async () => {
    const snapshot = { id: 'snap-1', label: 'Test' };
    const res = await app.request('/wallets/addr1/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(snapshot);
    expect(mockSql.json).toHaveBeenCalledWith([snapshot]);
  });
});

describe('PUT /wallets/:addr/snapshots/:id', () => {
  it('updates an existing snapshot', async () => {
    const existing = [{ id: 'snap-1', label: 'Old' }, { id: 'snap-2', label: 'Keep' }];
    mockSql.mockResolvedValue([{ data: existing }]);

    const updated = { id: 'snap-1', label: 'New' };
    const res = await app.request('/wallets/addr1/snapshots/snap-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    // Should write the array with the updated snapshot
    expect(mockSql.json).toHaveBeenCalledWith([updated, { id: 'snap-2', label: 'Keep' }]);
  });

  it('returns 404 when wallet has no snapshots', async () => {
    mockSql.mockResolvedValue([]);
    const res = await app.request('/wallets/addr1/snapshots/snap-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'snap-1', label: 'New' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /wallets/:addr/snapshots/:id', () => {
  it('removes a snapshot from the array', async () => {
    const existing = [{ id: 'snap-1', label: 'Del' }, { id: 'snap-2', label: 'Keep' }];
    mockSql.mockResolvedValue([{ data: existing }]);

    const res = await app.request('/wallets/addr1/snapshots/snap-1', {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSql.json).toHaveBeenCalledWith([{ id: 'snap-2', label: 'Keep' }]);
  });

  it('returns ok when wallet has no snapshots', async () => {
    mockSql.mockResolvedValue([]);
    const res = await app.request('/wallets/addr1/snapshots/snap-1', {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
