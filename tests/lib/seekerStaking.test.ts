import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSeekerStakeAccounts } from '../../src/lib/helius';

// Mock fetch globally
const originalFetch = globalThis.fetch;
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Helper: wrap an RPC result in the JSON-RPC envelope
function rpcOk(result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function rpcError(message: string) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Helper: build a base64-encoded stake account buffer with shares and unstaking_amount
function buildStakeAccountData(shares: bigint, unstakingAmount: bigint): string {
  // Need at least SEEKER_UNSTAKING_OFFSET(153) + 8 = 161 bytes
  const buf = new ArrayBuffer(161);
  const view = new DataView(buf);
  // shares u128 LE at offset 105
  view.setBigUint64(105, shares & 0xFFFFFFFFFFFFFFFFn, true);
  view.setBigUint64(113, shares >> 64n, true);
  // unstaking_amount u64 LE at offset 153
  view.setBigUint64(153, unstakingAmount, true);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

// Helper: build base64-encoded config data with share_price at offset 137
function buildConfigData(sharePrice: bigint): string {
  // Need at least SEEKER_SHARE_PRICE_OFFSET(137) + 16 = 153 bytes
  const buf = new ArrayBuffer(153);
  const view = new DataView(buf);
  view.setBigUint64(137, sharePrice & 0xFFFFFFFFFFFFFFFFn, true);
  view.setBigUint64(145, sharePrice >> 64n, true);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

// Route fetch calls based on the RPC method in the request body
function routeFetch(handlers: Record<string, () => Response>) {
  mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const handler = handlers[body.method];
    if (!handler) throw new Error(`Unexpected RPC method: ${body.method}`);
    return handler();
  });
}

describe('getSeekerStakeAccounts', () => {
  it('throws when getProgramAccounts RPC returns an error', async () => {
    routeFetch({
      getProgramAccounts: () => rpcError('Too many requests'),
      getAccountInfo: () => rpcOk({ value: { data: [buildConfigData(1_000_000_000n), 'base64'] } }),
    });

    await expect(getSeekerStakeAccounts('wallet1'))
      .rejects.toThrow('Failed to fetch Seeker stake accounts');
    // Verify the original RPC error is included
    routeFetch({
      getProgramAccounts: () => rpcError('Too many requests'),
      getAccountInfo: () => rpcOk({ value: { data: [buildConfigData(1_000_000_000n), 'base64'] } }),
    });
    await expect(getSeekerStakeAccounts('wallet1'))
      .rejects.toThrow('Too many requests');
  });

  it('throws when getAccountInfo for share price returns null', async () => {
    routeFetch({
      getProgramAccounts: () => rpcOk([]),
      getAccountInfo: () => rpcOk({ value: null }),
    });

    await expect(getSeekerStakeAccounts('wallet1'))
      .rejects.toThrow('Seeker staking config account not found');
  });

  it('throws when config account data is too short for share price', async () => {
    const shortData = btoa(String.fromCharCode(...new Uint8Array(50)));
    routeFetch({
      getProgramAccounts: () => rpcOk([]),
      getAccountInfo: () => rpcOk({ value: { data: [shortData, 'base64'] } }),
    });

    await expect(getSeekerStakeAccounts('wallet1'))
      .rejects.toThrow('Seeker config account data too short');
  });

  it('throws when stake account data is too short to decode shares', async () => {
    const configData = buildConfigData(1_000_000_000n);
    const shortAccountData = btoa(String.fromCharCode(...new Uint8Array(50)));

    routeFetch({
      getProgramAccounts: () => rpcOk([
        { pubkey: 'stake1', account: { lamports: 100, data: [shortAccountData, 'base64'] } },
      ]),
      getAccountInfo: () => rpcOk({ value: { data: [configData, 'base64'] } }),
    });

    await expect(getSeekerStakeAccounts('wallet1'))
      .rejects.toThrow('Failed to decode Seeker stake account stake1');
  });

  it('includes "Account data too short" detail when shares offset is beyond buffer', async () => {
    const configData = buildConfigData(1_000_000_000n);
    const shortAccountData = btoa(String.fromCharCode(...new Uint8Array(50)));

    routeFetch({
      getProgramAccounts: () => rpcOk([
        { pubkey: 'stake1', account: { lamports: 100, data: [shortAccountData, 'base64'] } },
      ]),
      getAccountInfo: () => rpcOk({ value: { data: [configData, 'base64'] } }),
    });

    await expect(getSeekerStakeAccounts('wallet1'))
      .rejects.toThrow('Account data too short to read shares');
  });

  it('throws with pubkey in error message when base64 decoding fails', async () => {
    const configData = buildConfigData(1_000_000_000n);

    routeFetch({
      getProgramAccounts: () => rpcOk([
        { pubkey: 'BadAccount123', account: { lamports: 100, data: ['!!!invalid!!!', 'base64'] } },
      ]),
      getAccountInfo: () => rpcOk({ value: { data: [configData, 'base64'] } }),
    });

    await expect(getSeekerStakeAccounts('wallet1'))
      .rejects.toThrow('Failed to decode Seeker stake account BadAccount123');
  });

  it('successfully parses valid stake accounts', async () => {
    const sharePrice = 1_500_000_000n; // 1.5x
    const shares = 2_000_000n;
    const unstaking = 500_000n;
    const configData = buildConfigData(sharePrice);
    const accountData = buildStakeAccountData(shares, unstaking);

    routeFetch({
      getProgramAccounts: () => rpcOk([
        { pubkey: 'stake1', account: { lamports: 2039280, data: [accountData, 'base64'] } },
      ]),
      getAccountInfo: () => rpcOk({ value: { data: [configData, 'base64'] } }),
    });

    const result = await getSeekerStakeAccounts('wallet1');
    expect(result).toHaveLength(1);
    expect(result[0].pubkey).toBe('stake1');
    expect(result[0].lamports).toBe(2039280);
    // stakedRaw = (2_000_000 * 1_500_000_000) / 1_000_000_000 = 3_000_000
    expect(result[0].stakedRaw).toBe(3_000_000n);
    expect(result[0].unstakingAmount).toBe(unstaking);
  });

  it('returns empty array when no stake accounts exist', async () => {
    const configData = buildConfigData(1_000_000_000n);
    routeFetch({
      getProgramAccounts: () => rpcOk([]),
      getAccountInfo: () => rpcOk({ value: { data: [configData, 'base64'] } }),
    });

    const result = await getSeekerStakeAccounts('wallet1');
    expect(result).toEqual([]);
  });
});
