import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../server/db.js', () => {
  const mockSql: any = vi.fn(() => Promise.resolve([]));
  mockSql.begin = vi.fn(async () => []);
  mockSql.array = vi.fn((arr: unknown[]) => arr);
  mockSql.json = vi.fn((data: unknown) => data);
  return { default: mockSql };
});

import app from '../../server/routes/transactions.js';
import sql from '../../server/db.js';

const mockSql = sql as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockResolvedValue([]);
});

// GET uses Promise.all([txQuery, metaQuery]) — configure two sequential results
function mockGetCall(txRows: unknown[], metaRows: unknown[]) {
  mockSql
    .mockResolvedValueOnce(txRows)   // transactions query
    .mockResolvedValueOnce(metaRows); // meta query
}

describe('GET /wallets/:addr/transactions', () => {
  it('returns null when no meta row exists', async () => {
    mockGetCall([], []);
    const res = await app.request('/wallets/addr1/transactions');
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('returns transaction list with metadata when meta row exists', async () => {
    const txRows = [
      {
        signature: 'sig1',
        block_time: 1700000000,
        slot: 200000000,
        fee: 5000,
        tax_category: 'TRADE',
        helius_type: 'SWAP',
        description: 'Swapped SOL for USDC',
        balance_changes: [{ mint: 'SOL', amount: -1 }],
        err: null,
        counterparty: null,
      },
      {
        signature: 'sig2',
        block_time: 1699000000,
        slot: 199000000,
        fee: 0,
        tax_category: 'STAKING_REWARD',
        helius_type: null,
        description: null,
        balance_changes: [],
        err: null,
        counterparty: null,
      },
    ];
    const metaRows = [{ complete: true }];
    mockGetCall(txRows, metaRows);

    const res = await app.request('/wallets/addr1/transactions');
    expect(res.status).toBe(200);
    const json = await res.json() as any;

    expect(json.complete).toBe(true);
    expect(json.newestSignature).toBe('sig1');
    expect(json.oldestSignature).toBe('sig2');
    expect(json.data).toHaveLength(2);

    const tx = json.data[0];
    expect(tx.signature).toBe('sig1');
    expect(tx.blockTime).toBe(1700000000);
    expect(tx.slot).toBe(200000000);
    expect(tx.fee).toBe(5000);
    expect(tx.taxCategory).toBe('TRADE');
    expect(tx.heliusType).toBe('SWAP');
    expect(tx.description).toBe('Swapped SOL for USDC');
    expect(tx.err).toBeNull();
    expect(tx.counterparty).toBeNull();
  });

  it('sets newestSignature and oldestSignature to null when no transactions', async () => {
    mockGetCall([], [{ complete: false }]);
    const res = await app.request('/wallets/addr1/transactions');
    const json = await res.json() as any;
    expect(json.newestSignature).toBeNull();
    expect(json.oldestSignature).toBeNull();
    expect(json.data).toEqual([]);
  });

  it('sets complete to false by default when meta complete is falsy', async () => {
    mockGetCall([], [{ complete: false }]);
    const res = await app.request('/wallets/addr1/transactions');
    expect((await res.json() as any).complete).toBe(false);
  });
});

describe('PUT /wallets/:addr/transactions', () => {
  it('returns { ok: true } when saving transactions', async () => {
    const body = {
      data: [
        {
          signature: 'sig1',
          blockTime: 1700000000,
          slot: 200000000,
          fee: 5000,
          taxCategory: 'TRADE',
          heliusType: 'SWAP',
          description: null,
          err: null,
          balanceChanges: [],
          counterparty: null,
        },
      ],
      complete: false,
    };
    const res = await app.request('/wallets/addr1/transactions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('skips bulk insert when data array is empty, only updates meta', async () => {
    const callsBefore = mockSql.mock.calls.length;
    const res = await app.request('/wallets/addr1/transactions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [], complete: true }),
    });
    expect(res.status).toBe(200);
    // Only the meta query should run (no bulk insert)
    const callsAfter = mockSql.mock.calls.length;
    expect(callsAfter - callsBefore).toBe(1);
  });
});

describe('DELETE /wallets/:addr/transactions', () => {
  it('returns { ok: true } after deleting transactions and meta', async () => {
    const res = await app.request('/wallets/addr1/transactions', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // Both transactions and transactions_meta are deleted (Promise.all)
    expect(mockSql.mock.calls.length).toBe(2);
  });
});
