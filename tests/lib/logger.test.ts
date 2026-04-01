import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeLog, getRecentLogs, _resetForTesting, type LogEntry } from '../../server/lib/logger.js';

// Suppress stdout noise during tests
const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

beforeEach(() => {
  _resetForTesting();
  stdoutSpy.mockClear();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function entry(path: string, overrides: Partial<LogEntry> = {}): LogEntry {
  return { timestamp: '2026-01-01T00:00:00Z', level: 'INFO', type: 'http', path, ...overrides };
}

// ─── writeLog ───────────────────────────────────────────────────────────────

describe('writeLog', () => {
  it('stores a single entry', () => {
    writeLog(entry('/test'));
    const logs = getRecentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].path).toBe('/test');
  });

  it('preserves all fields on the stored entry', () => {
    const e: LogEntry = {
      timestamp: '2026-04-01T10:00:00Z',
      level: 'WARN',
      type: 'external',
      target: 'helius',
      method: 'POST',
      path: '/rpc',
      status_code: 429,
      duration_ms: 312,
    };
    writeLog(e);
    expect(getRecentLogs()[0]).toEqual(e);
  });

  it('writes one JSON line to stdout per call', () => {
    writeLog(entry('/a'));
    writeLog(entry('/b'));
    expect(stdoutSpy).toHaveBeenCalledTimes(2);
  });

  it('stdout line is valid JSON matching the entry', () => {
    const e = entry('/stdout-test', { level: 'ERROR', type: 'db', message: 'oops' });
    writeLog(e);
    const [call] = stdoutSpy.mock.calls;
    const written = call[0] as string;
    expect(written.endsWith('\n')).toBe(true);
    expect(JSON.parse(written.trimEnd())).toEqual(e);
  });

  it('caps the buffer at 100 entries', () => {
    for (let i = 0; i < 110; i++) writeLog(entry(`/p${i}`));
    expect(getRecentLogs()).toHaveLength(100);
  });

  it('evicts the oldest entry when the 101st entry is written', () => {
    for (let i = 0; i < 101; i++) writeLog(entry(`/p${i}`));
    const paths = getRecentLogs().map(e => e.path);
    expect(paths).not.toContain('/p0');
    expect(paths[0]).toBe('/p1');
    expect(paths[99]).toBe('/p100');
  });

  it('evicts correctly after multiple wraps', () => {
    for (let i = 0; i < 250; i++) writeLog(entry(`/p${i}`));
    const paths = getRecentLogs().map(e => e.path);
    expect(paths).toHaveLength(100);
    expect(paths[0]).toBe('/p150');
    expect(paths[99]).toBe('/p249');
  });
});

// ─── getRecentLogs ──────────────────────────────────────────────────────────

describe('getRecentLogs', () => {
  it('returns an empty array before any writes', () => {
    expect(getRecentLogs()).toEqual([]);
  });

  it('returns entries in chronological order (oldest first)', () => {
    writeLog(entry('/first'));
    writeLog(entry('/second'));
    writeLog(entry('/third'));
    expect(getRecentLogs().map(e => e.path)).toEqual(['/first', '/second', '/third']);
  });

  it('maintains chronological order after buffer wraps', () => {
    for (let i = 0; i < 102; i++) writeLog(entry(`/p${i}`));
    const paths = getRecentLogs().map(e => e.path);
    // /p0 and /p1 evicted; remaining 100 in order
    expect(paths[0]).toBe('/p2');
    expect(paths[99]).toBe('/p101');
    // Spot-check ordering is strictly ascending
    for (let i = 0; i < paths.length - 1; i++) {
      const a = parseInt(paths[i].slice(2));
      const b = parseInt(paths[i + 1].slice(2));
      expect(a).toBeLessThan(b);
    }
  });

  it('returns a snapshot — mutations to the returned array do not affect the buffer', () => {
    writeLog(entry('/original'));
    const snapshot = getRecentLogs();
    snapshot.push(entry('/injected'));
    expect(getRecentLogs()).toHaveLength(1);
  });
});

// ─── level semantics (consumer convention documented in middleware) ──────────

describe('log level values', () => {
  it('accepts all valid log levels without error', () => {
    expect(() => {
      writeLog(entry('/d', { level: 'DEBUG' }));
      writeLog(entry('/i', { level: 'INFO' }));
      writeLog(entry('/w', { level: 'WARN' }));
      writeLog(entry('/e', { level: 'ERROR' }));
    }).not.toThrow();
  });

  it('stores the level exactly as provided', () => {
    writeLog(entry('/warn', { level: 'WARN' }));
    expect(getRecentLogs()[0].level).toBe('WARN');
  });
});

// ─── log type coverage ───────────────────────────────────────────────────────

describe('log types', () => {
  it('stores http entries with method, path, status_code, duration_ms', () => {
    writeLog({ timestamp: 't', level: 'INFO', type: 'http', method: 'GET', path: '/api/v1/wallets', status_code: 200, duration_ms: 8 });
    const [log] = getRecentLogs();
    expect(log.type).toBe('http');
    expect(log.method).toBe('GET');
    expect(log.status_code).toBe(200);
    expect(log.duration_ms).toBe(8);
  });

  it('stores external entries with target field', () => {
    writeLog({ timestamp: 't', level: 'INFO', type: 'external', target: 'coingecko', method: 'GET', path: '/api/v3/coins/markets', status_code: 200, duration_ms: 450 });
    const [log] = getRecentLogs();
    expect(log.type).toBe('external');
    expect(log.target).toBe('coingecko');
  });

  it('stores db error entries with message field', () => {
    writeLog({ timestamp: 't', level: 'ERROR', type: 'db', path: '/api/v1/transactions', message: 'connection refused' });
    const [log] = getRecentLogs();
    expect(log.type).toBe('db');
    expect(log.message).toBe('connection refused');
  });
});
