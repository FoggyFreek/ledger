import { describe, it, expect, vi, beforeEach } from 'vitest';

const httpEntry = {
  timestamp: '2026-04-01T10:00:00Z',
  level: 'INFO',
  type: 'http',
  method: 'GET',
  path: '/api/v1/wallets',
  status_code: 200,
  duration_ms: 12,
};

const externalEntry = {
  timestamp: '2026-04-01T10:00:01Z',
  level: 'WARN',
  type: 'external',
  target: 'helius',
  method: 'POST',
  path: '/rpc',
  status_code: 429,
  duration_ms: 840,
};

vi.mock('../../server/lib/logger.js', () => ({
  getRecentLogs: vi.fn(() => [httpEntry, externalEntry]),
}));

import app from '../../server/routes/logs.js';
import { getRecentLogs } from '../../server/lib/logger.js';

const mockGetRecentLogs = getRecentLogs as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRecentLogs.mockReturnValue([httpEntry, externalEntry]);
});

describe('GET /logs', () => {
  it('returns 200', async () => {
    const res = await app.request('/logs');
    expect(res.status).toBe(200);
  });

  it('returns Content-Type application/json', async () => {
    const res = await app.request('/logs');
    expect(res.headers.get('content-type')).toMatch('application/json');
  });

  it('returns the entries from getRecentLogs as a JSON array', async () => {
    const res = await app.request('/logs');
    const json = await res.json();
    expect(json).toEqual([httpEntry, externalEntry]);
  });

  it('calls getRecentLogs exactly once per request', async () => {
    await app.request('/logs');
    expect(mockGetRecentLogs).toHaveBeenCalledOnce();
  });

  it('returns an empty array when the buffer is empty', async () => {
    mockGetRecentLogs.mockReturnValue([]);
    const res = await app.request('/logs');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('propagates the full entry shape including optional fields', async () => {
    const res = await app.request('/logs');
    const [first] = await res.json() as typeof httpEntry[];
    expect(first.method).toBe('GET');
    expect(first.status_code).toBe(200);
    expect(first.duration_ms).toBe(12);
  });
});
