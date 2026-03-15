import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/db.js', () => {
  const mockSql: any = vi.fn(() => Promise.resolve([]));
  mockSql.begin = vi.fn(async () => []);
  mockSql.array = vi.fn((arr: unknown[]) => arr);
  mockSql.json = vi.fn((data: unknown) => data);
  return { default: mockSql };
});

import app from '../../server/routes/wallets.js';
import sql from '../../server/db.js';

const mockSql = sql as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
  mockSql.begin.mockResolvedValue([]);
});

describe('GET /wallets', () => {
  it('returns an empty array when no wallets exist', async () => {
    mockSql.mockResolvedValue([]);
    const res = await app.request('/wallets');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns mapped wallet objects with correct field names', async () => {
    mockSql.mockResolvedValue([
      { address: 'addr1', label: 'My Wallet', wallet_type: 'solana', added_at: 1000, last_refreshed: 2000 },
      { address: 'addr2', label: 'Bitvavo', wallet_type: 'bitvavo', added_at: 1500, last_refreshed: null },
    ]);
    const res = await app.request('/wallets');
    expect(res.status).toBe(200);
    const json = await res.json() as any[];
    expect(json).toHaveLength(2);
    expect(json[0]).toEqual({ address: 'addr1', label: 'My Wallet', type: 'solana', addedAt: 1000, lastRefreshed: 2000 });
    expect(json[1]).toEqual({ address: 'addr2', label: 'Bitvavo', type: 'bitvavo', addedAt: 1500, lastRefreshed: null });
  });

  it('defaults wallet_type to "solana" when null', async () => {
    mockSql.mockResolvedValue([
      { address: 'addr1', label: 'W', wallet_type: null, added_at: 1000, last_refreshed: null },
    ]);
    const res = await app.request('/wallets');
    const [wallet] = await res.json() as any[];
    expect(wallet.type).toBe('solana');
  });
});

describe('PUT /wallets', () => {
  it('returns { ok: true } after syncing wallets', async () => {
    const body = {
      wallets: [
        { address: 'addr1', label: 'Wallet 1', type: 'solana', addedAt: 1000, lastRefreshed: null },
      ],
    };
    const res = await app.request('/wallets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSql.begin).toHaveBeenCalledOnce();
  });

  it('calls sql.begin even when wallets array is empty', async () => {
    const res = await app.request('/wallets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallets: [] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSql.begin).toHaveBeenCalledOnce();
  });

  it('uses sql.array for address exclusion when wallets are provided', async () => {
    const body = {
      wallets: [
        { address: 'addr1', label: 'W1', addedAt: 1000, lastRefreshed: null },
        { address: 'addr2', label: 'W2', addedAt: 2000, lastRefreshed: null },
      ],
    };
    await app.request('/wallets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(mockSql.array).toHaveBeenCalledWith(['addr1', 'addr2']);
  });
});
