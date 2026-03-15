import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/db.js', () => {
  const mockSql: any = vi.fn(() => Promise.resolve([]));
  mockSql.begin = vi.fn(async () => []);
  mockSql.array = vi.fn((arr: unknown[]) => arr);
  mockSql.json = vi.fn((data: unknown) => data);
  return { default: mockSql };
});

import app from '../../server/routes/holdings.js';
import sql from '../../server/db.js';

const mockSql = sql as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
});

describe('GET /wallets/:addr/holdings', () => {
  it('returns null when no cached holdings exist', async () => {
    mockSql.mockResolvedValue([]);
    const res = await app.request('/wallets/addr1/holdings');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('returns the cached data object when found', async () => {
    const holdingsData = { tokens: [{ mint: 'So111', amount: 1.5 }], fetchedAt: 9999 };
    mockSql.mockResolvedValue([{ data: holdingsData }]);
    const res = await app.request('/wallets/addr1/holdings');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(holdingsData);
  });
});

describe('PUT /wallets/:addr/holdings', () => {
  it('returns { ok: true } after saving holdings', async () => {
    const data = { tokens: [], fetchedAt: 12345 };
    const res = await app.request('/wallets/addr1/holdings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('uses sql.json to serialize holdings data', async () => {
    const data = { tokens: [{ mint: 'abc', amount: 1 }], fetchedAt: 1000 };
    await app.request('/wallets/addr1/holdings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    expect(mockSql.json).toHaveBeenCalledWith(data);
  });
});

describe('DELETE /wallets/:addr/holdings', () => {
  it('returns { ok: true } after deletion', async () => {
    const res = await app.request('/wallets/addr1/holdings', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSql).toHaveBeenCalled();
  });
});
