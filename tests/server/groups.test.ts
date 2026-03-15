import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/db.js', () => {
  const mockSql: any = vi.fn(() => Promise.resolve([]));
  mockSql.begin = vi.fn(async () => []);
  mockSql.array = vi.fn((arr: unknown[]) => arr);
  mockSql.json = vi.fn((data: unknown) => data);
  return { default: mockSql };
});

import app from '../../server/routes/groups.js';
import sql from '../../server/db.js';

const mockSql = sql as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
});

// ─── GET /wallets/:addr/groups ────────────────────────────────────────────────

describe('GET /wallets/:addr/groups', () => {
  it('returns an empty array when no groups exist', async () => {
    const res = await app.request('/wallets/addr1/groups');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns groups with mapped field names', async () => {
    mockSql.mockResolvedValue([
      { id: 1, name: 'DeFi trades', created_at: 1700000000000, tx_count: 5 },
      { id: 2, name: 'Staking', created_at: 1690000000000, tx_count: 0 },
    ]);
    const res = await app.request('/wallets/addr1/groups');
    const json = await res.json() as any[];
    expect(json).toHaveLength(2);
    expect(json[0]).toEqual({ id: 1, name: 'DeFi trades', createdAt: 1700000000000, txCount: 5 });
    expect(json[1]).toEqual({ id: 2, name: 'Staking', createdAt: 1690000000000, txCount: 0 });
  });
});

// ─── POST /wallets/:addr/groups ───────────────────────────────────────────────

describe('POST /wallets/:addr/groups', () => {
  it('returns the created group with id, name, and createdAt', async () => {
    mockSql.mockResolvedValue([{ id: 42, name: 'New Group', created_at: 1700000000000 }]);
    const res = await app.request('/wallets/addr1/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Group' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.id).toBe(42);
    expect(json.name).toBe('New Group');
    expect(json.createdAt).toBe(1700000000000);
  });
});

// ─── PATCH /wallets/:addr/groups/:id ─────────────────────────────────────────

describe('PATCH /wallets/:addr/groups/:id', () => {
  it('returns { ok: true } after renaming group', async () => {
    const res = await app.request('/wallets/addr1/groups/1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed Group' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSql).toHaveBeenCalledOnce();
  });
});

// ─── DELETE /wallets/:addr/groups/:id ────────────────────────────────────────

describe('DELETE /wallets/:addr/groups/:id', () => {
  it('returns { ok: true } after deleting group', async () => {
    const res = await app.request('/wallets/addr1/groups/1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSql).toHaveBeenCalledOnce();
  });
});

// ─── GET /wallets/:addr/groups/:id/members ────────────────────────────────────

describe('GET /wallets/:addr/groups/:id/members', () => {
  it('returns empty array when no members', async () => {
    const res = await app.request('/wallets/addr1/groups/1/members');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('returns members with full transaction data and USD values', async () => {
    const rows = [
      {
        signature: 'sig1',
        block_time: 1700000000,
        slot: 200000000,
        fee: 5000,
        tax_category: 'TRADE',
        balance_changes: [{ mint: 'SOL', amount: -1 }],
        err: null,
        counterparty: null,
        usd_inflow: '1500.00',
        usd_outflow: null,
        price_fetched: true,
        added_at: 1700000001000,
      },
    ];
    mockSql.mockResolvedValue(rows);
    const res = await app.request('/wallets/addr1/groups/1/members');
    const json = await res.json() as any[];
    expect(json).toHaveLength(1);
    const m = json[0];
    expect(m.signature).toBe('sig1');
    expect(m.blockTime).toBe(1700000000);
    expect(m.slot).toBe(200000000);
    expect(m.fee).toBe(5000);
    expect(m.taxCategory).toBe('TRADE');
    expect(m.usdInflow).toBe(1500);
    expect(m.usdOutflow).toBeNull();
    expect(m.priceFetched).toBe(true);
    expect(m.addedAt).toBe(1700000001000);
  });

  it('converts numeric string usd_inflow/usd_outflow to numbers', async () => {
    mockSql.mockResolvedValue([{
      signature: 's1', block_time: 1, slot: 1, fee: 0,
      tax_category: 'TRADE', balance_changes: [], err: null, counterparty: null,
      usd_inflow: '123.45', usd_outflow: '67.89', price_fetched: true, added_at: 1,
    }]);
    const [m] = await (await app.request('/wallets/addr1/groups/1/members')).json() as any[];
    expect(m.usdInflow).toBe(123.45);
    expect(m.usdOutflow).toBe(67.89);
  });
});

// ─── POST /wallets/:addr/groups/:id/members ───────────────────────────────────

describe('POST /wallets/:addr/groups/:id/members', () => {
  it('returns { ok: true } immediately when members array is empty', async () => {
    const res = await app.request('/wallets/addr1/groups/1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: [] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // No SQL should be called for empty members
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('inserts members and returns { ok: true }', async () => {
    const body = {
      members: [
        { signature: 'sig1', usdInflow: 100, usdOutflow: null, priceFetched: true },
        { signature: 'sig2', usdInflow: null, usdOutflow: 50, priceFetched: true },
      ],
    };
    const res = await app.request('/wallets/addr1/groups/1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // sql called twice: once for inner sql(rows) fragment, once for the outer INSERT
    expect(mockSql.mock.calls.length).toBe(2);
  });
});

// ─── PATCH /wallets/:addr/groups/:id/members ──────────────────────────────────

describe('PATCH /wallets/:addr/groups/:id/members', () => {
  it('returns { ok: true } after updating USD values', async () => {
    const body = {
      updates: [
        { signature: 'sig1', usdInflow: 200, usdOutflow: null, priceFetched: true },
        { signature: 'sig2', usdInflow: null, usdOutflow: 75, priceFetched: true },
      ],
    };
    const res = await app.request('/wallets/addr1/groups/1/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // One sql call per update (Promise.all)
    expect(mockSql.mock.calls.length).toBe(2);
  });

  it('handles empty updates array without errors', async () => {
    const res = await app.request('/wallets/addr1/groups/1/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: [] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSql).not.toHaveBeenCalled();
  });
});

// ─── DELETE /wallets/:addr/groups/:id/members/:sig ────────────────────────────

describe('DELETE /wallets/:addr/groups/:id/members/:sig', () => {
  it('returns { ok: true } after removing a transaction from a group', async () => {
    const res = await app.request('/wallets/addr1/groups/1/members/sig123', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockSql).toHaveBeenCalledOnce();
  });
});

// ─── GET /wallets/:addr/group-memberships ─────────────────────────────────────

describe('GET /wallets/:addr/group-memberships', () => {
  it('returns an empty object when wallet has no group memberships', async () => {
    const res = await app.request('/wallets/addr1/group-memberships');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it('groups memberships by signature', async () => {
    mockSql.mockResolvedValue([
      { signature: 'sig1', id: 1, name: 'DeFi trades' },
      { signature: 'sig1', id: 2, name: 'Staking' },
      { signature: 'sig2', id: 1, name: 'DeFi trades' },
    ]);
    const res = await app.request('/wallets/addr1/group-memberships');
    const json = await res.json() as any;
    expect(json['sig1']).toHaveLength(2);
    expect(json['sig1']).toContainEqual({ id: 1, name: 'DeFi trades' });
    expect(json['sig1']).toContainEqual({ id: 2, name: 'Staking' });
    expect(json['sig2']).toHaveLength(1);
    expect(json['sig2'][0]).toEqual({ id: 1, name: 'DeFi trades' });
  });
});
